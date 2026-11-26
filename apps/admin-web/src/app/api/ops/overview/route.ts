import { NextResponse } from "next/server";
import {
  checkDatabaseHealth,
  getSql,
  getUngujaBootstrapSummary,
} from "@goboda/db";
import { MICROSERVICES_REGISTRY } from "@goboda/shared-types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = getSql();

    const [
      dbHealth,
      ungujaBootstrap,
      fleetRows,
      operatorRows,
      tripSummaryRows,
      recentTrips,
      tariffRows,
      promoRows,
      landmarkRows,
      sosRows,
      helmetRows,
      driftRows,
      financeSummaryRows,
      floatBlockedRows,
      payoutRows,
    ] = await Promise.all([
      checkDatabaseHealth(),
      getUngujaBootstrapSummary(),
      sql`
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
          rating_avg AS "ratingAvg",
          last_seen_at AS "lastSeenAt"
        FROM location.operator_positions
        WHERE is_online = TRUE
        ORDER BY last_seen_at DESC
        LIMIT 100
      `,
      sql`
        SELECT
          id,
          user_id AS "userId",
          transport_type AS "transportType",
          operator_title AS "operatorTitle",
          full_name AS "fullName",
          phone,
          home_kituo AS "homeKituo",
          plate_number AS "plateNumber",
          license_no AS "licenseNo",
          license_expiry AS "licenseExpiry",
          insurance_expiry AS "insuranceExpiry",
          kyc_status AS "kycStatus",
          helmet_verified AS "helmetVerified",
          is_online AS "isOnline",
          rejection_reason AS "rejectionReason",
          created_at AS "createdAt"
        FROM operator.profiles
        ORDER BY
          CASE WHEN kyc_status = 'PENDING_VERIFICATION' THEN 0 ELSE 1 END,
          created_at DESC
        LIMIT 60
      `,
      sql`
        SELECT
          COUNT(*)::int AS "totalTrips",
          COUNT(*) FILTER (WHERE status IN ('SEARCHING','OFFERED_TO_OPERATOR','ASSIGNED','ARRIVED_AT_PICKUP','IN_PROGRESS','SOS_ACTIVE'))::int AS "activeTrips",
          COUNT(*) FILTER (WHERE status IN ('COMPLETED_UNPAID','PAID_COMPLETED'))::int AS "completedTrips",
          COUNT(*) FILTER (WHERE transport_type = 'BODABODA')::int AS "bodabodaTrips",
          COUNT(*) FILTER (WHERE transport_type = 'BAJAJI')::int AS "bajajiTrips",
          COALESCE(SUM(final_fare_tzs) FILTER (WHERE status IN ('COMPLETED_UNPAID','PAID_COMPLETED')), 0)::bigint AS "gmvTzs"
        FROM trip.trips
      `,
      sql`
        SELECT
          id,
          trip_code AS "tripCode",
          transport_type AS "transportType",
          operator_title AS "operatorTitle",
          status,
          pickup_label AS "pickupLabel",
          pickup_snapped AS "pickupSnapped",
          dropoff_label AS "dropoffLabel",
          payment_method AS "paymentMethod",
          estimated_fare_tzs AS "estimatedFareTzs",
          final_fare_tzs AS "finalFareTzs",
          operator_plate AS "operatorPlate",
          created_at AS "createdAt"
        FROM trip.trips
        ORDER BY created_at DESC
        LIMIT 25
      `,
      sql`
        SELECT
          transport_type AS "transportType",
          operator_role AS "operatorRole",
          base_fare_tzs AS "baseFareTzs",
          per_km_tzs AS "perKmTzs",
          per_min_tzs AS "perMinTzs",
          min_fare_tzs AS "minFareTzs",
          wait_fee_per_min_tzs AS "waitFeePerMinTzs",
          cancel_fee_tzs AS "cancelFeeTzs",
          commission_pct AS "commissionPct",
          active_multiplier AS "activeMultiplier",
          max_multiplier AS "maxMultiplier",
          multiplier_reason AS "multiplierReason",
          max_passengers AS "maxPassengers",
          updated_at AS "updatedAt"
        FROM pricing.tariffs
        ORDER BY transport_type ASC
      `,
      sql`
        SELECT
          code,
          discount_type AS "discountType",
          discount_value AS "discountValue",
          max_discount_tzs AS "maxDiscountTzs",
          min_fare_tzs AS "minFareTzs",
          active,
          expires_at AS "expiresAt"
        FROM pricing.promo_codes
        ORDER BY created_at DESC
        LIMIT 30
      `,
      sql`
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
        ORDER BY is_kituo DESC, name_en ASC
        LIMIT 40
      `,
      sql`
        SELECT
          a.id,
          a.alert_code AS "alertCode",
          a.trip_id AS "tripId",
          t.trip_code AS "tripCode",
          a.triggered_by_role AS "triggeredByRole",
          a.transport_type AS "transportType",
          a.operator_plate AS "operatorPlate",
          a.lat,
          a.lng,
          a.reason,
          a.status,
          a.resolution_note AS "resolutionNote",
          a.created_at AS "createdAt",
          a.resolved_at AS "resolvedAt"
        FROM safety.sos_alerts a
        LEFT JOIN trip.trips t ON t.id = a.trip_id
        ORDER BY
          CASE WHEN a.status = 'OPEN' THEN 0 WHEN a.status = 'ACKNOWLEDGED' THEN 1 ELSE 2 END,
          a.created_at DESC
        LIMIT 40
      `,
      sql`
        SELECT
          operator_id AS "operatorId",
          COUNT(*)::int AS "totalChecks",
          COUNT(*) FILTER (WHERE helmet_provided = FALSE)::int AS "missingCount30d",
          MAX(created_at) AS "lastReportedAt"
        FROM safety.helmet_compliance_logs
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY operator_id
        HAVING COUNT(*) FILTER (WHERE helmet_provided = FALSE) > 0
        ORDER BY "missingCount30d" DESC
        LIMIT 30
      `,
      sql`
        SELECT COALESCE(SUM(delta_tzs), 0)::bigint AS "totalLedgerDriftTzs"
        FROM finance.ledger_entries
      `,
      sql`
        SELECT
          COUNT(*)::int AS "totalConfirmedPayments",
          COALESCE(SUM(gross_fare_tzs), 0)::bigint AS "gmvTzs",
          COALESCE(SUM(commission_tzs), 0)::bigint AS "platformCommissionTzs",
          COALESCE(SUM(operator_net_tzs), 0)::bigint AS "operatorNetTzs",
          COALESCE(SUM(float_offset_tzs), 0)::bigint AS "floatRecoveredTzs"
        FROM finance.payments
        WHERE status = 'CONFIRMED'
      `,
      sql`
        SELECT
          owner_id AS "operatorId",
          balance_tzs::int AS "floatBalanceTzs",
          updated_at AS "updatedAt"
        FROM finance.wallet_accounts
        WHERE account_type = 'COMMISSION_FLOAT' AND is_float_blocked = TRUE
        ORDER BY balance_tzs ASC
        LIMIT 30
      `,
      sql`
        SELECT
          id,
          operator_id AS "operatorId",
          amount_tzs AS "amountTzs",
          payout_channel AS "payoutChannel",
          destination_phone AS "destinationPhone",
          status,
          provider_ref AS "providerRef",
          created_at AS "createdAt"
        FROM finance.payouts
        ORDER BY created_at DESC
        LIMIT 20
      `,
    ]);

    const fleet = fleetRows as Array<{
      transportType: string;
      isBusy: boolean;
    }>;
    const operators = operatorRows as Array<{ kycStatus: string }>;
    const sosAlerts = sosRows as Array<{ status: string }>;
    const tripSummary = (tripSummaryRows[0] ?? {}) as Record<string, unknown>;
    const financeSummary = (financeSummaryRows[0] ?? {}) as Record<
      string,
      unknown
    >;
    const totalLedgerDriftTzs = Number(
      (driftRows[0] as { totalLedgerDriftTzs?: string | number })
        ?.totalLedgerDriftTzs ?? 0
    );

    const services = MICROSERVICES_REGISTRY.map((svc) => ({
      ...svc,
      productionUrl: `https://go-boda-${svc.id}.vercel.app`,
      status: dbHealth.connected ? ("online" as const) : ("offline" as const),
      latencyMs: dbHealth.latencyMs,
    }));

    return NextResponse.json({
      dbHealth,
      ungujaBootstrap,
      services,
      kpis: {
        onlineRiders: fleet.filter((f) => f.transportType === "BODABODA").length,
        onlineDrivers: fleet.filter((f) => f.transportType === "BAJAJI").length,
        busyOnTrips: fleet.filter((f) => f.isBusy).length,
        activeTrips: Number(tripSummary.activeTrips ?? 0),
        totalTrips: Number(tripSummary.totalTrips ?? 0),
        completedTrips: Number(tripSummary.completedTrips ?? 0),
        pendingKycCount: operators.filter(
          (o) => o.kycStatus === "PENDING_VERIFICATION"
        ).length,
        approvedOperatorsCount: operators.filter(
          (o) => o.kycStatus === "APPROVED"
        ).length,
        openSosCount: sosAlerts.filter(
          (s) => s.status === "OPEN" || s.status === "ACKNOWLEDGED"
        ).length,
        gmvTzs: Number(financeSummary.gmvTzs ?? tripSummary.gmvTzs ?? 0),
        platformCommissionTzs: Number(financeSummary.platformCommissionTzs ?? 0),
        ledgerBalanced: totalLedgerDriftTzs === 0,
        totalLedgerDriftTzs,
      },
      fleet: fleetRows,
      operators: operatorRows,
      trips: recentTrips,
      tariffs: tariffRows,
      promos: promoRows,
      landmarks: landmarkRows,
      sosAlerts: sosRows,
      helmetFlags: (
        helmetRows as Array<{
          operatorId: string;
          totalChecks: number;
          missingCount30d: number;
          lastReportedAt: string;
        }>
      ).map((h) => ({
        ...h,
        flaggedForReview: h.missingCount30d >= 3,
      })),
      finance: {
        ledgerBalanced: totalLedgerDriftTzs === 0,
        totalLedgerDriftTzs,
        totalConfirmedPayments: Number(
          financeSummary.totalConfirmedPayments ?? 0
        ),
        gmvTzs: Number(financeSummary.gmvTzs ?? 0),
        platformCommissionTzs: Number(
          financeSummary.platformCommissionTzs ?? 0
        ),
        operatorNetTzs: Number(financeSummary.operatorNetTzs ?? 0),
        floatRecoveredTzs: Number(financeSummary.floatRecoveredTzs ?? 0),
        floatBlockedOperators: floatBlockedRows,
        recentPayouts: payoutRows,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "OPS_OVERVIEW_FAILED",
        message: err instanceof Error ? err.message : "Database unavailable",
      },
      { status: 503 }
    );
  }
}
