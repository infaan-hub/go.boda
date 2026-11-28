import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import { verifyCustomerRequest } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

const OFFER_TTL_SECONDS = 30;
const MAX_SEARCH_RADIUS_KM = 100;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  try {
    const sql = getSql(process.env.DATABASE_URL ?? process.env.CUSTOMER_DATABASE_URL);
    const trips = (await sql`
      SELECT id, customer_id AS "customerId", transport_type AS "transportType",
             status, pickup_effective_lat AS "pickupLat",
             pickup_effective_lng AS "pickupLng", pickup_label AS "pickupLabel",
             dropoff_label AS "dropoffLabel", estimated_fare_tzs AS "fareTzs",
             payment_method AS "paymentMethod", created_at AS "createdAt"
      FROM trip.trips
      WHERE id = ${id}::uuid
      LIMIT 1
    `) as Array<{
      id: string;
      customerId: string;
      transportType: "BODABODA" | "BAJAJI";
      status: string;
      pickupLat: number;
      pickupLng: number;
      pickupLabel: string;
      dropoffLabel: string;
      fareTzs: number;
      paymentMethod: string;
      createdAt: string | Date;
    }>;
    const trip = trips[0];
    if (!trip) return NextResponse.json({ error: "TRIP_NOT_FOUND" }, { status: 404 });
    if (trip.customerId !== auth.customer.id) {
      return NextResponse.json({ error: "TRIP_ACCESS_DENIED" }, { status: 403 });
    }
    if (!["SEARCHING", "OFFERED_TO_OPERATOR", "NO_OPERATOR_FOUND"].includes(trip.status)) {
      return NextResponse.json({ assigned: true, status: trip.status });
    }

    await sql`
      UPDATE dispatch.offers
      SET status = 'EXPIRED', responded_at = NOW()
      WHERE trip_id = ${id}::uuid AND status = 'PENDING' AND expires_at <= NOW()
    `;
    const pending = await sql`
      SELECT 1 FROM dispatch.offers
      WHERE trip_id = ${id}::uuid AND status = 'PENDING' AND expires_at > NOW()
      LIMIT 1
    `;
    if (pending.length > 0) {
      return NextResponse.json({ dispatched: 0, waitingForResponses: true });
    }

    const roundRows = (await sql`
      SELECT COALESCE(MAX(round_number), 0)::int AS "lastRound",
             COALESCE(MAX(search_radius_km), 0)::float8 AS "lastRadiusKm"
      FROM dispatch.offers WHERE trip_id = ${id}::uuid
    `) as Array<{ lastRound: number; lastRadiusKm: number }>;
    const roundNumber = Number(roundRows[0]?.lastRound ?? 0) + 1;
    const elapsedSeconds = Math.max(
      0,
      (Date.now() - new Date(trip.createdAt).getTime()) / 1000
    );
    const elapsedRadiusKm = 1.5 * 2 ** Math.floor(elapsedSeconds / 35);
    const lastRadiusKm = Number(roundRows[0]?.lastRadiusKm ?? 0);
    const radiusKm = Math.min(
      MAX_SEARCH_RADIUS_KM,
      Math.max(lastRadiusKm > 0 ? lastRadiusKm * 2 : 1.5, elapsedRadiusKm)
    );
    const candidates = (await sql`
      SELECT p.operator_id AS "operatorId", p.rating_avg AS "ratingAvg",
             p.last_seen_at AS "lastSeenAt",
             ROUND(ST_DistanceSphere(
               p.geom,
               ST_SetSRID(ST_MakePoint(${trip.pickupLng}, ${trip.pickupLat}), 4326)
             ))::int AS "distanceMeters"
      FROM location.operator_positions p
      WHERE p.transport_type = ${trip.transportType}
        AND p.is_online = TRUE
        AND p.is_busy = FALSE
        AND p.is_demo = FALSE
        AND p.last_seen_at > NOW() - INTERVAL '90 seconds'
        AND ST_DWithin(
          p.geom::geography,
          ST_SetSRID(ST_MakePoint(${trip.pickupLng}, ${trip.pickupLat}), 4326)::geography,
          ${radiusKm * 1000}
        )
        AND NOT EXISTS (
          SELECT 1 FROM dispatch.offers prior
          WHERE prior.trip_id = ${id}::uuid
            AND prior.operator_id = p.operator_id
        )
      ORDER BY
        ST_DistanceSphere(
          p.geom,
          ST_SetSRID(ST_MakePoint(${trip.pickupLng}, ${trip.pickupLat}), 4326)
        ) ASC,
        p.last_seen_at DESC,
        p.rating_avg DESC
      LIMIT 5
    `) as Array<{
      operatorId: string;
      ratingAvg: number;
      lastSeenAt: string | Date;
      distanceMeters: number;
    }>;

    if (candidates.length === 0) {
      await sql`
        UPDATE trip.trips SET status = 'NO_OPERATOR_FOUND', updated_at = NOW()
        WHERE id = ${id}::uuid AND status IN ('SEARCHING', 'OFFERED_TO_OPERATOR', 'NO_OPERATOR_FOUND')
      `;
      return NextResponse.json({ dispatched: 0, searching: true, radiusKm });
    }

    const expiresAt = new Date(Date.now() + OFFER_TTL_SECONDS * 1000).toISOString();
    for (const candidate of candidates) {
      const etaMinutes = Math.max(
        1,
        Math.ceil(
          (candidate.distanceMeters * 1.3) /
            (trip.transportType === "BODABODA" ? 360 : 300)
        )
      );
      const gpsAgeSeconds = Math.max(
        0,
        (Date.now() - new Date(candidate.lastSeenAt).getTime()) / 1000
      );
      const matchScore = Math.max(
        0,
        Math.min(
          1,
          1 -
            0.65 * (candidate.distanceMeters / (radiusKm * 1000)) -
            0.2 * (gpsAgeSeconds / 90) +
            0.15 * ((Math.min(5, Number(candidate.ratingAvg) || 0) - 3) / 2)
        )
      );
      await sql`
        INSERT INTO dispatch.offers (
          trip_id, operator_id, transport_type, operator_title,
          search_radius_km, round_number, match_score, distance_meters, eta_minutes,
          pickup_label, dropoff_label, estimated_fare_tzs, payment_method, status, expires_at
        )
        VALUES (
          ${id}::uuid, ${candidate.operatorId}::uuid, ${trip.transportType},
          ${trip.transportType === "BODABODA" ? "RIDER" : "DRIVER"},
          ${radiusKm}, ${roundNumber}, ${matchScore}, ${candidate.distanceMeters},
          ${etaMinutes}, ${trip.pickupLabel}, ${trip.dropoffLabel}, ${trip.fareTzs},
          ${trip.paymentMethod}, 'PENDING', ${expiresAt}::timestamptz
        )
      `;
    }
    await sql`
      UPDATE trip.trips SET status = 'OFFERED_TO_OPERATOR', updated_at = NOW()
      WHERE id = ${id}::uuid AND status IN ('SEARCHING', 'NO_OPERATOR_FOUND', 'OFFERED_TO_OPERATOR')
    `;

    return NextResponse.json({
      dispatched: candidates.length,
      searching: true,
      roundNumber,
      radiusKm,
      offerExpiresAt: expiresAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "TRIP_DISPATCH_FAILED",
        message: error instanceof Error ? error.message : "Database error",
      },
      { status: 500 }
    );
  }
}
