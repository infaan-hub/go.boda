import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyPartnerRequest } from "../../../../lib/partner-auth";
import { emitPartnerRealtimeEvent } from "../../../../lib/partner-realtime";
import {
  deliverWebPushToCustomer,
  deliverWebPushToUser,
} from "../../../../lib/partner-webpush";

export const dynamic = "force-dynamic";

const PLATFORM_OWNER_ID = "00000000-0000-4000-8000-000000000000";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ACCEPT_OFFER"),
    offerId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("DECLINE_OFFER"),
    offerId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("ARRIVE"),
    tripId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("START"),
    tripId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("COMPLETE_CASH"),
    tripId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("COMPLETE_TRIP"),
    tripId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("GPS_UPDATE"),
    tripId: z.string().uuid(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    heading: z.number().min(0).max(360).default(0),
    speedKmh: z.number().min(0).max(200).default(0),
  }),
  z.object({
    action: z.literal("CONFIRM_DIGITAL"),
    tripId: z.string().uuid(),
  }),
]);

export async function POST(request: Request) {
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const operatorId = auth.partner.id;

  try {
    const sql = getSql(process.env.DATABASE_URL ?? process.env.PARTNER_DATABASE_URL);

    if (d.action === "ACCEPT_OFFER") {
      const [offerRows, opRows] = await Promise.all([
        sql`
          SELECT id, trip_id AS "tripId", operator_id AS "operatorId",
                 transport_type AS "transportType", status
          FROM dispatch.offers
          WHERE id = ${d.offerId}::uuid AND operator_id = ${operatorId}::uuid
          LIMIT 1
        `,
        sql`
          SELECT full_name AS "fullName", plate_number AS "plateNumber", phone,
                 transport_type AS "transportType"
          FROM operator.profiles
          WHERE user_id = ${operatorId}::uuid
          LIMIT 1
        `,
      ]);

      const offer = (offerRows as Array<{
        id: string;
        tripId: string;
        operatorId: string;
        transportType: string;
        status: string;
      }>)[0];
      const op = (opRows as Array<{
        fullName: string;
        plateNumber: string;
        phone: string;
        transportType: string;
      }>)[0];

      if (!offer || offer.status !== "PENDING") {
        return NextResponse.json({ error: "OFFER_NOT_AVAILABLE" }, { status: 409 });
      }

      const assignedTransportType = op?.transportType ?? auth.partner.transportType;
      if (offer.transportType !== assignedTransportType) {
        return NextResponse.json(
          {
            error: "TRANSPORT_CATEGORY_MISMATCH",
            message: "Operators can only accept trip offers matching their assigned vehicle category.",
          },
          { status: 403 }
        );
      }

      // Atomic first-accept-wins lock
      const lockRows = await sql`
        INSERT INTO dispatch.trip_locks (trip_id, assigned_operator_id, offer_id)
        VALUES (${offer.tripId}::uuid, ${operatorId}::uuid, ${offer.id}::uuid)
        ON CONFLICT (trip_id) DO NOTHING
        RETURNING trip_id
      `;
      if (lockRows.length === 0) {
        return NextResponse.json({ error: "TRIP_ALREADY_ASSIGNED" }, { status: 409 });
      }

      await Promise.all([
        sql`UPDATE dispatch.offers SET status = 'ACCEPTED', responded_at = NOW() WHERE id = ${offer.id}::uuid`,
        sql`UPDATE dispatch.offers SET status = 'SUPERSEDED', responded_at = NOW() WHERE trip_id = ${offer.tripId}::uuid AND id <> ${offer.id}::uuid AND status = 'PENDING'`,
        sql`
          UPDATE trip.trips
          SET status = 'ASSIGNED',
              operator_id = ${operatorId}::uuid,
              operator_name = ${op?.fullName ?? auth.partner.name},
              operator_plate = ${op?.plateNumber ?? null},
              operator_phone = ${op?.phone ?? auth.partner.phone},
              assigned_at = NOW(),
              updated_at = NOW()
          WHERE id = ${offer.tripId}::uuid
        `,
        sql`
          UPDATE location.operator_positions
          SET is_busy = TRUE, active_trip_id = ${offer.tripId}::uuid, last_seen_at = NOW()
          WHERE operator_id = ${operatorId}::uuid
        `,
      ]);

      emitPartnerRealtimeEvent({
        operatorId,
        reason: "offer_accepted",
      });

      const customerRows = await sql`
        SELECT customer_id AS "customerId", trip_code AS "tripCode", pickup_label AS "pickupLabel"
        FROM trip.trips WHERE id = ${offer.tripId}::uuid LIMIT 1
      ` as Array<{ customerId: string; tripCode: string; pickupLabel: string }>;
      const customer = customerRows[0];
      if (customer) {
        const title = `Rider confirmed trip ${customer.tripCode}`;
        const body = `${op?.fullName ?? auth.partner.name} is on the way to ${customer.pickupLabel}.`;
        const notifSql = getSql(process.env.NOTIF_DATABASE_URL ?? process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
        await notifSql`
          INSERT INTO notif.messages (user_id, channel, event_subject, locale, title, body, payload, status, provider_ref)
          VALUES (${customer.customerId}::uuid, 'WEB_PUSH', 'trip.operator_confirmed', 'en', ${title}, ${body}, ${JSON.stringify({ tripId: offer.tripId, tripCode: customer.tripCode, operatorName: op?.fullName ?? auth.partner.name, url: `/trips` })}::jsonb, 'SENT', ${`trip-confirmed-${offer.tripId}`})
        `.catch((err) => console.error("Customer trip confirmation notification failed:", err));
        void deliverWebPushToCustomer(customer.customerId, {
          title,
          body,
          url: "/trips",
          eventSubject: "trip.operator_confirmed",
          data: { tripId: offer.tripId, tripCode: customer.tripCode },
        }).catch(() => null);
      }

      return NextResponse.json({ accepted: true, tripId: offer.tripId });
    }

    if (d.action === "DECLINE_OFFER") {
      await sql`
        UPDATE dispatch.offers
        SET status = 'DECLINED', responded_at = NOW()
        WHERE id = ${d.offerId}::uuid
          AND operator_id = ${operatorId}::uuid
          AND status = 'PENDING'
      `;
      emitPartnerRealtimeEvent({
        operatorId,
        reason: "offer_declined",
      });
      return NextResponse.json({ declined: true, offerId: d.offerId });
    }

    if (d.action === "ARRIVE") {
      const updated = await sql`
        UPDATE trip.trips
        SET status = 'ARRIVED_AT_PICKUP', arrived_at = NOW(), updated_at = NOW()
        WHERE id = ${d.tripId}::uuid AND operator_id = ${operatorId}::uuid AND status = 'ASSIGNED'
        RETURNING id, status
      `;
      if (!updated[0]) {
        return NextResponse.json({ error: "INVALID_STATE_TRANSITION" }, { status: 409 });
      }
      emitPartnerRealtimeEvent({ operatorId, reason: "trip_arrived" });
      return NextResponse.json({ arrived: true, trip: updated[0] });
    }

    if (d.action === "GPS_UPDATE") {
      const active = await sql`
        SELECT id, transport_type AS "transportType", status
        FROM trip.trips
        WHERE id = ${d.tripId}::uuid AND operator_id = ${operatorId}::uuid
          AND status IN ('ASSIGNED', 'ARRIVED_AT_PICKUP', 'IN_PROGRESS')
        LIMIT 1
      ` as Array<{ id: string; transportType: "BODABODA" | "BAJAJI"; status: string }>;
      if (!active[0]) return NextResponse.json({ error: "TRIP_NOT_ACTIVE" }, { status: 409 });
      const boundary = await sql`
        SELECT ST_Contains((SELECT geom FROM geo.zones WHERE id = 'unguja-island'), ST_SetSRID(ST_MakePoint(${d.lng}, ${d.lat}), 4326)) AS inside
      ` as Array<{ inside: boolean }>;
      if (!boundary[0]?.inside) return NextResponse.json({ error: "OUTSIDE_UNGUJA_SERVICE_AREA" }, { status: 422 });
      await sql`
        UPDATE location.operator_positions
        SET lat = ${d.lat}, lng = ${d.lng}, heading = ${d.heading}, speed_kmh = ${d.speedKmh},
            geom = ST_SetSRID(ST_MakePoint(${d.lng}, ${d.lat}), 4326),
            active_trip_id = ${d.tripId}::uuid, is_busy = TRUE, last_seen_at = NOW()
        WHERE operator_id = ${operatorId}::uuid
      `;
      if (active[0].status === "IN_PROGRESS") {
        await sql`
          INSERT INTO location.trip_breadcrumbs (trip_id, operator_id, lat, lng, heading, speed_kmh)
          VALUES (${d.tripId}::uuid, ${operatorId}::uuid, ${d.lat}, ${d.lng}, ${d.heading}, ${d.speedKmh})
        `;
      }
      emitPartnerRealtimeEvent({ operatorId, reason: "trip_location_updated" });
      return NextResponse.json({ recorded: true });
    }

    if (d.action === "START") {
      const rows = (await sql`
        SELECT id, status
        FROM trip.trips
        WHERE id = ${d.tripId}::uuid AND operator_id = ${operatorId}::uuid
        LIMIT 1
      `) as Array<{ id: string; status: string }>;
      const trip = rows[0];
      if (!trip || trip.status !== "ARRIVED_AT_PICKUP") {
        return NextResponse.json({ error: "INVALID_STATE_TRANSITION" }, { status: 409 });
      }
      const updated = await sql`
        UPDATE trip.trips
        SET status = 'IN_PROGRESS', started_at = NOW(), updated_at = NOW()
        WHERE id = ${d.tripId}::uuid
        RETURNING id, status
      `;
      emitPartnerRealtimeEvent({ operatorId, reason: "trip_started" });
      return NextResponse.json({ started: true, trip: updated[0] });
    }

    if (d.action === "COMPLETE_TRIP") {
      const distanceRows = await sql`
        SELECT COALESCE(SUM(ST_DistanceSphere(previous_geom, geom)), 0)::int AS meters
        FROM (
          SELECT ST_SetSRID(ST_MakePoint(lng, lat), 4326) AS geom,
                 LAG(ST_SetSRID(ST_MakePoint(lng, lat), 4326)) OVER (ORDER BY recorded_at) AS previous_geom
          FROM location.trip_breadcrumbs
          WHERE trip_id = ${d.tripId}::uuid AND operator_id = ${operatorId}::uuid
        ) route_points
        WHERE previous_geom IS NOT NULL
      ` as Array<{ meters: number }>;
      const trackedDistance = Number(distanceRows[0]?.meters ?? 0);
      const completed = await sql`
        UPDATE trip.trips
        SET status = 'COMPLETED_UNPAID',
            distance_meters = CASE WHEN ${trackedDistance} >= 100 THEN ${trackedDistance} ELSE distance_meters END,
            duration_seconds = GREATEST(1, EXTRACT(EPOCH FROM (NOW() - COALESCE(started_at, NOW())))::int),
            final_fare_tzs = estimated_fare_tzs,
            completed_at = NOW(), updated_at = NOW()
        WHERE id = ${d.tripId}::uuid AND operator_id = ${operatorId}::uuid AND status = 'IN_PROGRESS'
        RETURNING id, estimated_fare_tzs AS "fareTzs", distance_meters AS "distanceMeters", duration_seconds AS "durationSeconds"
      `;
      if (!completed[0]) return NextResponse.json({ error: "INVALID_STATE_TRANSITION" }, { status: 409 });
      emitPartnerRealtimeEvent({ operatorId, reason: "trip_destination_reached" });
      return NextResponse.json({ completed: true, trip: completed[0] });
    }

    if (d.action === "CONFIRM_DIGITAL") {
      const tripRows = await sql`
        SELECT status, payment_method AS "paymentMethod"
        FROM trip.trips
        WHERE id = ${d.tripId}::uuid AND operator_id = ${operatorId}::uuid
        LIMIT 1
      ` as Array<{ status: string; paymentMethod: string }>;
      const trip = tripRows[0];
      if (!trip || !["MOBILE_MONEY", "CARD"].includes(trip.paymentMethod)) {
        return NextResponse.json({ error: "INVALID_PAYMENT_METHOD" }, { status: 409 });
      }
      if (trip.status === "PAID_COMPLETED") return NextResponse.json({ confirmed: true });
      const paymentRows = await sql`
        SELECT id FROM finance.payments
        WHERE trip_id = ${d.tripId}::uuid AND status = 'CONFIRMED'
        ORDER BY confirmed_at DESC NULLS LAST LIMIT 1
      `;
      if (!paymentRows[0]) {
        return NextResponse.json({ error: "PAYMENT_NOT_CONFIRMED", message: "The customer payment has not been confirmed yet." }, { status: 409 });
      }
      const updated = await sql`
        UPDATE trip.trips SET status = 'PAID_COMPLETED', updated_at = NOW()
        WHERE id = ${d.tripId}::uuid AND operator_id = ${operatorId}::uuid AND status = 'COMPLETED_UNPAID'
        RETURNING id
      `;
      if (!updated[0]) return NextResponse.json({ error: "INVALID_STATE_TRANSITION" }, { status: 409 });
      await sql`UPDATE location.operator_positions SET is_busy = FALSE, active_trip_id = NULL, last_seen_at = NOW() WHERE operator_id = ${operatorId}::uuid`;
      emitPartnerRealtimeEvent({ operatorId, reason: "trip_payment_confirmed" });
      return NextResponse.json({ confirmed: true });
    }

    // COMPLETE_CASH: complete trip + record zero-drift double-entry Cash commission journal
    const tripRows = (await sql`
      SELECT id, trip_code AS "tripCode", customer_id AS "customerId",
             estimated_fare_tzs AS "estimatedFareTzs", gross_fare_tzs AS "grossFareTzs",
             discount_tzs AS "discountTzs", commission_tzs AS "commissionTzs",
             operator_net_tzs AS "operatorNetTzs", status
      FROM trip.trips
      WHERE id = ${d.tripId}::uuid AND operator_id = ${operatorId}::uuid
      LIMIT 1
    `) as Array<{
      id: string;
      tripCode: string;
      customerId: string;
      estimatedFareTzs: number;
      grossFareTzs: number;
      discountTzs: number;
      commissionTzs: number;
      operatorNetTzs: number;
      status: string;
    }>;

    const trip = tripRows[0];
    if (!trip || (trip.status !== "IN_PROGRESS" && trip.status !== "COMPLETED_UNPAID")) {
      return NextResponse.json({ error: "INVALID_STATE_TRANSITION" }, { status: 409 });
    }

    await sql`
      UPDATE trip.trips
      SET status = 'PAID_COMPLETED',
          final_fare_tzs = ${trip.estimatedFareTzs},
          completed_at = NOW(),
          updated_at = NOW()
      WHERE id = ${trip.id}::uuid
    `;

    await sql`
      UPDATE location.operator_positions
      SET is_busy = FALSE, active_trip_id = NULL, last_seen_at = NOW()
      WHERE operator_id = ${operatorId}::uuid
    `;

    // Balanced double-entry journal: Operator COMMISSION_FLOAT (-commissionTzs) <-> PLATFORM_COMMISSION (+commissionTzs)
    const idemKey = `cash-${trip.id}`;
    const existingPay = await sql`
      SELECT id FROM finance.payments WHERE idempotency_key = ${idemKey} LIMIT 1
    `;
    if (existingPay.length === 0 && trip.commissionTzs > 0) {
      await sql`
        INSERT INTO finance.wallet_accounts (owner_id, account_type, currency, balance_tzs)
        VALUES
          (${operatorId}::uuid, 'COMMISSION_FLOAT', 'TZS', 0),
          (${PLATFORM_OWNER_ID}::uuid, 'PLATFORM_COMMISSION', 'TZS', 0)
        ON CONFLICT (owner_id, account_type) DO NOTHING
      `;

      const [opFloatRows, platCommRows] = await Promise.all([
        sql`
          UPDATE finance.wallet_accounts
          SET balance_tzs = balance_tzs - ${trip.commissionTzs},
              is_float_blocked = (balance_tzs - ${trip.commissionTzs}) < -5000,
              updated_at = NOW()
          WHERE owner_id = ${operatorId}::uuid AND account_type = 'COMMISSION_FLOAT'
          RETURNING id, balance_tzs::bigint AS "balanceTzs", is_float_blocked AS "isFloatBlocked"
        `,
        sql`
          UPDATE finance.wallet_accounts
          SET balance_tzs = balance_tzs + ${trip.commissionTzs},
              updated_at = NOW()
          WHERE owner_id = ${PLATFORM_OWNER_ID}::uuid AND account_type = 'PLATFORM_COMMISSION'
          RETURNING id, balance_tzs::bigint AS "balanceTzs"
        `,
      ]);

      const opFloat = opFloatRows[0] as { id: string; balanceTzs: string; isFloatBlocked: boolean };
      const platComm = platCommRows[0] as { id: string; balanceTzs: string };
      const journalId = randomUUID();

      await sql`
        INSERT INTO finance.ledger_entries (
          journal_id, idempotency_key, account_id, owner_id, account_type,
          delta_tzs, balance_after_tzs, entry_type, trip_id, reference
        )
        VALUES
          (
            ${journalId}::uuid, ${idemKey}, ${opFloat.id}::uuid, ${operatorId}::uuid,
            'COMMISSION_FLOAT', ${-trip.commissionTzs}, ${Number(opFloat.balanceTzs)},
            'CASH_COMMISSION_DEBIT', ${trip.id}::uuid, ${trip.tripCode}
          ),
          (
            ${journalId}::uuid, ${idemKey}, ${platComm.id}::uuid, ${PLATFORM_OWNER_ID}::uuid,
            'PLATFORM_COMMISSION', ${trip.commissionTzs}, ${Number(platComm.balanceTzs)},
            'PLATFORM_COMMISSION_CREDIT', ${trip.id}::uuid, ${trip.tripCode}
          )
      `;

      await sql`
        INSERT INTO finance.payments (
          idempotency_key, trip_id, customer_id, operator_id, payment_method, provider,
          gross_fare_tzs, discount_tzs, customer_paid_tzs, commission_tzs,
          operator_net_tzs, float_offset_tzs, status, confirmed_at
        )
        VALUES (
          ${idemKey}, ${trip.id}::uuid, ${trip.customerId}::uuid, ${operatorId}::uuid,
          'CASH', 'CASH_TZS', ${trip.grossFareTzs}, ${trip.discountTzs},
          ${trip.estimatedFareTzs}, ${trip.commissionTzs}, ${trip.operatorNetTzs},
          0, 'CONFIRMED', NOW()
        )
      `;
    }

    const titleEn = `Trip ${trip.tripCode} Completed`;
    const bodyEn = `Net earnings +TZS ${Number(trip.operatorNetTzs).toLocaleString()} recorded.`;
    const titleSw = `Safari ${trip.tripCode} Imekamilika`;
    const bodySw = `Mapato halisi +TZS ${Number(trip.operatorNetTzs).toLocaleString()} yamerekodiwa.`;

    await sql`
      INSERT INTO notif.messages (
        user_id, phone, channel, event_subject, locale, title, body, payload, status, provider_ref
      )
      VALUES (
        ${operatorId}::uuid,
        ${auth.partner.phone},
        'WEB_PUSH',
        'trip.completed',
        'en',
        ${titleEn},
        ${bodyEn},
        ${JSON.stringify({
          titleSw,
          bodySw,
          titleEn,
          bodyEn,
          tripId: trip.id,
          tripCode: trip.tripCode,
          operatorNetTzs: trip.operatorNetTzs,
          url: "/partner/tripshistory/",
        })}::jsonb,
        'SENT',
        'trip-completed'
      )
    `.catch(() => null);

    emitPartnerRealtimeEvent({
      operatorId,
      reason: "trip_completed",
    });

    void deliverWebPushToUser(operatorId, {
      title: titleEn,
      body: bodyEn,
      url: "/partner/tripshistory/",
      eventSubject: "trip.completed",
    }).catch(() => null);

    return NextResponse.json({
      completed: true,
      tripId: trip.id,
      finalFareTzs: trip.estimatedFareTzs,
      commissionTzs: trip.commissionTzs,
      operatorNetTzs: trip.operatorNetTzs,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "TRIP_ACTION_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
