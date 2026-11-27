import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@admin/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const users = await sql`
      SELECT id, name, phone, email, username, role, status, language,
             created_at AS "createdAt"
      FROM auth.users
      ORDER BY created_at DESC
      LIMIT 1000
    `;
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json(
      { error: "USERS_FETCH_FAILED", message: error instanceof Error ? error.message : "Database error" },
      { status: 500 }
    );
  }
}
