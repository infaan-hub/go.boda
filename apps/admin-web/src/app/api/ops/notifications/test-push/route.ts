import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";
import { deliverWebPushToAll, getVapidPublicKey, isWebPushConfigured } from "@/lib/admin-webpush";

export const dynamic = "force-dynamic";

const schema = z.object({ locale: z.enum(["sw", "en"]).default("en") });

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  const locale = parsed.success ? parsed.data.locale : "en";
  const title = locale === "sw" ? "Go.boda Ops Arifa ya Papo Hapo" : "Go.boda Ops Instant Alert";
  const text = locale === "sw" ? "Hii ni arifa ya majaribio ya Web Push kwa vifaa vyote." : "This is a test Web Push alert to all devices.";
  try {
    const result = await deliverWebPushToAll({ title, body: text, url: "/admin/notifications", tag: "admin-test-push" });
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    await sql`
      INSERT INTO notif.messages (user_id, phone, channel, event_subject, locale, title, body, payload, status, provider_ref)
      VALUES (
        ${auth.admin.id}::uuid, ${auth.admin.phone}, 'WEB_PUSH', 'admin.test_push', ${locale},
        ${title}, ${text},
        ${JSON.stringify({ title, body: text, url: "/admin/notifications", push: result })}::jsonb,
        ${result.delivered > 0 ? "SENT" : "SIMULATED"}, 'admin-test-push'
      )
    `.catch(() => null);
    return NextResponse.json({ sent: true, push: result, vapidPublicKey: getVapidPublicKey(), webPushConfigured: isWebPushConfigured() });
  } catch (err) {
    return NextResponse.json({ error: "TEST_PUSH_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}
