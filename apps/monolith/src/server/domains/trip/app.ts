import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
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
  coordinatesSchema,
  DEFAULT_TARIFFS_TZS,
  getOperatorTitle,
  paymentMethodSchema,
  PLATFORM_FINANCE,
  TransportType,
  transportTypeSchema,
  TripStatus,
  UserRole,
  type Coordinates,
} from "@goboda/shared-types";

export const SERVICE_NAME = "trip-service";
export const SERVICE_VERSION = "0.1.0";
export const PORT = Number(
  process.env.PORT ?? process.env.TRIP_SERVICE_PORT ?? 4007
);
export const HOST = process.env.HOST ?? "0.0.0.0";

export const logger = createLogger(SERVICE_NAME);

// Strict server-side Trip State Machine
export const ALLOWED_TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  [TripStatus.DRAFT]: [TripStatus.SEARCHING],
  [TripStatus.SEARCHING]: [
    TripStatus.OFFERED_TO_OPERATOR,
    TripStatus.ASSIGNED,
    TripStatus.NO_OPERATOR_FOUND,
    TripStatus.CANCELLED_BY_CUSTOMER,
  ],
  [TripStatus.OFFERED_TO_OPERATOR]: [
    TripStatus.ASSIGNED,
    TripStatus.SEARCHING,
    TripStatus.NO_OPERATOR_FOUND,
    TripStatus.CANCELLED_BY_CUSTOMER,
  ],
  [TripStatus.NO_OPERATOR_FOUND]: [
    TripStatus.SEARCHING,
    TripStatus.CANCELLED_BY_CUSTOMER,
  ],
  [TripStatus.ASSIGNED]: [
    TripStatus.ARRIVED_AT_PICKUP,
    TripStatus.SEARCHING,
    TripStatus.CANCELLED_BY_CUSTOMER,
    TripStatus.CANCELLED_BY_OPERATOR,
  ],
  [TripStatus.ARRIVED_AT_PICKUP]: [
    TripStatus.IN_PROGRESS,
    TripStatus.CANCELLED_BY_CUSTOMER,
    TripStatus.CANCELLED_BY_OPERATOR,
  ],
  [TripStatus.IN_PROGRESS]: [
    TripStatus.COMPLETED_UNPAID,
    TripStatus.SOS_ACTIVE,
  ],
  [TripStatus.SOS_ACTIVE]: [
    TripStatus.IN_PROGRESS,
    TripStatus.COMPLETED_UNPAID,
  ],
  [TripStatus.COMPLETED_UNPAID]: [
    TripStatus.PAID_COMPLETED,
    TripStatus.PAYMENT_DISPUTED,
  ],
  [TripStatus.PAID_COMPLETED]: [],
  [TripStatus.CANCELLED_BY_CUSTOMER]: [],
  [TripStatus.CANCELLED_BY_OPERATOR]: [],
  [TripStatus.PAYMENT_DISPUTED]: [TripStatus.PAID_COMPLETED],
};

function canTransition(from: TripStatus, to: TripStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
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
): Promise<{ userId: string; role: UserRole; phone?: string } | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(
      authHeader.slice(7).trim(),
      getJwtSecretBytes(),
      { issuer: "goboda-auth-service", audience: "goboda-platform" }
    );
    if (!payload.sub || typeof payload.role !== "string") return null;
    return {
      userId: payload.sub,
      role: payload.role as UserRole,
      phone: typeof payload.phone === "string" ? payload.phone : undefined,
    };
  } catch {
    return null;
  }
}

function haversineMeters(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

async function resolveUngujaPoint(point: Coordinates) {
  const sql = getSql();
  const checkRows = await sql`
    SELECT
      ST_Contains(
        (SELECT geom FROM geo.zones WHERE id = 'unguja-island'),
        ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)
      ) AS in_unguja,
      ST_Contains(
        (SELECT geom FROM geo.zones WHERE id = 'stone-town-pedestrian'),
        ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)
      ) AS in_stone_town
  `;
  const row = checkRows[0] as
    | { in_unguja?: boolean; in_stone_town?: boolean }
    | undefined;
  const inUnguja = Boolean(row?.in_unguja);
  const inStoneTown = Boolean(row?.in_stone_town);

  if (!inUnguja || !inStoneTown) {
    return {
      inUnguja,
      snapped: false,
      effective: point,
      snapGateName: null as string | null,
      walkMeters: 0,
    };
  }

  const snapRows = await sql`
    SELECT
      name_en AS "nameEn",
      lat,
      lng,
      ROUND(
        ST_DistanceSphere(
          geom,
          ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)
        )
      )::int AS "walkMeters"
    FROM geo.snap_points
    WHERE zone_id = 'stone-town-pedestrian'
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)
    LIMIT 1
  `;
  const gate = snapRows[0] as
    | { nameEn: string; lat: number; lng: number; walkMeters: number }
    | undefined;

  if (!gate) {
    return {
      inUnguja: true,
      snapped: false,
      effective: point,
      snapGateName: null,
      walkMeters: 0,
    };
  }

  return {
    inUnguja: true,
    snapped: true,
    effective: { lat: gate.lat, lng: gate.lng },
    snapGateName: gate.nameEn,
    walkMeters: gate.walkMeters,
  };
}

async function computeRouteMetrics(from: Coordinates, to: Coordinates) {
  const osrmBase = process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org";
  try {
    const res = await fetch(
      `${osrmBase}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`,
      { signal: AbortSignal.timeout(2500) }
    );
    if (res.ok) {
      const json = (await res.json()) as {
        routes?: Array<{ distance: number; duration: number }>;
      };
      const r = json.routes?.[0];
      if (r && r.distance > 0) {
        return {
          distanceMeters: Math.round(r.distance),
          durationSeconds: Math.round(r.duration),
        };
      }
    }
  } catch {
    // Fall back to Haversine road-factor estimate
  }

  const distanceMeters = Math.max(
    300,
    Math.round(haversineMeters(from, to) * 1.35)
  );
  return {
    distanceMeters,
    durationSeconds: Math.max(90, Math.round(distanceMeters / 7.5)),
  };
}

interface TripRow {
  id: string;
  trip_code: string;
  customer_id: string;
  operator_id: string | null;
  transport_type: TransportType;
  operator_title: "RIDER" | "DRIVER";
  status: TripStatus;
  pickup_lat: number;
  pickup_lng: number;
  pickup_label: string;
  pickup_snapped: boolean;
  pickup_effective_lat: number;
  pickup_effective_lng: number;
  pickup_snap_gate_name: string | null;
  pickup_walk_meters: number;
  pickup_note: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_label: string;
  distance_meters: number;
  duration_seconds: number;
  payment_method: string;
  promo_code: string | null;
  gross_fare_tzs: number;
  discount_tzs: number;
  estimated_fare_tzs: number;
  wait_fee_tzs: number;
  cancel_fee_tzs: number;
  final_fare_tzs: number | null;
  commission_pct: number;
  commission_tzs: number;
  operator_net_tzs: number;
  start_pin: string;
  pin_verified_at: string | null;
  assigned_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancelled_by_role: string | null;
  operator_plate: string | null;
  operator_name: string | null;
  operator_phone: string | null;
  helmet_provided: boolean | null;
  created_at: string;
  updated_at: string;
}

function serializeTrip(row: TripRow, includeStartPin: boolean) {
  const waitElapsedSeconds =
    row.arrived_at && row.status === TripStatus.ARRIVED_AT_PICKUP
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(row.arrived_at).getTime()) / 1000)
        )
      : 0;

  return {
    id: row.id,
    tripCode: row.trip_code,
    customerId: row.customer_id,
    operatorId: row.operator_id,
    transportType: row.transport_type,
    operatorTitle: row.operator_title,
    status: row.status,
    pickup: {
      lat: row.pickup_lat,
      lng: row.pickup_lng,
      label: row.pickup_label,
      snapped: row.pickup_snapped,
      effectiveLat: row.pickup_effective_lat,
      effectiveLng: row.pickup_effective_lng,
      snapGateName: row.pickup_snap_gate_name,
      walkMeters: row.pickup_walk_meters,
      note: row.pickup_note,
    },
    dropoff: {
      lat: row.dropoff_lat,
      lng: row.dropoff_lng,
      label: row.dropoff_label,
    },
    route: {
      distanceMeters: row.distance_meters,
      distanceKm: Number((row.distance_meters / 1000).toFixed(2)),
      durationSeconds: row.duration_seconds,
      durationMinutes: Math.max(1, Math.round(row.duration_seconds / 60)),
    },
    pricing: {
      currency: "TZS",
      paymentMethod: row.payment_method,
      promoCode: row.promo_code,
      grossFareTzs: row.gross_fare_tzs,
      discountTzs: row.discount_tzs,
      estimatedFareTzs: row.estimated_fare_tzs,
      waitFeeTzs: row.wait_fee_tzs,
      cancelFeeTzs: row.cancel_fee_tzs,
      finalFareTzs: row.final_fare_tzs,
      commissionPct: row.commission_pct,
      commissionTzs: row.commission_tzs,
      operatorNetTzs: row.operator_net_tzs,
    },
    startPin: includeStartPin ? row.start_pin : null,
    pinVerifiedAt: row.pin_verified_at,
    waitTimer: {
      freeWaitMinutes: PLATFORM_FINANCE.FREE_WAIT_MINUTES,
      elapsedSeconds: waitElapsedSeconds,
    },
    operator: row.operator_id
      ? {
          id: row.operator_id,
          title: row.operator_title,
          name: row.operator_name,
          plateNumber: row.operator_plate,
          phone: row.operator_phone,
        }
      : null,
    helmetProvided: row.helmet_provided,
    timestamps: {
      createdAt: row.created_at,
      assignedAt: row.assigned_at,
      arrivedAt: row.arrived_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      cancelledAt: row.cancelled_at,
    },
  };
}

async function appendOutbox(
  subject: string,
  payload: Record<string, unknown>,
  correlationId: string
) {
  const sql = getSql();
  await sql`
    INSERT INTO trip.outbox_events (subject, payload, correlation_id)
    VALUES (${subject}, ${JSON.stringify(payload)}::jsonb, ${correlationId})
  `;
}

async function recordTransition(params: {
  tripId: string;
  fromStatus: TripStatus | null;
  toStatus: TripStatus;
  actorId: string | null;
  actorRole: string;
  note?: string;
}) {
  const sql = getSql();
  await sql`
    INSERT INTO trip.state_transitions (
      trip_id, from_status, to_status, actor_id, actor_role, note
    )
    VALUES (
      ${params.tripId}::uuid,
      ${params.fromStatus},
      ${params.toStatus},
      ${params.actorId}::uuid,
      ${params.actorRole},
      ${params.note ?? ""}
    )
  `;
}

const createTripSchema = z.object({
  transportType: transportTypeSchema,
  pickup: coordinatesSchema,
  pickupLabel: z.string().trim().min(2).max(160),
  pickupNote: z.string().trim().max(200).default(""),
  dropoff: coordinatesSchema,
  dropoffLabel: z.string().trim().min(2).max(160),
  paymentMethod: paymentMethodSchema.default("CASH"),
  promoCode: z.string().trim().max(32).optional(),
});

const internalAssignSchema = z.object({
  operatorId: z.string().uuid(),
  operatorPlate: z.string().trim().max(24).optional(),
  operatorName: z.string().trim().max(120).optional(),
  operatorPhone: z.string().trim().max(32).optional(),
});

const internalStatusSchema = z.object({
  status: z.enum([
    "OFFERED_TO_OPERATOR",
    "NO_OPERATOR_FOUND",
    "PAID_COMPLETED",
    "PAYMENT_DISPUTED",
    "SOS_ACTIVE",
    "IN_PROGRESS",
  ]),
  note: z.string().trim().max(200).optional(),
});

const startTripSchema = z.object({
  startPin: z.string().trim().regex(/^\d{4}$/, "4-digit Start PIN required"),
});

const cancelTripSchema = z.object({
  reason: z.string().trim().max(200).default(""),
  requeue: z.boolean().default(true),
});

const rateTripSchema = z.object({
  stars: z.number().int().min(1).max(5),
  helmetProvided: z.boolean().optional(),
  comment: z.string().trim().max(300).default(""),
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
  serviceArea: "Unguja Island, Zanzibar",
  endpoints: [
    "/healthz",
    "/readyz",
    "POST /api/v1/trips",
    "GET /api/v1/trips",
    "GET /api/v1/trips/:id",
    "POST /api/v1/trips/:id/arrive",
    "POST /api/v1/trips/:id/start",
    "POST /api/v1/trips/:id/complete",
    "POST /api/v1/trips/:id/cancel",
    "POST /api/v1/trips/:id/rate",
    "GET /api/v1/trips/admin/overview",
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

// 1. Customer creates a new Unguja Bodaboda or Bajaji Trip
app.post("/api/v1/trips", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (caller.role !== UserRole.CUSTOMER && caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({
      error: "CUSTOMER_ROLE_REQUIRED",
      message: "Only Customers can request a trip.",
    });
  }

  const parsed = createTripSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const [pickupGeo, dropoffGeo] = await Promise.all([
    resolveUngujaPoint(d.pickup),
    resolveUngujaPoint(d.dropoff),
  ]);

  if (!pickupGeo.inUnguja || !dropoffGeo.inUnguja) {
    return reply.code(422).send({
      error: "OUTSIDE_UNGUJA_SERVICE_AREA",
      messageEn:
        "Both pickup and dropoff must be inside Unguja Island, Zanzibar.",
      messageSw:
        "Mahali pa kuchukuliwa na kushushwa lazima pawe ndani ya Kisiwa cha Unguja, Zanzibar.",
    });
  }

  const route = await computeRouteMetrics(
    pickupGeo.effective,
    dropoffGeo.effective
  );

  // Upfront TZS Fare Calculation (matching pricing-service rules)
  const sql = getSql();
  const tariffRows = (await sql`
    SELECT base_fare_tzs, per_km_tzs, per_min_tzs, min_fare_tzs,
           commission_pct, active_multiplier, max_multiplier
    FROM pricing.tariffs
    WHERE transport_type = ${d.transportType}
    LIMIT 1
  `) as Array<{
    base_fare_tzs: number;
    per_km_tzs: number;
    per_min_tzs: number;
    min_fare_tzs: number;
    commission_pct: number;
    active_multiplier: number;
    max_multiplier: number;
  }>;

  const fallback = DEFAULT_TARIFFS_TZS[d.transportType];
  const tr = tariffRows[0];
  const base = tr?.base_fare_tzs ?? fallback.baseFareTzs;
  const perKm = tr?.per_km_tzs ?? fallback.perKmTzs;
  const perMin = tr?.per_min_tzs ?? fallback.perMinTzs;
  const minFare = tr?.min_fare_tzs ?? fallback.minFareTzs;
  const commissionPct = tr?.commission_pct ?? fallback.commissionPct;
  const mult = Math.min(
    tr?.max_multiplier ?? fallback.maxMultiplier,
    Math.max(1, tr?.active_multiplier ?? 1)
  );

  const step = PLATFORM_FINANCE.FARE_ROUNDING_STEP_TZS;
  const rawFare =
    (base +
      (route.distanceMeters / 1000) * perKm +
      (route.durationSeconds / 60) * perMin) *
    mult;
  const grossFareTzs = Math.max(minFare, Math.round(rawFare / step) * step);

  let discountTzs = 0;
  let appliedPromo: string | null = null;
  if (d.promoCode && d.promoCode.trim().length > 0) {
    const code = d.promoCode.trim().toUpperCase();
    const promoRows = (await sql`
      SELECT code, discount_type, discount_value, max_discount_tzs, min_fare_tzs
      FROM pricing.promo_codes
      WHERE code = ${code} AND active = TRUE
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1
    `) as Array<{
      code: string;
      discount_type: "PERCENT" | "FLAT_TZS";
      discount_value: number;
      max_discount_tzs: number;
      min_fare_tzs: number;
    }>;
    const promo = promoRows[0];
    if (promo && grossFareTzs >= promo.min_fare_tzs) {
      const rawDisc =
        promo.discount_type === "PERCENT"
          ? Math.round((grossFareTzs * promo.discount_value) / 100)
          : promo.discount_value;
      const capped = Math.min(rawDisc, promo.max_discount_tzs);
      const after = Math.max(
        500,
        Math.round((grossFareTzs - capped) / step) * step
      );
      discountTzs = Math.max(0, grossFareTzs - after);
      if (discountTzs > 0) appliedPromo = promo.code;
    }
  }

  const estimatedFareTzs = grossFareTzs - discountTzs;
  const commissionTzs = Math.round((grossFareTzs * commissionPct) / 100);
  const operatorNetTzs = Math.max(0, grossFareTzs - commissionTzs);

  const operatorTitle = getOperatorTitle(d.transportType);
  const startPin = String(randomInt(1000, 10000));
  const tripCode = `GB-${randomInt(10000, 99999)}`;

  const inserted = (await sql`
    INSERT INTO trip.trips (
      trip_code, customer_id, transport_type, operator_title, status,
      pickup_lat, pickup_lng, pickup_label, pickup_snapped,
      pickup_effective_lat, pickup_effective_lng, pickup_snap_gate_name,
      pickup_walk_meters, pickup_note,
      dropoff_lat, dropoff_lng, dropoff_label,
      distance_meters, duration_seconds, payment_method, promo_code,
      gross_fare_tzs, discount_tzs, estimated_fare_tzs,
      commission_pct, commission_tzs, operator_net_tzs, start_pin
    )
    VALUES (
      ${tripCode}, ${caller.userId}::uuid, ${d.transportType}, ${operatorTitle},
      ${TripStatus.SEARCHING},
      ${d.pickup.lat}, ${d.pickup.lng}, ${d.pickupLabel}, ${pickupGeo.snapped},
      ${pickupGeo.effective.lat}, ${pickupGeo.effective.lng}, ${pickupGeo.snapGateName},
      ${pickupGeo.walkMeters}, ${d.pickupNote},
      ${d.dropoff.lat}, ${d.dropoff.lng}, ${d.dropoffLabel},
      ${route.distanceMeters}, ${route.durationSeconds}, ${d.paymentMethod}, ${appliedPromo},
      ${grossFareTzs}, ${discountTzs}, ${estimatedFareTzs},
      ${commissionPct}, ${commissionTzs}, ${operatorNetTzs}, ${startPin}
    )
    RETURNING *
  `) as unknown as TripRow[];

  const trip = inserted[0]!;

  await Promise.all([
    recordTransition({
      tripId: trip.id,
      fromStatus: null,
      toStatus: TripStatus.SEARCHING,
      actorId: caller.userId,
      actorRole: caller.role,
      note: pickupGeo.snapped
        ? `Stone Town Smart Snap -> ${pickupGeo.snapGateName}`
        : "Trip requested",
    }),
    appendOutbox(
      EVENT_SUBJECTS.TRIP_REQUESTED,
      {
        tripId: trip.id,
        tripCode: trip.trip_code,
        customerId: trip.customer_id,
        transportType: trip.transport_type,
        pickup: pickupGeo.effective,
        dropoff: dropoffGeo.effective,
        estimatedFareTzs: trip.estimated_fare_tzs,
        paymentMethod: trip.payment_method,
      },
      String(request.id)
    ),
  ]);

  return reply.code(201).send({
    trip: serializeTrip(trip, true),
    emittedEvent: EVENT_SUBJECTS.TRIP_REQUESTED,
  });
});

// 2. List caller's trips
app.get("/api/v1/trips", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const sql = getSql();
  let rows: TripRow[];
  if (caller.role === UserRole.ADMIN) {
    rows = (await sql`
      SELECT * FROM trip.trips ORDER BY created_at DESC LIMIT 50
    `) as unknown as TripRow[];
  } else if (caller.role === UserRole.CUSTOMER) {
    rows = (await sql`
      SELECT * FROM trip.trips WHERE customer_id = ${caller.userId}::uuid
      ORDER BY created_at DESC LIMIT 30
    `) as unknown as TripRow[];
  } else {
    rows = (await sql`
      SELECT * FROM trip.trips WHERE operator_id = ${caller.userId}::uuid
      ORDER BY created_at DESC LIMIT 30
    `) as unknown as TripRow[];
  }

  return reply.code(200).send({
    count: rows.length,
    trips: rows.map((r) =>
      serializeTrip(
        r,
        caller.role === UserRole.ADMIN || r.customer_id === caller.userId
      )
    ),
  });
});

// 3. Admin live overview (register before /:id!)
app.get("/api/v1/trips/admin/overview", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "ADMIN_REQUIRED" });
  }

  const sql = getSql();
  const [summaryRows, recentRows] = await Promise.all([
    sql`
      SELECT
        COUNT(*)::int AS "totalTrips",
        COUNT(*) FILTER (WHERE status IN ('SEARCHING','OFFERED_TO_OPERATOR','ASSIGNED','ARRIVED_AT_PICKUP','IN_PROGRESS','SOS_ACTIVE'))::int AS "activeTrips",
        COUNT(*) FILTER (WHERE status IN ('COMPLETED_UNPAID','PAID_COMPLETED'))::int AS "completedTrips",
        COUNT(*) FILTER (WHERE transport_type = 'BODABODA')::int AS "bodabodaTrips",
        COUNT(*) FILTER (WHERE transport_type = 'BAJAJI')::int AS "bajajiTrips",
        COALESCE(SUM(final_fare_tzs) FILTER (WHERE status IN ('COMPLETED_UNPAID','PAID_COMPLETED')), 0)::int AS "gmvTzs"
      FROM trip.trips
    `,
    sql`
      SELECT * FROM trip.trips ORDER BY created_at DESC LIMIT 20
    `,
  ]);

  return reply.code(200).send({
    summary: summaryRows[0],
    recentTrips: (recentRows as unknown as TripRow[]).map((r) =>
      serializeTrip(r, true)
    ),
  });
});

// 4. Get single trip with state transition audit log
app.get("/api/v1/trips/:id", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const { id } = request.params as { id: string };
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM trip.trips WHERE id = ${id}::uuid LIMIT 1
  `) as unknown as TripRow[];
  const trip = rows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });

  const isOwner = trip.customer_id === caller.userId;
  const isAssignedOperator = trip.operator_id === caller.userId;
  const isAdmin = caller.role === UserRole.ADMIN;
  if (!isOwner && !isAssignedOperator && !isAdmin) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }

  const transitions = await sql`
    SELECT from_status AS "fromStatus", to_status AS "toStatus",
           actor_role AS "actorRole", note, created_at AS "createdAt"
    FROM trip.state_transitions
    WHERE trip_id = ${id}::uuid
    ORDER BY created_at ASC
  `;

  return reply.code(200).send({
    trip: serializeTrip(trip, isOwner || isAdmin),
    transitions,
  });
});

// 5. Internal: Dispatch assigns verified Rider/Driver atomically
app.post("/api/v1/trips/internal/:id/assign", async (request, reply) => {
  if (!hasValidInternalSecret(request.headers["x-internal-service-secret"])) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }

  const { id } = request.params as { id: string };
  const parsed = internalAssignSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "VALIDATION_ERROR" });
  }

  const sql = getSql();
  const existingRows = (await sql`
    SELECT * FROM trip.trips WHERE id = ${id}::uuid LIMIT 1
  `) as unknown as TripRow[];
  const trip = existingRows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });

  if (!canTransition(trip.status, TripStatus.ASSIGNED)) {
    return reply.code(409).send({
      error: "INVALID_STATE_TRANSITION",
      from: trip.status,
      to: TripStatus.ASSIGNED,
    });
  }

  const d = parsed.data;
  const updated = (await sql`
    UPDATE trip.trips
    SET
      status = ${TripStatus.ASSIGNED},
      operator_id = ${d.operatorId}::uuid,
      operator_plate = COALESCE(${d.operatorPlate ?? null}, operator_plate),
      operator_name = COALESCE(${d.operatorName ?? null}, operator_name),
      operator_phone = COALESCE(${d.operatorPhone ?? null}, operator_phone),
      assigned_at = NOW(),
      updated_at = NOW()
    WHERE id = ${id}::uuid
      AND status IN ('SEARCHING', 'OFFERED_TO_OPERATOR')
    RETURNING *
  `) as unknown as TripRow[];

  if (!updated[0]) {
    return reply.code(409).send({ error: "TRIP_ALREADY_ASSIGNED" });
  }

  await recordTransition({
    tripId: id,
    fromStatus: trip.status,
    toStatus: TripStatus.ASSIGNED,
    actorId: d.operatorId,
    actorRole: trip.transport_type === "BODABODA" ? "BODABODA_RIDER" : "BAJAJI_DRIVER",
    note: `Assigned ${trip.operator_title} (${d.operatorPlate ?? d.operatorId})`,
  });

  return reply.code(200).send({ trip: serializeTrip(updated[0], false) });
});

// 6. Internal: Status updates from Dispatch / Payment / Safety services
app.post("/api/v1/trips/internal/:id/status", async (request, reply) => {
  if (!hasValidInternalSecret(request.headers["x-internal-service-secret"])) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }

  const { id } = request.params as { id: string };
  const parsed = internalStatusSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "VALIDATION_ERROR" });
  }

  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM trip.trips WHERE id = ${id}::uuid LIMIT 1
  `) as unknown as TripRow[];
  const trip = rows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });

  const targetStatus = parsed.data.status as TripStatus;
  if (!canTransition(trip.status, targetStatus)) {
    return reply.code(409).send({
      error: "INVALID_STATE_TRANSITION",
      from: trip.status,
      to: targetStatus,
    });
  }

  const updated = (await sql`
    UPDATE trip.trips
    SET status = ${targetStatus}, updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING *
  `) as unknown as TripRow[];

  await recordTransition({
    tripId: id,
    fromStatus: trip.status,
    toStatus: targetStatus,
    actorId: null,
    actorRole: "SYSTEM",
    note: parsed.data.note ?? "",
  });

  return reply.code(200).send({ trip: serializeTrip(updated[0]!, false) });
});

// 7. Operator marks Arrived at Pickup (starts 5-minute free wait timer)
app.post("/api/v1/trips/:id/arrive", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const { id } = request.params as { id: string };
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM trip.trips WHERE id = ${id}::uuid LIMIT 1
  `) as unknown as TripRow[];
  const trip = rows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });

  if (trip.operator_id !== caller.userId && caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "ASSIGNED_OPERATOR_REQUIRED" });
  }

  if (!canTransition(trip.status, TripStatus.ARRIVED_AT_PICKUP)) {
    return reply.code(409).send({
      error: "INVALID_STATE_TRANSITION",
      from: trip.status,
      to: TripStatus.ARRIVED_AT_PICKUP,
    });
  }

  const updated = (await sql`
    UPDATE trip.trips
    SET status = ${TripStatus.ARRIVED_AT_PICKUP}, arrived_at = NOW(), updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING *
  `) as unknown as TripRow[];

  await Promise.all([
    recordTransition({
      tripId: id,
      fromStatus: trip.status,
      toStatus: TripStatus.ARRIVED_AT_PICKUP,
      actorId: caller.userId,
      actorRole: caller.role,
      note: "Operator arrived at pickup gate; 5-minute free wait timer started",
    }),
    appendOutbox(
      EVENT_SUBJECTS.TRIP_ARRIVED,
      {
        tripId: id,
        customerId: trip.customer_id,
        operatorId: trip.operator_id,
        transportType: trip.transport_type,
      },
      String(request.id)
    ),
  ]);

  return reply.code(200).send({
    trip: serializeTrip(updated[0]!, false),
    emittedEvent: EVENT_SUBJECTS.TRIP_ARRIVED,
  });
});

// 8. Operator verifies Customer's 4-digit Start PIN & begins trip
app.post("/api/v1/trips/:id/start", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const parsed = startTripSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const { id } = request.params as { id: string };
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM trip.trips WHERE id = ${id}::uuid LIMIT 1
  `) as unknown as TripRow[];
  const trip = rows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });

  if (trip.operator_id !== caller.userId && caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "ASSIGNED_OPERATOR_REQUIRED" });
  }

  if (!canTransition(trip.status, TripStatus.IN_PROGRESS)) {
    return reply.code(409).send({
      error: "INVALID_STATE_TRANSITION",
      from: trip.status,
      to: TripStatus.IN_PROGRESS,
    });
  }

  if (!safeEqual(parsed.data.startPin, trip.start_pin)) {
    return reply.code(400).send({
      error: "INVALID_START_PIN",
      messageEn: "The 4-digit Start PIN does not match the Customer's PIN.",
      messageSw: "PIN ya tarakimu 4 si sahihi. Muulize Mteja PIN yake.",
    });
  }

  // Compute any billable wait minutes beyond 5 free minutes
  let waitFeeTzs = 0;
  if (trip.arrived_at) {
    const waitedMinutes = Math.floor(
      (Date.now() - new Date(trip.arrived_at).getTime()) / 60000
    );
    const billableMinutes = Math.max(
      0,
      waitedMinutes - PLATFORM_FINANCE.FREE_WAIT_MINUTES
    );
    const perMinWait =
      DEFAULT_TARIFFS_TZS[trip.transport_type].waitFeePerMinTzs;
    waitFeeTzs = billableMinutes * perMinWait;
  }

  const updated = (await sql`
    UPDATE trip.trips
    SET
      status = ${TripStatus.IN_PROGRESS},
      pin_verified_at = NOW(),
      started_at = NOW(),
      wait_fee_tzs = ${waitFeeTzs},
      updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING *
  `) as unknown as TripRow[];

  await Promise.all([
    recordTransition({
      tripId: id,
      fromStatus: trip.status,
      toStatus: TripStatus.IN_PROGRESS,
      actorId: caller.userId,
      actorRole: caller.role,
      note: "4-digit Start PIN verified; trip in progress",
    }),
    appendOutbox(
      EVENT_SUBJECTS.TRIP_STARTED,
      {
        tripId: id,
        customerId: trip.customer_id,
        operatorId: trip.operator_id,
        transportType: trip.transport_type,
        waitFeeTzs,
      },
      String(request.id)
    ),
  ]);

  return reply.code(200).send({
    trip: serializeTrip(updated[0]!, false),
    emittedEvent: EVENT_SUBJECTS.TRIP_STARTED,
  });
});

// 9. Operator completes trip at Dropoff -> COMPLETED_UNPAID + Digital Receipt
app.post("/api/v1/trips/:id/complete", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const { id } = request.params as { id: string };
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM trip.trips WHERE id = ${id}::uuid LIMIT 1
  `) as unknown as TripRow[];
  const trip = rows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });

  if (trip.operator_id !== caller.userId && caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "ASSIGNED_OPERATOR_REQUIRED" });
  }

  if (!canTransition(trip.status, TripStatus.COMPLETED_UNPAID)) {
    return reply.code(409).send({
      error: "INVALID_STATE_TRANSITION",
      from: trip.status,
      to: TripStatus.COMPLETED_UNPAID,
    });
  }

  const step = PLATFORM_FINANCE.FARE_ROUNDING_STEP_TZS;
  const finalGross =
    Math.round((trip.gross_fare_tzs + trip.wait_fee_tzs) / step) * step;
  const finalFareTzs = Math.max(500, finalGross - trip.discount_tzs);
  const commissionTzs = Math.round((finalGross * trip.commission_pct) / 100);
  const operatorNetTzs = Math.max(0, finalGross - commissionTzs);

  const updated = (await sql`
    UPDATE trip.trips
    SET
      status = ${TripStatus.COMPLETED_UNPAID},
      final_fare_tzs = ${finalFareTzs},
      commission_tzs = ${commissionTzs},
      operator_net_tzs = ${operatorNetTzs},
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = ${id}::uuid
    RETURNING *
  `) as unknown as TripRow[];

  // Free operator back to available Unguja pool
  if (trip.operator_id) {
    await sql`
      UPDATE location.operator_positions
      SET is_busy = FALSE, active_trip_id = NULL, idle_since = NOW()
      WHERE operator_id = ${trip.operator_id}::uuid
    `;
  }

  await Promise.all([
    recordTransition({
      tripId: id,
      fromStatus: trip.status,
      toStatus: TripStatus.COMPLETED_UNPAID,
      actorId: caller.userId,
      actorRole: caller.role,
      note: `Trip completed; final fare TZS ${finalFareTzs}`,
    }),
    appendOutbox(
      EVENT_SUBJECTS.TRIP_COMPLETED,
      {
        tripId: id,
        customerId: trip.customer_id,
        operatorId: trip.operator_id,
        transportType: trip.transport_type,
        finalFareTzs,
        commissionTzs,
        operatorNetTzs,
        paymentMethod: trip.payment_method,
      },
      String(request.id)
    ),
  ]);

  const completedTrip = updated[0]!;
  return reply.code(200).send({
    trip: serializeTrip(completedTrip, false),
    receipt: {
      tripCode: completedTrip.trip_code,
      transportType: completedTrip.transport_type,
      operatorTitle: completedTrip.operator_title,
      currency: "TZS",
      grossFareTzs: finalGross,
      waitFeeTzs: completedTrip.wait_fee_tzs,
      discountTzs: completedTrip.discount_tzs,
      finalFareTzs,
      commissionPct: completedTrip.commission_pct,
      commissionTzs,
      operatorNetTzs,
      paymentMethod: completedTrip.payment_method,
      completedAt: completedTrip.completed_at,
    },
    emittedEvent: EVENT_SUBJECTS.TRIP_COMPLETED,
  });
});

// 10. Cancel Trip (Customer or Assigned Operator — supports auto-requeue on Operator cancel)
app.post("/api/v1/trips/:id/cancel", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const parsed = cancelTripSchema.safeParse(request.body ?? {});
  const d = parsed.success ? parsed.data : { reason: "", requeue: true };

  const { id } = request.params as { id: string };
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM trip.trips WHERE id = ${id}::uuid LIMIT 1
  `) as unknown as TripRow[];
  const trip = rows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });

  const isCustomer = trip.customer_id === caller.userId;
  const isOperator = trip.operator_id === caller.userId;
  const isAdmin = caller.role === UserRole.ADMIN;
  if (!isCustomer && !isOperator && !isAdmin) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }

  let cancelFeeTzs = 0;
  let nextStatus: TripStatus;
  let emittedSubject: string;

  if (isOperator && trip.status === TripStatus.ASSIGNED && d.requeue) {
    // Post-accept operator cancel -> release lock & auto-requeue to SEARCHING
    nextStatus = TripStatus.SEARCHING;
    emittedSubject = EVENT_SUBJECTS.TRIP_CANCELLED_BY_OPERATOR;
  } else if (isOperator) {
    nextStatus = TripStatus.CANCELLED_BY_OPERATOR;
    emittedSubject = EVENT_SUBJECTS.TRIP_CANCELLED_BY_OPERATOR;
  } else {
    nextStatus = TripStatus.CANCELLED_BY_CUSTOMER;
    emittedSubject = EVENT_SUBJECTS.TRIP_CANCELLED_BY_CUSTOMER;
    const secondsSinceAssigned = trip.assigned_at
      ? Math.floor((Date.now() - new Date(trip.assigned_at).getTime()) / 1000)
      : 0;
    const pastFreeWindow =
      trip.status === TripStatus.ARRIVED_AT_PICKUP ||
      (trip.status === TripStatus.ASSIGNED && secondsSinceAssigned > 120);
    if (pastFreeWindow) {
      cancelFeeTzs = trip.transport_type === TransportType.BAJAJI ? 1000 : 500;
    }
  }

  if (!canTransition(trip.status, nextStatus)) {
    return reply.code(409).send({
      error: "INVALID_STATE_TRANSITION",
      from: trip.status,
      to: nextStatus,
    });
  }

  // Release dispatch lock & free operator position if one was assigned
  if (trip.operator_id) {
    await Promise.all([
      sql`DELETE FROM dispatch.trip_locks WHERE trip_id = ${id}::uuid`,
      sql`
        UPDATE location.operator_positions
        SET is_busy = FALSE, active_trip_id = NULL
        WHERE operator_id = ${trip.operator_id}::uuid
      `,
    ]);
  }

  const updated =
    nextStatus === TripStatus.SEARCHING
      ? ((await sql`
          UPDATE trip.trips
          SET
            status = ${TripStatus.SEARCHING},
            operator_id = NULL,
            operator_plate = NULL,
            operator_name = NULL,
            operator_phone = NULL,
            assigned_at = NULL,
            cancel_reason = ${d.reason || "Operator cancelled before arrival"},
            updated_at = NOW()
          WHERE id = ${id}::uuid
          RETURNING *
        `) as unknown as TripRow[])
      : ((await sql`
          UPDATE trip.trips
          SET
            status = ${nextStatus},
            cancel_fee_tzs = ${cancelFeeTzs},
            cancel_reason = ${d.reason},
            cancelled_by_role = ${caller.role},
            cancelled_at = NOW(),
            updated_at = NOW()
          WHERE id = ${id}::uuid
          RETURNING *
        `) as unknown as TripRow[]);

  await Promise.all([
    recordTransition({
      tripId: id,
      fromStatus: trip.status,
      toStatus: nextStatus,
      actorId: caller.userId,
      actorRole: caller.role,
      note:
        nextStatus === TripStatus.SEARCHING
          ? "Operator cancelled post-accept; trip requeued to SEARCHING"
          : d.reason || "Trip cancelled",
    }),
    appendOutbox(
      emittedSubject,
      {
        tripId: id,
        previousOperatorId: trip.operator_id,
        requeued: nextStatus === TripStatus.SEARCHING,
        cancelFeeTzs,
        reason: d.reason,
      },
      String(request.id)
    ),
  ]);

  return reply.code(200).send({
    trip: serializeTrip(updated[0]!, isCustomer || isAdmin),
    requeued: nextStatus === TripStatus.SEARCHING,
    cancelFeeTzs,
    emittedEvent: emittedSubject,
  });
});

// 11. Two-way Trip Rating + Bodaboda Helmet Compliance Check
app.post("/api/v1/trips/:id/rate", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const parsed = rateTripSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const { id } = request.params as { id: string };
  const sql = getSql();
  const rows = (await sql`
    SELECT * FROM trip.trips WHERE id = ${id}::uuid LIMIT 1
  `) as unknown as TripRow[];
  const trip = rows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });

  if (
    trip.status !== TripStatus.COMPLETED_UNPAID &&
    trip.status !== TripStatus.PAID_COMPLETED
  ) {
    return reply.code(409).send({
      error: "TRIP_NOT_COMPLETED",
      message: "Trips can only be rated after completion.",
    });
  }

  const isCustomer = trip.customer_id === caller.userId;
  const isOperator = trip.operator_id === caller.userId;
  if (!isCustomer && !isOperator) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }
  if (!trip.operator_id) {
    return reply.code(400).send({ error: "NO_OPERATOR_ON_TRIP" });
  }

  const rateeId = isCustomer ? trip.operator_id : trip.customer_id;
  const d = parsed.data;
  const helmetProvided =
    isCustomer && trip.transport_type === TransportType.BODABODA
      ? (d.helmetProvided ?? null)
      : null;

  const inserted = await sql`
    INSERT INTO trip.ratings (
      trip_id, rater_id, rater_role, ratee_id, stars, helmet_provided, comment
    )
    VALUES (
      ${id}::uuid, ${caller.userId}::uuid, ${caller.role}, ${rateeId}::uuid,
      ${d.stars}, ${helmetProvided}, ${d.comment}
    )
    ON CONFLICT (trip_id, rater_id) DO UPDATE SET
      stars = EXCLUDED.stars,
      helmet_provided = EXCLUDED.helmet_provided,
      comment = EXCLUDED.comment
    RETURNING *
  `;

  if (helmetProvided !== null) {
    await sql`
      UPDATE trip.trips
      SET helmet_provided = ${helmetProvided}, updated_at = NOW()
      WHERE id = ${id}::uuid
    `;
  }

  const helmetFlagged =
    trip.transport_type === TransportType.BODABODA && helmetProvided === false;

  await appendOutbox(
    EVENT_SUBJECTS.TRIP_RATED,
    {
      tripId: id,
      raterId: caller.userId,
      raterRole: caller.role,
      rateeId,
      transportType: trip.transport_type,
      stars: d.stars,
      helmetProvided,
      helmetFlagged,
    },
    String(request.id)
  );

  return reply.code(200).send({
    rating: inserted[0],
    helmetFlagged,
    emittedEvent: EVENT_SUBJECTS.TRIP_RATED,
  });
});

export default app;
