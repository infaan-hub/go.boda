import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@admin/lib/admin-auth";

export const dynamic = "force-dynamic";

const COMMON_DOCS = [
  "SELFIE",
  "NATIONAL_ID",
  "DRIVING_LICENSE",
  "VEHICLE_FRONT",
  "VEHICLE_REAR",
  "INSURANCE",
] as const;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const profileRows = (await sql`
      SELECT
        id, user_id AS "userId", transport_type AS "transportType",
        operator_title AS "operatorTitle", full_name AS "fullName", phone,
        home_kituo AS "homeKituo", national_id_no AS "nationalIdNo",
        license_no AS "licenseNo", license_expiry AS "licenseExpiry",
        plate_number AS "plateNumber", vehicle_model AS "vehicleModel",
        vehicle_color AS "vehicleColor", insurance_expiry AS "insuranceExpiry",
        payout_mobile_number AS "payoutMobileNumber", kyc_status AS "kycStatus",
        helmet_verified AS "helmetVerified", is_online AS "isOnline",
        float_blocked AS "floatBlocked", rejection_reason AS "rejectionReason",
        approved_at AS "approvedAt", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM operator.profiles
      WHERE id = ${id}::uuid
      LIMIT 1
    `) as Array<Record<string, unknown>>;

    const profile = profileRows[0];
    if (!profile) {
      return NextResponse.json({ error: "OPERATOR_NOT_FOUND" }, { status: 404 });
    }

    const userId = String(profile.userId);
    const isBoda = profile.transportType === "BODABODA";
    const requiredDocTypes = isBoda ? [...COMMON_DOCS, "HELMETS"] : [...COMMON_DOCS];

    const [docs, wallets, tripsSummary, helmetLogs, auditEvents, positionRows] =
      await Promise.all([
        sql`
          SELECT id, doc_type AS "docType", storage_key AS "storageKey",
                 content_type AS "contentType", status, uploaded_at AS "uploadedAt"
          FROM operator.kyc_documents
          WHERE operator_id = ${id}::uuid
          ORDER BY doc_type ASC
        `,
        sql`
          SELECT account_type AS "accountType", balance_tzs::int AS "balanceTzs",
                 is_float_blocked AS "isFloatBlocked", updated_at AS "updatedAt"
          FROM finance.wallet_accounts
          WHERE owner_id = ${userId}::uuid
        `,
        sql`
          SELECT
            COUNT(*)::int AS "totalTrips",
            COUNT(*) FILTER (WHERE status IN ('COMPLETED_UNPAID','PAID_COMPLETED'))::int AS "completedTrips",
            COALESCE(SUM(operator_net_tzs) FILTER (WHERE status IN ('COMPLETED_UNPAID','PAID_COMPLETED')), 0)::bigint AS "totalNetTzs"
          FROM trip.trips
          WHERE operator_id = ${userId}::uuid
        `,
        sql`
          SELECT id, trip_id AS "tripId", helmet_provided AS "helmetProvided",
                 note, created_at AS "createdAt"
          FROM safety.helmet_compliance_logs
          WHERE operator_id = ${userId}::uuid
          ORDER BY created_at DESC
          LIMIT 20
        `,
        sql`
          SELECT id, subject, payload, created_at AS "createdAt"
          FROM operator.outbox_events
          WHERE payload->>'operatorId' = ${id} OR payload->>'userId' = ${userId}
          ORDER BY created_at DESC
          LIMIT 25
        `,
        sql`
          SELECT lat, lng, is_online AS "isOnline", is_busy AS "isBusy",
                 rating_avg AS "ratingAvg", last_seen_at AS "lastSeenAt"
          FROM location.operator_positions
          WHERE operator_id = ${userId}::uuid
          LIMIT 1
        `,
      ]);

    const uploadedMap = new Map(
      (docs as Array<{ docType: string; storageKey: string; status: string; uploadedAt: string }>).map(
        (d) => [d.docType, d]
      )
    );
    const checklist = requiredDocTypes.map((docType) => {
      const found = uploadedMap.get(docType);
      return {
        docType,
        uploaded: Boolean(found),
        status: found?.status ?? "MISSING",
        storageKey: found?.storageKey ?? null,
        bucket: process.env.R2_KYC_BUCKET ?? "goboda-kyc-private",
        uploadedAt: found?.uploadedAt ?? null,
      };
    });

    return NextResponse.json({
      profile,
      checklist,
      wallets,
      tripsSummary: tripsSummary[0] ?? { totalTrips: 0, completedTrips: 0, totalNetTzs: 0 },
      helmetLogs,
      auditEvents,
      livePosition: positionRows[0] ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "OPERATOR_DETAIL_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
