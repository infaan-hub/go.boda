import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@admin/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const riders = await sql`
      SELECT p.id, p.user_id AS "userId", u.name, u.email, u.username,
             COALESCE(p.phone, u.phone) AS phone,
             p.transport_type AS "transportType", p.plate_number AS "plateNumber",
             p.home_kituo AS "homeKituo", p.kyc_status AS "kycStatus",
             u.status AS "accountStatus", p.is_online AS "isOnline",
             p.created_at AS "createdAt"
      FROM operator.profiles p
      JOIN auth.users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT 1000
    `;
    return NextResponse.json({ riders });
  } catch (error) {
    return NextResponse.json({ error: "RIDERS_FETCH_FAILED", message: error instanceof Error ? error.message : "Database error" }, { status: 500 });
  }
}
