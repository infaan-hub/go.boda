import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@admin/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const [devices, breadcrumbs] = await Promise.all([
      sql`
        SELECT
          p.operator_id AS "operatorId",
          p.transport_type AS "transportType",
          p.operator_title AS "operatorTitle",
          p.plate_number AS "plateNumber",
          p.home_kituo AS "homeKituo",
          p.is_online AS "isOnline",
          p.is_busy AS "isBusy",
          p.is_demo AS "isDemo",
          p.lat,
          p.lng,
          p.heading,
          p.speed_kmh AS "speedKmh",
          p.active_trip_id AS "activeTripId",
          p.last_seen_at AS "lastSeenAt",
          EXTRACT(EPOCH FROM (NOW() - p.last_seen_at))::int AS "pingAgeSeconds",
          ST_Contains((SELECT geom FROM geo.zones WHERE id = 'unguja-island'), p.geom) AS "inUnguja"
        FROM location.operator_positions p
        ORDER BY p.is_online DESC, p.last_seen_at DESC
        LIMIT 100
      `,
      sql`
        SELECT
          b.id,
          b.trip_id AS "tripId",
          t.trip_code AS "tripCode",
          b.operator_id AS "operatorId",
          b.lat,
          b.lng,
          b.speed_kmh AS "speedKmh",
          b.recorded_at AS "recordedAt"
        FROM location.trip_breadcrumbs b
        LEFT JOIN trip.trips t ON t.id = b.trip_id
        ORDER BY b.recorded_at DESC
        LIMIT 40
      `,
    ]);

    const rows = (
      devices as Array<{
        operatorId: string;
        transportType: string;
        operatorTitle: string;
        plateNumber: string;
        homeKituo: string;
        isOnline: boolean;
        isBusy: boolean;
        isDemo: boolean;
        lat: number;
        lng: number;
        speedKmh: number;
        pingAgeSeconds: number;
        inUnguja: boolean;
        lastSeenAt: string;
      }>
    ).map((d) => {
      const isStale = !d.isDemo && d.isOnline && d.pingAgeSeconds > 45;
      const gpsAnomaly = !d.inUnguja || d.speedKmh > 115;
      return {
        ...d,
        isStale,
        gpsAnomaly,
        healthStatus: gpsAnomaly
          ? ("ANOMALY" as const)
          : isStale
            ? ("STALE" as const)
            : d.isOnline
              ? ("FRESH" as const)
              : ("OFFLINE" as const),
      };
    });

    return NextResponse.json({
      summary: {
        totalTracked: rows.length,
        freshOnline: rows.filter((r) => r.healthStatus === "FRESH").length,
        staleCount: rows.filter((r) => r.healthStatus === "STALE").length,
        anomalyCount: rows.filter((r) => r.healthStatus === "ANOMALY").length,
        breadcrumbCount: breadcrumbs.length,
      },
      devices: rows,
      breadcrumbs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "TELEMETRY_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
