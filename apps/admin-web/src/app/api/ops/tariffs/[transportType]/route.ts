import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const tariffPatchSchema = z.object({
  baseFareTzs: z.number().int().min(500).max(20000).optional(),
  perKmTzs: z.number().int().min(100).max(10000).optional(),
  perMinTzs: z.number().int().min(0).max(2000).optional(),
  minFareTzs: z.number().int().min(500).max(20000).optional(),
  cancelFeeTzs: z.number().int().min(0).max(5000).optional(),
  commissionPct: z.number().int().min(0).max(25).optional(),
  activeMultiplier: z.number().min(1).max(1.25).optional(),
  multiplierReason: z.string().trim().min(2).max(40).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ transportType: string }> }
) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const { transportType } = await context.params;
  const normalized = transportType.toUpperCase();
  if (normalized !== "BODABODA" && normalized !== "BAJAJI") {
    return NextResponse.json(
      { error: "INVALID_TRANSPORT_TYPE" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = tariffPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      UPDATE pricing.tariffs
      SET
        base_fare_tzs = COALESCE(${d.baseFareTzs ?? null}, base_fare_tzs),
        per_km_tzs = COALESCE(${d.perKmTzs ?? null}, per_km_tzs),
        per_min_tzs = COALESCE(${d.perMinTzs ?? null}, per_min_tzs),
        min_fare_tzs = COALESCE(${d.minFareTzs ?? null}, min_fare_tzs),
        cancel_fee_tzs = COALESCE(${d.cancelFeeTzs ?? null}, cancel_fee_tzs),
        commission_pct = COALESCE(${d.commissionPct ?? null}, commission_pct),
        active_multiplier = COALESCE(${d.activeMultiplier ?? null}, active_multiplier),
        multiplier_reason = COALESCE(${d.multiplierReason ?? null}, multiplier_reason),
        updated_at = NOW()
      WHERE transport_type = ${normalized}
      RETURNING
        transport_type AS "transportType",
        base_fare_tzs AS "baseFareTzs",
        per_km_tzs AS "perKmTzs",
        per_min_tzs AS "perMinTzs",
        min_fare_tzs AS "minFareTzs",
        cancel_fee_tzs AS "cancelFeeTzs",
        commission_pct AS "commissionPct",
        active_multiplier AS "activeMultiplier",
        multiplier_reason AS "multiplierReason",
        updated_at AS "updatedAt"
    `;
    return NextResponse.json({ updated: true, tariff: rows[0] });
  } catch (err) {
    return NextResponse.json(
      {
        error: "TARIFF_UPDATE_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
