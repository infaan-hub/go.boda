import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const sql = getSql();
    const [fleetStatsRows, operatorRows] = await Promise.all([
      sql`
        SELECT
          COUNT(*)::int AS "totalOffers",
          COUNT(*) FILTER (WHERE status = 'ACCEPTED')::int AS "acceptedCount",
          COUNT(*) FILTER (WHERE status = 'DECLINED')::int AS "declinedCount",
          COUNT(*) FILTER (WHERE status = 'EXPIRED')::int AS "expiredCount",
          COUNT(*) FILTER (WHERE status = 'PENDING')::int AS "pendingCount",
          ROUND(AVG(match_score)::numeric, 3) AS "avgMatchScore",
          ROUND(AVG(search_radius_km)::numeric, 2) AS "avgRadiusKm"
        FROM dispatch.offers
      `,
      sql`
        SELECT
          o.operator_id AS "operatorId",
          COALESCE(pr.full_name, 'Unguja Operator') AS "fullName",
          COALESCE(pr.plate_number, pos.plate_number, 'N/A') AS "plateNumber",
          o.transport_type AS "transportType",
          COUNT(*)::int AS "totalOffers",
          COUNT(*) FILTER (WHERE o.status = 'ACCEPTED')::int AS "acceptedCount",
          COUNT(*) FILTER (WHERE o.status = 'DECLINED')::int AS "declinedCount",
          COUNT(*) FILTER (WHERE o.status = 'EXPIRED')::int AS "expiredCount",
          ROUND(AVG(o.match_score)::numeric, 3) AS "avgMatchScore",
          MAX(o.created_at) AS "lastOfferAt"
        FROM dispatch.offers o
        LEFT JOIN operator.profiles pr ON pr.user_id = o.operator_id
        LEFT JOIN location.operator_positions pos ON pos.operator_id = o.operator_id
        GROUP BY o.operator_id, pr.full_name, pr.plate_number, pos.plate_number, o.transport_type
        ORDER BY "totalOffers" DESC
        LIMIT 50
      `,
    ]);

    const s = (fleetStatsRows[0] ?? {}) as Record<string, unknown>;
    const total = Number(s.totalOffers ?? 0);
    const accepted = Number(s.acceptedCount ?? 0);
    const declined = Number(s.declinedCount ?? 0);
    const expired = Number(s.expiredCount ?? 0);

    const operators = (
      operatorRows as Array<{
        operatorId: string;
        fullName: string;
        plateNumber: string;
        transportType: string;
        totalOffers: number;
        acceptedCount: number;
        declinedCount: number;
        expiredCount: number;
        avgMatchScore: string | number | null;
        lastOfferAt: string;
      }>
    ).map((r) => {
      const acceptRatePct =
        r.totalOffers > 0 ? Math.round((r.acceptedCount / r.totalOffers) * 100) : 100;
      const cooldownRecommended =
        r.declinedCount + r.expiredCount >= 3 && acceptRatePct < 50;
      return {
        ...r,
        avgMatchScore: Number(r.avgMatchScore ?? 0),
        acceptRatePct,
        cooldownRecommended,
      };
    });

    return NextResponse.json({
      matchWeights: {
        proximityPct: 60,
        ratingPct: 25,
        idleFairnessPct: 15,
        offerTtlSeconds: 20,
        expandingRadiiKm: [1.5, 3.5, 6.0],
      },
      summary: {
        totalOffers: total,
        acceptedCount: accepted,
        declinedCount: declined,
        expiredCount: expired,
        acceptanceRatePct: total > 0 ? Math.round((accepted / total) * 100) : 100,
        timeoutRatePct: total > 0 ? Math.round((expired / total) * 100) : 0,
        avgMatchScore: Number(s.avgMatchScore ?? 0),
        avgRadiusKm: Number(s.avgRadiusKm ?? 1.5),
        cooldownCandidatesCount: operators.filter((o) => o.cooldownRecommended).length,
      },
      operators,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "DISPATCH_PERF_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
