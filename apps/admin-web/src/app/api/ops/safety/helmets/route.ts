import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT
        pr.id AS "profileId",
        pr.user_id AS "operatorId",
        pr.full_name AS "fullName",
        pr.phone,
        pr.plate_number AS "plateNumber",
        pr.home_kituo AS "homeKituo",
        pr.kyc_status AS "kycStatus",
        pr.helmet_verified AS "helmetVerified",
        COUNT(h.id)::int AS "checks30d",
        COUNT(h.id) FILTER (WHERE h.helmet_provided = TRUE)::int AS "compliant30d",
        COUNT(h.id) FILTER (WHERE h.helmet_provided = FALSE)::int AS "missing30d",
        MAX(h.created_at) AS "lastCheckedAt"
      FROM operator.profiles pr
      LEFT JOIN safety.helmet_compliance_logs h
        ON h.operator_id = pr.user_id
       AND h.created_at > NOW() - INTERVAL '30 days'
      WHERE pr.transport_type = 'BODABODA'
      GROUP BY pr.id, pr.user_id, pr.full_name, pr.phone, pr.plate_number,
               pr.home_kituo, pr.kyc_status, pr.helmet_verified
      ORDER BY "missing30d" DESC, "compliant30d" DESC
      LIMIT 100
    `) as Array<{
      profileId: string;
      operatorId: string;
      fullName: string;
      phone: string;
      plateNumber: string;
      homeKituo: string;
      kycStatus: string;
      helmetVerified: boolean;
      checks30d: number;
      compliant30d: number;
      missing30d: number;
      lastCheckedAt: string | null;
    }>;

    const riders = rows.map((r) => {
      const compliancePct =
        r.checks30d > 0 ? Math.round((r.compliant30d / r.checks30d) * 100) : 100;
      const repeatOffender = r.missing30d >= 3;
      const safeRiderEligible = r.helmetVerified && r.missing30d === 0;
      return {
        ...r,
        compliancePct,
        repeatOffender,
        safeRiderEligible,
      };
    });

    return NextResponse.json({
      threshold: 3,
      summary: {
        totalBodabodaRiders: riders.length,
        verifiedSafeRiders: riders.filter((r) => r.safeRiderEligible).length,
        watchlistCount: riders.filter((r) => r.missing30d > 0 && !r.repeatOffender).length,
        repeatOffendersCount: riders.filter((r) => r.repeatOffender).length,
      },
      riders,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "HELMETS_FETCH_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}

const helmetActionSchema = z.object({
  profileId: z.string().uuid(),
  action: z.enum(["AWARD_SAFE_BADGE", "SUSPEND_FOR_HELMET", "CLEAR_COACHING"]),
  note: z.string().trim().max(240).default(""),
});

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = helmetActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const d = parsed.data;
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    if (d.action === "AWARD_SAFE_BADGE") {
      const updated = await sql`
        UPDATE operator.profiles
        SET helmet_verified = TRUE, updated_at = NOW()
        WHERE id = ${d.profileId}::uuid
        RETURNING id, full_name AS "fullName", helmet_verified AS "helmetVerified"
      `;
      if (!updated[0]) return NextResponse.json({ error: "RIDER_NOT_FOUND" }, { status: 404 });
      return NextResponse.json({ updated: true, rider: updated[0] });
    }

    if (d.action === "SUSPEND_FOR_HELMET") {
      const updated = (await sql`
        UPDATE operator.profiles
        SET kyc_status = 'SUSPENDED',
            helmet_verified = FALSE,
            is_online = FALSE,
            rejection_reason = ${d.note || "Suspended: Missing clean passenger helmet (3+ reports)"},
            updated_at = NOW()
        WHERE id = ${d.profileId}::uuid
        RETURNING id, user_id AS "userId", full_name AS "fullName", kyc_status AS "kycStatus"
      `) as Array<{ id: string; userId: string }>;
      if (!updated[0]) return NextResponse.json({ error: "RIDER_NOT_FOUND" }, { status: 404 });
      await sql`
        UPDATE location.operator_positions SET is_online = FALSE WHERE operator_id = ${updated[0].userId}::uuid
      `;
      return NextResponse.json({ updated: true, rider: updated[0] });
    }

    const updated = await sql`
      UPDATE operator.profiles
      SET kyc_status = 'APPROVED',
          helmet_verified = TRUE,
          rejection_reason = NULL,
          updated_at = NOW()
      WHERE id = ${d.profileId}::uuid
      RETURNING id, full_name AS "fullName", kyc_status AS "kycStatus", helmet_verified AS "helmetVerified"
    `;
    if (!updated[0]) return NextResponse.json({ error: "RIDER_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ updated: true, rider: updated[0] });
  } catch (err) {
    return NextResponse.json(
      { error: "HELMET_ACTION_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
