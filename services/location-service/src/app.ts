import { randomUUID, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { jwtVerify } from "jose";
import { z } from "zod";
import { checkDatabaseHealth, getSql } from "@goboda/db";
import { createLogger, REQUEST_ID_HEADER } from "@goboda/logger";
import {
  getOperatorTitle,
  TransportType,
  transportTypeSchema,
  UNGUJA_GEO,
  UserRole,
} from "@goboda/shared-types";

export const SERVICE_NAME = "location-service";
export const SERVICE_VERSION = "0.1.0";
export const PORT = Number(
  process.env.PORT ?? process.env.LOCATION_SERVICE_PORT ?? 4004
);
export const HOST = process.env.HOST ?? "0.0.0.0";

export const logger = createLogger(SERVICE_NAME);

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

function estimateArrivalMinutes(
  distanceMeters: number,
  transportType: TransportType
): number {
  // Bodabodas weave slightly faster (~26 km/h avg) than Bajajis (~21 km/h avg) in Unguja urban areas
  const speedMetersPerMin = transportType === TransportType.BODABODA ? 430 : 350;
  return Math.max(1, Math.ceil(distanceMeters / speedMetersPerMin));
}

const pingBodySchema = z.object({
  operatorId: z.string().uuid().optional(),
  transportType: transportTypeSchema,
  plateNumber: z.string().trim().min(3).max(20),
  homeKituo: z.string().trim().max(120).default(""),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).default(0),
  speedKmh: z.number().min(0).max(140).default(0),
  isOnline: z.boolean().default(true),
  isBusy: z.boolean().default(false),
  activeTripId: z.string().uuid().nullable().optional(),
  ratingAvg: z.number().min(1).max(5).default(5.0),
});

const candidatesBodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  transportType: transportTypeSchema,
  radiusKm: z.number().min(0.5).max(15).default(5),
  excludeOperatorIds: z.array(z.string().uuid()).default([]),
  limit: z.number().int().min(1).max(20).default(10),
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
  serviceArea: "Unguja Island, Zanzibar",
  endpoints: [
    "/healthz",
    "/readyz",
    "/api/v1/nearby",
    "/api/v1/location/ping",
    "/api/v1/location/trip/:tripId",
    "/api/v1/location/internal/candidates",
    "/api/v1/location/admin/fleet",
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

// 1. Live Nearby Bodaboda & Bajaji Discovery for Customers (PostGIS spatial query)
app.get("/api/v1/nearby", async (request, reply) => {
  const q = request.query as {
    lat?: string;
    lng?: string;
    radiusKm?: string;
    transportType?: string;
  };

  const lat = q.lat !== undefined ? Number(q.lat) : UNGUJA_GEO.CENTER.lat;
  const lng = q.lng !== undefined ? Number(q.lng) : UNGUJA_GEO.CENTER.lng;
  const radiusKm = Math.min(15, Math.max(0.5, Number(q.radiusKm ?? 5) || 5));
  const radiusMeters = radiusKm * 1000;
  const filterType =
    q.transportType === "BODABODA" || q.transportType === "BAJAJI"
      ? q.transportType
      : null;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return reply.code(400).send({ error: "INVALID_COORDINATES" });
  }

  const includeDemo = process.env.INCLUDE_DEMO_FLEET !== "false";
  const sql = getSql();

  // Real operators must have pinged within 90s; demo fleet stays fresh for live previews
  const rows = await sql`
    SELECT
      operator_id AS "operatorId",
      transport_type AS "transportType",
      operator_title AS "operatorTitle",
      home_kituo AS "homeKituo",
      lat,
      lng,
      heading,
      rating_avg AS "ratingAvg",
      is_demo AS "isDemo",
      ROUND(
        ST_DistanceSphere(
          geom,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
        )
      )::int AS "distanceMeters"
    FROM location.operator_positions
    WHERE is_online = TRUE
      AND is_busy = FALSE
      AND (${includeDemo} OR is_demo = FALSE)
      AND (is_demo = TRUE OR last_seen_at > NOW() - INTERVAL '90 seconds')
      AND (${filterType === null} OR transport_type = ${filterType})
      AND ST_DWithin(
        geom::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
    LIMIT 30
  `;

  const vehicles = (
    rows as Array<{
      operatorId: string;
      transportType: TransportType;
      operatorTitle: "RIDER" | "DRIVER";
      homeKituo: string;
      lat: number;
      lng: number;
      heading: number;
      ratingAvg: number;
      isDemo: boolean;
      distanceMeters: number;
    }>
  ).map((v) => ({
    ...v,
    etaMinutes: estimateArrivalMinutes(v.distanceMeters, v.transportType),
  }));

  const bodabodas = vehicles.filter(
    (v) => v.transportType === TransportType.BODABODA
  );
  const bajajis = vehicles.filter(
    (v) => v.transportType === TransportType.BAJAJI
  );

  return reply.code(200).send({
    center: { lat, lng },
    radiusKm,
    summary: {
      totalNearby: vehicles.length,
      bodabodaCount: bodabodas.length,
      bajajiCount: bajajis.length,
      nearestBodabodaEtaMin: bodabodas[0]?.etaMinutes ?? null,
      nearestBajajiEtaMin: bajajis[0]?.etaMinutes ?? null,
    },
    vehicles,
    timestamp: new Date().toISOString(),
  });
});

// 2. Rider / Driver GPS Heartbeat Ingestion (enforces Unguja polygon)
app.post("/api/v1/location/ping", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (
    caller.role !== UserRole.BODABODA_RIDER &&
    caller.role !== UserRole.BAJAJI_DRIVER &&
    caller.role !== UserRole.ADMIN
  ) {
    return reply.code(403).send({ error: "OPERATOR_ROLE_REQUIRED" });
  }

  const parsed = pingBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const sql = getSql();

  // Validate operator GPS is inside Unguja Island
  const geoRows = await sql`
    SELECT ST_Contains(
      (SELECT geom FROM geo.zones WHERE id = 'unguja-island'),
      ST_SetSRID(ST_MakePoint(${d.lng}, ${d.lat}), 4326)
    ) AS in_unguja
  `;
  if (!(geoRows[0] as { in_unguja?: boolean })?.in_unguja) {
    return reply.code(422).send({
      error: "OUTSIDE_UNGUJA_SERVICE_AREA",
      message: "Operator GPS coordinates must be within Unguja Island.",
    });
  }

  const operatorId = d.operatorId ?? caller.userId;
  const operatorTitle = getOperatorTitle(d.transportType);

  await sql`
    INSERT INTO location.operator_positions (
      operator_id, transport_type, operator_title, plate_number, home_kituo,
      is_online, is_busy, is_demo, active_trip_id, lat, lng, heading, speed_kmh,
      rating_avg, geom, last_seen_at
    )
    VALUES (
      ${operatorId}::uuid, ${d.transportType}, ${operatorTitle}, ${d.plateNumber},
      ${d.homeKituo}, ${d.isOnline}, ${d.isBusy}, FALSE, ${d.activeTripId ?? null}::uuid,
      ${d.lat}, ${d.lng}, ${d.heading}, ${d.speedKmh}, ${d.ratingAvg},
      ST_SetSRID(ST_MakePoint(${d.lng}, ${d.lat}), 4326), NOW()
    )
    ON CONFLICT (operator_id) DO UPDATE SET
      transport_type = EXCLUDED.transport_type,
      operator_title = EXCLUDED.operator_title,
      plate_number = EXCLUDED.plate_number,
      home_kituo = EXCLUDED.home_kituo,
      is_online = EXCLUDED.is_online,
      is_busy = EXCLUDED.is_busy,
      active_trip_id = EXCLUDED.active_trip_id,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      heading = EXCLUDED.heading,
      speed_kmh = EXCLUDED.speed_kmh,
      rating_avg = EXCLUDED.rating_avg,
      geom = EXCLUDED.geom,
      last_seen_at = NOW()
  `;

  if (d.activeTripId) {
    await sql`
      INSERT INTO location.trip_breadcrumbs (trip_id, operator_id, lat, lng, heading, speed_kmh)
      VALUES (${d.activeTripId}::uuid, ${operatorId}::uuid, ${d.lat}, ${d.lng}, ${d.heading}, ${d.speedKmh})
    `;
  }

  return reply.code(200).send({
    recorded: true,
    operatorId,
    transportType: d.transportType,
    operatorTitle,
    isOnline: d.isOnline,
    timestamp: new Date().toISOString(),
  });
});

// 3. Live Trip Location Stream Snapshot (for Customer Tracker & Shared Link)
app.get("/api/v1/location/trip/:tripId", async (request, reply) => {
  const { tripId } = request.params as { tripId: string };
  const sql = getSql();

  const [currentRows, trailRows] = await Promise.all([
    sql`
      SELECT operator_id AS "operatorId", transport_type AS "transportType",
             operator_title AS "operatorTitle", plate_number AS "plateNumber",
             lat, lng, heading, speed_kmh AS "speedKmh", last_seen_at AS "lastSeenAt"
      FROM location.operator_positions
      WHERE active_trip_id = ${tripId}::uuid
      LIMIT 1
    `,
    sql`
      SELECT lat, lng, heading, speed_kmh AS "speedKmh", recorded_at AS "recordedAt"
      FROM location.trip_breadcrumbs
      WHERE trip_id = ${tripId}::uuid
      ORDER BY recorded_at DESC
      LIMIT 50
    `,
  ]);

  return reply.code(200).send({
    tripId,
    currentPosition: currentRows[0] ?? null,
    breadcrumbs: trailRows,
  });
});

// 4. Internal Dispatch Candidate Discovery (Proximity 60% + Rating 25% + Idle Fairness 15%)
app.post("/api/v1/location/internal/candidates", async (request, reply) => {
  const expected = process.env.INTERNAL_SERVICE_SECRET;
  const provided = request.headers["x-internal-service-secret"];
  if (!expected || typeof provided !== "string" || !safeEqual(provided, expected)) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }

  const parsed = candidatesBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const radiusMeters = d.radiusKm * 1000;
  const includeDemo = process.env.INCLUDE_DEMO_FLEET !== "false";
  const sql = getSql();

  const rows = await sql`
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
          ST_SetSRID(ST_MakePoint(${d.lng}, ${d.lat}), 4326)
        )
      )::int AS "distanceMeters"
    FROM location.operator_positions
    WHERE transport_type = ${d.transportType}
      AND is_online = TRUE
      AND is_busy = FALSE
      AND (${includeDemo} OR is_demo = FALSE)
      AND (is_demo = TRUE OR last_seen_at > NOW() - INTERVAL '45 seconds')
      AND NOT (operator_id = ANY(${d.excludeOperatorIds}::uuid[]))
      AND ST_DWithin(
        geom::geography,
        ST_SetSRID(ST_MakePoint(${d.lng}, ${d.lat}), 4326)::geography,
        ${radiusMeters}
      )
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${d.lng}, ${d.lat}), 4326)
    LIMIT ${d.limit}
  `;

  const scored = (
    rows as Array<{
      operatorId: string;
      transportType: TransportType;
      operatorTitle: string;
      plateNumber: string;
      homeKituo: string;
      lat: number;
      lng: number;
      ratingAvg: number;
      idleSeconds: number;
      distanceMeters: number;
    }>
  )
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
    .sort((a, b) => b.matchScore - a.matchScore);

  return reply.code(200).send({
    transportType: d.transportType,
    radiusKm: d.radiusKm,
    count: scored.length,
    candidates: scored,
  });
});

// 5. Admin Live Unguja Fleet Snapshot
app.get("/api/v1/location/admin/fleet", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "ADMIN_REQUIRED" });
  }

  const sql = getSql();
  const rows = await sql`
    SELECT
      operator_id AS "operatorId",
      transport_type AS "transportType",
      operator_title AS "operatorTitle",
      plate_number AS "plateNumber",
      home_kituo AS "homeKituo",
      is_online AS "isOnline",
      is_busy AS "isBusy",
      is_demo AS "isDemo",
      lat,
      lng,
      heading,
      rating_avg AS "ratingAvg",
      last_seen_at AS "lastSeenAt"
    FROM location.operator_positions
    WHERE is_online = TRUE
    ORDER BY last_seen_at DESC
    LIMIT 200
  `;

  const list = rows as Array<{ transportType: string; isBusy: boolean }>;
  return reply.code(200).send({
    summary: {
      totalOnline: list.length,
      onlineRiders: list.filter((r) => r.transportType === "BODABODA").length,
      onlineDrivers: list.filter((r) => r.transportType === "BAJAJI").length,
      busyOnTrips: list.filter((r) => r.isBusy).length,
    },
    fleet: rows,
    timestamp: new Date().toISOString(),
  });
});

export default app;
