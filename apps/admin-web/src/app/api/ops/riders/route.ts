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
    const transport = searchParams.get("transport");
    const like = q ? `%${q}%` : "%";
    const rows = await sql`
      SELECT
        p.id, p.user_id AS "userId", p.transport_type AS "transportType",
        p.operator_title AS "operatorTitle", p.full_name AS "fullName", p.phone,
        p.plate_number AS "plateNumber", p.kyc_status AS "kycStatus",
        p.is_online AS "isOnline", p.float_blocked AS "floatBlocked",
        p.created_at AS "createdAt", u.status AS "userStatus"
      FROM operator.profiles p
      LEFT JOIN auth.users u ON u.id = p.user_id
      WHERE (${transport}::text IS NULL OR p.transport_type = ${transport})
        AND (p.full_name ILIKE ${like} OR p.phone ILIKE ${like} OR p.plate_number ILIKE ${like})
      ORDER BY p.created_at DESC
      LIMIT 200
    `;
    return NextResponse.json({ riders: rows });
  } catch (err) {
    return NextResponse.json({ error: "RIDERS_FETCH_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}
