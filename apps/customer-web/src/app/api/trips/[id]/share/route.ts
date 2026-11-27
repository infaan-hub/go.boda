import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    locale?: "sw" | "en";
    ttlMinutes?: number;
  };
  const locale = body.locale === "sw" ? "sw" : "en";
  const ttlMinutes = Math.min(240, Math.max(15, Number(body.ttlMinutes ?? 120)));

  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT id, trip_code, customer_id, operator_plate, pickup_label, dropoff_label
      FROM trip.trips
      WHERE id = ${id}::uuid
      LIMIT 1
    `) as Array<{
      id: string;
      trip_code: string;
      customer_id: string;
      operator_plate: string | null;
      pickup_label: string;
      dropoff_label: string;
    }>;

    const trip = rows[0];
    if (!trip) {
      return NextResponse.json({ error: "TRIP_NOT_FOUND" }, { status: 404 });
    }

    const token = randomBytes(12).toString("base64url");
    const expiresAt = new Date(Date.now() + ttlMinutes * 60000).toISOString();

    await sql`
      INSERT INTO safety.share_links (
        trip_id, token, created_by_user_id, created_by_role, expires_at
      )
      VALUES (
        ${trip.id}::uuid, ${token}, ${trip.customer_id}::uuid, 'CUSTOMER', ${expiresAt}::timestamptz
      )
    `;

    const origin = new URL(request.url).origin;
    const sharePath = `/track/${token}`;
    const shareUrl = `${origin}${sharePath}`;
    const platePart = trip.operator_plate ? ` (${trip.operator_plate})` : "";
    const msg =
      locale === "sw"
        ? `Fuatilia safari yangu ya Go.boda (${trip.trip_code}${platePart}) kutoka ${trip.pickup_label} kwenda ${trip.dropoff_label}: ${shareUrl}`
        : `Track my live Go.boda Unguja trip (${trip.trip_code}${platePart}) from ${trip.pickup_label} to ${trip.dropoff_label}: ${shareUrl}`;

    return NextResponse.json(
      {
        shareToken: token,
        sharePath,
        shareUrl,
        whatsappShareUrl: `https://wa.me/?text=${encodeURIComponent(msg)}`,
        expiresAt,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "SHARE_LINK_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
