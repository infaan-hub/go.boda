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
  coordinatesSchema,
  DEFAULT_TARIFFS_TZS,
  PLATFORM_FINANCE,
  UNGUJA_GEO,
  UserRole,
  type Coordinates,
} from "@goboda/shared-types";

export const SERVICE_NAME = "geo-zone-service";
export const SERVICE_VERSION = "0.1.0";
export const PORT = Number(
  process.env.PORT ?? process.env.GEO_ZONE_SERVICE_PORT ?? 4003
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

export interface ResolvedUngujaPoint {
  inUnguja: boolean;
  inStoneTownPedestrian: boolean;
  snapped: boolean;
  original: Coordinates;
  effective: Coordinates;
  snapGate: {
    id: string;
    nameSw: string;
    nameEn: string;
    walkingDistanceMeters: number;
    walkingMinutes: number;
  } | null;
}

async function resolveUngujaPoint(
  point: Coordinates
): Promise<ResolvedUngujaPoint> {
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

  if (!inUnguja) {
    return {
      inUnguja: false,
      inStoneTownPedestrian: false,
      snapped: false,
      original: point,
      effective: point,
      snapGate: null,
    };
  }

  if (!inStoneTown) {
    return {
      inUnguja: true,
      inStoneTownPedestrian: false,
      snapped: false,
      original: point,
      effective: point,
      snapGate: null,
    };
  }

  // Inside Stone Town pedestrian alleys -> snap to closest perimeter gate via PostGIS KNN
  const snapRows = await sql`
    SELECT
      id,
      name_sw AS "nameSw",
      name_en AS "nameEn",
      lat,
      lng,
      ROUND(
        ST_DistanceSphere(
          geom,
          ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)
        )
      )::int AS "walkingDistanceMeters"
    FROM geo.snap_points
    WHERE zone_id = 'stone-town-pedestrian'
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)
    LIMIT 1
  `;

  const gate = snapRows[0] as
    | {
        id: string;
        nameSw: string;
        nameEn: string;
        lat: number;
        lng: number;
        walkingDistanceMeters: number;
      }
    | undefined;

  if (!gate) {
    return {
      inUnguja: true,
      inStoneTownPedestrian: true,
      snapped: false,
      original: point,
      effective: point,
      snapGate: null,
    };
  }

  const walkingMinutes = Math.max(1, Math.ceil(gate.walkingDistanceMeters / 80));

  return {
    inUnguja: true,
    inStoneTownPedestrian: true,
    snapped: true,
    original: point,
    effective: { lat: gate.lat, lng: gate.lng },
    snapGate: {
      id: gate.id,
      nameSw: gate.nameSw,
      nameEn: gate.nameEn,
      walkingDistanceMeters: gate.walkingDistanceMeters,
      walkingMinutes,
    },
  };
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

async function computeRoute(from: Coordinates, to: Coordinates): Promise<{
  distanceMeters: number;
  durationSeconds: number;
  source: "osrm" | "haversine-fallback";
  geometry: unknown | null;
}> {
  const osrmBase = process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org";
  const url = `${osrmBase}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const res = (await fetch(url, { signal: controller.signal })) as unknown as {
      ok?: boolean;
      json: () => Promise<{
        routes?: Array<{
          distance: number;
          duration: number;
          geometry?: unknown;
        }>;
      }>;
    };
    if (res.ok) {
      const json = await res.json();
      const first = json.routes?.[0];
      if (first && first.distance > 0) {
        return {
          distanceMeters: Math.round(first.distance),
          durationSeconds: Math.round(first.duration),
          source: "osrm",
          geometry: first.geometry ?? null,
        };
      }
    }
  } catch {
    // Fallback cleanly to Haversine road-factor estimate when OSRM times out
  } finally {
    clearTimeout(timer);
  }

  const straightMeters = haversineMeters(from, to);
  const roadMeters = Math.max(200, Math.round(straightMeters * 1.35));
  const avgSpeedMetersPerSec = 7.5; // ~27 km/h Unguja urban/coastal average
  return {
    distanceMeters: roadMeters,
    durationSeconds: Math.max(60, Math.round(roadMeters / avgSpeedMetersPerSec)),
    source: "haversine-fallback",
    geometry: {
      type: "LineString",
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
    },
  };
}

function roundTzsFare(raw: number, minFare: number): number {
  const step = PLATFORM_FINANCE.FARE_ROUNDING_STEP_TZS;
  return Math.max(minFare, Math.round(raw / step) * step);
}

const validateBodySchema = z.union([
  z.object({ point: coordinatesSchema }),
  z.object({ pickup: coordinatesSchema, dropoff: coordinatesSchema }),
]);

const routeBodySchema = z.object({
  pickup: coordinatesSchema,
  dropoff: coordinatesSchema,
});

const createLandmarkSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .min(3)
    .max(64),
  nameSw: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().min(2).max(120),
  category: z.enum([
    "MARKET",
    "TRANSPORT",
    "AIRPORT",
    "LANDMARK",
    "SHOPPING",
    "KITUO",
    "NEIGHBORHOOD",
    "BEACH",
    "HOSPITAL",
    "EDUCATION",
  ]),
  area: z.string().trim().min(2).max(80),
  isKituo: z.boolean().default(false),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
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
app.register(rateLimit, { max: 160, timeWindow: "1 minute" });

app.addHook("onRequest", async (request, reply) => {
  reply.header(REQUEST_ID_HEADER, request.id);
});

app.get("/", async () => ({
  service: SERVICE_NAME,
  version: SERVICE_VERSION,
  serviceArea: "Unguja Island, Zanzibar",
  ungujaCenter: UNGUJA_GEO.CENTER,
  endpoints: [
    "/healthz",
    "/readyz",
    "/api/v1/geo/validate",
    "/api/v1/geo/resolve-point",
    "/api/v1/geo/landmarks",
    "/api/v1/geo/snap-points",
    "/api/v1/geo/route",
  ],
}));

app.get("/healthz", async () => {
  const db = await checkDatabaseHealth();
  return {
    service: SERVICE_NAME,
    status: db.connected && db.postgisVersion ? "ok" : "degraded",
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
  const ready = db.connected && Boolean(db.postgisVersion);
  reply.code(ready ? 200 : 503);
  return { service: SERVICE_NAME, ready, postgisVersion: db.postgisVersion };
});

// 1. Strict Unguja Island Geofence Validation (blocks Pemba & Mainland Tanzania)
app.post("/api/v1/geo/validate", async (request, reply) => {
  const parsed = validateBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  if ("point" in parsed.data) {
    const resolved = await resolveUngujaPoint(parsed.data.point);
    return reply.code(200).send({
      valid: resolved.inUnguja,
      ...resolved,
      ...(!resolved.inUnguja
        ? {
            error: "OUTSIDE_UNGUJA_SERVICE_AREA",
            messageEn:
              "Go.boda currently operates exclusively on Unguja Island, Zanzibar.",
            messageSw:
              "Go.boda inafanya kazi Kisiwani Unguja, Zanzibar pekee kwa sasa.",
          }
        : {}),
    });
  }

  const [pickup, dropoff] = await Promise.all([
    resolveUngujaPoint(parsed.data.pickup),
    resolveUngujaPoint(parsed.data.dropoff),
  ]);
  const valid = pickup.inUnguja && dropoff.inUnguja;

  return reply.code(200).send({
    valid,
    pickup,
    dropoff,
    ...(!valid
      ? {
          error: "OUTSIDE_UNGUJA_SERVICE_AREA",
          messageEn:
            "Both pickup and dropoff must be inside Unguja Island, Zanzibar.",
          messageSw:
            "Mahali pa kuchukuliwa na kushushwa lazima pawe ndani ya Kisiwa cha Unguja, Zanzibar.",
        }
      : {}),
  });
});

// 2. Resolve Single Point + Stone Town Pedestrian Smart Snap
app.post("/api/v1/geo/resolve-point", async (request, reply) => {
  const parsed = coordinatesSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const resolved = await resolveUngujaPoint(parsed.data);
  if (!resolved.inUnguja) {
    return reply.code(422).send({
      error: "OUTSIDE_UNGUJA_SERVICE_AREA",
      messageEn:
        "Go.boda currently operates exclusively on Unguja Island, Zanzibar.",
      messageSw:
        "Go.boda inafanya kazi Kisiwani Unguja, Zanzibar pekee kwa sasa.",
      ...resolved,
    });
  }

  return reply.code(200).send(resolved);
});

// 3. Curated Unguja Landmarks & Vituo Search (Kiswahili & English)
app.get("/api/v1/geo/landmarks", async (request, reply) => {
  const q = request.query as {
    q?: string;
    area?: string;
    kituoOnly?: string;
    lat?: string;
    lng?: string;
    limit?: string;
  };

  const search = (q.q ?? "").trim();
  const area = (q.area ?? "").trim();
  const kituoOnly = q.kituoOnly === "true";
  const limit = Math.min(50, Math.max(1, Number(q.limit ?? 20) || 20));
  const lat = q.lat !== undefined ? Number(q.lat) : null;
  const lng = q.lng !== undefined ? Number(q.lng) : null;
  const hasCoords =
    lat !== null &&
    lng !== null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);

  const sql = getSql();
  const pattern = search ? `%${search}%` : "%";
  const areaPattern = area ? `%${area}%` : "%";

  const rows = hasCoords
    ? await sql`
        SELECT
          id,
          name_sw AS "nameSw",
          name_en AS "nameEn",
          category,
          area,
          is_kituo AS "isKituo",
          lat,
          lng,
          ROUND(
            ST_DistanceSphere(
              geom,
              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
            )
          )::int AS "distanceMeters"
        FROM geo.landmarks
        WHERE (name_sw ILIKE ${pattern} OR name_en ILIKE ${pattern} OR area ILIKE ${pattern})
          AND area ILIKE ${areaPattern}
          AND (${!kituoOnly} OR is_kituo = TRUE)
        ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
        LIMIT ${limit}
      `
    : await sql`
        SELECT
          id,
          name_sw AS "nameSw",
          name_en AS "nameEn",
          category,
          area,
          is_kituo AS "isKituo",
          lat,
          lng
        FROM geo.landmarks
        WHERE (name_sw ILIKE ${pattern} OR name_en ILIKE ${pattern} OR area ILIKE ${pattern})
          AND area ILIKE ${areaPattern}
          AND (${!kituoOnly} OR is_kituo = TRUE)
        ORDER BY is_kituo DESC, name_en ASC
        LIMIT ${limit}
      `;

  return reply.code(200).send({
    count: rows.length,
    landmarks: rows,
  });
});

// 4. List All Stone Town Perimeter Snap Gates
app.get("/api/v1/geo/snap-points", async (_req, reply) => {
  const sql = getSql();
  const rows = await sql`
    SELECT id, zone_id AS "zoneId", name_sw AS "nameSw", name_en AS "nameEn", lat, lng
    FROM geo.snap_points
    ORDER BY name_en ASC
  `;
  return reply.code(200).send({
    count: rows.length,
    snapPoints: rows,
  });
});

// 5. Route + Stone Town Smart Snap + Indicative Upfront TZS Fares (Bodaboda & Bajaji)
app.post("/api/v1/geo/route", async (request, reply) => {
  const parsed = routeBodySchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const [pickup, dropoff] = await Promise.all([
    resolveUngujaPoint(parsed.data.pickup),
    resolveUngujaPoint(parsed.data.dropoff),
  ]);

  if (!pickup.inUnguja || !dropoff.inUnguja) {
    return reply.code(422).send({
      error: "OUTSIDE_UNGUJA_SERVICE_AREA",
      messageEn:
        "Both pickup and dropoff must be inside Unguja Island, Zanzibar.",
      messageSw:
        "Mahali pa kuchukuliwa na kushushwa lazima pawe ndani ya Kisiwa cha Unguja, Zanzibar.",
      pickup,
      dropoff,
    });
  }

  const route = await computeRoute(pickup.effective, dropoff.effective);
  const km = route.distanceMeters / 1000;
  const mins = route.durationSeconds / 60;

  // Read active tariffs from Neon (falling back to canonical defaults if table unavailable)
  const sql = getSql();
  let bodaTariff: {
    baseFareTzs: number;
    perKmTzs: number;
    perMinTzs: number;
    minFareTzs: number;
  } = { ...DEFAULT_TARIFFS_TZS.BODABODA };
  let bajajiTariff: {
    baseFareTzs: number;
    perKmTzs: number;
    perMinTzs: number;
    minFareTzs: number;
  } = { ...DEFAULT_TARIFFS_TZS.BAJAJI };

  try {
    const tariffRows = await sql`
      SELECT transport_type, base_fare_tzs, per_km_tzs, per_min_tzs, min_fare_tzs
      FROM pricing.tariffs
    `;
    for (const row of tariffRows as Array<{
      transport_type: string;
      base_fare_tzs: number;
      per_km_tzs: number;
      per_min_tzs: number;
      min_fare_tzs: number;
    }>) {
      const mapped = {
        baseFareTzs: row.base_fare_tzs,
        perKmTzs: row.per_km_tzs,
        perMinTzs: row.per_min_tzs,
        minFareTzs: row.min_fare_tzs,
      };
      if (row.transport_type === "BODABODA") bodaTariff = mapped;
      if (row.transport_type === "BAJAJI") bajajiTariff = mapped;
    }
  } catch {
    // keep default tariffs
  }

  const bodabodaFareTzs = roundTzsFare(
    bodaTariff.baseFareTzs + km * bodaTariff.perKmTzs + mins * bodaTariff.perMinTzs,
    bodaTariff.minFareTzs
  );
  const bajajiFareTzs = roundTzsFare(
    bajajiTariff.baseFareTzs +
      km * bajajiTariff.perKmTzs +
      mins * bajajiTariff.perMinTzs,
    bajajiTariff.minFareTzs
  );

  return reply.code(200).send({
    pickup,
    dropoff,
    route: {
      distanceMeters: route.distanceMeters,
      distanceKm: Number(km.toFixed(2)),
      durationSeconds: route.durationSeconds,
      durationMinutes: Math.max(1, Math.round(mins)),
      source: route.source,
      geometry: route.geometry,
    },
    quotes: {
      BODABODA: {
        transportType: "BODABODA",
        operatorRole: "RIDER",
        currency: "TZS",
        estimatedFareTzs: bodabodaFareTzs,
        maxPassengers: 1,
      },
      BAJAJI: {
        transportType: "BAJAJI",
        operatorRole: "DRIVER",
        currency: "TZS",
        estimatedFareTzs: bajajiFareTzs,
        maxPassengers: 3,
      },
    },
  });
});

// 6. Admin: Add New Curated Unguja Landmark / Kituo
app.post("/api/v1/geo/admin/landmarks", async (request, reply) => {
  if (!(await isAdminCaller(request.headers.authorization))) {
    return reply.code(403).send({ error: "ADMIN_REQUIRED" });
  }

  const parsed = createLandmarkSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const check = await resolveUngujaPoint({ lat: d.lat, lng: d.lng });
  if (!check.inUnguja) {
    return reply.code(422).send({
      error: "OUTSIDE_UNGUJA_SERVICE_AREA",
      message: "Landmark coordinates must lie within Unguja Island.",
    });
  }

  const sql = getSql();
  const rows = await sql`
    INSERT INTO geo.landmarks (id, name_sw, name_en, category, area, is_kituo, lat, lng, geom)
    VALUES (
      ${d.id}, ${d.nameSw}, ${d.nameEn}, ${d.category}, ${d.area},
      ${d.isKituo}, ${d.lat}, ${d.lng},
      ST_SetSRID(ST_MakePoint(${d.lng}, ${d.lat}), 4326)
    )
    ON CONFLICT (id) DO UPDATE SET
      name_sw = EXCLUDED.name_sw,
      name_en = EXCLUDED.name_en,
      category = EXCLUDED.category,
      area = EXCLUDED.area,
      is_kituo = EXCLUDED.is_kituo,
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      geom = EXCLUDED.geom
    RETURNING id, name_sw AS "nameSw", name_en AS "nameEn", category, area, is_kituo AS "isKituo", lat, lng
  `;

  return reply.code(201).send({ landmark: rows[0] });
});

export default app;
