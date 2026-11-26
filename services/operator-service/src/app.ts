import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { jwtVerify } from "jose";
import { z } from "zod";
import { checkDatabaseHealth, getSql } from "@goboda/db";
import { EVENT_SUBJECTS } from "@goboda/events";
import { createLogger, REQUEST_ID_HEADER } from "@goboda/logger";
import {
  getOperatorTitle,
  TransportType,
  transportTypeSchema,
  UserRole,
} from "@goboda/shared-types";

export const SERVICE_NAME = "operator-service";
export const SERVICE_VERSION = "0.1.0";
export const PORT = Number(
  process.env.PORT ?? process.env.OPERATOR_SERVICE_PORT ?? 4002
);
export const HOST = process.env.HOST ?? "0.0.0.0";

export const logger = createLogger(SERVICE_NAME);

interface CallerIdentity {
  userId: string;
  role: UserRole;
  phone: string | null;
}

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

async function resolveCaller(authHeader?: string): Promise<CallerIdentity | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes(), {
      issuer: "goboda-auth-service",
      audience: "goboda-platform",
    });
    if (!payload.sub || typeof payload.role !== "string") return null;
    return {
      userId: payload.sub,
      role: payload.role as UserRole,
      phone: typeof payload.phone === "string" ? payload.phone : null,
    };
  } catch {
    return null;
  }
}

const REQUIRED_DOCS_COMMON = [
  "SELFIE",
  "NATIONAL_ID",
  "DRIVING_LICENSE",
  "VEHICLE_FRONT",
  "VEHICLE_REAR",
  "INSURANCE",
] as const;

function getRequiredDocs(transportType: TransportType): string[] {
  return transportType === TransportType.BODABODA
    ? [...REQUIRED_DOCS_COMMON, "HELMETS"]
    : [...REQUIRED_DOCS_COMMON];
}

const onboardingSchema = z.object({
  transportType: transportTypeSchema,
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(20),
  homeKituo: z.string().trim().min(2).max(120),
  nationalIdNo: z.string().trim().min(5).max(50),
  licenseNo: z.string().trim().min(4).max(50),
  licenseExpiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD date format")
    .optional(),
  plateNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^Z[\s-]?[A-Z0-9\s-]{2,12}$/, "Unguja vehicle plate must start with Z"),
  vehicleModel: z.string().trim().min(2).max(80),
  vehicleColor: z.string().trim().min(2).max(40),
  insuranceExpiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD date format")
    .optional(),
  payoutMobileNumber: z.string().trim().min(9).max(20),
});

const presignDocumentSchema = z.object({
  docType: z.enum([
    "SELFIE",
    "NATIONAL_ID",
    "DRIVING_LICENSE",
    "VEHICLE_FRONT",
    "VEHICLE_REAR",
    "INSURANCE",
    "HELMETS",
  ]),
  contentType: z
    .enum(["image/jpeg", "image/png", "image/webp", "application/pdf"])
    .default("image/jpeg"),
});

const availabilitySchema = z.object({
  isOnline: z.boolean(),
});

const adminReviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
  helmetVerified: z.boolean().optional(),
  rejectionReason: z.string().trim().max(300).optional(),
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
app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

app.addHook("onRequest", async (request, reply) => {
  reply.header(REQUEST_ID_HEADER, request.id);
});

app.get("/", async () => ({
  service: SERVICE_NAME,
  version: SERVICE_VERSION,
  status: "ok",
  roles: { BODABODA: "RIDER", BAJAJI: "DRIVER" },
  endpoints: [
    "/healthz",
    "/readyz",
    "/api/v1/operators/onboarding",
    "/api/v1/operators/me",
    "/api/v1/operators/documents/presign",
    "/api/v1/operators/availability",
    "/api/v1/operators/admin/queue",
    "/api/v1/operators/admin/:operatorId/review",
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

// 1. Submit or Update Bodaboda Rider / Bajaji Driver Onboarding Profile
app.post("/api/v1/operators/onboarding", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }
  if (
    caller.role !== UserRole.BODABODA_RIDER &&
    caller.role !== UserRole.BAJAJI_DRIVER &&
    caller.role !== UserRole.ADMIN
  ) {
    return reply.code(403).send({
      error: "OPERATOR_ROLE_REQUIRED",
      message: "Only Bodaboda Riders and Bajaji Drivers can submit onboarding.",
    });
  }

  const parsed = onboardingSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const data = parsed.data;
  const operatorTitle = getOperatorTitle(data.transportType);
  const normalizedPlate = data.plateNumber.replace(/\s+/g, " ").trim();
  const sql = getSql();

  const rows = await sql`
    INSERT INTO operator.profiles (
      user_id, transport_type, operator_title, full_name, phone, home_kituo,
      national_id_no, license_no, license_expiry, plate_number, vehicle_model,
      vehicle_color, insurance_expiry, payout_mobile_number, kyc_status, rejection_reason
    )
    VALUES (
      ${caller.userId}, ${data.transportType}, ${operatorTitle}, ${data.fullName},
      ${data.phone}, ${data.homeKituo}, ${data.nationalIdNo}, ${data.licenseNo},
      ${data.licenseExpiry ?? null}, ${normalizedPlate}, ${data.vehicleModel},
      ${data.vehicleColor}, ${data.insuranceExpiry ?? null}, ${data.payoutMobileNumber},
      'PENDING_VERIFICATION', NULL
    )
    ON CONFLICT (user_id) DO UPDATE SET
      transport_type = EXCLUDED.transport_type,
      operator_title = EXCLUDED.operator_title,
      full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      home_kituo = EXCLUDED.home_kituo,
      national_id_no = EXCLUDED.national_id_no,
      license_no = EXCLUDED.license_no,
      license_expiry = EXCLUDED.license_expiry,
      plate_number = EXCLUDED.plate_number,
      vehicle_model = EXCLUDED.vehicle_model,
      vehicle_color = EXCLUDED.vehicle_color,
      insurance_expiry = EXCLUDED.insurance_expiry,
      payout_mobile_number = EXCLUDED.payout_mobile_number,
      kyc_status = 'PENDING_VERIFICATION',
      rejection_reason = NULL,
      is_online = FALSE,
      updated_at = NOW()
    RETURNING *
  `;

  const profile = rows[0] as { id: string; transport_type: TransportType };

  await sql`
    INSERT INTO operator.outbox_events (subject, correlation_id, payload)
    VALUES (
      ${EVENT_SUBJECTS.OPERATOR_KYC_SUBMITTED},
      ${String(request.id)},
      ${JSON.stringify({
        operatorId: profile.id,
        userId: caller.userId,
        transportType: data.transportType,
        operatorTitle,
        plateNumber: normalizedPlate,
      })}::jsonb
    )
  `;

  return reply.code(200).send({
    profile,
    requiredDocuments: getRequiredDocs(data.transportType),
  });
});

// 2. Get Own Rider / Driver Profile + KYC Checklist + Eligibility
app.get("/api/v1/operators/me", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }

  const sql = getSql();
  const profiles = await sql`
    SELECT * FROM operator.profiles
    WHERE user_id = ${caller.userId}
    LIMIT 1
  `;

  const profile = profiles[0] as
    | {
        id: string;
        transport_type: TransportType;
        kyc_status: string;
        float_blocked: boolean;
      }
    | undefined;

  if (!profile) {
    return reply.code(404).send({
      error: "PROFILE_NOT_FOUND",
      kycStatus: "NOT_SUBMITTED",
    });
  }

  const documents = await sql`
    SELECT id, doc_type, storage_key, content_type, status, uploaded_at
    FROM operator.kyc_documents
    WHERE operator_id = ${profile.id}
    ORDER BY doc_type ASC
  `;

  const requiredDocs = getRequiredDocs(profile.transport_type);
  const uploadedTypes = new Set(
    documents.map((d) => String((d as { doc_type: string }).doc_type))
  );
  const missingDocuments = requiredDocs.filter((doc) => !uploadedTypes.has(doc));

  return reply.code(200).send({
    profile,
    documents,
    requiredDocuments: requiredDocs,
    missingDocuments,
    canGoOnline:
      profile.kyc_status === "APPROVED" && !profile.float_blocked,
  });
});

// 3. Request Presigned Private Storage Key for KYC Photo Upload
app.post("/api/v1/operators/documents/presign", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }

  const parsed = presignDocumentSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const sql = getSql();
  const profiles = await sql`
    SELECT id FROM operator.profiles WHERE user_id = ${caller.userId} LIMIT 1
  `;
  const profile = profiles[0] as { id: string } | undefined;
  if (!profile) {
    return reply.code(404).send({
      error: "PROFILE_NOT_FOUND",
      message: "Submit onboarding profile before uploading KYC documents.",
    });
  }

  const ext =
    parsed.data.contentType === "image/png"
      ? "png"
      : parsed.data.contentType === "image/webp"
        ? "webp"
        : parsed.data.contentType === "application/pdf"
          ? "pdf"
          : "jpg";
  const bucket = process.env.R2_KYC_BUCKET ?? "goboda-kyc-private";
  const storageKey = `kyc/${profile.id}/${parsed.data.docType.toLowerCase()}-${randomUUID()}.${ext}`;

  const docRows = await sql`
    INSERT INTO operator.kyc_documents (operator_id, doc_type, storage_key, content_type, status)
    VALUES (${profile.id}, ${parsed.data.docType}, ${storageKey}, ${parsed.data.contentType}, 'UPLOADED')
    ON CONFLICT (operator_id, doc_type) DO UPDATE SET
      storage_key = EXCLUDED.storage_key,
      content_type = EXCLUDED.content_type,
      status = 'UPLOADED',
      uploaded_at = NOW()
    RETURNING id, doc_type, storage_key, content_type, status, uploaded_at
  `;

  return reply.code(200).send({
    document: docRows[0],
    uploadTarget: {
      bucket,
      storageKey,
      contentType: parsed.data.contentType,
      provider: process.env.R2_ACCOUNT_ID ? "cloudflare-r2" : "storage-stub",
    },
  });
});

// 4. Toggle Online / Offline Shift Availability (Strictly Enforces Approval + Float Gate)
app.patch("/api/v1/operators/availability", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }

  const parsed = availabilitySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "VALIDATION_ERROR" });
  }

  const sql = getSql();
  const rows = await sql`
    SELECT id, kyc_status, float_blocked, transport_type, operator_title
    FROM operator.profiles
    WHERE user_id = ${caller.userId}
    LIMIT 1
  `;

  const profile = rows[0] as
    | {
        id: string;
        kyc_status: string;
        float_blocked: boolean;
        transport_type: TransportType;
        operator_title: string;
      }
    | undefined;

  if (!profile) {
    return reply.code(404).send({ error: "PROFILE_NOT_FOUND" });
  }

  if (parsed.data.isOnline) {
    if (profile.kyc_status !== "APPROVED") {
      return reply.code(403).send({
        error: "KYC_NOT_APPROVED",
        kycStatus: profile.kyc_status,
        message: "Account must be approved by Go.boda Admin before going online.",
      });
    }
    if (profile.float_blocked) {
      return reply.code(403).send({
        error: "COMMISSION_FLOAT_BLOCKED",
        message:
          "Commission float is below -5,000 TZS. Top up via Mobile Money to resume trips.",
      });
    }
  }

  const updated = await sql`
    UPDATE operator.profiles
    SET is_online = ${parsed.data.isOnline}, updated_at = NOW()
    WHERE id = ${profile.id}
    RETURNING id, transport_type, operator_title, kyc_status, is_online, updated_at
  `;

  return reply.code(200).send({ availability: updated[0] });
});

// 5. Admin: List Rider & Driver KYC Verification Queue
app.get("/api/v1/operators/admin/queue", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "ADMIN_REQUIRED" });
  }

  const query = request.query as { status?: string; transportType?: string };
  const statusFilter = query.status ?? "PENDING_VERIFICATION";
  const sql = getSql();

  const profiles =
    query.transportType === "BODABODA" || query.transportType === "BAJAJI"
      ? await sql`
          SELECT * FROM operator.profiles
          WHERE kyc_status = ${statusFilter}
            AND transport_type = ${query.transportType}
          ORDER BY created_at ASC
          LIMIT 100
        `
      : await sql`
          SELECT * FROM operator.profiles
          WHERE kyc_status = ${statusFilter}
          ORDER BY created_at ASC
          LIMIT 100
        `;

  return reply.code(200).send({
    filter: { status: statusFilter, transportType: query.transportType ?? "ALL" },
    count: profiles.length,
    operators: profiles,
  });
});

// 6. Admin: Approve / Reject / Suspend Bodaboda Rider or Bajaji Driver
app.post("/api/v1/operators/admin/:operatorId/review", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "ADMIN_REQUIRED" });
  }

  const { operatorId } = request.params as { operatorId: string };
  const parsed = adminReviewSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const sql = getSql();
  const existing = await sql`
    SELECT id, user_id, transport_type, operator_title, plate_number
    FROM operator.profiles
    WHERE id = ${operatorId}
    LIMIT 1
  `;

  const op = existing[0] as
    | {
        id: string;
        user_id: string;
        transport_type: TransportType;
        operator_title: string;
        plate_number: string;
      }
    | undefined;

  if (!op) {
    return reply.code(404).send({ error: "OPERATOR_NOT_FOUND" });
  }

  const isApproved = parsed.data.decision === "APPROVED";
  const helmetVerified =
    parsed.data.helmetVerified ??
    (isApproved && op.transport_type === TransportType.BODABODA);

  const updatedRows = await sql`
    UPDATE operator.profiles
    SET
      kyc_status = ${parsed.data.decision},
      helmet_verified = ${helmetVerified},
      rejection_reason = ${isApproved ? null : (parsed.data.rejectionReason ?? null)},
      is_online = CASE WHEN ${isApproved} THEN is_online ELSE FALSE END,
      approved_by = CASE WHEN ${isApproved} THEN ${caller.userId}::uuid ELSE approved_by END,
      approved_at = CASE WHEN ${isApproved} THEN NOW() ELSE approved_at END,
      updated_at = NOW()
    WHERE id = ${operatorId}
    RETURNING *
  `;

  const subject =
    parsed.data.decision === "APPROVED"
      ? EVENT_SUBJECTS.OPERATOR_APPROVED
      : parsed.data.decision === "REJECTED"
        ? EVENT_SUBJECTS.OPERATOR_REJECTED
        : EVENT_SUBJECTS.OPERATOR_SUSPENDED;

  await sql`
    INSERT INTO operator.outbox_events (subject, correlation_id, payload)
    VALUES (
      ${subject},
      ${String(request.id)},
      ${JSON.stringify({
        operatorId: op.id,
        userId: op.user_id,
        transportType: op.transport_type,
        operatorTitle: op.operator_title,
        plateNumber: op.plate_number,
        decision: parsed.data.decision,
        reviewedBy: caller.userId,
      })}::jsonb
    )
  `;

  return reply.code(200).send({
    operator: updatedRows[0],
    emittedEvent: subject,
  });
});

export default app;
