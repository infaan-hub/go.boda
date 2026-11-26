import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  try {
    const sql = getSql();
    const tripRows = (await sql`
      SELECT
        id, trip_code AS "tripCode", customer_id AS "customerId",
        operator_id AS "operatorId", transport_type AS "transportType",
        operator_title AS "operatorTitle", status,
        pickup_lat AS "pickupLat", pickup_lng AS "pickupLng",
        pickup_label AS "pickupLabel", pickup_snapped AS "pickupSnapped",
        pickup_effective_lat AS "pickupEffectiveLat", pickup_effective_lng AS "pickupEffectiveLng",
        pickup_snap_gate_name AS "pickupSnapGateName", pickup_walk_meters AS "pickupWalkMeters",
        pickup_note AS "pickupNote",
        dropoff_lat AS "dropoffLat", dropoff_lng AS "dropoffLng", dropoff_label AS "dropoffLabel",
        distance_meters AS "distanceMeters", duration_seconds AS "durationSeconds",
        payment_method AS "paymentMethod", promo_code AS "promoCode",
        gross_fare_tzs AS "grossFareTzs", discount_tzs AS "discountTzs",
        estimated_fare_tzs AS "estimatedFareTzs", wait_fee_tzs AS "waitFeeTzs",
        cancel_fee_tzs AS "cancelFeeTzs", final_fare_tzs AS "finalFareTzs",
        commission_pct AS "commissionPct", commission_tzs AS "commissionTzs",
        operator_net_tzs AS "operatorNetTzs", start_pin AS "startPin",
        pin_verified_at AS "pinVerifiedAt", operator_name AS "operatorName",
        operator_plate AS "operatorPlate", operator_phone AS "operatorPhone",
        helmet_provided AS "helmetProvided", cancel_reason AS "cancelReason",
        created_at AS "createdAt", assigned_at AS "assignedAt",
        arrived_at AS "arrivedAt", started_at AS "startedAt",
        completed_at AS "completedAt", cancelled_at AS "cancelledAt"
      FROM trip.trips
      WHERE id = ${id}::uuid
      LIMIT 1
    `) as Array<Record<string, unknown>>;

    const trip = tripRows[0];
    if (!trip) {
      return NextResponse.json({ error: "TRIP_NOT_FOUND" }, { status: 404 });
    }

    const [transitions, breadcrumbs, chatMessages, sosAlerts, payments, ratings] =
      await Promise.all([
        sql`
          SELECT id, from_status AS "fromStatus", to_status AS "toStatus",
                 actor_role AS "actorRole", note, created_at AS "createdAt"
          FROM trip.state_transitions
          WHERE trip_id = ${id}::uuid
          ORDER BY created_at ASC
        `,
        sql`
          SELECT id, lat, lng, heading, speed_kmh AS "speedKmh", recorded_at AS "recordedAt"
          FROM location.trip_breadcrumbs
          WHERE trip_id = ${id}::uuid
          ORDER BY recorded_at ASC
          LIMIT 200
        `,
        sql`
          SELECT id, sender_role AS "senderRole", preset_key AS "presetKey",
                 body_sw AS "bodySw", body_en AS "bodyEn", body_text AS "bodyText",
                 created_at AS "createdAt"
          FROM notif.trip_chat_messages
          WHERE trip_id = ${id}::uuid
          ORDER BY created_at ASC
        `,
        sql`
          SELECT id, alert_code AS "alertCode", status, reason, resolution_note AS "resolutionNote",
                 lat, lng, created_at AS "createdAt", resolved_at AS "resolvedAt"
          FROM safety.sos_alerts
          WHERE trip_id = ${id}::uuid
          ORDER BY created_at DESC
        `,
        sql`
          SELECT id, payment_method AS "paymentMethod", provider,
                 gross_fare_tzs AS "grossFareTzs", discount_tzs AS "discountTzs",
                 customer_paid_tzs AS "customerPaidTzs", commission_tzs AS "commissionTzs",
                 operator_net_tzs AS "operatorNetTzs", float_offset_tzs AS "floatOffsetTzs",
                 status, confirmed_at AS "confirmedAt"
          FROM finance.payments
          WHERE trip_id = ${id}::uuid
        `,
        sql`
          SELECT id, rater_role AS "raterRole", stars, helmet_provided AS "helmetProvided",
                 comment, created_at AS "createdAt"
          FROM trip.ratings
          WHERE trip_id = ${id}::uuid
        `,
      ]);

    return NextResponse.json({
      trip,
      transitions,
      breadcrumbs,
      chatMessages,
      sosAlerts,
      payments,
      ratings,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "TRIP_FORENSICS_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}

const adjustSchema = z.object({
  adjustedFareTzs: z.number().int().min(500).max(200000),
  resolutionStatus: z.enum(["PAID_COMPLETED", "PAYMENT_DISPUTED"]).optional(),
  note: z.string().trim().min(3).max(300),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = adjustSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  try {
    const sql = getSql();
    const existing = (await sql`
      SELECT id, status, final_fare_tzs AS "finalFareTzs", estimated_fare_tzs AS "estimatedFareTzs"
      FROM trip.trips WHERE id = ${id}::uuid LIMIT 1
    `) as Array<{ id: string; status: string; finalFareTzs: number | null; estimatedFareTzs: number }>;

    const trip = existing[0];
    if (!trip) return NextResponse.json({ error: "TRIP_NOT_FOUND" }, { status: 404 });

    const nextStatus = d.resolutionStatus ?? trip.status;
    await sql`
      UPDATE trip.trips
      SET final_fare_tzs = ${d.adjustedFareTzs},
          status = ${nextStatus},
          updated_at = NOW()
      WHERE id = ${id}::uuid
    `;

    await sql`
      INSERT INTO trip.state_transitions (trip_id, from_status, to_status, actor_id, actor_role, note)
      VALUES (
        ${id}::uuid,
        ${trip.status},
        ${nextStatus},
        ${auth.admin.id}::uuid,
        'ADMIN',
        ${`Dispute fare adjustment: TZS ${trip.finalFareTzs ?? trip.estimatedFareTzs} -> TZS ${d.adjustedFareTzs}. ${d.note}`}
      )
    `;

    return NextResponse.json({
      adjusted: true,
      tripId: id,
      adjustedFareTzs: d.adjustedFareTzs,
      status: nextStatus,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "TRIP_ADJUST_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
