import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@admin/lib/admin-auth";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(6).max(32).nullable().optional(),
  email: z.string().trim().email().max(254).nullable().optional(),
  username: z.string().trim().min(3).max(60).nullable().optional(),
  role: z.enum(["CUSTOMER", "BODABODA_RIDER", "BAJAJI_DRIVER", "ADMIN"]).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  }
  if (id === auth.admin.id && parsed.data.role && parsed.data.role !== "ADMIN") {
    return NextResponse.json({ error: "CANNOT_CHANGE_OWN_ADMIN_ROLE" }, { status: 400 });
  }
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      UPDATE auth.users SET
        name = COALESCE(${parsed.data.name ?? null}, name),
        phone = CASE WHEN ${parsed.data.phone !== undefined} THEN ${parsed.data.phone ?? null} ELSE phone END,
        email = CASE WHEN ${parsed.data.email !== undefined} THEN ${parsed.data.email ?? null} ELSE email END,
        username = CASE WHEN ${parsed.data.username !== undefined} THEN ${parsed.data.username ?? null} ELSE username END,
        role = COALESCE(${parsed.data.role ?? null}, role)
      WHERE id = ${id}::uuid
      RETURNING id, name, phone, email, username, role, status, language,
                created_at AS "createdAt"
    `;
    if (!rows[0]) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    if (parsed.data.name !== undefined || parsed.data.phone !== undefined) {
      await sql`
        UPDATE operator.profiles SET
          full_name = COALESCE(${parsed.data.name ?? null}, full_name),
          phone = CASE WHEN ${parsed.data.phone !== undefined} THEN ${parsed.data.phone ?? null} ELSE phone END,
          updated_at = NOW()
        WHERE user_id = ${id}::uuid
      `;
    }
    return NextResponse.json({ user: rows[0] });
  } catch (error) {
    return NextResponse.json({ error: "USER_UPDATE_FAILED", message: error instanceof Error ? error.message : "Database error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (id === auth.admin.id) {
    return NextResponse.json({ error: "CANNOT_DELETE_CURRENT_ADMIN" }, { status: 400 });
  }
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      UPDATE auth.users SET status = 'SUSPENDED'
      WHERE id = ${id}::uuid
      RETURNING id
    `;
    if (!rows[0]) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    await sql`UPDATE operator.profiles SET is_online = FALSE, kyc_status = 'SUSPENDED', updated_at = NOW() WHERE user_id = ${id}::uuid`;
    await sql`UPDATE location.operator_positions SET is_online = FALSE WHERE operator_id = ${id}::uuid`;
    await sql`UPDATE notif.push_subscriptions SET active = FALSE, updated_at = NOW() WHERE user_id = ${id}::uuid`;
    return NextResponse.json({ deleted: true, softDeleted: true });
  } catch (error) {
    return NextResponse.json({ error: "USER_DELETE_FAILED", message: error instanceof Error ? error.message : "Database error" }, { status: 500 });
  }
}
