import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const broadcastSchema = z.object({
  segment: z.enum([
    "ALL_OPERATORS",
    "BODABODA_RIDERS",
    "BAJAJI_DRIVERS",
    "FLOAT_BLOCKED",
    "STONE_TOWN_RIDERS",
    "ALL_CUSTOMERS",
  ]),
  channel: z.enum(["WEB_PUSH", "WHATSAPP", "SMS"]).default("WHATSAPP"),
  titleSw: z.string().trim().min(2).max(140),
  bodySw: z.string().trim().min(4).max(500),
  titleEn: z.string().trim().min(2).max(140),
  bodyEn: z.string().trim().min(4).max(500),
});

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT
        id, channel, event_subject AS "eventSubject", locale,
        title, body, payload, status, provider_ref AS "providerRef",
        created_at AS "createdAt"
      FROM notif.messages
      WHERE event_subject LIKE 'ops.broadcast.%'
      ORDER BY created_at DESC
      LIMIT 40
    `;
    return NextResponse.json({ broadcasts: rows });
  } catch (err) {
    return NextResponse.json(
      { error: "BROADCASTS_FETCH_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = broadcastSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  try {
    const sql = getSql();

    // Count live target audience size in Neon
    let recipientCount = 0;
    if (d.segment === "ALL_OPERATORS") {
      const c = await sql`SELECT COUNT(*)::int AS n FROM operator.profiles`;
      recipientCount = Number((c[0] as { n?: number })?.n ?? 0);
    } else if (d.segment === "BODABODA_RIDERS") {
      const c = await sql`SELECT COUNT(*)::int AS n FROM operator.profiles WHERE transport_type = 'BODABODA'`;
      recipientCount = Number((c[0] as { n?: number })?.n ?? 0);
    } else if (d.segment === "BAJAJI_DRIVERS") {
      const c = await sql`SELECT COUNT(*)::int AS n FROM operator.profiles WHERE transport_type = 'BAJAJI'`;
      recipientCount = Number((c[0] as { n?: number })?.n ?? 0);
    } else if (d.segment === "FLOAT_BLOCKED") {
      const c = await sql`SELECT COUNT(*)::int AS n FROM finance.wallet_accounts WHERE account_type = 'COMMISSION_FLOAT' AND is_float_blocked = TRUE`;
      recipientCount = Number((c[0] as { n?: number })?.n ?? 0);
    } else if (d.segment === "STONE_TOWN_RIDERS") {
      const c = await sql`SELECT COUNT(*)::int AS n FROM location.operator_positions WHERE is_online = TRUE AND transport_type = 'BODABODA'`;
      recipientCount = Number((c[0] as { n?: number })?.n ?? 0);
    } else {
      const c = await sql`SELECT COUNT(*)::int AS n FROM auth.users WHERE role = 'CUSTOMER'`;
      recipientCount = Number((c[0] as { n?: number })?.n ?? 0);
    }

    const inserted = await sql`
      INSERT INTO notif.messages (
        channel, event_subject, locale, title, body, payload, status, provider_ref
      )
      VALUES (
        ${d.channel},
        ${`ops.broadcast.${d.segment.toLowerCase()}`},
        'sw',
        ${`${d.titleSw} / ${d.titleEn}`},
        ${`[SW] ${d.bodySw}\n[EN] ${d.bodyEn}`},
        ${JSON.stringify({
          segment: d.segment,
          titleSw: d.titleSw,
          bodySw: d.bodySw,
          titleEn: d.titleEn,
          bodyEn: d.bodyEn,
          recipientCount,
          sentByAdminId: auth.admin.id,
          sentByAdminName: auth.admin.name,
        })}::jsonb,
        'SENT',
        ${`ops-broadcast-${d.segment.toLowerCase()}`}
      )
      RETURNING id, channel, event_subject AS "eventSubject", title, body, payload, status, created_at AS "createdAt"
    `;

    return NextResponse.json(
      { sent: true, recipientCount, broadcast: inserted[0] },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "BROADCAST_SEND_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
