import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyCustomerRequest } from "@/lib/customer-auth";
import { emitCustomerRealtimeEvent } from "@/lib/customer-realtime";
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/customer-webpush";

export const dynamic = "force-dynamic";

const subSchema = z.object({
  endpoint: z.string().url().max(1200),
  keys: z.object({ p256dh: z.string().min(8).max(500), auth: z.string().min(8).max(500) }),
  userAgent: z.string().max(300).default(""),
});

export async function GET(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT id, endpoint, user_agent AS "userAgent", updated_at AS "updatedAt"
      FROM notif.push_subscriptions
      WHERE user_id = ${auth.customer.id}::uuid
      ORDER BY updated_at DESC
    `) as Array<{ id: string; endpoint: string; userAgent: string; updatedAt: string }>;
    return NextResponse.json({
      subscriptions: rows,
      vapidPublicKey: getVapidPublicKey(),
      webPushConfigured: isWebPushConfigured(),
    });
  } catch (err) {
    return NextResponse.json({ error: "PUSH_SUBS_FETCH_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const parsed = subSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      INSERT INTO notif.push_subscriptions (user_id, role, endpoint, p256dh, auth_key, user_agent, active)
      VALUES (${auth.customer.id}::uuid, 'CUSTOMER', ${d.endpoint}, ${d.keys.p256dh}, ${d.keys.auth}, ${d.userAgent}, TRUE)
      ON CONFLICT (endpoint) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        role = EXCLUDED.role,
        p256dh = EXCLUDED.p256dh,
        auth_key = EXCLUDED.auth_key,
        user_agent = EXCLUDED.user_agent,
        active = TRUE,
        updated_at = NOW()
      RETURNING id
    `) as Array<{ id: string }>;
    emitCustomerRealtimeEvent({ customerId: auth.customer.id, reason: "push_subscribed" });
    return NextResponse.json({ subscribed: true, id: rows[0]?.id ?? null }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "PUSH_SUBSCRIBE_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const endpoint = searchParams.get("endpoint");
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    if (endpoint) {
      await sql`UPDATE notif.push_subscriptions SET active = FALSE, updated_at = NOW() WHERE user_id = ${auth.customer.id}::uuid AND endpoint = ${endpoint}`;
    } else {
      await sql`UPDATE notif.push_subscriptions SET active = FALSE, updated_at = NOW() WHERE user_id = ${auth.customer.id}::uuid`;
    }
    emitCustomerRealtimeEvent({ customerId: auth.customer.id, reason: "push_unsubscribed" });
    return NextResponse.json({ unsubscribed: true });
  } catch (err) {
    return NextResponse.json({ error: "PUSH_UNSUBSCRIBE_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}
