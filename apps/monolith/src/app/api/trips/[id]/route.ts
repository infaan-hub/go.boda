import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT
        id, trip_code AS "tripCode", customer_id AS "customerId",
        operator_id AS "operatorId", transport_type AS "transportType",
        operator_title AS "operatorTitle", status,
        pickup_label AS "pickupLabel", pickup_snapped AS "pickupSnapped",
        pickup_effective_lat AS "pickupLat", pickup_effective_lng AS "pickupLng",
        dropoff_label AS "dropoffLabel", dropoff_lat AS "dropoffLat", dropoff_lng AS "dropoffLng",
        payment_method AS "paymentMethod", estimated_fare_tzs AS "estimatedFareTzs",
        final_fare_tzs AS "finalFareTzs", commission_tzs AS "commissionTzs",
        operator_net_tzs AS "operatorNetTzs", start_pin AS "startPin",
        operator_name AS "operatorName", operator_plate AS "operatorPlate",
        operator_phone AS "operatorPhone", helmet_provided AS "helmetProvided",
        created_at AS "createdAt", assigned_at AS "assignedAt",
        arrived_at AS "arrivedAt", started_at AS "startedAt", completed_at AS "completedAt"
      FROM trip.trips
      WHERE id = ${id}::uuid
      LIMIT 1
    `) as Array<Record<string, unknown>>;

    const trip = rows[0];
    if (!trip) {
      return NextResponse.json({ error: "TRIP_NOT_FOUND" }, { status: 404 });
    }

    const [posRows, chatRows, sosRows] = await Promise.all([
      trip.operatorId
        ? sql`
            SELECT lat, lng, heading, speed_kmh AS "speedKmh", last_seen_at AS "lastSeenAt"
            FROM location.operator_positions
            WHERE operator_id = ${String(trip.operatorId)}::uuid
            LIMIT 1
          `
        : Promise.resolve([]),
      sql`
        SELECT id, sender_role AS "senderRole", body_sw AS "bodySw", body_en AS "bodyEn",
               body_text AS "bodyText", created_at AS "createdAt"
        FROM notif.trip_chat_messages
        WHERE trip_id = ${id}::uuid
        ORDER BY created_at ASC
        LIMIT 50
      `,
      sql`
        SELECT id, alert_code AS "alertCode", status, created_at AS "createdAt"
        FROM safety.sos_alerts
        WHERE trip_id = ${id}::uuid AND status IN ('OPEN', 'ACKNOWLEDGED')
        ORDER BY created_at DESC
        LIMIT 1
      `,
    ]);

    return NextResponse.json({
      trip,
      liveOperatorPosition: posRows[0] ?? null,
      messages: chatRows,
      activeSos: sosRows[0] ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "TRIP_FETCH_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
