import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import {
  normalizeTzPhone,
  verifyCustomerRequest,
} from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

const createTicketSchema = z.object({
  tripId: z.string().uuid().optional().nullable(),
  tripCode: z.string().trim().max(32).optional().nullable(),
  reporterPhone: z.string().trim().min(7).max(24).optional(),
  category: z
    .enum(["LOST_ITEM", "PAYMENT_DISPUTE", "SAFETY", "GENERAL"])
    .default("LOST_ITEM"),
  subject: z.string().trim().min(3).max(160),
  description: z.string().trim().min(5).max(1000),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const auth = await verifyCustomerRequest(request);
  const phoneParam = searchParams.get("phone")?.trim();
  const phone = auth.ok
    ? auth.customer.phone
    : phoneParam
      ? normalizeTzPhone(phoneParam)
      : null;

  if (!phone) {
    return NextResponse.json({ tickets: [] });
  }

  try {
    const sql = getSql();
    const tickets = await sql`
      SELECT
        id, trip_id AS "tripId", trip_code AS "tripCode",
        category, subject, description, status,
        ops_reply_sw AS "opsReplySw", ops_reply_en AS "opsReplyEn",
        created_at AS "createdAt", updated_at AS "updatedAt"
      FROM notif.support_tickets
      WHERE reporter_phone = ${phone}
      ORDER BY created_at DESC
      LIMIT 25
    `;
    return NextResponse.json({ count: tickets.length, tickets });
  } catch (err) {
    return NextResponse.json(
      {
        error: "SUPPORT_TICKETS_FETCH_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await verifyCustomerRequest(request);
  const body = await request.json().catch(() => null);
  const parsed = createTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const rawPhone = auth.ok ? auth.customer.phone : d.reporterPhone;
  if (!rawPhone) {
    return NextResponse.json(
      {
        error: "PHONE_REQUIRED",
        messageEn: "Please sign in or provide a Zanzibar phone number.",
        messageSw: "Tafadhali ingia au weka namba yako ya simu ya Zanzibar.",
      },
      { status: 400 }
    );
  }
  const phone = normalizeTzPhone(rawPhone);

  try {
    const sql = getSql();
    const rows = (await sql`
      INSERT INTO notif.support_tickets (
        trip_id, trip_code, reporter_role, reporter_phone,
        category, subject, description, status
      )
      VALUES (
        ${d.tripId ?? null}::uuid,
        ${d.tripCode ?? null},
        'CUSTOMER',
        ${phone},
        ${d.category},
        ${d.subject},
        ${d.description},
        'OPEN'
      )
      RETURNING
        id, trip_id AS "tripId", trip_code AS "tripCode",
        reporter_role AS "reporterRole", reporter_phone AS "reporterPhone",
        category, subject, description, status,
        ops_reply_sw AS "opsReplySw", ops_reply_en AS "opsReplyEn",
        created_at AS "createdAt"
    `) as Array<Record<string, unknown>>;

    return NextResponse.json(
      { created: true, ticket: rows[0] },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "SUPPORT_TICKET_CREATE_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
