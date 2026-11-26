import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { jwtVerify } from "jose";
import { z } from "zod";
import { checkDatabaseHealth, getSql } from "@goboda/db";
import { createLogger, REQUEST_ID_HEADER } from "@goboda/logger";
import {
  PLATFORM_FINANCE,
  transportTypeSchema,
  UserRole,
  type TransportType,
} from "@goboda/shared-types";

export const SERVICE_NAME = "pricing-service";
export const SERVICE_VERSION = "0.1.0";
export const PORT = Number(
  process.env.PORT ?? process.env.PRICING_SERVICE_PORT ?? 4005
);
export const HOST = process.env.HOST ?? "0.0.0.0";

export const logger = createLogger(SERVICE_NAME);

interface TariffRow {
  transport_type: TransportType;
  operator_role: "RIDER" | "DRIVER";
  base_fare_tzs: number;
  per_km_tzs: number;
  per_min_tzs: number;
  min_fare_tzs: number;
  wait_fee_per_min_tzs: number;
  free_wait_minutes: number;
  cancel_fee_tzs: number;
  commission_pct: number;
  max_multiplier: number;
  active_multiplier: number;
  multiplier_reason: string;
  max_passengers: number;
}

interface PromoRow {
  code: string;
  discount_type: "PERCENT" | "FLAT_TZS";
  discount_value: number;
  max_discount_tzs: number;
  min_fare_tzs: number;
  active: boolean;
  expires_at: string | null;
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

async function isAdminCaller(authHeader?: string): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  try {
    const { payload } = await jwtVerify(
      authHeader.slice(7).trim(),
      getJwtSecretBytes(),
      { issuer: "goboda-auth-service", audience: "goboda-platform" }
    );
    return payload.role === UserRole.ADMIN;
  } catch {
    return false;
  }
}

function roundToStep(amount: number, minFare: number): number {
  const step = PLATFORM_FINANCE.FARE_ROUNDING_STEP_TZS;
  return Math.max(minFare, Math.round(amount / step) * step);
}

function computeTierQuote(params: {
  tariff: TariffRow;
  distanceMeters: number;
  durationSeconds: number;
  waitMinutes: number;
  requestedMultiplier?: number;
  promo?: PromoRow | null;
}) {
  const { tariff, distanceMeters, durationSeconds, waitMinutes, promo } = params;
  const distanceKm = distanceMeters / 1000;
  const durationMin = durationSeconds / 60;

  const billableWaitMin = Math.max(0, waitMinutes - tariff.free_wait_minutes);
  const waitFeeTzs = billableWaitMin * tariff.wait_fee_per_min_tzs;

  const rawMultiplier = params.requestedMultiplier ?? tariff.active_multiplier;
  const appliedMultiplier = Math.min(
    tariff.max_multiplier,
    Math.max(1.0, rawMultiplier)
  );

  const subtotalBeforeMultiplier =
    tariff.base_fare_tzs +
    distanceKm * tariff.per_km_tzs +
    durationMin * tariff.per_min_tzs +
    waitFeeTzs;

  const grossFareTzs = roundToStep(
    subtotalBeforeMultiplier * appliedMultiplier,
    tariff.min_fare_tzs
  );

  let discountTzs = 0;
  let promoApplied: string | null = null;
  if (promo && grossFareTzs >= promo.min_fare_tzs) {
    const rawDiscount =
      promo.discount_type === "PERCENT"
        ? Math.round((grossFareTzs * promo.discount_value) / 100)
        : promo.discount_value;
    discountTzs = Math.min(rawDiscount, promo.max_discount_tzs);
    // Keep final fare in clean 500 TZS steps and never below 500 TZS
    const discounted = Math.max(
      500,
      Math.round((grossFareTzs - discountTzs) / 500) * 500
    );
    discountTzs = Math.max(0, grossFareTzs - discounted);
    if (discountTzs > 0) promoApplied = promo.code;
  }

  const finalFareTzs = grossFareTzs - discountTzs;
  // Commission calculated on gross trip value so promos never punish Riders/Drivers
  const commissionTzs = Math.round((grossFareTzs * tariff.commission_pct) / 100);
  const operatorNetTzs = Math.max(0, grossFareTzs - commissionTzs);

  return {
    transportType: tariff.transport_type,
    operatorRole: tariff.operator_role,
    currency: "TZS",
    maxPassengers: tariff.max_passengers,
    baseFareTzs: tariff.base_fare_tzs,
    distanceFareTzs: Math.round(distanceKm * tariff.per_km_tzs),
    timeFareTzs: Math.round(durationMin * tariff.per_min_tzs),
    waitFeeTzs,
    appliedMultiplier,
    multiplierReason:
      appliedMultiplier > 1 ? tariff.multiplier_reason : "NORMAL",
    grossFareTzs,
    discountTzs,
    promoApplied,
    finalFareTzs,
    commissionPct: tariff.commission_pct,
    commissionTzs,
    operatorNetTzs,
  };
}

const quoteBodySchema = z.object({
  distanceMeters: z.number().min(50).max(120000),
  durationSeconds: z.number().min(30).max(18000),
  waitMinutes: z.number().min(0).max(120).default(0),
  promoCode: z.string().trim().max(32).optional(),
  isNight: z.boolean().default(false),
  isRain: z.boolean().default(false),
});

const cancelFeeBodySchema = z.object({
  transportType: transportTypeSchema,
  tripStatus: z.enum([
    "SEARCHING",
    "OFFERED_TO_OPERATOR",
    "ASSIGNED",
    "ARRIVED_AT_PICKUP",
  ]),
  secondsSinceAssigned: z.number().min(0).default(0),
});

const updateTariffSchema = z.object({
  baseFareTzs: z.number().int().min(500).max(20000).optional(),
  perKmTzs: z.number().int().min(100).max(10000).optional(),
  perMinTzs: z.number().int().min(0).max(2000).optional(),
  minFareTzs: z.number().int().min(500).max(20000).optional(),
  waitFeePerMinTzs: z.number().int().min(0).max(2000).optional(),
  cancelFeeTzs: z.number().int().min(0).max(5000).optional(),
  commissionPct: z.number().int().min(0).max(25).optional(),
  activeMultiplier: z.number().min(1).max(1.5).optional(),
  multiplierReason: z.string().trim().min(2).max(40).optional(),
});

const createPromoSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(24),
  discountType: z.enum(["PERCENT", "FLAT_TZS"]),
  discountValue: z.number().int().min(1).max(50000),
  maxDiscountTzs: z.number().int().min(100).max(50000).default(2000),
  minFareTzs: z.number().int().min(500).max(50000).default(1500),
  active: z.boolean().default(true),
  expiresAt: z.string().datetime().nullable().optional(),
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
app.register(rateLimit, { max: 200, timeWindow: "1 minute" });

app.addHook("onRequest", async (request, reply) => {
  reply.header(REQUEST_ID_HEADER, request.id);
});

app.get("/", async () => ({
  service: SERVICE_NAME,
  version: SERVICE_VERSION,
  currency: "TZS",
  endpoints: [
    "/healthz",
    "/readyz",
    "/api/v1/pricing/tariffs",
    "/api/v1/pricing/quote",
    "/api/v1/pricing/cancel-fee",
    "/api/v1/pricing/admin/tariffs/:transportType",
    "/api/v1/pricing/admin/promos",
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

// 1. Get Active Unguja Bodaboda (Rider) & Bajaji (Driver) Tariffs
app.get("/api/v1/pricing/tariffs", async (_req, reply) => {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM pricing.tariffs ORDER BY transport_type ASC
  `;
  return reply.code(200).send({
    currency: "TZS",
    roundingStepTzs: PLATFORM_FINANCE.FARE_ROUNDING_STEP_TZS,
    tariffs: rows,
  });
});

// 2. Calculate Upfront TZS Fare Quotes (Go.boda & Go.bajaji)
app.post("/api/v1/pricing/quote", async (request, reply) => {
  const parsed = quoteBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const sql = getSql();
  const tariffRows = (await sql`
    SELECT * FROM pricing.tariffs ORDER BY transport_type ASC
  `) as unknown as TariffRow[];

  let promo: PromoRow | null = null;
  let promoStatus: "NONE" | "APPLIED" | "INVALID" = "NONE";
  if (d.promoCode && d.promoCode.length > 0) {
    const normalizedCode = d.promoCode.toUpperCase();
    const promoRows = (await sql`
      SELECT * FROM pricing.promo_codes
      WHERE code = ${normalizedCode}
        AND active = TRUE
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1
    `) as unknown as PromoRow[];
    if (promoRows[0]) {
      promo = promoRows[0];
      promoStatus = "APPLIED";
    } else {
      promoStatus = "INVALID";
    }
  }

  const dynamicRequestedMultiplier =
    d.isNight && d.isRain
      ? 1.25
      : d.isNight || d.isRain
        ? 1.15
        : undefined;

  const quotes: Record<string, ReturnType<typeof computeTierQuote>> = {};
  for (const tariff of tariffRows) {
    quotes[tariff.transport_type] = computeTierQuote({
      tariff,
      distanceMeters: d.distanceMeters,
      durationSeconds: d.durationSeconds,
      waitMinutes: d.waitMinutes,
      requestedMultiplier: dynamicRequestedMultiplier,
      promo,
    });
  }

  return reply.code(200).send({
    currency: "TZS",
    distanceKm: Number((d.distanceMeters / 1000).toFixed(2)),
    durationMinutes: Math.max(1, Math.round(d.durationSeconds / 60)),
    promoStatus,
    quotes,
  });
});

// 3. Cancellation Fee Calculator
app.post("/api/v1/pricing/cancel-fee", async (request, reply) => {
  const parsed = cancelFeeBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "VALIDATION_ERROR" });
  }
  const d = parsed.data;

  // Free cancellation before assignment or within 2 minutes of assignment
  if (
    d.tripStatus === "SEARCHING" ||
    d.tripStatus === "OFFERED_TO_OPERATOR" ||
    (d.tripStatus === "ASSIGNED" && d.secondsSinceAssigned <= 120)
  ) {
    return reply.code(200).send({
      cancelFeeTzs: 0,
      currency: "TZS",
      reason: "FREE_CANCELLATION_WINDOW",
    });
  }

  const sql = getSql();
  const rows = await sql`
    SELECT cancel_fee_tzs FROM pricing.tariffs
    WHERE transport_type = ${d.transportType}
    LIMIT 1
  `;
  const fee = Number(
    (rows[0] as { cancel_fee_tzs?: number })?.cancel_fee_tzs ??
      (d.transportType === "BAJAJI" ? 1000 : 500)
  );

  return reply.code(200).send({
    cancelFeeTzs: fee,
    currency: "TZS",
    reason:
      d.tripStatus === "ARRIVED_AT_PICKUP"
        ? "OPERATOR_ALREADY_ARRIVED"
        : "LATE_CANCELLATION",
  });
});

// 4. Admin: Live Update TZS Tariff Config
app.patch("/api/v1/pricing/admin/tariffs/:transportType", async (request, reply) => {
  if (!(await isAdminCaller(request.headers.authorization))) {
    return reply.code(403).send({ error: "ADMIN_REQUIRED" });
  }

  const { transportType } = request.params as { transportType: string };
  const validType = transportTypeSchema.safeParse(transportType.toUpperCase());
  if (!validType.success) {
    return reply.code(400).send({ error: "INVALID_TRANSPORT_TYPE" });
  }

  const parsed = updateTariffSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const sql = getSql();
  const rows = await sql`
    UPDATE pricing.tariffs
    SET
      base_fare_tzs = COALESCE(${d.baseFareTzs ?? null}, base_fare_tzs),
      per_km_tzs = COALESCE(${d.perKmTzs ?? null}, per_km_tzs),
      per_min_tzs = COALESCE(${d.perMinTzs ?? null}, per_min_tzs),
      min_fare_tzs = COALESCE(${d.minFareTzs ?? null}, min_fare_tzs),
      wait_fee_per_min_tzs = COALESCE(${d.waitFeePerMinTzs ?? null}, wait_fee_per_min_tzs),
      cancel_fee_tzs = COALESCE(${d.cancelFeeTzs ?? null}, cancel_fee_tzs),
      commission_pct = COALESCE(${d.commissionPct ?? null}, commission_pct),
      active_multiplier = COALESCE(${d.activeMultiplier ?? null}, active_multiplier),
      multiplier_reason = COALESCE(${d.multiplierReason ?? null}, multiplier_reason),
      updated_at = NOW()
    WHERE transport_type = ${validType.data}
    RETURNING *
  `;

  return reply.code(200).send({ tariff: rows[0] });
});

// 5. Admin: Create / Update Promo Code
app.post("/api/v1/pricing/admin/promos", async (request, reply) => {
  if (!(await isAdminCaller(request.headers.authorization))) {
    return reply.code(403).send({ error: "ADMIN_REQUIRED" });
  }

  const parsed = createPromoSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const sql = getSql();
  const rows = await sql`
    INSERT INTO pricing.promo_codes (
      code, discount_type, discount_value, max_discount_tzs, min_fare_tzs, active, expires_at
    )
    VALUES (
      ${d.code}, ${d.discountType}, ${d.discountValue}, ${d.maxDiscountTzs},
      ${d.minFareTzs}, ${d.active}, ${d.expiresAt ?? null}
    )
    ON CONFLICT (code) DO UPDATE SET
      discount_type = EXCLUDED.discount_type,
      discount_value = EXCLUDED.discount_value,
      max_discount_tzs = EXCLUDED.max_discount_tzs,
      min_fare_tzs = EXCLUDED.min_fare_tzs,
      active = EXCLUDED.active,
      expires_at = EXCLUDED.expires_at
    RETURNING *
  `;

  return reply.code(201).send({ promo: rows[0] });
});

export default app;
