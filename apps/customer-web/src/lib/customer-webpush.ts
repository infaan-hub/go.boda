import webpush from "web-push";
import { metric } from "@vercel/functions";
import { getSql } from "@goboda/db";

let vapidInitialized = false;

export function getVapidPublicKey(): string | null {
  const key = process.env.VAPID_PUBLIC_KEY?.trim();
  return key && key.length > 10 ? key : null;
}

export function isWebPushConfigured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  return Boolean(pub && priv && pub.length > 10 && priv.length > 10);
}

function ensureVapidConfigured(): boolean {
  if (!isWebPushConfigured()) return false;
  if (!vapidInitialized) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT?.trim() || "mailto:ops@goboda.co.tz",
      process.env.VAPID_PUBLIC_KEY!.trim(),
      process.env.VAPID_PRIVATE_KEY!.trim()
    );
    vapidInitialized = true;
  }
  return true;
}

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  eventSubject?: string;
  data?: Record<string, unknown>;
}

export interface WebPushDeliveryResult {
  configured: boolean;
  attempted: number;
  delivered: number;
  failed: number;
  removed: number;
}

export async function deliverWebPushToUser(
  userId: string,
  payload: WebPushPayload
): Promise<WebPushDeliveryResult> {
  const result: WebPushDeliveryResult = {
    configured: isWebPushConfigured(),
    attempted: 0,
    delivered: 0,
    failed: 0,
    removed: 0,
  };
  if (!ensureVapidConfigured()) return result;

  const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
  const rows = (await sql`
    SELECT id, endpoint, p256dh, auth_key AS "authKey"
    FROM notif.push_subscriptions
    WHERE user_id = ${userId}::uuid AND active = TRUE
  `) as Array<{ id: string; endpoint: string; p256dh: string; authKey: string }>;

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/notifications",
    tag: payload.tag ?? payload.eventSubject ?? "goboda-customer",
    eventSubject: payload.eventSubject ?? "customer.notification",
    data: payload.data ?? {},
  });

  for (const sub of rows) {
    result.attempted += 1;
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.authKey },
        },
        pushPayload,
        { TTL: 60 * 60 }
      );
      result.delivered += 1;
    } catch (err) {
      result.failed += 1;
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await sql`
          UPDATE notif.push_subscriptions SET active = FALSE, updated_at = NOW()
          WHERE id = ${sub.id}::uuid
        `.catch(() => null);
        result.removed += 1;
      }
    }
  }

  try {
    metric("customer.webpush.delivery", result.delivered, {
      configured: String(result.configured),
    });
  } catch {
    // ignore
  }
  return result;
}
