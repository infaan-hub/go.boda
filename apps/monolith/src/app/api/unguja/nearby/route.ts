import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import { TransportType, UNGUJA_GEO } from "@goboda/shared-types";

export const dynamic = "force-dynamic";

function estimateEta(distanceMeters: number, type: TransportType): number {
  // Combine exact crow-flight distance with an Unguja road detour factor and
  // typical in-town speeds; straight-line distance alone understates travel time.
  const roadDistanceMeters = distanceMeters * 1.3;
  const speedMetersPerMinute = type === TransportType.BODABODA ? 360 : 300;
  return Math.max(1, Math.ceil(roadDistanceMeters / speedMetersPerMinute));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat") ?? UNGUJA_GEO.CENTER.lat);
  const lng = Number(searchParams.get("lng") ?? UNGUJA_GEO.CENTER.lng);
  const radiusKm = Math.min(15, Math.max(1, Number(searchParams.get("radiusKm") ?? 6) || 6));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "INVALID_COORDINATES" }, { status: 400 });
  }

  // Query Neon PostGIS directly in the monolith.
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const radiusMeters = radiusKm * 1000;
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
        last_seen_at AS "lastSeenAt",
        ROUND(
          ST_DistanceSphere(
            geom,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
          )
        )::int AS "distanceMeters"
      FROM location.operator_positions
      WHERE is_online = TRUE
        AND is_busy = FALSE
        AND is_demo = FALSE
        AND last_seen_at > NOW() - INTERVAL '90 seconds'
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
      ORDER BY
        ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)) ASC,
        rating_avg DESC
      LIMIT 30
    `;

    const countRows = await sql`
      SELECT
        COUNT(*) FILTER (WHERE transport_type = 'BODABODA')::int AS bodabodas,
        COUNT(*) FILTER (WHERE transport_type = 'BAJAJI')::int AS bajajis,
        (MIN(ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)))
          FILTER (WHERE transport_type = 'BODABODA'))::int AS "nearestBodabodaMeters",
        (MIN(ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)))
          FILTER (WHERE transport_type = 'BAJAJI'))::int AS "nearestBajajiMeters"
      FROM location.operator_positions
      WHERE is_online = TRUE
        AND is_busy = FALSE
        AND is_demo = FALSE
        AND last_seen_at > NOW() - INTERVAL '90 seconds'
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          ${radiusMeters}
        )
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
        lastSeenAt: string | Date;
        distanceMeters: number;
      }>
    )
      .map((v) => {
        const etaMinutes = estimateEta(v.distanceMeters, v.transportType);
        const secondsSinceUpdate = Math.max(
          0,
          (Date.now() - new Date(v.lastSeenAt).getTime()) / 1000
        );
        // Hybrid rank balances estimated road ETA, GPS freshness, and operator rating.
        const matchScore =
          etaMinutes * 0.7 +
          (secondsSinceUpdate / 90) * 0.3 -
          (Number(v.ratingAvg) || 0) * 0.08;
        return {
          vehicle: { ...v, etaMinutes },
          matchScore,
        };
      })
      .sort((a, b) => a.matchScore - b.matchScore)
      .map(({ vehicle }) => vehicle);

    const counts = countRows[0] as {
      bodabodas: number;
      bajajis: number;
      nearestBodabodaMeters: number | null;
      nearestBajajiMeters: number | null;
    };

    return NextResponse.json({
      center: { lat, lng },
      radiusKm,
      summary: {
        totalNearby: counts.bodabodas + counts.bajajis,
        bodabodaCount: counts.bodabodas,
        bajajiCount: counts.bajajis,
        nearestBodabodaEtaMin:
          counts.nearestBodabodaMeters == null
            ? null
            : estimateEta(counts.nearestBodabodaMeters, TransportType.BODABODA),
        nearestBajajiEtaMin:
          counts.nearestBajajiMeters == null
            ? null
            : estimateEta(counts.nearestBajajiMeters, TransportType.BAJAJI),
      },
      vehicles,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "NEARBY_UNAVAILABLE",
        message: err instanceof Error ? err.message : "Database unavailable",
      },
      { status: 503 }
    );
  }
}
