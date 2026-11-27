import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(["CUSTOMER", "BODABODA_RIDER", "BAJAJI_DRIVER", "ADMIN"]).optional(),
  phone: z.string().trim().min(9).max(20).optional(),
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
      UPDATE auth.users
      SET name = COALESCE(${d.name ?? null}, name),
          role = COALESCE(${d.role ?? null}, role),
          phone = COALESCE(${d.phone ?? null}, phone),
          updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING id, phone, name, role, updated_at AS "updatedAt"
    `;
    if (!rows[0]) return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ user: rows[0] });
  } catch (err) {
    return NextResponse.json({ error: "USER_UPDATE_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    await sql`DELETE FROM auth.users WHERE id = ${id}::uuid`;
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: "USER_DELETE_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}
