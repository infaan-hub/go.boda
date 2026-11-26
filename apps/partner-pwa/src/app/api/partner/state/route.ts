import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import { verifyPartnerRequest } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  const operatorId = auth.partner.id;

  try {
    const sql = getSql();
    const [profileRows, walletRows, ledgerRows, payoutRows, offerRows, activeTripRows] =
      await Promise.all([
        sql`
          SELECT id, transport_type AS "transportType", operator_title AS "operatorTitle",
                 full_name AS "fullName", phone, home_kituo AS "homeKituo",
                 plate_number AS "plateNumber", kyc_status AS "kycStatus",
                 helmet_verified AS "helmetVerified", is_online AS "isOnline",
                 rejection_reason AS "rejectionReason"
          FROM operator.profiles
          WHERE user_id = ${operatorId}::uuid
          LIMIT 1
        `,
        sql`
          SELECT account_type AS "accountType", balance_tzs::int AS "balanceTzs",
                 is_float_blocked AS "isFloatBlocked"
          FROM finance.wallet_accounts
          WHERE owner_id = ${operatorId}::uuid
        `,
        sql`
          SELECT id, account_type AS "accountType", delta_tzs::int AS "deltaTzs",
                 balance_after_tzs::int AS "balanceAfterTzs", entry_type AS "entryType",
                 reference, created_at AS "createdAt"
          FROM finance.ledger_entries
          WHERE owner_id = ${operatorId}::uuid
          ORDER BY created_at DESC
          LIMIT 15
        `,
        sql`
          SELECT id, amount_tzs::int AS "amountTzs", payout_channel AS "payoutChannel",
                 destination_phone AS "destinationPhone", status, provider_ref AS "providerRef",
                 created_at AS "createdAt"
          FROM finance.payouts
          WHERE operator_id = ${operatorId}::uuid
          ORDER BY created_at DESC
          LIMIT 10
        `,
        sql`
          SELECT id, trip_id AS "tripId", transport_type AS "transportType",
                 pickup_label AS "pickupLabel", dropoff_label AS "dropoffLabel",
                 estimated_fare_tzs AS "estimatedFareTzs", payment_method AS "paymentMethod",
                 distance_meters AS "distanceMeters", eta_minutes AS "etaMinutes",
                 expires_at AS "expiresAt"
          FROM dispatch.offers
          WHERE operator_id = ${operatorId}::uuid
            AND status = 'PENDING'
            AND expires_at > NOW()
          ORDER BY created_at DESC
          LIMIT 5
        `,
        sql`
          SELECT id, trip_code AS "tripCode", transport_type AS "transportType",
                 status, pickup_label AS "pickupLabel", pickup_snapped AS "pickupSnapped",
                 dropoff_label AS "dropoffLabel", payment_method AS "paymentMethod",
                 estimated_fare_tzs AS "estimatedFareTzs", final_fare_tzs AS "finalFareTzs",
                 commission_tzs AS "commissionTzs", operator_net_tzs AS "operatorNetTzs"
          FROM trip.trips
          WHERE operator_id = ${operatorId}::uuid
            AND status IN ('ASSIGNED', 'ARRIVED_AT_PICKUP', 'IN_PROGRESS', 'SOS_ACTIVE', 'COMPLETED_UNPAID')
          ORDER BY updated_at DESC
          LIMIT 1
        `,
      ]);

    const wallets = walletRows as Array<{
      accountType: string;
      balanceTzs: number;
      isFloatBlocked: boolean;
    }>;
    const earnings = wallets.find((w) => w.accountType === "EARNINGS");
    const floatAcc = wallets.find((w) => w.accountType === "COMMISSION_FLOAT");

    return NextResponse.json({
      authenticated: true,
      partner: auth.partner,
      profile: profileRows[0] ?? null,
      wallet: {
        earningsBalanceTzs: earnings?.balanceTzs ?? 0,
        commissionFloatTzs: floatAcc?.balanceTzs ?? 0,
        isFloatBlocked: floatAcc?.isFloatBlocked ?? false,
        ledgerEntries: ledgerRows,
        payouts: payoutRows,
      },
      pendingOffers: offerRows,
      activeTrip: activeTripRows[0] ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "PARTNER_STATE_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
