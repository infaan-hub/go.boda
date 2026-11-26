import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";

export const dynamic = "force-dynamic";

const promoSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(24),
  discountType: z.enum(["PERCENT", "FLAT_TZS"]).default("PERCENT"),
  discountValue: z.number().int().min(1).max(20000),
  maxDiscountTzs: z.number().int().min(100).max(20000).default(2000),
  minFareTzs: z.number().int().min(500).max(50000).default(1500),
  active: z.boolean().default(true),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = promoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const d = parsed.data;
  try {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO pricing.promo_codes (
        code, discount_type, discount_value, max_discount_tzs, min_fare_tzs, active
      )
      VALUES (
        ${d.code}, ${d.discountType}, ${d.discountValue},
        ${d.maxDiscountTzs}, ${d.minFareTzs}, ${d.active}
      )
      ON CONFLICT (code) DO UPDATE SET
        discount_type = EXCLUDED.discount_type,
        discount_value = EXCLUDED.discount_value,
        max_discount_tzs = EXCLUDED.max_discount_tzs,
        min_fare_tzs = EXCLUDED.min_fare_tzs,
        active = EXCLUDED.active
      RETURNING
        code,
        discount_type AS "discountType",
        discount_value AS "discountValue",
        max_discount_tzs AS "maxDiscountTzs",
        min_fare_tzs AS "minFareTzs",
        active
    `;
    return NextResponse.json({ saved: true, promo: rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: "PROMO_SAVE_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
