import { randomUUID, timingSafeEqual } from "node:crypto";
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
  PLATFORM_FINANCE,
  TransportType,
  TripStatus,
  UserRole,
} from "@goboda/shared-types";
import { emitPartnerRealtimeEvent } from "@partner/lib/partner-realtime";
import { deliverWebPushToUser } from "@partner/lib/partner-webpush";

export const SERVICE_NAME = "dispatch-service";
export const SERVICE_VERSION = "0.1.0";
export const PORT = Number(
  process.env.PORT ?? process.env.DISPATCH_SERVICE_PORT ?? 4006
);
export const HOST = process.env.HOST ?? "0.0.0.0";

export const logger = createLogger(SERVICE_NAME);

// Expanding search radius sequence across Unguja (urban -> outer/rural)
export const EXPANDING_RADII_KM = [1.5, 3.0, 5.0, 6.0] as const;

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

function estimateArrivalMinutes(
  distanceMeters: number,
  transportType: TransportType
): number {
  const speed = transportType === TransportType.BODABODA ? 430 : 350;
  return Math.max(1, Math.ceil(distanceMeters / speed));
}

async function appendOutbox(
  subject: string,
  payload: Record<string, unknown>,
  correlationId: string
) {
  const sql = getSql();
  await sql`
    INSERT INTO dispatch.outbox_events (subject, payload, correlation_id)
    VALUES (${subject}, ${JSON.stringify(payload)}::jsonb, ${correlationId})
  `;
}

interface CandidateRow {
  operatorId: string;
  transportType: TransportType;
  operatorTitle: "RIDER" | "DRIVER";
  plateNumber: string;
  homeKituo: string;
  lat: number;
  lng: number;
  ratingAvg: number;
  idleSeconds: number;
  distanceMeters: number;
}

interface ScoredCandidate extends CandidateRow {
  etaMinutes: number;
  matchScore: number;
}

interface TripSummaryRow {
  id: string;
  trip_code: string;
  customer_id: string;
  transport_type: TransportType;
  status: TripStatus;
  pickup_effective_lat: number;
  pickup_effective_lng: number;
  pickup_label: string;
  dropoff_label: string;
  estimated_fare_tzs: number;
  payment_method: string;
}

async function findCandidatesExpandingRadius(params: {
  lat: number;
  lng: number;
  transportType: TransportType;
  excludeOperatorIds: string[];
  includeDemo: boolean;
  limit: number;
}): Promise<{ radiusKm: number; candidates: ScoredCandidate[] }> {
  const sql = getSql();

  for (const radiusKm of EXPANDING_RADII_KM) {
    const radiusMeters = radiusKm * 1000;
    const rows = (await sql`
      SELECT
        operator_id AS "operatorId",
        transport_type AS "transportType",
        operator_title AS "operatorTitle",
        plate_number AS "plateNumber",
        home_kituo AS "homeKituo",
        lat,
        lng,
        rating_avg AS "ratingAvg",
        EXTRACT(EPOCH FROM (NOW() - idle_since))::int AS "idleSeconds",
        ROUND(
          ST_DistanceSphere(
            geom,
            ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)
          )
        )::int AS "distanceMeters"
      FROM location.operator_positions
      WHERE transport_type = ${params.transportType}
        AND is_online = TRUE
        AND is_busy = FALSE
        AND (${params.includeDemo} OR is_demo = FALSE)
        AND (is_demo = TRUE OR last_seen_at > NOW() - INTERVAL '90 seconds')
        AND NOT (operator_id = ANY(${params.excludeOperatorIds}::uuid[]))
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography,
          ${radiusMeters}
        )
      ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)
      LIMIT 20
    `) as unknown as CandidateRow[];

    if (rows.length > 0) {
      // Composite ranking: Proximity 60% + Rating 25% + Idle Fairness 15%
      const scored = rows
        .map((c) => {
          const proximityScore = Math.max(0, 1 - c.distanceMeters / radiusMeters);
          const ratingScore = Math.min(1, c.ratingAvg / 5);
          const idleScore = Math.min(1, Math.max(0, c.idleSeconds) / 1800);
          const matchScore = Number(
            (proximityScore * 0.6 + ratingScore * 0.25 + idleScore * 0.15).toFixed(4)
          );
          return {
            ...c,
            etaMinutes: estimateArrivalMinutes(c.distanceMeters, c.transportType),
            matchScore,
          };
        })
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, params.limit);

      return { radiusKm, candidates: scored };
    }
  }

  return {
    radiusKm: EXPANDING_RADII_KM[EXPANDING_RADII_KM.length - 1] ?? 6.0,
    candidates: [],
  };
}

async function expireStaleOffersForTrip(tripId: string, correlationId: string) {
  const sql = getSql();
  const expired = (await sql`
    UPDATE dispatch.offers
    SET status = 'EXPIRED', responded_at = NOW()
    WHERE trip_id = ${tripId}::uuid
      AND status = 'PENDING'
      AND expires_at <= NOW()
    RETURNING id, operator_id AS "operatorId", transport_type AS "transportType"
  `) as Array<{ id: string; operatorId: string; transportType: TransportType }>;

  for (const row of expired) {
    await appendOutbox(
      EVENT_SUBJECTS.DISPATCH_OFFER_EXPIRED,
      {
        offerId: row.id,
        tripId,
        operatorId: row.operatorId,
        transportType: row.transportType,
      },
      correlationId
    );
  }
  return expired.length;
}

async function dispatchNextWave(params: {
  tripId: string;
  correlationId: string;
  offerTtlSeconds: number;
  waveSize: number;
  includeDemo: boolean;
  extraExcludeIds?: string[];
}) {
  const sql = getSql();

  const tripRows = (await sql`
    SELECT
      id, trip_code, customer_id, transport_type, status,
      pickup_effective_lat, pickup_effective_lng,
      pickup_label, dropoff_label, estimated_fare_tzs, payment_method
    FROM trip.trips
    WHERE id = ${params.tripId}::uuid
    LIMIT 1
  `) as unknown as TripSummaryRow[];

  const trip = tripRows[0];
  if (!trip) {
    return { status: "NOT_FOUND" as const };
  }

  // Already assigned?
  const lockRows = await sql`
    SELECT trip_id, assigned_operator_id FROM dispatch.trip_locks
    WHERE trip_id = ${params.tripId}::uuid
    LIMIT 1
  `;
  if (lockRows[0]) {
    return {
      status: "ALREADY_ASSIGNED" as const,
      assignedOperatorId: (lockRows[0] as { assigned_operator_id: string })
        .assigned_operator_id,
    };
  }

  if (
    trip.status !== TripStatus.SEARCHING &&
    trip.status !== TripStatus.OFFERED_TO_OPERATOR &&
    trip.status !== TripStatus.NO_OPERATOR_FOUND
  ) {
    return {
      status: "TRIP_NOT_DISPATCHABLE" as const,
      tripStatus: trip.status,
    };
  }

  await expireStaleOffersForTrip(params.tripId, params.correlationId);

  // Exclude every operator who has already received an offer on this trip
  const pastOffers = (await sql`
    SELECT operator_id AS "operatorId", COALESCE(MAX(round_number), 0)::int AS "maxRound"
    FROM dispatch.offers
    WHERE trip_id = ${params.tripId}::uuid
    GROUP BY operator_id
  `) as Array<{ operatorId: string; maxRound: number }>;

  const excludeSet = new Set<string>(params.extraExcludeIds ?? []);
  let roundNumber = 1;
  for (const row of pastOffers) {
    excludeSet.add(row.operatorId);
    roundNumber = Math.max(roundNumber, row.maxRound + 1);
  }

  const { radiusKm, candidates } = await findCandidatesExpandingRadius({
    lat: trip.pickup_effective_lat,
    lng: trip.pickup_effective_lng,
    transportType: trip.transport_type,
    excludeOperatorIds: Array.from(excludeSet),
    includeDemo: params.includeDemo,
    limit: params.waveSize,
  });

  if (candidates.length === 0) {
    await sql`
      UPDATE trip.trips
      SET status = ${TripStatus.NO_OPERATOR_FOUND}, updated_at = NOW()
      WHERE id = ${params.tripId}::uuid
        AND status IN ('SEARCHING', 'OFFERED_TO_OPERATOR')
    `;
    await sql`
      INSERT INTO trip.state_transitions (
        trip_id, from_status, to_status, actor_id, actor_role, note
      )
      VALUES (
        ${params.tripId}::uuid, ${trip.status}, ${TripStatus.NO_OPERATOR_FOUND},
        NULL, 'SYSTEM', ${`No available ${trip.transport_type} within ${radiusKm}km`}
      )
    `;
    await appendOutbox(
      EVENT_SUBJECTS.DISPATCH_NO_OPERATOR_FOUND,
      {
        tripId: params.tripId,
        transportType: trip.transport_type,
        maxRadiusKm: radiusKm,
      },
      params.correlationId
    );
    return {
      status: "NO_OPERATOR_FOUND" as const,
      radiusKm,
      offers: [],
    };
  }

  const expiresAt = new Date(
    Date.now() + params.offerTtlSeconds * 1000
  ).toISOString();
  const operatorTitle = getOperatorTitle(trip.transport_type);
  const createdOffers = [];

  for (const c of candidates) {
    const inserted = await sql`
      INSERT INTO dispatch.offers (
        trip_id, operator_id, transport_type, operator_title,
        search_radius_km, round_number, match_score, distance_meters, eta_minutes,
        pickup_label, dropoff_label, estimated_fare_tzs, payment_method,
        status, expires_at
      )
      VALUES (
        ${params.tripId}::uuid, ${c.operatorId}::uuid, ${trip.transport_type},
        ${operatorTitle}, ${radiusKm}, ${roundNumber}, ${c.matchScore},
        ${c.distanceMeters}, ${c.etaMinutes}, ${trip.pickup_label},
        ${trip.dropoff_label}, ${trip.estimated_fare_tzs}, ${trip.payment_method},
        'PENDING', ${expiresAt}::timestamptz
      )
      RETURNING *
    `;
    const offer = inserted[0] as Record<string, unknown>;
    createdOffers.push(offer);

    await appendOutbox(
      EVENT_SUBJECTS.DISPATCH_OFFER_SENT,
      {
        offerId: offer.id,
        tripId: params.tripId,
        operatorId: c.operatorId,
        transportType: trip.transport_type,
        radiusKm,
        expiresAt,
      },
      params.correlationId
    );

    emitPartnerRealtimeEvent({
      operatorId: c.operatorId,
      transportType: trip.transport_type === TransportType.BAJAJI ? "BAJAJI" : "BODABODA",
      reason: "dispatch_offer_sent",
    });

    void deliverWebPushToUser(c.operatorId, {
      title: `Go.Boda — New ${trip.transport_type === TransportType.BAJAJI ? "Bajaji" : "Bodaboda"} Request`,
      body: `${trip.pickup_label} → ${trip.dropoff_label} • TZS ${Number(trip.estimated_fare_tzs).toLocaleString()}`,
      url: "/partner/shift",
      tag: `offer-${String(offer.id)}`,
      eventSubject: "dispatch.offer_sent",
    }).catch(() => null);
  }

  if (trip.status !== TripStatus.OFFERED_TO_OPERATOR) {
    await sql`
      UPDATE trip.trips
      SET status = ${TripStatus.OFFERED_TO_OPERATOR}, updated_at = NOW()
      WHERE id = ${params.tripId}::uuid
        AND status IN ('SEARCHING', 'NO_OPERATOR_FOUND')
    `;
    await sql`
      INSERT INTO trip.state_transitions (
        trip_id, from_status, to_status, actor_id, actor_role, note
      )
      VALUES (
        ${params.tripId}::uuid, ${trip.status}, ${TripStatus.OFFERED_TO_OPERATOR},
        NULL, 'SYSTEM', ${`Offer round ${roundNumber} sent at ${radiusKm}km radius`}
      )
    `;
  }

  return {
    status: "OFFERED" as const,
    radiusKm,
    roundNumber,
    offers: createdOffers,
  };
}

const startDispatchSchema = z.object({
  tripId: z.string().uuid(),
  offerTtlSeconds: z
    .number()
    .int()
    .min(2)
    .max(60)
    .default(PLATFORM_FINANCE.DISPATCH_OFFER_TTL_SECONDS),
  waveSize: z.number().int().min(1).max(5).default(1),
  includeDemo: z.boolean().optional(),
  excludeOperatorIds: z.array(z.string().uuid()).default([]),
});

const requeueBodySchema = z.object({
  offerTtlSeconds: z
    .number()
    .int()
    .min(2)
    .max(60)
    .default(PLATFORM_FINANCE.DISPATCH_OFFER_TTL_SECONDS),
  waveSize: z.number().int().min(1).max(5).default(1),
  includeDemo: z.boolean().optional(),
  excludeOperatorIds: z.array(z.string().uuid()).default([]),
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
app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

app.addHook("onRequest", async (request, reply) => {
  reply.header(REQUEST_ID_HEADER, request.id);
});

app.get("/", async () => ({
  service: SERVICE_NAME,
  version: SERVICE_VERSION,
  expandingRadiiKm: EXPANDING_RADII_KM,
  defaultOfferTtlSeconds: PLATFORM_FINANCE.DISPATCH_OFFER_TTL_SECONDS,
  endpoints: [
    "/healthz",
    "/readyz",
    "POST /api/v1/dispatch/start",
    "GET /api/v1/dispatch/offers/pending",
    "POST /api/v1/dispatch/offers/:offerId/accept",
    "POST /api/v1/dispatch/offers/:offerId/decline",
    "POST /api/v1/dispatch/trips/:tripId/requeue",
  ],
}));

app.get("/healthz", async () => {
  const db = await checkDatabaseHealth();
  return {
    service: SERVICE_NAME,
    status: db.connected ? "ok" : "degraded",
    port: PORT,
    databaseConnected: db.connected,
    postgisVersion: db.postgisVersion,
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

// 1. Start expanding-radius dispatch for a SEARCHING trip
app.post("/api/v1/dispatch/start", async (request, reply) => {
  const isInternal = hasValidInternalSecret(
    request.headers["x-internal-service-secret"]
  );
  const caller = isInternal
    ? null
    : await resolveCaller(request.headers.authorization);
  if (!isInternal && !caller) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }

  const parsed = startDispatchSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const includeDemo =
    d.includeDemo ?? process.env.INCLUDE_DEMO_FLEET !== "false";

  const result = await dispatchNextWave({
    tripId: d.tripId,
    correlationId: String(request.id),
    offerTtlSeconds: d.offerTtlSeconds,
    waveSize: d.waveSize,
    includeDemo,
    extraExcludeIds: d.excludeOperatorIds,
  });

  if (result.status === "NOT_FOUND") {
    return reply.code(404).send({ error: "TRIP_NOT_FOUND" });
  }
  if (result.status === "ALREADY_ASSIGNED") {
    return reply.code(409).send({
      error: "TRIP_ALREADY_ASSIGNED",
      assignedOperatorId: result.assignedOperatorId,
    });
  }
  if (result.status === "TRIP_NOT_DISPATCHABLE") {
    return reply.code(409).send({
      error: "TRIP_NOT_DISPATCHABLE",
      tripStatus: result.tripStatus,
    });
  }

  return reply.code(200).send(result);
});

// 2. Operator fetches active pending 20s ride offers
app.get("/api/v1/dispatch/offers/pending", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (
    caller.role !== UserRole.BODABODA_RIDER &&
    caller.role !== UserRole.BAJAJI_DRIVER &&
    caller.role !== UserRole.ADMIN
  ) {
    return reply.code(403).send({ error: "OPERATOR_ROLE_REQUIRED" });
  }

  const q = request.query as { operatorId?: string };
  const targetOperatorId =
    caller.role === UserRole.ADMIN && q.operatorId
      ? q.operatorId
      : caller.userId;

  const sql = getSql();
  // Expire any timed-out offers first
  await sql`
    UPDATE dispatch.offers
    SET status = 'EXPIRED', responded_at = NOW()
    WHERE operator_id = ${targetOperatorId}::uuid
      AND status = 'PENDING'
      AND expires_at <= NOW()
  `;

  const expectedTransportType =
    caller.role === UserRole.BODABODA_RIDER
      ? TransportType.BODABODA
      : caller.role === UserRole.BAJAJI_DRIVER
        ? TransportType.BAJAJI
        : null;

  const offers = (await sql`
    SELECT
      id, trip_id AS "tripId", operator_id AS "operatorId",
      transport_type AS "transportType", operator_title AS "operatorTitle",
      search_radius_km AS "searchRadiusKm", round_number AS "roundNumber",
      match_score AS "matchScore", distance_meters AS "distanceMeters",
      eta_minutes AS "etaMinutes", pickup_label AS "pickupLabel",
      dropoff_label AS "dropoffLabel", estimated_fare_tzs AS "estimatedFareTzs",
      payment_method AS "paymentMethod", status,
      expires_at AS "expiresAt",
      GREATEST(0, EXTRACT(EPOCH FROM (expires_at - NOW()))::int) AS "remainingSeconds"
    FROM dispatch.offers
    WHERE operator_id = ${targetOperatorId}::uuid
      AND (${expectedTransportType}::text IS NULL OR transport_type = ${expectedTransportType})
      AND status = 'PENDING'
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 5
  `) as Array<Record<string, unknown>>;

  return reply.code(200).send({
    operatorId: targetOperatorId,
    count: offers.length,
    offers,
  });
});

// 3. Operator accepts an offer — TRUE ATOMIC LOCK (ON CONFLICT DO NOTHING)
app.post("/api/v1/dispatch/offers/:offerId/accept", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (
    caller.role !== UserRole.BODABODA_RIDER &&
    caller.role !== UserRole.BAJAJI_DRIVER &&
    caller.role !== UserRole.ADMIN
  ) {
    return reply.code(403).send({ error: "OPERATOR_ROLE_REQUIRED" });
  }

  const { offerId } = request.params as { offerId: string };
  const sql = getSql();

  const offerRows = (await sql`
    SELECT * FROM dispatch.offers WHERE id = ${offerId}::uuid LIMIT 1
  `) as Array<{
    id: string;
    trip_id: string;
    operator_id: string;
    transport_type: TransportType;
    operator_title: "RIDER" | "DRIVER";
    status: string;
    expires_at: string;
  }>;

  const offer = offerRows[0];
  if (!offer) return reply.code(404).send({ error: "OFFER_NOT_FOUND" });

  if (offer.operator_id !== caller.userId && caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "OFFER_NOT_FOR_CALLER" });
  }
  if (
    (caller.role === UserRole.BODABODA_RIDER &&
      offer.transport_type !== TransportType.BODABODA) ||
    (caller.role === UserRole.BAJAJI_DRIVER &&
      offer.transport_type !== TransportType.BAJAJI)
  ) {
    return reply.code(403).send({ error: "TRANSPORT_CATEGORY_MISMATCH" });
  }

  if (offer.status !== "PENDING") {
    return reply.code(409).send({
      error: "OFFER_NO_LONGER_PENDING",
      status: offer.status,
    });
  }

  if (new Date(offer.expires_at).getTime() <= Date.now()) {
    await sql`
      UPDATE dispatch.offers
      SET status = 'EXPIRED', responded_at = NOW()
      WHERE id = ${offerId}::uuid AND status = 'PENDING'
    `;
    return reply.code(410).send({
      error: "OFFER_EXPIRED",
      message: "The 20-second offer window has expired.",
    });
  }

  // ATOMIC LOCK: PostgreSQL primary-key conflict guarantees exactly ONE winner
  const lockAcquired = await sql`
    INSERT INTO dispatch.trip_locks (trip_id, assigned_operator_id, offer_id)
    VALUES (${offer.trip_id}::uuid, ${offer.operator_id}::uuid, ${offer.id}::uuid)
    ON CONFLICT (trip_id) DO NOTHING
    RETURNING trip_id
  `;

  if (lockAcquired.length === 0) {
    await sql`
      UPDATE dispatch.offers
      SET status = 'SUPERSEDED', responded_at = NOW()
      WHERE id = ${offerId}::uuid AND status = 'PENDING'
    `;
    return reply.code(409).send({
      error: "TRIP_ALREADY_ASSIGNED",
      message: "Another operator accepted this trip just before you.",
    });
  }

  // Look up operator plate & identity for the Customer's assigned card
  const [posRows, opProfileRows] = await Promise.all([
    sql`
      SELECT plate_number FROM location.operator_positions
      WHERE operator_id = ${offer.operator_id}::uuid
      LIMIT 1
    `,
    sql`
      SELECT full_name, phone, plate_number FROM operator.profiles
      WHERE user_id = ${offer.operator_id}::uuid OR id = ${offer.operator_id}::uuid
      LIMIT 1
    `,
  ]);

  const plateNumber =
    (opProfileRows[0] as { plate_number?: string } | undefined)?.plate_number ??
    (posRows[0] as { plate_number?: string } | undefined)?.plate_number ??
    null;
  const operatorName =
    (opProfileRows[0] as { full_name?: string } | undefined)?.full_name ??
    (offer.operator_title === "RIDER" ? "Verified Bodaboda Rider" : "Verified Bajaji Driver");
  const operatorPhone =
    (opProfileRows[0] as { phone?: string } | undefined)?.phone ??
    caller.phone ??
    null;

  // Mark offer ACCEPTED, supersede any sibling pending offers, mark operator busy, assign trip
  await Promise.all([
    sql`
      UPDATE dispatch.offers
      SET status = 'ACCEPTED', responded_at = NOW()
      WHERE id = ${offer.id}::uuid
    `,
    sql`
      UPDATE dispatch.offers
      SET status = 'SUPERSEDED', responded_at = NOW()
      WHERE trip_id = ${offer.trip_id}::uuid
        AND id <> ${offer.id}::uuid
        AND status = 'PENDING'
    `,
    sql`
      UPDATE location.operator_positions
      SET is_busy = TRUE, active_trip_id = ${offer.trip_id}::uuid
      WHERE operator_id = ${offer.operator_id}::uuid
    `,
    sql`
      UPDATE trip.trips
      SET
        status = ${TripStatus.ASSIGNED},
        operator_id = ${offer.operator_id}::uuid,
        operator_plate = ${plateNumber},
        operator_name = ${operatorName},
        operator_phone = ${operatorPhone},
        assigned_at = NOW(),
        updated_at = NOW()
      WHERE id = ${offer.trip_id}::uuid
        AND status IN ('SEARCHING', 'OFFERED_TO_OPERATOR')
    `,
    sql`
      INSERT INTO trip.state_transitions (
        trip_id, from_status, to_status, actor_id, actor_role, note
      )
      VALUES (
        ${offer.trip_id}::uuid, ${TripStatus.OFFERED_TO_OPERATOR},
        ${TripStatus.ASSIGNED}, ${offer.operator_id}::uuid, ${caller.role},
        ${`Atomic lock acquired by ${offer.operator_title} (${plateNumber})`}
      )
    `,
    appendOutbox(
      EVENT_SUBJECTS.DISPATCH_OPERATOR_ASSIGNED,
      {
        tripId: offer.trip_id,
        offerId: offer.id,
        operatorId: offer.operator_id,
        transportType: offer.transport_type,
        operatorTitle: offer.operator_title,
        plateNumber,
      },
      String(request.id)
    ),
  ]);

  return reply.code(200).send({
    assigned: true,
    tripId: offer.trip_id,
    offerId: offer.id,
    operatorId: offer.operator_id,
    operatorTitle: offer.operator_title,
    plateNumber,
    emittedEvent: EVENT_SUBJECTS.DISPATCH_OPERATOR_ASSIGNED,
  });
});

// 4. Operator declines an offer -> automatically dispatches next-best candidate
app.post("/api/v1/dispatch/offers/:offerId/decline", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const { offerId } = request.params as { offerId: string };
  const body = (request.body ?? {}) as {
    includeDemo?: boolean;
    offerTtlSeconds?: number;
  };
  const sql = getSql();

  const offerRows = (await sql`
    SELECT * FROM dispatch.offers WHERE id = ${offerId}::uuid LIMIT 1
  `) as Array<{
    id: string;
    trip_id: string;
    operator_id: string;
    transport_type: TransportType;
    status: string;
  }>;

  const offer = offerRows[0];
  if (!offer) return reply.code(404).send({ error: "OFFER_NOT_FOUND" });
  if (offer.operator_id !== caller.userId && caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "OFFER_NOT_FOR_CALLER" });
  }
  if (
    (caller.role === UserRole.BODABODA_RIDER &&
      offer.transport_type !== TransportType.BODABODA) ||
    (caller.role === UserRole.BAJAJI_DRIVER &&
      offer.transport_type !== TransportType.BAJAJI)
  ) {
    return reply.code(403).send({ error: "TRANSPORT_CATEGORY_MISMATCH" });
  }

  await sql`
    UPDATE dispatch.offers
    SET status = 'DECLINED', responded_at = NOW()
    WHERE id = ${offerId}::uuid AND status = 'PENDING'
  `;

  // Immediately re-dispatch to next candidate (expanding radius if needed)
  const nextWave = await dispatchNextWave({
    tripId: offer.trip_id,
    correlationId: String(request.id),
    offerTtlSeconds:
      body.offerTtlSeconds ?? PLATFORM_FINANCE.DISPATCH_OFFER_TTL_SECONDS,
    waveSize: 1,
    includeDemo:
      body.includeDemo ?? process.env.INCLUDE_DEMO_FLEET !== "false",
  });

  return reply.code(200).send({
    declined: true,
    offerId,
    tripId: offer.trip_id,
    requeueResult: nextWave,
  });
});

// 5. Requeue Trip (after offer timeout or post-accept operator cancel)
app.post("/api/v1/dispatch/trips/:tripId/requeue", async (request, reply) => {
  const isInternal = hasValidInternalSecret(
    request.headers["x-internal-service-secret"]
  );
  const caller = isInternal
    ? null
    : await resolveCaller(request.headers.authorization);
  if (!isInternal && !caller) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }

  const { tripId } = request.params as { tripId: string };
  const parsed = requeueBodySchema.safeParse(request.body ?? {});
  const d = parsed.success
    ? parsed.data
    : {
        offerTtlSeconds: PLATFORM_FINANCE.DISPATCH_OFFER_TTL_SECONDS,
        waveSize: 1,
        excludeOperatorIds: [],
      };

  const result = await dispatchNextWave({
    tripId,
    correlationId: String(request.id),
    offerTtlSeconds: d.offerTtlSeconds,
    waveSize: d.waveSize,
    includeDemo:
      d.includeDemo ?? process.env.INCLUDE_DEMO_FLEET !== "false",
    extraExcludeIds: d.excludeOperatorIds,
  });

  return reply.code(200).send(result);
});

export default app;
