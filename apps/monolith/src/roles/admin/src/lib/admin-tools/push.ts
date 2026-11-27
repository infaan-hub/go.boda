import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@admin/lib/admin-auth";
import { getVapidPublicKey, isWebPushConfigured } from "@partner/lib/partner-webpush";

export const dynamic = "force-dynamic";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1200),
  keys: z.object({ p256dh: z.string().min(8).max(500), auth: z.string().min(8).max(500) }),
  userAgent: z.string().max(300).default(""),
});

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const sql = getSql(process.env.NOTIF_DATABASE_URL ?? process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`SELECT COUNT(*)::int AS count FROM notif.push_subscriptions WHERE user_id = ${auth.admin.id}::uuid AND active = TRUE` as Array<{ count: number }>;
    return NextResponse.json({ configured: isWebPushConfigured(), vapidPublicKey: getVapidPublicKey(), activeCount: Number(rows[0]?.count ?? 0) });
  } catch (error) {
    return NextResponse.json({ error: "PUSH_STATUS_FAILED", message: error instanceof Error ? error.message : "Database error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  try {
    const sql = getSql(process.env.NOTIF_DATABASE_URL ?? process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    await sql`
      INSERT INTO notif.push_subscriptions (user_id, role, endpoint, p256dh, auth_key, user_agent, active, updated_at)
      VALUES (${auth.admin.id}::uuid, 'ADMIN', ${parsed.data.endpoint}, ${parsed.data.keys.p256dh}, ${parsed.data.keys.auth}, ${parsed.data.userAgent}, TRUE, NOW())
      ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, role = 'ADMIN', p256dh = EXCLUDED.p256dh, auth_key = EXCLUDED.auth_key, user_agent = EXCLUDED.user_agent, active = TRUE, updated_at = NOW()
    `;
    return NextResponse.json({ subscribed: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "PUSH_SUBSCRIBE_FAILED", message: error instanceof Error ? error.message : "Database error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({})) as { endpoint?: string };
  try {
    const sql = getSql(process.env.NOTIF_DATABASE_URL ?? process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    if (body.endpoint) {
      await sql`UPDATE notif.push_subscriptions SET active = FALSE, updated_at = NOW() WHERE user_id = ${auth.admin.id}::uuid AND endpoint = ${body.endpoint}`;
    } else {
      await sql`UPDATE notif.push_subscriptions SET active = FALSE, updated_at = NOW() WHERE user_id = ${auth.admin.id}::uuid`;
    }
    return NextResponse.json({ unsubscribed: true });
  } catch (error) {
    return NextResponse.json({ error: "PUSH_UNSUBSCRIBE_FAILED", message: error instanceof Error ? error.message : "Database error" }, { status: 500 });
  }
}
