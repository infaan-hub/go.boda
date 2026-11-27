import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import { TransportType, UNGUJA_GEO } from "@goboda/shared-types";

export const dynamic = "force-dynamic";

function estimateEta(distanceMeters: number, type: TransportType): number {
  const speed = type === TransportType.BODABODA ? 430 : 350;
  return Math.max(1, Math.ceil(distanceMeters / speed));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat") ?? UNGUJA_GEO.CENTER.lat);
  const lng = Number(searchParams.get("lng") ?? UNGUJA_GEO.CENTER.lng);
  const radiusKm = Math.min(15, Math.max(1, Number(searchParams.get("radiusKm") ?? 6) || 6));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "INVALID_COORDINATES" }, { status: 400 });
  }

  // 1. Try location-service microservice first when reachable
  const locationUrl = process.env.LOCATION_SERVICE_URL;
  if (locationUrl) {
    try {
      const upstream = await fetch(
        `${locationUrl}/api/v1/nearby?lat=${lat}&lng=${lng}&radiusKm=${radiusKm}`,
        { cache: "no-store", signal: AbortSignal.timeout(2500) }
      );
      if (upstream.ok) {
        return NextResponse.json(await upstream.json());
      }
    } catch {
      // Fallback cleanly to Neon PostGIS below
    }
  }

  // 2. Direct Neon PostGIS fallback (keeps preview/SSO deployments seamlessly functional)
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
        ROUND(
          ST_DistanceSphere(
            geom,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
          )
        )::int AS "distanceMeters"
      FROM location.operator_positions
      WHERE is_online = TRUE
        AND is_busy = FALSE
        AND (is_demo = TRUE OR last_seen_at > NOW() - INTERVAL '90 seconds')
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
      etaMinutes: estimateEta(v.distanceMeters, v.transportType),
    }));

    const bodabodas = vehicles.filter((v) => v.transportType === "BODABODA");
    const bajajis = vehicles.filter((v) => v.transportType === "BAJAJI");

    return NextResponse.json({
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
