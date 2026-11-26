import { randomUUID, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { jwtVerify } from "jose";
import { z } from "zod";
import { checkDatabaseHealth, getSql } from "@goboda/db";
import { createLogger, REQUEST_ID_HEADER } from "@goboda/logger";
import { UserRole } from "@goboda/shared-types";

export const SERVICE_NAME = "notification-service";
export const SERVICE_VERSION = "0.1.0";
export const PORT = Number(
  process.env.PORT ?? process.env.NOTIFICATION_SERVICE_PORT ?? 4009
);
export const HOST = process.env.HOST ?? "0.0.0.0";

export const logger = createLogger(SERVICE_NAME);

// Bilingual preset quick-chat phrases for low-distraction Customer <-> Rider/Driver messaging
export const QUICK_CHAT_PRESETS = [
  {
    key: "ON_THE_WAY",
    audience: "OPERATOR",
    sw: "Niko njiani nakuja sasa hivi!",
    en: "I am on my way right now!",
  },
  {
    key: "ARRIVED_GATE",
    audience: "OPERATOR",
    sw: "Nimefika kituoni / getini, nakusubiri.",
    en: "I have arrived at the pickup gate and am waiting.",
  },
  {
    key: "WAIT_2_MIN",
    audience: "CUSTOMER",
    sw: "Tafadhali subiri dakika 2, natoka sasa.",
    en: "Please wait 2 minutes, I am coming out now.",
  },
  {
    key: "STONE_TOWN_WALK",
    audience: "CUSTOMER",
    sw: "Natembea kutoka kichochoroni kuja barabarani.",
    en: "Walking out from the Stone Town alley to the perimeter road.",
  },
  {
    key: "EXTRA_HELMET",
    audience: "CUSTOMER",
    sw: "Tafadhali hakikisha una helmeti safi ya abiria.",
    en: "Please make sure you have a clean passenger helmet.",
  },
  {
    key: "CALL_ME",
    audience: "BOTH",
    sw: "Tafadhali nipigie simu tukutane haraka.",
    en: "Please call me so we can meet quickly.",
  },
] as const;

const PRESET_MAP = new Map<string, (typeof QUICK_CHAT_PRESETS)[number]>(
  QUICK_CHAT_PRESETS.map((p) => [p.key, p])
);

function getJwtSecretBytes(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET is required in production");
    }
    return new TextEncoder().encode("dev-only-insecure-goboda-jwt-secret");
  }
  return new TextEncoder().encode(secret);
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function hasValidInternalSecret(header: unknown): boolean {
  const expected = process.env.INTERNAL_SERVICE_SECRET;
  return (
    Boolean(expected) &&
    typeof header === "string" &&
    safeEqual(header, expected!)
  );
}

async function resolveCaller(
  authHeader?: string
): Promise<{ userId: string; role: UserRole } | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(
      authHeader.slice(7).trim(),
      getJwtSecretBytes(),
      { issuer: "goboda-auth-service", audience: "goboda-platform" }
    );
    if (!payload.sub || typeof payload.role !== "string") return null;
    return { userId: payload.sub, role: payload.role as UserRole };
  } catch {
    return null;
  }
}

const pushSubSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(8).max(500),
    auth: z.string().min(8).max(500),
  }),
  userAgent: z.string().max(300).default(""),
});

const internalSendSchema = z.object({
  userId: z.string().uuid().optional(),
  phone: z.string().trim().min(9).max(20).optional(),
  channel: z.enum(["WEB_PUSH", "WHATSAPP", "SMS"]),
  eventSubject: z.string().trim().min(2).max(80),
  locale: z.enum(["sw", "en"]).default("sw"),
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().min(1).max(500),
  payload: z.record(z.unknown()).default({}),
});

const chatPostSchema = z
  .object({
    presetKey: z.string().trim().max(40).optional(),
    text: z.string().trim().min(1).max(240).optional(),
  })
  .refine((v) => Boolean(v.presetKey || v.text), {
    message: "Either presetKey or text is required",
  });

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
app.register(rateLimit, { max: 240, timeWindow: "1 minute" });

app.addHook("onRequest", async (request, reply) => {
  reply.header(REQUEST_ID_HEADER, request.id);
});

app.get("/", async () => ({
  service: SERVICE_NAME,
  version: SERVICE_VERSION,
  channels: ["WEB_PUSH", "WHATSAPP", "SMS", "TRIP_QUICK_CHAT"],
  endpoints: [
    "/healthz",
    "/readyz",
    "GET /api/v1/notifications/vapid-public-key",
    "POST /api/v1/notifications/subscriptions",
    "DELETE /api/v1/notifications/subscriptions",
    "GET /api/v1/notifications/me",
    "POST /api/v1/notifications/internal/send",
    "GET /api/v1/notifications/chat/presets",
    "GET /api/v1/notifications/chat/:tripId",
    "POST /api/v1/notifications/chat/:tripId",
  ],
}));

app.get("/healthz", async () => {
  const db = await checkDatabaseHealth();
  return {
    service: SERVICE_NAME,
    status: db.connected ? "ok" : "degraded",
    port: PORT,
    databaseConnected: db.connected,
    vapidConfigured: Boolean(process.env.VAPID_PUBLIC_KEY),
    whatsappConfigured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
    smsConfigured: Boolean(process.env.AFRICASTALKING_API_KEY),
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

// 1. VAPID public key for browser PWA PushManager subscription
app.get("/api/v1/notifications/vapid-public-key", async () => ({
  configured: Boolean(process.env.VAPID_PUBLIC_KEY),
  publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
}));

// 2. Register or refresh a PWA Web Push subscription
app.post("/api/v1/notifications/subscriptions", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const parsed = pushSubSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const sql = getSql();
  const rows = await sql`
    INSERT INTO notif.push_subscriptions (
      user_id, role, endpoint, p256dh, auth_key, user_agent, active, updated_at
    )
    VALUES (
      ${caller.userId}::uuid, ${caller.role}, ${d.endpoint},
      ${d.keys.p256dh}, ${d.keys.auth}, ${d.userAgent}, TRUE, NOW()
    )
    ON CONFLICT (endpoint) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      role = EXCLUDED.role,
      p256dh = EXCLUDED.p256dh,
      auth_key = EXCLUDED.auth_key,
      user_agent = EXCLUDED.user_agent,
      active = TRUE,
      updated_at = NOW()
    RETURNING id, user_id AS "userId", role, endpoint, active, updated_at AS "updatedAt"
  `;

  return reply.code(201).send({ subscription: rows[0] });
});

// 3. Deactivate PWA push subscription
app.delete("/api/v1/notifications/subscriptions", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const body = (request.body ?? {}) as { endpoint?: string };
  const sql = getSql();
  if (body.endpoint) {
    await sql`
      UPDATE notif.push_subscriptions
      SET active = FALSE, updated_at = NOW()
      WHERE user_id = ${caller.userId}::uuid AND endpoint = ${body.endpoint}
    `;
  } else {
    await sql`
      UPDATE notif.push_subscriptions
      SET active = FALSE, updated_at = NOW()
      WHERE user_id = ${caller.userId}::uuid
    `;
  }
  return reply.code(200).send({ unsubscribed: true });
});

// 4. Internal Multi-Channel Dispatch (Web Push / WhatsApp Cloud API / Africa's Talking SMS)
app.post("/api/v1/notifications/internal/send", async (request, reply) => {
  if (!hasValidInternalSecret(request.headers["x-internal-service-secret"])) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }

  const parsed = internalSendSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const sql = getSql();

  let status: "SENT" | "SIMULATED" | "FAILED" = "SIMULATED";
  let providerRef = `sim-${randomUUID().slice(0, 8)}`;
  let matchedSubscriptions = 0;

  if (d.channel === "WEB_PUSH" && d.userId) {
    const subs = await sql`
      SELECT id, endpoint FROM notif.push_subscriptions
      WHERE user_id = ${d.userId}::uuid AND active = TRUE
    `;
    matchedSubscriptions = subs.length;
    providerRef = `webpush-subs-${matchedSubscriptions}`;
  } else if (
    d.channel === "WHATSAPP" &&
    d.phone &&
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID
  ) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: d.phone.replace(/^\+/, ""),
            type: "text",
            text: { body: `${d.title}\n${d.body}` },
          }),
          signal: AbortSignal.timeout(4000),
        }
      );
      status = res.ok ? "SENT" : "FAILED";
      providerRef = `wa-http-${res.status}`;
    } catch {
      status = "FAILED";
      providerRef = "wa-timeout";
    }
  } else if (
    d.channel === "SMS" &&
    d.phone &&
    process.env.AFRICASTALKING_API_KEY &&
    process.env.AFRICASTALKING_USERNAME
  ) {
    try {
      const form = new URLSearchParams({
        username: process.env.AFRICASTALKING_USERNAME,
        to: d.phone,
        message: `${d.title}: ${d.body}`,
      });
      const res = await fetch(
        "https://api.africastalking.com/version1/messaging",
        {
          method: "POST",
          headers: {
            apiKey: process.env.AFRICASTALKING_API_KEY,
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
          signal: AbortSignal.timeout(4000),
        }
      );
      status = res.ok ? "SENT" : "FAILED";
      providerRef = `at-sms-http-${res.status}`;
    } catch {
      status = "FAILED";
      providerRef = "at-sms-timeout";
    }
  }

  const inserted = await sql`
    INSERT INTO notif.messages (
      user_id, phone, channel, event_subject, locale, title, body, payload, status, provider_ref
    )
    VALUES (
      ${d.userId ?? null}::uuid, ${d.phone ?? null}, ${d.channel},
      ${d.eventSubject}, ${d.locale}, ${d.title}, ${d.body},
      ${JSON.stringify(d.payload)}::jsonb, ${status}, ${providerRef}
    )
    RETURNING id, channel, event_subject AS "eventSubject", status, provider_ref AS "providerRef", created_at AS "createdAt"
  `;

  return reply.code(201).send({
    notification: inserted[0],
    matchedSubscriptions,
  });
});

// 5. Caller's notification inbox
app.get("/api/v1/notifications/me", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const sql = getSql();
  const rows = await sql`
    SELECT
      id, channel, event_subject AS "eventSubject", locale,
      title, body, payload, status, created_at AS "createdAt"
    FROM notif.messages
    WHERE user_id = ${caller.userId}::uuid
    ORDER BY created_at DESC
    LIMIT 30
  `;

  return reply.code(200).send({
    count: rows.length,
    notifications: rows,
  });
});

// 6. Bilingual Quick-Chat Presets (public catalog)
app.get("/api/v1/notifications/chat/presets", async () => ({
  count: QUICK_CHAT_PRESETS.length,
  presets: QUICK_CHAT_PRESETS,
}));

// 7. Fetch Trip Quick-Chat Thread
app.get("/api/v1/notifications/chat/:tripId", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const { tripId } = request.params as { tripId: string };
  const sql = getSql();
  const rows = await sql`
    SELECT
      id, trip_id AS "tripId", sender_id AS "senderId", sender_role AS "senderRole",
      preset_key AS "presetKey", body_sw AS "bodySw", body_en AS "bodyEn",
      body_text AS "bodyText", created_at AS "createdAt"
    FROM notif.trip_chat_messages
    WHERE trip_id = ${tripId}::uuid
    ORDER BY created_at ASC
    LIMIT 100
  `;

  return reply.code(200).send({
    tripId,
    count: rows.length,
    messages: rows,
  });
});

// 8. Send Bilingual Preset or Custom Trip Quick-Chat Message
app.post("/api/v1/notifications/chat/:tripId", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const parsed = chatPostSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const { tripId } = request.params as { tripId: string };
  const d = parsed.data;
  const preset = d.presetKey ? PRESET_MAP.get(d.presetKey.toUpperCase()) : undefined;

  if (d.presetKey && !preset) {
    return reply.code(400).send({ error: "UNKNOWN_CHAT_PRESET" });
  }

  const bodySw = preset ? preset.sw : (d.text ?? "");
  const bodyEn = preset ? preset.en : (d.text ?? "");
  const bodyText = preset ? `${preset.sw} / ${preset.en}` : (d.text ?? "");

  const sql = getSql();
  const inserted = await sql`
    INSERT INTO notif.trip_chat_messages (
      trip_id, sender_id, sender_role, preset_key, body_sw, body_en, body_text
    )
    VALUES (
      ${tripId}::uuid, ${caller.userId}::uuid, ${caller.role},
      ${preset ? preset.key : null}, ${bodySw}, ${bodyEn}, ${bodyText}
    )
    RETURNING
      id, trip_id AS "tripId", sender_id AS "senderId", sender_role AS "senderRole",
      preset_key AS "presetKey", body_sw AS "bodySw", body_en AS "bodyEn",
      body_text AS "bodyText", created_at AS "createdAt"
  `;

  return reply.code(201).send({ message: inserted[0] });
});

export default app;
