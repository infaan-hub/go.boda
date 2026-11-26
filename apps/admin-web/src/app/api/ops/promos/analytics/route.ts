import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT
        p.code,
        p.discount_type AS "discountType",
        p.discount_value AS "discountValue",
        p.max_discount_tzs AS "maxDiscountTzs",
        p.min_fare_tzs AS "minFareTzs",
        p.active,
        COALESCE(p.max_redemptions, 1000)::int AS "maxRedemptions",
        COALESCE(p.budget_cap_tzs, 2000000)::bigint AS "budgetCapTzs",
        p.expires_at AS "expiresAt",
        COUNT(t.id)::int AS "redemptionsCount",
        COALESCE(SUM(t.discount_tzs), 0)::bigint AS "subsidyBurnTzs",
        COALESCE(SUM(t.gross_fare_tzs), 0)::bigint AS "grossGmvTzs",
        COALESCE(SUM(t.operator_net_tzs), 0)::bigint AS "operatorNetProtectedTzs"
      FROM pricing.promo_codes p
      LEFT JOIN trip.trips t ON t.promo_code = p.code
      GROUP BY p.code, p.discount_type, p.discount_value, p.max_discount_tzs,
               p.min_fare_tzs, p.active, p.max_redemptions, p.budget_cap_tzs, p.expires_at, p.created_at
      ORDER BY p.created_at DESC
    `) as Array<{
      code: string;
      discountType: string;
      discountValue: number;
      maxDiscountTzs: number;
      minFareTzs: number;
      active: boolean;
      maxRedemptions: number;
      budgetCapTzs: string | number;
      expiresAt: string | null;
      redemptionsCount: number;
      subsidyBurnTzs: string | number;
      grossGmvTzs: string | number;
      operatorNetProtectedTzs: string | number;
    }>;

    const campaigns = rows.map((r) => {
      const budgetCapTzs = Number(r.budgetCapTzs);
      const subsidyBurnTzs = Number(r.subsidyBurnTzs);
      return {
        ...r,
        budgetCapTzs,
        subsidyBurnTzs,
        grossGmvTzs: Number(r.grossGmvTzs),
        operatorNetProtectedTzs: Number(r.operatorNetProtectedTzs),
        budgetUtilizationPct:
          budgetCapTzs > 0 ? Math.min(100, Math.round((subsidyBurnTzs / budgetCapTzs) * 100)) : 0,
      };
    });

    return NextResponse.json({
      summary: {
        activeCampaigns: campaigns.filter((c) => c.active).length,
        totalRedemptions: campaigns.reduce((s, c) => s + c.redemptionsCount, 0),
        totalSubsidyBurnTzs: campaigns.reduce((s, c) => s + c.subsidyBurnTzs, 0),
        totalOperatorNetProtectedTzs: campaigns.reduce(
          (s, c) => s + c.operatorNetProtectedTzs,
          0
        ),
      },
      campaigns,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "PROMO_ANALYTICS_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}

const capPatchSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(24),
  maxRedemptions: z.number().int().min(1).max(100000).optional(),
  budgetCapTzs: z.number().int().min(5000).max(500000000).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = capPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const d = parsed.data;
  try {
    const sql = getSql();
    const rows = await sql`
      UPDATE pricing.promo_codes
      SET
        max_redemptions = COALESCE(${d.maxRedemptions ?? null}, max_redemptions),
        budget_cap_tzs = COALESCE(${d.budgetCapTzs ?? null}, budget_cap_tzs),
        active = COALESCE(${d.active ?? null}, active)
      WHERE code = ${d.code}
      RETURNING code, active, max_redemptions AS "maxRedemptions", budget_cap_tzs AS "budgetCapTzs"
    `;
    if (!rows[0]) {
      return NextResponse.json({ error: "PROMO_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ updated: true, campaign: rows[0] });
  } catch (err) {
    return NextResponse.json(
      { error: "PROMO_CAP_UPDATE_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
