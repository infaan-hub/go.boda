import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@admin/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const sql = getSql(process.env.NOTIF_DATABASE_URL ?? process.env.DATABASE_URL);
    const notifications = await sql`
      SELECT id, channel, title, body, status, created_at AS "createdAt"
      FROM notif.messages
      WHERE user_id = ${auth.admin.id}::uuid
      ORDER BY created_at DESC
      LIMIT 30
    `;
    return NextResponse.json({ count: notifications.length, notifications });
  } catch {
    return NextResponse.json(
      { error: "ADMIN_NOTIFICATIONS_UNAVAILABLE" },
      { status: 503 }
    );
  }
}
