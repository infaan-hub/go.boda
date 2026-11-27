import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(9).max(20).optional(),
  plateNumber: z.string().trim().max(40).optional(),
  kycStatus: z.enum(["NOT_SUBMITTED", "PENDING_VERIFICATION", "APPROVED", "REJECTED", "SUSPENDED"]).optional(),
  suspend: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      SELECT user_id AS "userId" FROM operator.profiles WHERE id = ${id}::uuid LIMIT 1
    ` as Array<{ userId: string }>;
    const userId = rows[0]?.userId;
    if (!userId) return NextResponse.json({ error: "RIDER_NOT_FOUND" }, { status: 404 });

    const newKyc = d.suspend ? "SUSPENDED" : d.kycStatus;
    await sql`
      UPDATE operator.profiles
      SET full_name = COALESCE(${d.fullName ?? null}, full_name),
          phone = COALESCE(${d.phone ?? null}, phone),
          plate_number = COALESCE(${d.plateNumber ?? null}, plate_number),
          kyc_status = COALESCE(${newKyc ?? null}, kyc_status),
          updated_at = NOW()
      WHERE id = ${id}::uuid
    `;
    if (d.suspend !== undefined) {
      await sql`
        UPDATE auth.users SET status = ${d.suspend ? "SUSPENDED" : "ACTIVE"}, updated_at = NOW()
        WHERE id = ${userId}::uuid
      `;
    }
    return NextResponse.json({ updated: true });
  } catch (err) {
    return NextResponse.json({ error: "RIDER_UPDATE_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`SELECT user_id AS "userId" FROM operator.profiles WHERE id = ${id}::uuid LIMIT 1` as Array<{ userId: string }>;
    const userId = rows[0]?.userId;
    await sql`DELETE FROM operator.profiles WHERE id = ${id}::uuid`;
    if (userId) await sql`DELETE FROM auth.users WHERE id = ${userId}::uuid`;
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: "RIDER_DELETE_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}
