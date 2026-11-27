import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "SUSPENDED"]),
  reason: z.string().trim().max(300).default(""),
  helmetVerified: z.boolean().optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      UPDATE operator.profiles
      SET
        kyc_status = ${d.decision},
        rejection_reason = CASE WHEN ${d.decision} = 'APPROVED' THEN '' ELSE ${d.reason} END,
        helmet_verified = COALESCE(${d.helmetVerified ?? null}, helmet_verified),
        is_online = CASE WHEN ${d.decision} = 'SUSPENDED' THEN FALSE ELSE is_online END,
        updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING id, user_id AS "userId", transport_type AS "transportType",
                operator_title AS "operatorTitle", plate_number AS "plateNumber",
                kyc_status AS "kycStatus", helmet_verified AS "helmetVerified"
    `) as Array<{
      id: string;
      userId: string;
      transportType: string;
      operatorTitle: string;
      plateNumber: string;
      kycStatus: string;
      helmetVerified: boolean;
    }>;

    const op = rows[0];
    if (!op) {
      return NextResponse.json({ error: "OPERATOR_NOT_FOUND" }, { status: 404 });
    }

    // Auto-provision EARNINGS + COMMISSION_FLOAT wallets on approval
    if (d.decision === "APPROVED") {
      await sql`
        INSERT INTO finance.wallet_accounts (owner_id, account_type, currency, balance_tzs)
        VALUES
          (${op.userId}::uuid, 'EARNINGS', 'TZS', 0),
          (${op.userId}::uuid, 'COMMISSION_FLOAT', 'TZS', 0)
        ON CONFLICT (owner_id, account_type) DO NOTHING
      `;
    } else if (d.decision === "SUSPENDED") {
      await sql`
        UPDATE location.operator_positions
        SET is_online = FALSE
        WHERE operator_id = ${op.userId}::uuid
      `;
    }

    return NextResponse.json({ updated: true, operator: op });
  } catch (err) {
    return NextResponse.json(
      {
        error: "REVIEW_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
