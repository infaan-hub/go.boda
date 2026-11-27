import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      SELECT t.id, t.trip_code AS "tripCode", t.status, t.transport_type AS "transportType",
             t.operator_id AS "operatorId", t.operator_name AS "operatorName",
             t.operator_plate AS "operatorPlate", t.operator_phone AS "operatorPhone",
             t.pickup_effective_lat AS "pickupLat", t.pickup_effective_lng AS "pickupLng",
             t.dropoff_lat AS "dropoffLat", t.dropoff_lng AS "dropoffLng",
             t.estimated_fare_tzs AS "estimatedFareTzs", t.start_pin AS "startPin",
             t.updated_at AS "updatedAt"
      FROM trip.trips t
      WHERE t.id = ${id}::uuid
      LIMIT 1
    ` as Array<Record<string, unknown>>;
    const trip = rows[0];
    if (!trip) return NextResponse.json({ error: "TRIP_NOT_FOUND" }, { status: 404 });

    let operatorLat: number | null = null;
    let operatorLng: number | null = null;
    let operatorHeading: number | null = null;
    if (trip.operatorId) {
      const pos = await sql`
        SELECT lat, lng, heading, updated_at AS "updatedAt"
        FROM location.operator_positions
        WHERE operator_id = ${trip.operatorId}::uuid
        LIMIT 1
      ` as Array<{ lat: number; lng: number; heading: number; updatedAt: string }>;
      if (pos[0]) {
        operatorLat = Number(pos[0].lat);
        operatorLng = Number(pos[0].lng);
        operatorHeading = Number(pos[0].heading);
      }
    }

    // stops
    const stops = await sql`
      SELECT id, stop_order AS "stopOrder", label, lat, lng, is_pickup AS "isPickup", is_dropoff AS "isDropoff"
      FROM trip.trip_stops
      WHERE trip_id = ${id}::uuid
      ORDER BY stop_order ASC
    `;

    return NextResponse.json({
      trip: { ...trip, operatorLat, operatorLng, operatorHeading },
      stops,
    });
  } catch (err) {
    return NextResponse.json({ error: "TRIP_LIVE_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}
