import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    lat?: number;
    lng?: number;
    reason?: string;
  };

  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT id, trip_code, customer_id, operator_id, transport_type,
             operator_plate, pickup_effective_lat, pickup_effective_lng
      FROM trip.trips
      WHERE id = ${id}::uuid
      LIMIT 1
    `) as Array<{
      id: string;
      trip_code: string;
      customer_id: string;
      operator_id: string | null;
      transport_type: "BODABODA" | "BAJAJI";
      operator_plate: string | null;
      pickup_effective_lat: number;
      pickup_effective_lng: number;
    }>;

    const trip = rows[0];
    if (!trip) {
      return NextResponse.json({ error: "TRIP_NOT_FOUND" }, { status: 404 });
    }

    const lat = Number.isFinite(body.lat) ? Number(body.lat) : trip.pickup_effective_lat;
    const lng = Number.isFinite(body.lng) ? Number(body.lng) : trip.pickup_effective_lng;
    const reason = (body.reason ?? "").trim() || "Customer triggered in-trip SOS alert";
    const alertCode = `SOS-${randomInt(10000, 99999)}`;

    const inserted = await sql`
      INSERT INTO safety.sos_alerts (
        alert_code, trip_id, triggered_by_user_id, triggered_by_role,
        transport_type, operator_id, operator_plate, lat, lng, reason, status
      )
      VALUES (
        ${alertCode}, ${trip.id}::uuid, ${trip.customer_id}::uuid, 'CUSTOMER',
        ${trip.transport_type}, ${trip.operator_id}::uuid, ${trip.operator_plate},
        ${lat}, ${lng}, ${reason}, 'OPEN'
      )
      RETURNING id, alert_code AS "alertCode", status, lat, lng, created_at AS "createdAt"
    `;

    await sql`
      UPDATE trip.trips SET status = 'SOS_ACTIVE', updated_at = NOW()
      WHERE id = ${trip.id}::uuid
    `;

    return NextResponse.json(
      {
        created: true,
        alert: inserted[0],
        emergencyHotlines: {
          zanzibarEmergency: "112",
          gobodaOpsDesk: "+255770000112",
        },
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "SOS_CREATE_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
