import { NextResponse } from "next/server";
import { z } from "zod";
import { metric } from "@vercel/functions";
import { getSql } from "@goboda/db";
import { verifyPartnerRequest } from "../../../../../lib/partner-auth";
import { emitPartnerRealtimeEvent } from "../../../../../lib/partner-realtime";
import {
  getVapidPublicKey,
  isWebPushConfigured,
} from "../../../../../lib/partner-webpush";

export const dynamic = "force-dynamic";

const subSchema = z.object({
  endpoint: z.string().url().max(1200),
  keys: z.object({
    p256dh: z.string().min(8).max(500),
    auth: z.string().min(8).max(500),
  }),
  userAgent: z.string().max(300).default(""),
});

export async function GET(request: Request) {
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT id, endpoint, user_agent AS "userAgent", updated_at AS "updatedAt"
      FROM notif.push_subscriptions
      WHERE user_id = ${auth.partner.id}::uuid AND active = TRUE
      ORDER BY updated_at DESC
    `) as Array<{ id: string; endpoint: string; userAgent: string; updatedAt: string }>;

    return NextResponse.json({
      configured: isWebPushConfigured(),
      vapidPublicKey: getVapidPublicKey(),
      activeCount: rows.length,
      subscriptions: rows,
    });
  } catch (err) {
    console.error("Push subscription status fetch failed:", err);
    return NextResponse.json(
      { error: "PUSH_STATUS_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = subSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      INSERT INTO notif.push_subscriptions (
        user_id, role, endpoint, p256dh, auth_key, user_agent, active, updated_at
      )
      VALUES (
        ${auth.partner.id}::uuid,
        ${auth.partner.role},
        ${d.endpoint},
        ${d.keys.p256dh},
        ${d.keys.auth},
        ${d.userAgent},
        TRUE,
        NOW()
      )
      ON CONFLICT (endpoint) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        role = EXCLUDED.role,
        p256dh = EXCLUDED.p256dh,
        auth_key = EXCLUDED.auth_key,
        user_agent = EXCLUDED.user_agent,
        active = TRUE,
        updated_at = NOW()
      RETURNING id, endpoint, active, updated_at AS "updatedAt"
    `;

    const countRows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM notif.push_subscriptions
      WHERE user_id = ${auth.partner.id}::uuid AND active = TRUE
    `) as Array<{ count: number }>;

    emitPartnerRealtimeEvent({
      operatorId: auth.partner.id,
      reason: "push_subscribed",
    });

    metric("partner.webpush.subscribe", 1, { outcome: "success" });

    return NextResponse.json(
      {
        subscribed: true,
        subscription: rows[0],
        activeCount: Number(countRows[0]?.count ?? 1),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("Push subscription save failed:", err);
    metric("partner.webpush.subscribe", 1, { outcome: "error" });
    return NextResponse.json(
      { error: "PUSH_SUBSCRIBE_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };

  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    if (body.endpoint) {
      await sql`
        UPDATE notif.push_subscriptions
        SET active = FALSE, updated_at = NOW()
        WHERE user_id = ${auth.partner.id}::uuid AND endpoint = ${body.endpoint}
      `;
    } else {
      await sql`
        UPDATE notif.push_subscriptions
        SET active = FALSE, updated_at = NOW()
        WHERE user_id = ${auth.partner.id}::uuid
      `;
    }

    emitPartnerRealtimeEvent({
      operatorId: auth.partner.id,
      reason: "push_unsubscribed",
    });

    return NextResponse.json({ unsubscribed: true });
  } catch (err) {
    console.error("Push unsubscribe failed:", err);
    return NextResponse.json(
      { error: "PUSH_UNSUBSCRIBE_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
