import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyPartnerRequest } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

const PLATFORM_OWNER_ID = "00000000-0000-4000-8000-000000000000";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ACCEPT_OFFER"),
    offerId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("ARRIVE"),
    tripId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("START"),
    tripId: z.string().uuid(),
    startPin: z.string().trim().regex(/^\d{4}$/),
  }),
  z.object({
    action: z.literal("COMPLETE_CASH"),
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
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);

    if (d.action === "ACCEPT_OFFER") {
      const offerRows = (await sql`
        SELECT id, trip_id AS "tripId", operator_id AS "operatorId", status
        FROM dispatch.offers
        WHERE id = ${d.offerId}::uuid AND operator_id = ${operatorId}::uuid
        LIMIT 1
      `) as Array<{ id: string; tripId: string; operatorId: string; status: string }>;

      const offer = offerRows[0];
      if (!offer || offer.status !== "PENDING") {
        return NextResponse.json({ error: "OFFER_NOT_AVAILABLE" }, { status: 409 });
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

      const opRows = (await sql`
        SELECT full_name AS "fullName", plate_number AS "plateNumber", phone
        FROM operator.profiles
        WHERE user_id = ${operatorId}::uuid
        LIMIT 1
      `) as Array<{ fullName: string; plateNumber: string; phone: string }>;
      const op = opRows[0];

      await Promise.all([
        sql`UPDATE dispatch.offers SET status = 'ACCEPTED', responded_at = NOW() WHERE id = ${offer.id}::uuid`,
        sql`UPDATE dispatch.offers SET status = 'SUPERSEDED', responded_at = NOW() WHERE trip_id = ${offer.tripId}::uuid AND id <> ${offer.id}::uuid AND status = 'PENDING'`,
        sql`
          UPDATE trip.trips
          SET status = 'ASSIGNED',
              operator_id = ${operatorId}::uuid,
              operator_name = ${op?.fullName ?? auth.partner.name},
              operator_plate = ${op?.plateNumber ?? "Z 000 AAA"},
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

      return NextResponse.json({ accepted: true, tripId: offer.tripId });
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
      return NextResponse.json({ arrived: true, trip: updated[0] });
    }

    if (d.action === "START") {
      const rows = (await sql`
        SELECT id, start_pin AS "startPin", status
        FROM trip.trips
        WHERE id = ${d.tripId}::uuid AND operator_id = ${operatorId}::uuid
        LIMIT 1
      `) as Array<{ id: string; startPin: string; status: string }>;
      const trip = rows[0];
      if (!trip || trip.status !== "ARRIVED_AT_PICKUP") {
        return NextResponse.json({ error: "INVALID_STATE_TRANSITION" }, { status: 409 });
      }
      if (trip.startPin !== d.startPin) {
        return NextResponse.json({ error: "INVALID_START_PIN" }, { status: 400 });
      }
      const updated = await sql`
        UPDATE trip.trips
        SET status = 'IN_PROGRESS', pin_verified_at = NOW(), started_at = NOW(), updated_at = NOW()
        WHERE id = ${d.tripId}::uuid
        RETURNING id, status
      `;
      return NextResponse.json({ started: true, trip: updated[0] });
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
    if (!trip || trip.status !== "IN_PROGRESS") {
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
