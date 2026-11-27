import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@admin/lib/admin-auth";
import { deliverWebPushToAll } from "@partner/lib/partner-webpush";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const push = await deliverWebPushToAll({
      title: "Go.boda Admin Push Test",
      body: `This instant Web Push test was sent by ${auth.admin.name}.`,
      url: "/admin/notification",
      eventSubject: "admin.push_test",
    });
    const sql = getSql(process.env.NOTIF_DATABASE_URL ?? process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    await sql`
      INSERT INTO notif.messages (user_id, channel, event_subject, locale, title, body, payload, status, provider_ref)
      VALUES (${auth.admin.id}::uuid, 'WEB_PUSH', 'admin.push_test', 'en', 'Go.boda Admin Push Test', ${`Instant Web Push test sent to all devices by ${auth.admin.name}.`}, ${JSON.stringify({ attempted: push.attempted, delivered: push.delivered, failed: push.failed, deactivated: push.deactivated, sentByAdminId: auth.admin.id })}::jsonb, ${push.delivered > 0 ? "SENT" : "SIMULATED"}, ${`admin-webpush-test-${Date.now()}`})
    `;
    return NextResponse.json({ sent: true, push }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "PUSH_TEST_FAILED", message: error instanceof Error ? error.message : "Could not send the test push" }, { status: 500 });
  }
}
