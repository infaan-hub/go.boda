import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const [tickets, recentChats, disputedTrips] = await Promise.all([
      sql`
        SELECT
          id, trip_id AS "tripId", trip_code AS "tripCode",
          reporter_role AS "reporterRole", reporter_phone AS "reporterPhone",
          category, subject, description, status,
          ops_reply_sw AS "opsReplySw", ops_reply_en AS "opsReplyEn",
          created_at AS "createdAt", updated_at AS "updatedAt"
        FROM notif.support_tickets
        ORDER BY CASE WHEN status = 'OPEN' THEN 0 WHEN status = 'IN_REVIEW' THEN 1 ELSE 2 END,
                 created_at DESC
        LIMIT 60
      `,
      sql`
        SELECT
          m.id, m.trip_id AS "tripId", t.trip_code AS "tripCode",
          m.sender_role AS "senderRole", m.preset_key AS "presetKey",
          m.body_sw AS "bodySw", m.body_en AS "bodyEn", m.body_text AS "bodyText",
          m.created_at AS "createdAt"
        FROM notif.trip_chat_messages m
        LEFT JOIN trip.trips t ON t.id = m.trip_id
        ORDER BY m.created_at DESC
        LIMIT 40
      `,
      sql`
        SELECT
          id, trip_code AS "tripCode", transport_type AS "transportType",
          status, pickup_label AS "pickupLabel", dropoff_label AS "dropoffLabel",
          payment_method AS "paymentMethod", estimated_fare_tzs AS "estimatedFareTzs",
          final_fare_tzs AS "finalFareTzs", operator_plate AS "operatorPlate",
          created_at AS "createdAt"
        FROM trip.trips
        WHERE status IN ('PAYMENT_DISPUTED', 'SOS_ACTIVE', 'CANCELLED_BY_OPERATOR')
        ORDER BY updated_at DESC
        LIMIT 25
      `,
    ]);

    return NextResponse.json({
      summary: {
        openTickets: (tickets as Array<{ status: string }>).filter((t) => t.status === "OPEN").length,
        totalTickets: tickets.length,
        recentChatsCount: recentChats.length,
        disputedTripsCount: disputedTrips.length,
      },
      tickets,
      recentChats,
      disputedTrips,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "SUPPORT_INBOX_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}

const replySchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(["IN_REVIEW", "RESOLVED"]).default("RESOLVED"),
  opsReplySw: z.string().trim().min(2).max(400),
  opsReplyEn: z.string().trim().min(2).max(400),
});

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = replySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const d = parsed.data;
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      UPDATE notif.support_tickets
      SET status = ${d.status},
          ops_reply_sw = ${d.opsReplySw},
          ops_reply_en = ${d.opsReplyEn},
          updated_at = NOW()
      WHERE id = ${d.ticketId}::uuid
      RETURNING id, reporter_phone AS "reporterPhone", subject, status
    `) as Array<{ id: string; reporterPhone: string; subject: string; status: string }>;

    const ticket = rows[0];
    if (!ticket) {
      return NextResponse.json({ error: "TICKET_NOT_FOUND" }, { status: 404 });
    }

    if (ticket.reporterPhone) {
      await sql`
        INSERT INTO notif.messages (
          phone, channel, event_subject, locale, title, body, payload, status, provider_ref
        )
        VALUES (
          ${ticket.reporterPhone}, 'WHATSAPP', 'support.ticket_reply', 'sw',
          ${`Go.boda Support: ${ticket.subject}`},
          ${`[SW] ${d.opsReplySw}\n[EN] ${d.opsReplyEn}`},
          ${JSON.stringify({ ticketId: ticket.id, repliedByAdminId: auth.admin.id })}::jsonb,
          'SENT', 'ops-support-reply'
        )
      `;
    }

    return NextResponse.json({ updated: true, ticket });
  } catch (err) {
    return NextResponse.json(
      { error: "SUPPORT_REPLY_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
