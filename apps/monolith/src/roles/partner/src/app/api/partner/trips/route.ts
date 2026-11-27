import { NextResponse } from "next/server";
import { metric } from "@vercel/functions";
import { getSql } from "@goboda/db";
import { verifyPartnerRequest } from "../../../../lib/partner-auth";

export const dynamic = "force-dynamic";

interface PartnerTripRow {
  id: string;
  tripCode: string;
  transportType: "BODABODA" | "BAJAJI";
  status: string;
  pickupLabel: string;
  pickupSnapped: boolean;
  pickupSnapGateName: string | null;
  pickupEffectiveLat: number;
  pickupEffectiveLng: number;
  dropoffLabel: string;
  dropoffLat: number;
  dropoffLng: number;
  distanceMeters: number;
  durationSeconds: number;
  paymentMethod: "CASH" | "MOBILE_MONEY" | "CARD";
  grossFareTzs: number;
  estimatedFareTzs: number;
  finalFareTzs: number | null;
  commissionTzs: number;
  operatorNetTzs: number;
  helmetProvided: boolean | null;
  cancelReason: string | null;
  customerRating: number | null;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get("range") ?? "all";
  const range: "today" | "week" | "all" =
    rangeParam === "today" || rangeParam === "week" ? rangeParam : "all";
  const statusParam = searchParams.get("status") ?? "ALL";
  const statusFilter: "ALL" | "COMPLETED" | "CANCELLED" =
    statusParam === "COMPLETED" || statusParam === "CANCELLED"
      ? statusParam
      : "ALL";

  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    const profileRows = (await sql`
      SELECT transport_type AS "transportType"
      FROM operator.profiles
      WHERE user_id = ${auth.partner.id}::uuid
      LIMIT 1
    `) as Array<{ transportType: "BODABODA" | "BAJAJI" }>;

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
        t.id,
        t.trip_code AS "tripCode",
        t.transport_type AS "transportType",
        t.status,
        t.pickup_label AS "pickupLabel",
        t.pickup_snapped AS "pickupSnapped",
        t.pickup_snap_gate_name AS "pickupSnapGateName",
        t.pickup_effective_lat AS "pickupEffectiveLat",
        t.pickup_effective_lng AS "pickupEffectiveLng",
        t.dropoff_label AS "dropoffLabel",
        t.dropoff_lat AS "dropoffLat",
        t.dropoff_lng AS "dropoffLng",
        t.distance_meters::int AS "distanceMeters",
        t.duration_seconds::int AS "durationSeconds",
        t.payment_method AS "paymentMethod",
        t.gross_fare_tzs::int AS "grossFareTzs",
        t.estimated_fare_tzs::int AS "estimatedFareTzs",
        t.final_fare_tzs::int AS "finalFareTzs",
        t.commission_tzs::int AS "commissionTzs",
        t.operator_net_tzs::int AS "operatorNetTzs",
        t.helmet_provided AS "helmetProvided",
        t.cancel_reason AS "cancelReason",
        r.stars::int AS "customerRating",
        t.created_at AS "createdAt",
        t.completed_at AS "completedAt",
        t.cancelled_at AS "cancelledAt"
      FROM trip.trips t
      LEFT JOIN trip.ratings r
        ON r.trip_id = t.id AND r.ratee_id = ${auth.partner.id}::uuid
      WHERE t.operator_id = ${auth.partner.id}::uuid
        AND t.transport_type = ${assignedTransportType}
        AND (
          ${range} = 'all'
          OR (${range} = 'today' AND t.created_at >= CURRENT_DATE)
          OR (${range} = 'week' AND t.created_at >= NOW() - INTERVAL '7 days')
        )
        AND (
          ${statusFilter} = 'ALL'
          OR (${statusFilter} = 'COMPLETED' AND t.status IN ('PAID_COMPLETED', 'COMPLETED_UNPAID'))
          OR (${statusFilter} = 'CANCELLED' AND t.status IN ('CANCELLED_BY_CUSTOMER', 'CANCELLED_BY_OPERATOR'))
        )
      ORDER BY t.created_at DESC
      LIMIT 100
    `) as PartnerTripRow[];

    const completed = rows.filter(
      (r) => r.status === "PAID_COMPLETED" || r.status === "COMPLETED_UNPAID"
    );
    const cancelled = rows.filter(
      (r) =>
        r.status === "CANCELLED_BY_CUSTOMER" ||
        r.status === "CANCELLED_BY_OPERATOR"
    );
    const rated = rows.filter((r) => typeof r.customerRating === "number");
    const avgRating =
      rated.length > 0
        ? Number(
            (
              rated.reduce((sum, r) => sum + Number(r.customerRating || 0), 0) /
              rated.length
            ).toFixed(2)
          )
        : null;

    const summary = {
      totalTrips: rows.length,
      completedTrips: completed.length,
      cancelledTrips: cancelled.length,
      totalNetTzs: completed.reduce((s, r) => s + Number(r.operatorNetTzs || 0), 0),
      totalGrossTzs: completed.reduce(
        (s, r) => s + Number(r.finalFareTzs ?? r.estimatedFareTzs ?? 0),
        0
      ),
      totalCommissionTzs: completed.reduce(
        (s, r) => s + Number(r.commissionTzs || 0),
        0
      ),
      totalDistanceKm: Number(
        (
          completed.reduce((s, r) => s + Number(r.distanceMeters || 0), 0) / 1000
        ).toFixed(1)
      ),
      avgRating,
    };

    metric("partner.trips.history_fetch", 1, { outcome: "success", range });
    metric("partner.trips.duration_ms", Math.round(performance.now() - startedAt), {
      outcome: "success",
    });

    return NextResponse.json({
      transportType: assignedTransportType,
      range,
      status: statusFilter,
      summary,
      trips: rows,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Partner trips fetch failed:", err);
    metric("partner.trips.history_fetch", 1, { outcome: "error" });
    return NextResponse.json(
      {
        error: "PARTNER_TRIPS_FAILED",
        message: err instanceof Error ? err.message : "DB error",
      },
      { status: 500 }
    );
  }
}
