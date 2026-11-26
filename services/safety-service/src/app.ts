import { randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { jwtVerify } from "jose";
import { z } from "zod";
import { checkDatabaseHealth, getSql } from "@goboda/db";
import { EVENT_SUBJECTS } from "@goboda/events";
import { createLogger, REQUEST_ID_HEADER } from "@goboda/logger";
import { TransportType, TripStatus, UserRole } from "@goboda/shared-types";

export const SERVICE_NAME = "safety-service";
export const SERVICE_VERSION = "0.1.0";
export const PORT = Number(
  process.env.PORT ?? process.env.SAFETY_SERVICE_PORT ?? 4010
);
export const HOST = process.env.HOST ?? "0.0.0.0";
export const HELMET_FLAG_THRESHOLD = 3;

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

async function appendOutbox(
  subject: string,
  payload: Record<string, unknown>,
  correlationId: string
) {
  const sql = getSql();
  await sql`
    INSERT INTO safety.outbox_events (subject, payload, correlation_id)
    VALUES (${subject}, ${JSON.stringify(payload)}::jsonb, ${correlationId})
  `;
}

const createShareSchema = z.object({
  tripId: z.string().uuid(),
  ttlMinutes: z.number().int().min(15).max(480).default(240),
  locale: z.enum(["sw", "en"]).default("sw"),
});

const triggerSosSchema = z.object({
  tripId: z.string().uuid(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  reason: z.string().trim().min(2).max(240).default("EMERGENCY_SOS"),
});

const resolveSosSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "RESOLVED", "FALSE_ALARM"]),
  resolutionNote: z.string().trim().max(400).default(""),
});

const helmetCheckSchema = z.object({
  tripId: z.string().uuid(),
  operatorId: z.string().uuid().optional(),
  helmetProvided: z.boolean(),
  note: z.string().trim().max(240).default(""),
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
  serviceArea: "Unguja Island, Zanzibar",
  emergencyHotlines: {
    zanzibarEmergency: "112",
    gobodaOpsDesk: "+255770000112",
  },
  endpoints: [
    "/healthz",
    "/readyz",
    "POST /api/v1/safety/share-link",
    "DELETE /api/v1/safety/share-link/:token",
    "GET /api/v1/track/:shareToken",
    "POST /api/v1/safety/sos",
    "POST /api/v1/safety/helmet-check",
    "GET /api/v1/safety/admin/sos",
    "PATCH /api/v1/safety/admin/sos/:alertId",
    "GET /api/v1/safety/admin/helmet-flags",
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

// 1. Create time-limited live WhatsApp trip tracking share token
app.post("/api/v1/safety/share-link", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const parsed = createShareSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const sql = getSql();
  const tripRows = (await sql`
    SELECT id, trip_code, customer_id, operator_id, transport_type,
           operator_plate, pickup_label, dropoff_label
    FROM trip.trips
    WHERE id = ${d.tripId}::uuid
    LIMIT 1
  `) as Array<{
    id: string;
    trip_code: string;
    customer_id: string;
    operator_id: string | null;
    transport_type: TransportType;
    operator_plate: string | null;
    pickup_label: string;
    dropoff_label: string;
  }>;

  const trip = tripRows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });

  if (
    trip.customer_id !== caller.userId &&
    trip.operator_id !== caller.userId &&
    caller.role !== UserRole.ADMIN
  ) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }

  const token = randomBytes(12).toString("base64url");
  const expiresAt = new Date(Date.now() + d.ttlMinutes * 60000).toISOString();

  await sql`
    INSERT INTO safety.share_links (
      trip_id, token, created_by_user_id, created_by_role, expires_at
    )
    VALUES (
      ${trip.id}::uuid, ${token}, ${caller.userId}::uuid, ${caller.role}, ${expiresAt}::timestamptz
    )
  `;

  const webOrigin = (
    process.env.CUSTOMER_WEB_URL ?? "https://go-boda-customer-web.vercel.app"
  ).replace(/\/+$/, "");
  const sharePath = `/track/${token}`;
  const shareUrl = `${webOrigin}${sharePath}`;
  const platePart = trip.operator_plate ? ` (${trip.operator_plate})` : "";
  const message =
    d.locale === "sw"
      ? `Fuatilia safari yangu ya Go.boda (${trip.trip_code}${platePart}) kutoka ${trip.pickup_label} kwenda ${trip.dropoff_label} moja kwa moja: ${shareUrl}`
      : `Track my live Go.boda Unguja trip (${trip.trip_code}${platePart}) from ${trip.pickup_label} to ${trip.dropoff_label}: ${shareUrl}`;

  return reply.code(201).send({
    shareToken: token,
    tripId: trip.id,
    tripCode: trip.trip_code,
    sharePath,
    shareUrl,
    whatsappShareUrl: `https://wa.me/?text=${encodeURIComponent(message)}`,
    expiresAt,
  });
});

// 2. Revoke a live share link
app.delete("/api/v1/safety/share-link/:token", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const { token } = request.params as { token: string };
  const sql = getSql();
  const rows = (await sql`
    SELECT created_by_user_id FROM safety.share_links WHERE token = ${token} LIMIT 1
  `) as Array<{ created_by_user_id: string }>;

  if (!rows[0]) return reply.code(404).send({ error: "SHARE_LINK_NOT_FOUND" });
  if (
    rows[0].created_by_user_id !== caller.userId &&
    caller.role !== UserRole.ADMIN
  ) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }

  await sql`
    UPDATE safety.share_links SET revoked_at = NOW() WHERE token = ${token}
  `;
  return reply.code(200).send({ revoked: true, token });
});

// 3. PUBLIC Live Trip Tracker endpoint (/api/v1/track/:shareToken — no JWT required, zero PII!)
app.get("/api/v1/track/:shareToken", async (request, reply) => {
  const { shareToken } = request.params as { shareToken: string };
  const sql = getSql();

  const linkRows = (await sql`
    SELECT id, trip_id, expires_at, revoked_at, views_count
    FROM safety.share_links
    WHERE token = ${shareToken}
    LIMIT 1
  `) as Array<{
    id: string;
    trip_id: string;
    expires_at: string;
    revoked_at: string | null;
    views_count: number;
  }>;

  const link = linkRows[0];
  if (!link) return reply.code(404).send({ error: "SHARE_LINK_NOT_FOUND" });
  if (link.revoked_at || new Date(link.expires_at).getTime() <= Date.now()) {
    return reply.code(410).send({
      error: "SHARE_LINK_EXPIRED",
      message: "This live trip tracking link has expired or been revoked.",
    });
  }

  await sql`
    UPDATE safety.share_links
    SET views_count = views_count + 1
    WHERE id = ${link.id}::uuid
  `;

  const tripRows = (await sql`
    SELECT
      id, trip_code, transport_type, operator_title, status,
      operator_id, operator_plate, operator_name,
      pickup_effective_lat, pickup_effective_lng, pickup_label,
      dropoff_lat, dropoff_lng, dropoff_label,
      distance_meters, duration_seconds,
      assigned_at, arrived_at, started_at, completed_at
    FROM trip.trips
    WHERE id = ${link.trip_id}::uuid
    LIMIT 1
  `) as Array<{
    id: string;
    trip_code: string;
    transport_type: TransportType;
    operator_title: "RIDER" | "DRIVER";
    status: TripStatus;
    operator_id: string | null;
    operator_plate: string | null;
    operator_name: string | null;
    pickup_effective_lat: number;
    pickup_effective_lng: number;
    pickup_label: string;
    dropoff_lat: number;
    dropoff_lng: number;
    dropoff_label: string;
    distance_meters: number;
    duration_seconds: number;
    assigned_at: string | null;
    arrived_at: string | null;
    started_at: string | null;
    completed_at: string | null;
  }>;

  const trip = tripRows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });

  const [posRows, trailRows, sosRows] = await Promise.all([
    trip.operator_id
      ? sql`
          SELECT lat, lng, heading, speed_kmh AS "speedKmh", last_seen_at AS "lastSeenAt"
          FROM location.operator_positions
          WHERE operator_id = ${trip.operator_id}::uuid
          LIMIT 1
        `
      : Promise.resolve([]),
    sql`
      SELECT lat, lng, recorded_at AS "recordedAt"
      FROM location.trip_breadcrumbs
      WHERE trip_id = ${trip.id}::uuid
      ORDER BY recorded_at DESC
      LIMIT 40
    `,
    sql`
      SELECT alert_code AS "alertCode", status, created_at AS "createdAt"
      FROM safety.sos_alerts
      WHERE trip_id = ${trip.id}::uuid AND status IN ('OPEN', 'ACKNOWLEDGED')
      ORDER BY created_at DESC
      LIMIT 1
    `,
  ]);

  return reply.code(200).send({
    shareToken,
    expiresAt: link.expires_at,
    viewsCount: link.views_count + 1,
    trip: {
      tripCode: trip.trip_code,
      status: trip.status,
      transportType: trip.transport_type,
      operatorTitle: trip.operator_title,
      operatorName: trip.operator_name,
      operatorPlate: trip.operator_plate,
      pickup: {
        lat: trip.pickup_effective_lat,
        lng: trip.pickup_effective_lng,
        label: trip.pickup_label,
      },
      dropoff: {
        lat: trip.dropoff_lat,
        lng: trip.dropoff_lng,
        label: trip.dropoff_label,
      },
      distanceKm: Number((trip.distance_meters / 1000).toFixed(2)),
      durationMinutes: Math.max(1, Math.round(trip.duration_seconds / 60)),
      timestamps: {
        assignedAt: trip.assigned_at,
        arrivedAt: trip.arrived_at,
        startedAt: trip.started_at,
        completedAt: trip.completed_at,
      },
    },
    livePosition: posRows[0] ?? null,
    breadcrumbs: trailRows,
    activeSos: sosRows[0] ?? null,
  });
});

// 4. Trigger High-Priority In-Trip SOS Alert
app.post("/api/v1/safety/sos", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const parsed = triggerSosSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const sql = getSql();
  const tripRows = (await sql`
    SELECT id, trip_code, customer_id, operator_id, transport_type,
           operator_plate, status, pickup_effective_lat, pickup_effective_lng
    FROM trip.trips
    WHERE id = ${d.tripId}::uuid
    LIMIT 1
  `) as Array<{
    id: string;
    trip_code: string;
    customer_id: string;
    operator_id: string | null;
    transport_type: TransportType;
    operator_plate: string | null;
    status: TripStatus;
    pickup_effective_lat: number;
    pickup_effective_lng: number;
  }>;

  const trip = tripRows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });
  if (
    trip.customer_id !== caller.userId &&
    trip.operator_id !== caller.userId &&
    caller.role !== UserRole.ADMIN
  ) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }

  // Capture live GPS from location-service table if caller didn't send GPS
  let lat = d.lat;
  let lng = d.lng;
  if ((lat === undefined || lng === undefined) && trip.operator_id) {
    const posRows = (await sql`
      SELECT lat, lng FROM location.operator_positions
      WHERE operator_id = ${trip.operator_id}::uuid
      LIMIT 1
    `) as Array<{ lat: number; lng: number }>;
    if (posRows[0]) {
      lat = posRows[0].lat;
      lng = posRows[0].lng;
    }
  }
  lat = lat ?? trip.pickup_effective_lat;
  lng = lng ?? trip.pickup_effective_lng;

  const alertCode = `SOS-${randomInt(10000, 99999)}`;
  const inserted = await sql`
    INSERT INTO safety.sos_alerts (
      alert_code, trip_id, triggered_by_user_id, triggered_by_role,
      transport_type, operator_id, operator_plate, lat, lng, reason, status
    )
    VALUES (
      ${alertCode}, ${trip.id}::uuid, ${caller.userId}::uuid, ${caller.role},
      ${trip.transport_type}, ${trip.operator_id}::uuid, ${trip.operator_plate},
      ${lat}, ${lng}, ${d.reason}, 'OPEN'
    )
    RETURNING *
  `;
  const alert = inserted[0] as Record<string, unknown>;

  // Transition active in-progress trip into SOS_ACTIVE
  if (trip.status === TripStatus.IN_PROGRESS) {
    await Promise.all([
      sql`
        UPDATE trip.trips
        SET status = ${TripStatus.SOS_ACTIVE}, updated_at = NOW()
        WHERE id = ${trip.id}::uuid
      `,
      sql`
        INSERT INTO trip.state_transitions (
          trip_id, from_status, to_status, actor_id, actor_role, note
        )
        VALUES (
          ${trip.id}::uuid, ${TripStatus.IN_PROGRESS}, ${TripStatus.SOS_ACTIVE},
          ${caller.userId}::uuid, ${caller.role},
          ${`SOS triggered (${alertCode}): ${d.reason}`}
        )
      `,
    ]);
  }

  await appendOutbox(
    EVENT_SUBJECTS.SAFETY_SOS_TRIGGERED,
    {
      alertId: alert.id,
      alertCode,
      tripId: trip.id,
      tripCode: trip.trip_code,
      triggeredByUserId: caller.userId,
      triggeredByRole: caller.role,
      operatorPlate: trip.operator_plate,
      location: { lat, lng },
      reason: d.reason,
    },
    String(request.id)
  );

  return reply.code(201).send({
    alert,
    emergencyHotlines: {
      zanzibarEmergency: "112",
      gobodaOpsDesk: "+255770000112",
    },
    emittedEvent: EVENT_SUBJECTS.SAFETY_SOS_TRIGGERED,
  });
});

// 5. Bodaboda Helmet Compliance Logging & Repeat-Offender Flagging
app.post("/api/v1/safety/helmet-check", async (request, reply) => {
  const isInternal = hasValidInternalSecret(
    request.headers["x-internal-service-secret"]
  );
  const caller = isInternal
    ? null
    : await resolveCaller(request.headers.authorization);
  if (!isInternal && !caller) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }

  const parsed = helmetCheckSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const sql = getSql();
  const tripRows = (await sql`
    SELECT id, customer_id, operator_id, transport_type
    FROM trip.trips
    WHERE id = ${d.tripId}::uuid
    LIMIT 1
  `) as Array<{
    id: string;
    customer_id: string;
    operator_id: string | null;
    transport_type: TransportType;
  }>;

  const trip = tripRows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });
  if (trip.transport_type !== TransportType.BODABODA) {
    return reply.code(400).send({
      error: "BODABODA_ONLY_CHECK",
      message: "Helmet compliance applies strictly to Bodaboda Rider trips.",
    });
  }

  const operatorId = d.operatorId ?? trip.operator_id;
  if (!operatorId) {
    return reply.code(400).send({ error: "OPERATOR_ID_REQUIRED" });
  }

  await sql`
    INSERT INTO safety.helmet_compliance_logs (
      trip_id, operator_id, customer_id, helmet_provided, note
    )
    VALUES (
      ${trip.id}::uuid, ${operatorId}::uuid, ${trip.customer_id}::uuid,
      ${d.helmetProvided}, ${d.note}
    )
    ON CONFLICT (trip_id) DO UPDATE SET
      helmet_provided = EXCLUDED.helmet_provided,
      note = EXCLUDED.note
  `;

  const countRows = (await sql`
    SELECT COUNT(*)::int AS "missingCount"
    FROM safety.helmet_compliance_logs
    WHERE operator_id = ${operatorId}::uuid
      AND helmet_provided = FALSE
      AND created_at > NOW() - INTERVAL '30 days'
  `) as Array<{ missingCount: number }>;

  const missingCount30d = countRows[0]?.missingCount ?? 0;
  const flagRaised =
    !d.helmetProvided && missingCount30d >= HELMET_FLAG_THRESHOLD;

  if (flagRaised) {
    await appendOutbox(
      EVENT_SUBJECTS.SAFETY_HELMET_FLAG_RAISED,
      {
        operatorId,
        tripId: trip.id,
        missingCount30d,
        threshold: HELMET_FLAG_THRESHOLD,
      },
      String(request.id)
    );
  }

  return reply.code(200).send({
    recorded: true,
    tripId: trip.id,
    operatorId,
    helmetProvided: d.helmetProvided,
    missingCount30d,
    flagRaised,
    ...(flagRaised
      ? { emittedEvent: EVENT_SUBJECTS.SAFETY_HELMET_FLAG_RAISED }
      : {}),
  });
});

// 6. Admin: SOS Incident Console Feed
app.get("/api/v1/safety/admin/sos", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "ADMIN_REQUIRED" });
  }

  const sql = getSql();
  const rows = (await sql`
    SELECT
      a.id, a.alert_code AS "alertCode", a.trip_id AS "tripId",
      t.trip_code AS "tripCode", a.triggered_by_role AS "triggeredByRole",
      a.transport_type AS "transportType", a.operator_id AS "operatorId",
      a.operator_plate AS "operatorPlate", a.lat, a.lng, a.reason,
      a.status, a.resolution_note AS "resolutionNote",
      a.acknowledged_at AS "acknowledgedAt", a.resolved_at AS "resolvedAt",
      a.created_at AS "createdAt"
    FROM safety.sos_alerts a
    LEFT JOIN trip.trips t ON t.id = a.trip_id
    ORDER BY
      CASE WHEN a.status = 'OPEN' THEN 0 WHEN a.status = 'ACKNOWLEDGED' THEN 1 ELSE 2 END,
      a.created_at DESC
    LIMIT 100
  `) as Array<{ status: string }>;

  return reply.code(200).send({
    summary: {
      total: rows.length,
      openCount: rows.filter((r) => r.status === "OPEN").length,
      acknowledgedCount: rows.filter((r) => r.status === "ACKNOWLEDGED").length,
      resolvedCount: rows.filter(
        (r) => r.status === "RESOLVED" || r.status === "FALSE_ALARM"
      ).length,
    },
    alerts: rows,
  });
});

// 7. Admin: Acknowledge or Resolve an SOS Alert
app.patch("/api/v1/safety/admin/sos/:alertId", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "ADMIN_REQUIRED" });
  }

  const parsed = resolveSosSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const { alertId } = request.params as { alertId: string };
  const d = parsed.data;
  const sql = getSql();

  const updated = (await sql`
    UPDATE safety.sos_alerts
    SET
      status = ${d.status},
      resolution_note = ${d.resolutionNote},
      resolved_by_admin_id = ${caller.userId}::uuid,
      acknowledged_at = CASE WHEN acknowledged_at IS NULL THEN NOW() ELSE acknowledged_at END,
      resolved_at = CASE WHEN ${d.status} IN ('RESOLVED', 'FALSE_ALARM') THEN NOW() ELSE resolved_at END,
      updated_at = NOW()
    WHERE id = ${alertId}::uuid
    RETURNING *
  `) as Array<{ id: string; alert_code: string; trip_id: string; status: string }>;

  const alert = updated[0];
  if (!alert) return reply.code(404).send({ error: "SOS_ALERT_NOT_FOUND" });

  // Restore SOS_ACTIVE trip back to IN_PROGRESS when resolved
  if (d.status === "RESOLVED" || d.status === "FALSE_ALARM") {
    await sql`
      UPDATE trip.trips
      SET status = ${TripStatus.IN_PROGRESS}, updated_at = NOW()
      WHERE id = ${alert.trip_id}::uuid AND status = ${TripStatus.SOS_ACTIVE}
    `;
    await appendOutbox(
      EVENT_SUBJECTS.SAFETY_SOS_RESOLVED,
      {
        alertId: alert.id,
        alertCode: alert.alert_code,
        tripId: alert.trip_id,
        status: d.status,
        resolvedByAdminId: caller.userId,
        resolutionNote: d.resolutionNote,
      },
      String(request.id)
    );
  }

  return reply.code(200).send({
    alert,
    ...(d.status === "RESOLVED" || d.status === "FALSE_ALARM"
      ? { emittedEvent: EVENT_SUBJECTS.SAFETY_SOS_RESOLVED }
      : {}),
  });
});

// 8. Admin: Bodaboda Helmet Compliance Queue
app.get("/api/v1/safety/admin/helmet-flags", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "ADMIN_REQUIRED" });
  }

  const sql = getSql();
  const rows = (await sql`
    SELECT
      operator_id AS "operatorId",
      COUNT(*)::int AS "totalChecks",
      COUNT(*) FILTER (WHERE helmet_provided = FALSE)::int AS "missingCount30d",
      MAX(created_at) AS "lastReportedAt"
    FROM safety.helmet_compliance_logs
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY operator_id
    HAVING COUNT(*) FILTER (WHERE helmet_provided = FALSE) > 0
    ORDER BY "missingCount30d" DESC, "lastReportedAt" DESC
    LIMIT 100
  `) as Array<{
    operatorId: string;
    totalChecks: number;
    missingCount30d: number;
    lastReportedAt: string;
  }>;

  const flagged = rows.map((r) => ({
    ...r,
    flaggedForReview: r.missingCount30d >= HELMET_FLAG_THRESHOLD,
  }));

  return reply.code(200).send({
    threshold: HELMET_FLAG_THRESHOLD,
    flaggedCount: flagged.filter((f) => f.flaggedForReview).length,
    operators: flagged,
  });
});

export default app;
