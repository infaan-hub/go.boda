import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const sql = getSql();
    const [pendingTrips, activeOffers, availableFleet] = await Promise.all([
      sql`
        SELECT
          id, trip_code AS "tripCode", transport_type AS "transportType",
          operator_title AS "operatorTitle", status,
          pickup_label AS "pickupLabel", pickup_snapped AS "pickupSnapped",
          dropoff_label AS "dropoffLabel", estimated_fare_tzs AS "estimatedFareTzs",
          payment_method AS "paymentMethod", created_at AS "createdAt"
        FROM trip.trips
        WHERE status IN ('SEARCHING', 'OFFERED_TO_OPERATOR', 'NO_OPERATOR_FOUND')
        ORDER BY created_at DESC
        LIMIT 40
      `,
      sql`
        SELECT
          o.id, o.trip_id AS "tripId", t.trip_code AS "tripCode",
          o.operator_id AS "operatorId", p.plate_number AS "operatorPlate",
          o.transport_type AS "transportType", o.search_radius_km AS "searchRadiusKm",
          o.round_number AS "roundNumber", o.match_score AS "matchScore",
          o.distance_meters AS "distanceMeters", o.eta_minutes AS "etaMinutes",
          o.status, o.expires_at AS "expiresAt", o.created_at AS "createdAt"
        FROM dispatch.offers o
        LEFT JOIN trip.trips t ON t.id = o.trip_id
        LEFT JOIN location.operator_positions p ON p.operator_id = o.operator_id
        ORDER BY o.created_at DESC
        LIMIT 50
      `,
      sql`
        SELECT
          operator_id AS "operatorId", transport_type AS "transportType",
          operator_title AS "operatorTitle", plate_number AS "plateNumber",
          home_kituo AS "homeKituo", rating_avg AS "ratingAvg", lat, lng
        FROM location.operator_positions
        WHERE is_online = TRUE AND is_busy = FALSE
        ORDER BY rating_avg DESC
        LIMIT 60
      `,
    ]);

    const trips = pendingTrips as Array<{ status: string }>;
    return NextResponse.json({
      summary: {
        searchingCount: trips.filter((t) => t.status === "SEARCHING").length,
        offeredCount: trips.filter((t) => t.status === "OFFERED_TO_OPERATOR").length,
        noOperatorFoundCount: trips.filter((t) => t.status === "NO_OPERATOR_FOUND").length,
        availableFleetCount: availableFleet.length,
      },
      pendingTrips,
      activeOffers,
      availableFleet,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "DISPATCH_QUEUE_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}

const overrideSchema = z.object({
  tripId: z.string().uuid(),
  operatorId: z.string().uuid(),
  note: z.string().trim().max(200).default("Manual Unguja Ops Dispatch Override"),
});

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = overrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  const d = parsed.data;
  try {
    const sql = getSql();
    const [tripRows, opPosRows, opProfRows] = await Promise.all([
      sql`SELECT id, status, transport_type AS "transportType" FROM trip.trips WHERE id = ${d.tripId}::uuid LIMIT 1`,
      sql`SELECT plate_number AS "plateNumber", transport_type AS "transportType" FROM location.operator_positions WHERE operator_id = ${d.operatorId}::uuid LIMIT 1`,
      sql`SELECT full_name AS "fullName", phone, plate_number AS "plateNumber" FROM operator.profiles WHERE user_id = ${d.operatorId}::uuid LIMIT 1`,
    ]);

    const trip = tripRows[0] as { id: string; status: string; transportType: string } | undefined;
    if (!trip) return NextResponse.json({ error: "TRIP_NOT_FOUND" }, { status: 404 });

    const lockRows = await sql`
      INSERT INTO dispatch.trip_locks (trip_id, assigned_operator_id, offer_id)
      VALUES (${d.tripId}::uuid, ${d.operatorId}::uuid, ${randomUUID()}::uuid)
      ON CONFLICT (trip_id) DO NOTHING
      RETURNING trip_id
    `;
    if (lockRows.length === 0) {
      return NextResponse.json(
        { error: "TRIP_ALREADY_LOCKED", message: "Trip already has an assigned operator." },
        { status: 409 }
      );
    }

    const opProf = opProfRows[0] as { fullName?: string; phone?: string; plateNumber?: string } | undefined;
    const opPos = opPosRows[0] as { plateNumber?: string } | undefined;
    const plate = opProf?.plateNumber ?? opPos?.plateNumber ?? "Z 000 OPS";
    const name = opProf?.fullName ?? "Verified Unguja Operator";

    await Promise.all([
      sql`
        UPDATE trip.trips
        SET status = 'ASSIGNED',
            operator_id = ${d.operatorId}::uuid,
            operator_name = ${name},
            operator_plate = ${plate},
            operator_phone = ${opProf?.phone ?? null},
            assigned_at = NOW(),
            updated_at = NOW()
        WHERE id = ${d.tripId}::uuid
      `,
      sql`
        INSERT INTO trip.state_transitions (trip_id, from_status, to_status, actor_id, actor_role, note)
        VALUES (${d.tripId}::uuid, ${trip.status}, 'ASSIGNED', ${auth.admin.id}::uuid, 'ADMIN', ${d.note})
      `,
      sql`
        UPDATE location.operator_positions
        SET is_busy = TRUE, active_trip_id = ${d.tripId}::uuid, last_seen_at = NOW()
        WHERE operator_id = ${d.operatorId}::uuid
      `,
      sql`
        UPDATE dispatch.offers
        SET status = 'SUPERSEDED', responded_at = NOW()
        WHERE trip_id = ${d.tripId}::uuid AND status = 'PENDING'
      `,
    ]);

    return NextResponse.json({ assigned: true, tripId: d.tripId, operatorPlate: plate });
  } catch (err) {
    return NextResponse.json(
      { error: "MANUAL_OVERRIDE_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
