import { NextResponse } from "next/server";
import { z } from "zod";
import { metric } from "@vercel/functions";
import { getSql } from "@goboda/db";
import { verifyPartnerRequest } from "../../../../lib/partner-auth";
import {
  buildPartnerRealtimeSnapshot,
  emitPartnerRealtimeEvent,
} from "../../../../lib/partner-realtime";
import {
  getVapidPublicKey,
  isWebPushConfigured,
} from "../../../../lib/partner-webpush";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const snapshot = await buildPartnerRealtimeSnapshot(auth.partner);
    return NextResponse.json({
      notifications: snapshot.notifications,
      unreadCount: snapshot.unreadCount,
      pushSubscriptionsCount: snapshot.pushSubscriptionsCount,
      vapidPublicKey: getVapidPublicKey(),
      webPushConfigured: isWebPushConfigured(),
      compliance: snapshot.compliance,
      timestamp: snapshot.timestamp,
    });
  } catch (err) {
    console.error("Partner notifications fetch failed:", err);
    return NextResponse.json(
      {
        error: "NOTIFICATIONS_FETCH_FAILED",
        message: err instanceof Error ? err.message : "DB error",
      },
      { status: 500 }
    );
  }
}

const actionSchema = z.object({
  action: z.literal("MARK_READ"),
  id: z.string().uuid().optional(),
  all: z.boolean().optional(),
});

export async function POST(request: Request) {
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const operatorId = auth.partner.id;

  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);

    if (d.id) {
      await sql`
          UPDATE notif.messages
          SET payload = jsonb_set(
            COALESCE(payload, '{}'::jsonb),
            '{readByOperatorIds}',
            (
              SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
              FROM jsonb_array_elements(
                COALESCE(payload->'readByOperatorIds', '[]'::jsonb) || to_jsonb(${operatorId}::text)
              ) AS elem
            ),
            true
          )
          WHERE id = ${d.id}::uuid
        `;
    } else if (d.all) {
      const snapshot = await buildPartnerRealtimeSnapshot(auth.partner);
      const unreadIds = snapshot.notifications
        .filter((n) => !n.read)
        .map((n) => n.id);
      if (unreadIds.length > 0) {
        await sql`
            UPDATE notif.messages
            SET payload = jsonb_set(
              COALESCE(payload, '{}'::jsonb),
              '{readByOperatorIds}',
              (
                SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
                FROM jsonb_array_elements(
                  COALESCE(payload->'readByOperatorIds', '[]'::jsonb) || to_jsonb(${operatorId}::text)
                ) AS elem
              ),
              true
            )
            WHERE id = ANY(${unreadIds}::uuid[])
        `;
      }
    }

    emitPartnerRealtimeEvent({
      operatorId,
      reason: "notifications_read",
    });

    metric("partner.notifications.action", 1, {
      action: "mark_read",
      outcome: "success",
    });

    return NextResponse.json({ updated: true });

  } catch (err) {
    console.error("Partner notification action failed:", err);
    metric("partner.notifications.action", 1, {
      action: "mark_read",
      outcome: "error",
    });
    return NextResponse.json(
      {
        error: "NOTIFICATION_ACTION_FAILED",
        message: err instanceof Error ? err.message : "DB error",
      },
      { status: 500 }
    );
  }
}
