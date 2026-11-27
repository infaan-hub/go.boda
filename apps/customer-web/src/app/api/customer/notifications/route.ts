import { NextResponse } from "next/server";
import { z } from "zod";
import { metric } from "@vercel/functions";
import { getSql } from "@goboda/db";
import { verifyCustomerRequest } from "@/lib/customer-auth";
import {
  buildCustomerRealtimeSnapshot,
  emitCustomerRealtimeEvent,
} from "@/lib/customer-realtime";
import {
  deliverWebPushToUser,
  getVapidPublicKey,
  isWebPushConfigured,
} from "@/lib/customer-webpush";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const snapshot = await buildCustomerRealtimeSnapshot(auth.customer);
    return NextResponse.json({
      notifications: snapshot.notifications,
      unreadCount: snapshot.unreadCount,
      pushSubscriptionsCount: snapshot.pushSubscriptionsCount,
      vapidPublicKey: getVapidPublicKey(),
      webPushConfigured: isWebPushConfigured(),
      activeTrip: snapshot.activeTrip,
      timestamp: snapshot.timestamp,
    });
  } catch (err) {
    console.error("Customer notifications fetch failed:", err);
    return NextResponse.json(
      { error: "NOTIFICATIONS_FETCH_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("MARK_READ"), id: z.string().uuid().optional(), all: z.boolean().optional() }),
  z.object({ action: z.literal("SEND_TEST_PUSH"), locale: z.enum(["sw", "en"]).default("en") }),
]);

export async function POST(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const customerId = auth.customer.id;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);

    if (d.action === "MARK_READ") {
      if (d.id) {
        await sql`
          UPDATE notif.messages
          SET payload = jsonb_set(
            COALESCE(payload, '{}'::jsonb),
            '{readByCustomerIds}',
            (
              SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
              FROM jsonb_array_elements(
                COALESCE(payload->'readByCustomerIds', '[]'::jsonb) || to_jsonb(${customerId}::text)
              ) AS elem
            ),
            true
          )
          WHERE id = ${d.id}::uuid
        `;
      } else if (d.all) {
        const snapshot = await buildCustomerRealtimeSnapshot(auth.customer);
        const unreadIds = snapshot.notifications.filter((n) => !n.read).map((n) => n.id);
        if (unreadIds.length > 0) {
          await sql`
            UPDATE notif.messages
            SET payload = jsonb_set(
              COALESCE(payload, '{}'::jsonb),
              '{readByCustomerIds}',
              (
                SELECT COALESCE(jsonb_agg(DISTINCT elem), '[]'::jsonb)
                FROM jsonb_array_elements(
                  COALESCE(payload->'readByCustomerIds', '[]'::jsonb) || to_jsonb(${customerId}::text)
                ) AS elem
              ),
              true
            )
            WHERE id = ANY(${unreadIds}::uuid[])
          `;
        }
      }
      emitCustomerRealtimeEvent({ customerId, reason: "notifications_read" });
      metric("customer.notifications.action", 1, { action: "mark_read", outcome: "success" });
      return NextResponse.json({ updated: true });
    }

    const titleSw = "Go.boda Taarifa ya Papo Hapo";
    const bodySw = "Arifa za Web Push na mtandao wa moja kwa moja ziko tayari.";
    const titleEn = "Go.boda Instant Alert Ready";
    const bodyEn = "Instant Web Push & live realtime connection are active.";
    const title = d.locale === "sw" ? titleSw : titleEn;
    const textBody = d.locale === "sw" ? bodySw : bodyEn;

    const pushResult = await deliverWebPushToUser(customerId, {
      title,
      body: textBody,
      url: "/notifications",
      eventSubject: "customer.push_test",
    });

    const inserted = await sql`
      INSERT INTO notif.messages (user_id, phone, channel, event_subject, locale, title, body, payload, status, provider_ref)
      VALUES (
        ${customerId}::uuid,
        ${auth.customer.phone},
        'WEB_PUSH',
        'customer.push_test',
        ${d.locale},
        ${title},
        ${textBody},
        ${JSON.stringify({
          titleSw, bodySw, titleEn, bodyEn, url: "/notifications",
          pushDelivered: pushResult.delivered,
          pushAttempted: pushResult.attempted,
          webPushConfigured: pushResult.configured,
        })}::jsonb,
        ${pushResult.delivered > 0 ? "SENT" : "SIMULATED"},
        ${`customer-webpush-${pushResult.delivered}`}
      )
      RETURNING id, created_at AS "createdAt"
    `;

    emitCustomerRealtimeEvent({ customerId, reason: "test_push_sent" });
    metric("customer.notifications.action", 1, { action: "send_test_push", outcome: "success" });

    return NextResponse.json(
      { sent: true, notificationId: (inserted[0] as { id?: string } | undefined)?.id ?? null, push: pushResult },
      { status: 201 }
    );
  } catch (err) {
    console.error("Customer notification action failed:", err);
    metric("customer.notifications.action", 1, { action: d.action.toLowerCase(), outcome: "error" });
    return NextResponse.json({ error: "NOTIFICATION_ACTION_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}
