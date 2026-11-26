import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { checkDatabaseHealth, getSql } from "@goboda/db";
import { createLogger, REQUEST_ID_HEADER } from "@goboda/logger";
import { localeSchema, UserRole } from "@goboda/shared-types";
import {
  generateOtpCode,
  generateRefreshToken,
  hashSecret,
  normalizePhone,
  safeEqual,
  signAccessToken,
  verifyAccessToken,
  type AuthTokenClaims,
} from "./crypto.js";

export const SERVICE_NAME = "auth-service";
export const SERVICE_VERSION = "0.1.0";
export const PORT = Number(process.env.PORT ?? process.env.AUTH_SERVICE_PORT ?? 4001);
export const HOST = process.env.HOST ?? "0.0.0.0";

export const logger = createLogger(SERVICE_NAME);

const otpRequestSchema = z.object({
  phone: z.string().min(9).max(20),
  channel: z.enum(["WHATSAPP", "SMS"]).default("WHATSAPP"),
  locale: localeSchema.default("sw"),
});

const otpVerifySchema = z.object({
  phone: z.string().min(9).max(20),
  code: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  name: z.string().trim().min(1).max(120).optional(),
  locale: localeSchema.optional(),
  intendedRole: z
    .enum(["CUSTOMER", "BODABODA_RIDER", "BAJAJI_DRIVER"])
    .default("CUSTOMER"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().email().optional(),
  language: localeSchema.optional(),
});

const promoteAdminSchema = z.object({
  phone: z.string().min(9).max(20),
  name: z.string().trim().min(1).max(120).default("Go.boda Admin"),
});

async function extractAuthenticatedUser(
  authHeader?: string
): Promise<AuthTokenClaims | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    return await verifyAccessToken(token);
  } catch {
    return null;
  }
}

export const app = Fastify({
  logger: false,
  genReqId: (req) => {
    const existing = req.headers[REQUEST_ID_HEADER];
    return typeof existing === "string" && existing.length > 0
      ? existing
      : randomUUID();
  },
});

app.register(cors, { origin: true, credentials: true });
app.register(helmet, { contentSecurityPolicy: false });
app.register(rateLimit, { max: 80, timeWindow: "1 minute" });

app.addHook("onRequest", async (request, reply) => {
  reply.header(REQUEST_ID_HEADER, request.id);
});

app.get("/", async () => ({
  service: SERVICE_NAME,
  version: SERVICE_VERSION,
  status: "ok",
  endpoints: [
    "/healthz",
    "/readyz",
    "/api/v1/auth/otp/request",
    "/api/v1/auth/otp/verify",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
    "/api/v1/auth/me",
  ],
}));

app.get("/healthz", async () => {
  const db = await checkDatabaseHealth();
  return {
    service: SERVICE_NAME,
    status: db.connected ? "ok" : "degraded",
    port: PORT,
    databaseConnected: db.connected,
    latencyMs: db.latencyMs,
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
  };
});

app.get("/readyz", async (_req, reply) => {
  const db = await checkDatabaseHealth();
  reply.code(db.connected ? 200 : 503);
  return { service: SERVICE_NAME, ready: db.connected };
});

// 1. Request Phone OTP (WhatsApp primary / SMS fallback)
app.post("/api/v1/auth/otp/request", async (request, reply) => {
  const parsed = otpRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const sql = getSql();
  const phone = normalizePhone(parsed.data.phone);

  // Cooldown check (prevent spam within 30s unless in test override)
  const recentRows = await sql`
    SELECT id, created_at
    FROM auth.otp_codes
    WHERE phone = ${phone}
      AND consumed_at IS NULL
      AND created_at > NOW() - INTERVAL '30 seconds'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (recentRows.length > 0 && process.env.OTP_SKIP_COOLDOWN !== "true") {
    return reply.code(429).send({
      error: "OTP_COOLDOWN",
      message:
        parsed.data.locale === "sw"
          ? "Subiri sekunde 30 kabla ya kuomba msimbo mwingine."
          : "Please wait 30 seconds before requesting another OTP code.",
    });
  }

  const code = generateOtpCode();
  const codeHash = hashSecret(code);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await sql`
    INSERT INTO auth.otp_codes (phone, code_hash, channel, expires_at)
    VALUES (${phone}, ${codeHash}, ${parsed.data.channel}, ${expiresAt})
  `;

  logger.info(
    { requestId: request.id, phone, channel: parsed.data.channel },
    "OTP code generated"
  );

  const echoDevOtp =
    process.env.OTP_DEV_ECHO === "true" ||
    process.env.NODE_ENV !== "production";

  return reply.code(200).send({
    sent: true,
    phone,
    channel: parsed.data.channel,
    expiresInSeconds: 300,
    ...(echoDevOtp ? { devOtp: code } : {}),
  });
});

// 2. Verify Phone OTP -> Issue Access JWT + Rotating Refresh Token
app.post("/api/v1/auth/otp/verify", async (request, reply) => {
  const parsed = otpVerifySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const sql = getSql();
  const phone = normalizePhone(parsed.data.phone);

  const otpRows = await sql`
    SELECT id, code_hash, attempts, expires_at
    FROM auth.otp_codes
    WHERE phone = ${phone}
      AND consumed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;

  const otpRecord = otpRows[0] as
    | { id: string; code_hash: string; attempts: number; expires_at: string }
    | undefined;

  if (!otpRecord) {
    return reply.code(401).send({
      error: "OTP_NOT_FOUND",
      message: "No active OTP code found. Please request a new code.",
    });
  }

  if (new Date(otpRecord.expires_at).getTime() < Date.now()) {
    return reply.code(401).send({
      error: "OTP_EXPIRED",
      message: "OTP code has expired. Please request a new code.",
    });
  }

  if (otpRecord.attempts >= 5) {
    return reply.code(429).send({
      error: "OTP_MAX_ATTEMPTS",
      message: "Too many failed attempts. Please request a new OTP code.",
    });
  }

  const candidateHash = hashSecret(parsed.data.code);
  if (!safeEqual(candidateHash, otpRecord.code_hash)) {
    await sql`
      UPDATE auth.otp_codes
      SET attempts = attempts + 1
      WHERE id = ${otpRecord.id}
    `;
    return reply.code(401).send({
      error: "OTP_INVALID",
      message: "Incorrect OTP code.",
    });
  }

  await sql`
    UPDATE auth.otp_codes
    SET consumed_at = NOW()
    WHERE id = ${otpRecord.id}
  `;

  // Upsert user cleanly — existing user preserves assigned role (e.g. ADMIN stays ADMIN)
  const existingUsers = await sql`
    SELECT id, phone, email, name, role, language, status, rating_avg
    FROM auth.users
    WHERE phone = ${phone}
    LIMIT 1
  `;

  let user = existingUsers[0] as
    | {
        id: string;
        phone: string | null;
        email: string | null;
        name: string;
        role: UserRole;
        language: "sw" | "en";
        status: string;
        rating_avg: number;
      }
    | undefined;

  if (!user) {
    const inserted = await sql`
      INSERT INTO auth.users (phone, name, role, language)
      VALUES (
        ${phone},
        ${parsed.data.name ?? ""},
        ${parsed.data.intendedRole},
        ${parsed.data.locale ?? "sw"}
      )
      RETURNING id, phone, email, name, role, language, status, rating_avg
    `;
    user = inserted[0] as typeof user;
  }

  if (!user) {
    return reply.code(500).send({ error: "USER_PROVISION_FAILED" });
  }

  if (user.status === "SUSPENDED") {
    return reply.code(403).send({
      error: "ACCOUNT_SUSPENDED",
      message: "This Go.boda account is suspended. Contact operations support.",
    });
  }

  const accessToken = await signAccessToken({
    sub: user.id,
    role: user.role,
    phone: user.phone,
    language: user.language,
  });

  const refreshToken = generateRefreshToken();
  const refreshHash = hashSecret(refreshToken);
  const refreshExpiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  await sql`
    INSERT INTO auth.refresh_tokens (user_id, token_hash, expires_at)
    VALUES (${user.id}, ${refreshHash}, ${refreshExpiresAt})
  `;

  return reply.code(200).send({
    accessToken,
    refreshToken,
    expiresInSeconds: 900,
    user: {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      role: user.role,
      language: user.language,
      ratingAvg: user.rating_avg,
    },
  });
});

// 3. Rotate Refresh Token -> Fresh Access Token
app.post("/api/v1/auth/refresh", async (request, reply) => {
  const parsed = refreshSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "VALIDATION_ERROR" });
  }

  const sql = getSql();
  const tokenHash = hashSecret(parsed.data.refreshToken);

  const rows = await sql`
    SELECT rt.id AS token_id, rt.expires_at, rt.revoked_at,
           u.id AS user_id, u.phone, u.role, u.language, u.status
    FROM auth.refresh_tokens rt
    JOIN auth.users u ON u.id = rt.user_id
    WHERE rt.token_hash = ${tokenHash}
    LIMIT 1
  `;

  const rec = rows[0] as
    | {
        token_id: string;
        expires_at: string;
        revoked_at: string | null;
        user_id: string;
        phone: string | null;
        role: UserRole;
        language: "sw" | "en";
        status: string;
      }
    | undefined;

  if (
    !rec ||
    rec.revoked_at ||
    new Date(rec.expires_at).getTime() < Date.now() ||
    rec.status === "SUSPENDED"
  ) {
    return reply.code(401).send({ error: "INVALID_REFRESH_TOKEN" });
  }

  // Revoke previous refresh token (rotation)
  await sql`
    UPDATE auth.refresh_tokens
    SET revoked_at = NOW()
    WHERE id = ${rec.token_id}
  `;

  const nextRefreshToken = generateRefreshToken();
  const nextRefreshHash = hashSecret(nextRefreshToken);
  const nextExpiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  await sql`
    INSERT INTO auth.refresh_tokens (user_id, token_hash, expires_at)
    VALUES (${rec.user_id}, ${nextRefreshHash}, ${nextExpiresAt})
  `;

  const accessToken = await signAccessToken({
    sub: rec.user_id,
    role: rec.role,
    phone: rec.phone,
    language: rec.language,
  });

  return reply.code(200).send({
    accessToken,
    refreshToken: nextRefreshToken,
    expiresInSeconds: 900,
  });
});

// 4. Logout -> Revoke Refresh Token
app.post("/api/v1/auth/logout", async (request, reply) => {
  const parsed = refreshSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "VALIDATION_ERROR" });
  }
  const sql = getSql();
  const tokenHash = hashSecret(parsed.data.refreshToken);
  await sql`
    UPDATE auth.refresh_tokens
    SET revoked_at = NOW()
    WHERE token_hash = ${tokenHash}
  `;
  return reply.code(200).send({ loggedOut: true });
});

// 5. Get Current User Profile
app.get("/api/v1/auth/me", async (request, reply) => {
  const claims = await extractAuthenticatedUser(request.headers.authorization);
  if (!claims) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }

  const sql = getSql();
  const rows = await sql`
    SELECT id, phone, email, name, role, language, status, rating_avg, created_at
    FROM auth.users
    WHERE id = ${claims.sub}
    LIMIT 1
  `;

  const user = rows[0];
  if (!user) {
    return reply.code(404).send({ error: "USER_NOT_FOUND" });
  }
  return reply.code(200).send({ user });
});

// 6. Update Current User Profile (name, email, language)
app.patch("/api/v1/auth/me", async (request, reply) => {
  const claims = await extractAuthenticatedUser(request.headers.authorization);
  if (!claims) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }

  const parsed = updateMeSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const sql = getSql();
  const rows = await sql`
    UPDATE auth.users
    SET
      name = COALESCE(${parsed.data.name ?? null}, name),
      email = COALESCE(${parsed.data.email ?? null}, email),
      language = COALESCE(${parsed.data.language ?? null}, language),
      updated_at = NOW()
    WHERE id = ${claims.sub}
    RETURNING id, phone, email, name, role, language, status, rating_avg
  `;
  return reply.code(200).send({ user: rows[0] });
});

// 7. Internal Protected Admin Bootstrap (requires INTERNAL_SERVICE_SECRET)
app.post("/api/v1/auth/internal/promote-admin", async (request, reply) => {
  const expected = process.env.INTERNAL_SERVICE_SECRET;
  const provided = request.headers["x-internal-service-secret"];
  if (
    !expected ||
    typeof provided !== "string" ||
    !safeEqual(provided, expected)
  ) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }

  const parsed = promoteAdminSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "VALIDATION_ERROR" });
  }

  const sql = getSql();
  const phone = normalizePhone(parsed.data.phone);
  const rows = await sql`
    INSERT INTO auth.users (phone, name, role, language)
    VALUES (${phone}, ${parsed.data.name}, ${UserRole.ADMIN}, 'en')
    ON CONFLICT (phone) DO UPDATE
      SET role = ${UserRole.ADMIN}, updated_at = NOW()
    RETURNING id, phone, name, role, language
  `;

  return reply.code(200).send({ admin: rows[0] });
});

export default app;
