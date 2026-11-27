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
  deactivated: number;
}

interface PushSubRow {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  authKey: string;
}

async function sendToSubscriptions(
  subs: PushSubRow[],
  payload: WebPushPayload
): Promise<WebPushDeliveryResult> {
  const configured = ensureVapidConfigured();
  if (!configured || subs.length === 0) {
    return {
      configured,
      attempted: subs.length,
      delivered: 0,
      failed: 0,
      deactivated: 0,
    };
  }

  const sql = getSql(process.env.NOTIF_DATABASE_URL ?? process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
  const bodyJson = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/partner/notifications",
    tag: payload.tag ?? payload.eventSubject ?? "goboda-partner",
    eventSubject: payload.eventSubject ?? "partner.notification",
    timestamp: new Date().toISOString(),
    ...(payload.data ?? {}),
  });

  let delivered = 0;
  let failed = 0;
  let deactivated = 0;

  for (let offset = 0; offset < subs.length; offset += 50) {
    await Promise.all(subs.slice(offset, offset + 50).map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.authKey } },
          bodyJson,
          { TTL: 60, urgency: "high" }
        );
        delivered += 1;
      } catch (err: unknown) {
        failed += 1;
        const statusCode = typeof err === "object" && err !== null && "statusCode" in err
          ? Number((err as { statusCode?: number }).statusCode)
          : 0;
        if (statusCode === 404 || statusCode === 410) {
          deactivated += 1;
          await sql`
            UPDATE notif.push_subscriptions
            SET active = FALSE, updated_at = NOW()
            WHERE id = ${sub.id}::uuid
          `.catch(() => null);
        }
      }
    }));
  }

  metric("partner.webpush.delivery", delivered, {
    outcome: delivered > 0 ? "delivered" : "zero",
  });
  if (failed > 0) {
    metric("partner.webpush.failed", failed, { outcome: "error" });
  }

  return {
    configured: true,
    attempted: subs.length,
    delivered,
    failed,
    deactivated,
  };
}

export async function deliverWebPushToUser(
  userId: string,
  payload: WebPushPayload
): Promise<WebPushDeliveryResult> {
  const sql = getSql(process.env.NOTIF_DATABASE_URL ?? process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
  const subs = (await sql`
    SELECT id, user_id AS "userId", endpoint, p256dh, auth_key AS "authKey"
    FROM notif.push_subscriptions
    WHERE user_id = ${userId}::uuid AND active = TRUE
  `) as PushSubRow[];

  return sendToSubscriptions(subs, payload);
}

export async function deliverWebPushToCustomer(
  userId: string,
  payload: WebPushPayload
): Promise<WebPushDeliveryResult> {
  const sql = getSql(process.env.NOTIF_DATABASE_URL ?? process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
  const subs = (await sql`
    SELECT id, user_id AS "userId", endpoint, p256dh, auth_key AS "authKey"
    FROM notif.push_subscriptions
    WHERE user_id = ${userId}::uuid AND active = TRUE
  `) as PushSubRow[];
  return sendToSubscriptions(subs, payload);
}

export async function deliverWebPushToAll(
  payload: WebPushPayload
): Promise<WebPushDeliveryResult> {
  const sql = getSql(process.env.NOTIF_DATABASE_URL ?? process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
  const subs = (await sql`
    SELECT id, user_id AS "userId", endpoint, p256dh, auth_key AS "authKey"
    FROM notif.push_subscriptions
    WHERE active = TRUE
    ORDER BY updated_at DESC
  `) as PushSubRow[];
  return sendToSubscriptions(subs, payload);
}

export async function deliverWebPushToSegment(
  segment:
    | "ALL_OPERATORS"
    | "BODABODA_RIDERS"
    | "BAJAJI_DRIVERS"
    | "STONE_TOWN_RIDERS",
  payload: WebPushPayload
): Promise<WebPushDeliveryResult> {
  const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
  let subs: PushSubRow[] = [];

  if (segment === "BODABODA_RIDERS" || segment === "STONE_TOWN_RIDERS") {
    subs = (await sql`
      SELECT s.id, s.user_id AS "userId", s.endpoint, s.p256dh, s.auth_key AS "authKey"
      FROM notif.push_subscriptions s
      JOIN operator.profiles p ON p.user_id = s.user_id
      WHERE s.active = TRUE AND p.transport_type = 'BODABODA'
      LIMIT 200
    `) as PushSubRow[];
  } else if (segment === "BAJAJI_DRIVERS") {
    subs = (await sql`
      SELECT s.id, s.user_id AS "userId", s.endpoint, s.p256dh, s.auth_key AS "authKey"
      FROM notif.push_subscriptions s
      JOIN operator.profiles p ON p.user_id = s.user_id
      WHERE s.active = TRUE AND p.transport_type = 'BAJAJI'
      LIMIT 200
    `) as PushSubRow[];
  } else {
    subs = (await sql`
      SELECT s.id, s.user_id AS "userId", s.endpoint, s.p256dh, s.auth_key AS "authKey"
      FROM notif.push_subscriptions s
      JOIN operator.profiles p ON p.user_id = s.user_id
      WHERE s.active = TRUE
      LIMIT 200
    `) as PushSubRow[];
  }

  return sendToSubscriptions(subs, payload);
}
