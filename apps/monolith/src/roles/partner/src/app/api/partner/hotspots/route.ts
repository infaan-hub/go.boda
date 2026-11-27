import { NextResponse } from "next/server";
import { metric } from "@vercel/functions";
import { getSql } from "@goboda/db";
import { verifyPartnerRequest } from "../../../../lib/partner-auth";

export const dynamic = "force-dynamic";

interface HotspotRow {
  id: string;
  nameSw: string;
  nameEn: string;
  category: string;
  area: string;
  lat: number;
  lng: number;
  targetSupply: number;
  onlineSameCategory: number;
  idleSameCategory: number;
  activeRequestsNearby: number;
  recentTrips2h: number;
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    const profileRows = (await sql`
      SELECT transport_type AS "transportType", home_kituo AS "homeKituo"
      FROM operator.profiles
      WHERE user_id = ${auth.partner.id}::uuid
      LIMIT 1
    `) as Array<{ transportType: "BODABODA" | "BAJAJI"; homeKituo: string | null }>;

    const assignedTransportType: "BODABODA" | "BAJAJI" =
      profileRows[0]?.transportType === "BAJAJI"
        ? "BAJAJI"
        : profileRows[0]?.transportType === "BODABODA"
          ? "BODABODA"
          : auth.partner.transportType === "BAJAJI"
            ? "BAJAJI"
            : "BODABODA";

    const rows = (await sql`
      SELECT
        l.id,
        l.name_sw AS "nameSw",
        l.name_en AS "nameEn",
        l.category,
        l.area,
        l.lat,
        l.lng,
        COALESCE(l.target_supply, 4)::int AS "targetSupply",
        COUNT(DISTINCT p.operator_id) FILTER (
          WHERE p.is_online = TRUE AND p.transport_type = ${assignedTransportType}
        )::int AS "onlineSameCategory",
        COUNT(DISTINCT p.operator_id) FILTER (
          WHERE p.is_online = TRUE
            AND p.is_busy = FALSE
            AND p.transport_type = ${assignedTransportType}
        )::int AS "idleSameCategory",
        (
          SELECT COUNT(*)::int
          FROM trip.trips t
          WHERE t.transport_type = ${assignedTransportType}
            AND t.status IN ('SEARCHING', 'OFFERED_TO_OPERATOR')
            AND ST_DWithin(
              l.geom::geography,
              ST_SetSRID(ST_MakePoint(t.pickup_effective_lng, t.pickup_effective_lat), 4326)::geography,
              3000
            )
        ) AS "activeRequestsNearby",
        (
          SELECT COUNT(*)::int
          FROM trip.trips t
          WHERE t.transport_type = ${assignedTransportType}
            AND t.created_at >= NOW() - INTERVAL '2 hours'
            AND ST_DWithin(
              l.geom::geography,
              ST_SetSRID(ST_MakePoint(t.pickup_effective_lng, t.pickup_effective_lat), 4326)::geography,
              3000
            )
        ) AS "recentTrips2h"
      FROM geo.landmarks l
      LEFT JOIN location.operator_positions p
        ON p.is_online = TRUE
       AND p.transport_type = ${assignedTransportType}
       AND ST_DWithin(l.geom::geography, p.geom::geography, 2500)
      WHERE l.is_kituo = TRUE
      GROUP BY l.id, l.name_sw, l.name_en, l.category, l.area, l.lat, l.lng, l.target_supply, l.geom
      ORDER BY l.area ASC, l.name_en ASC
      LIMIT 60
    `) as HotspotRow[];

    const hotspots = rows
      .map((r) => {
        const deficit = Math.max(0, r.targetSupply - r.onlineSameCategory);
        const demandScore =
          r.activeRequestsNearby * 30 +
          r.recentTrips2h * 12 +
          deficit * 10 +
          (r.onlineSameCategory === 0 ? 15 : 0);

        const demandLevel: "HOT" | "BUSY" | "STEADY" | "QUIET" =
          r.activeRequestsNearby >= 2 || demandScore >= 45
            ? "HOT"
            : r.activeRequestsNearby >= 1 || demandScore >= 25
              ? "BUSY"
              : demandScore >= 12
                ? "STEADY"
                : "QUIET";

        return {
          ...r,
          lat: Number(r.lat),
          lng: Number(r.lng),
          queueGap: deficit,
          demandScore,
          demandLevel,
        };
      })
      .sort((a, b) => b.demandScore - a.demandScore || a.nameEn.localeCompare(b.nameEn));

    const summary = {
      totalVituo: hotspots.length,
      hotCount: hotspots.filter((h) => h.demandLevel === "HOT").length,
      busyCount: hotspots.filter((h) => h.demandLevel === "BUSY").length,
      activeRequestsTotal: hotspots.reduce((s, h) => s + h.activeRequestsNearby, 0),
      onlineOperatorsCategory: hotspots.reduce((s, h) => s + h.onlineSameCategory, 0),
    };

    metric("partner.hotspots.fetch", 1, {
      outcome: "success",
      transport_type: assignedTransportType,
    });
    metric("partner.hotspots.duration_ms", Math.round(performance.now() - startedAt), {
      outcome: "success",
    });

    return NextResponse.json({
      transportType: assignedTransportType,
      homeKituo: profileRows[0]?.homeKituo ?? null,
      summary,
      hotspots,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Partner hotspots fetch failed:", err);
    metric("partner.hotspots.fetch", 1, { outcome: "error" });
    return NextResponse.json(
      {
        error: "HOTSPOTS_FETCH_FAILED",
        message: err instanceof Error ? err.message : "DB error",
      },
      { status: 500 }
    );
  }
}
