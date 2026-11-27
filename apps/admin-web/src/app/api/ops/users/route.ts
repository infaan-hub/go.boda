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
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const role = searchParams.get("role");
    const like = q ? `%${q}%` : "%";
    const rows = await sql`
      SELECT id, phone, name, role, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM auth.users
      WHERE (${role}::text IS NULL OR role = ${role})
        AND (name ILIKE ${like} OR phone ILIKE ${like})
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return NextResponse.json({ users: rows });
  } catch (err) {
    return NextResponse.json({ error: "USERS_FETCH_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(20),
  role: z.enum(["CUSTOMER", "BODABODA_RIDER", "BAJAJI_DRIVER", "ADMIN"]).default("CUSTOMER"),
});

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      INSERT INTO auth.users (phone, name, role)
      VALUES (${d.phone}, ${d.name}, ${d.role})
      RETURNING id, phone, name, role, created_at AS "createdAt"
    `;
    return NextResponse.json({ user: rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "USER_CREATE_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}
