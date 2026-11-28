import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import {
  DEFAULT_TARIFFS_TZS,
  PLATFORM_FINANCE,
  getOperatorTitle,
  paymentMethodSchema,
  transportTypeSchema,
} from "@goboda/shared-types";
import { verifyCustomerRequest } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

const createTripSchema = z.object({
  transportType: transportTypeSchema,
  pickup: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  pickupLabel: z.string().trim().min(2).max(160),
  pickupNote: z.string().trim().max(200).default(""),
  dropoff: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  dropoffLabel: z.string().trim().min(2).max(160),
  paymentMethod: paymentMethodSchema.default("CASH"),
  promoCode: z.string().trim().max(32).optional(),
});

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)));
}

async function estimateRoadRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  const straightMeters = Math.max(400, haversineMeters(from, to));
  try {
    const osrmBase = process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org";
    const response = await fetch(
      `${osrmBase}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`,
      { cache: "no-store", signal: AbortSignal.timeout(2500) }
    );
    if (response.ok) {
      const data = (await response.json()) as {
        routes?: Array<{ distance: number; duration: number }>;
      };
      const route = data.routes?.[0];
      if (route && route.distance > 0 && route.duration > 0) {
        return {
          distanceMeters: Math.round(route.distance),
          durationSeconds: Math.max(180, Math.round(route.duration)),
        };
      }
    }
  } catch {
    // The local estimate below keeps trip creation available when routing is down.
  }

  const distanceMeters = Math.round(straightMeters * 1.24);
  return {
    distanceMeters,
    durationSeconds: Math.max(
      180,
      Math.round((distanceMeters / 1000 / 24) * 3600)
    ),
  };
}

export async function GET(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  const customerId = auth.customer.id;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = customerId
      ? await sql`
          SELECT
            id, trip_code AS "tripCode", transport_type AS "transportType",
            operator_title AS "operatorTitle", status,
            pickup_lat AS "pickupLat", pickup_lng AS "pickupLng",
            pickup_label AS "pickupLabel", pickup_snapped AS "pickupSnapped",
            pickup_snap_gate_name AS "pickupSnapGateName",
            dropoff_lat AS "dropoffLat", dropoff_lng AS "dropoffLng",
            dropoff_label AS "dropoffLabel",
            distance_meters AS "distanceMeters", duration_seconds AS "durationSeconds",
            payment_method AS "paymentMethod", promo_code AS "promoCode",
            gross_fare_tzs AS "grossFareTzs", discount_tzs AS "discountTzs",
            estimated_fare_tzs AS "estimatedFareTzs", final_fare_tzs AS "finalFareTzs",
            operator_name AS "operatorName", operator_plate AS "operatorPlate",
            completed_at AS "completedAt",
            created_at AS "createdAt"
          FROM trip.trips
          WHERE customer_id = ${customerId}::uuid
          ORDER BY created_at DESC
          LIMIT 30
        `
      : await sql`
          SELECT
            id, trip_code AS "tripCode", transport_type AS "transportType",
            operator_title AS "operatorTitle", status,
            pickup_lat AS "pickupLat", pickup_lng AS "pickupLng",
            pickup_label AS "pickupLabel", pickup_snapped AS "pickupSnapped",
            pickup_snap_gate_name AS "pickupSnapGateName",
            dropoff_lat AS "dropoffLat", dropoff_lng AS "dropoffLng",
            dropoff_label AS "dropoffLabel",
            distance_meters AS "distanceMeters", duration_seconds AS "durationSeconds",
            payment_method AS "paymentMethod", promo_code AS "promoCode",
            gross_fare_tzs AS "grossFareTzs", discount_tzs AS "discountTzs",
            estimated_fare_tzs AS "estimatedFareTzs", final_fare_tzs AS "finalFareTzs",
            operator_name AS "operatorName", operator_plate AS "operatorPlate",
            completed_at AS "completedAt", created_at AS "createdAt"
          FROM trip.trips
          ORDER BY created_at DESC
          LIMIT 15
        `;
    return NextResponse.json({ count: rows.length, trips: rows });
  } catch (err) {
    return NextResponse.json(
      { error: "TRIPS_FETCH_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const parsed = createTripSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);

    // 1. Keep the exact selected pickup and validate both points against Unguja.
    const geoCheck = (await sql`
      SELECT
        ST_Contains((SELECT geom FROM geo.zones WHERE id = 'unguja-island'),
          ST_SetSRID(ST_MakePoint(${d.pickup.lng}, ${d.pickup.lat}), 4326)) AS pickup_in_unguja,
        ST_Contains((SELECT geom FROM geo.zones WHERE id = 'unguja-island'),
          ST_SetSRID(ST_MakePoint(${d.dropoff.lng}, ${d.dropoff.lat}), 4326)) AS dropoff_in_unguja
    `) as Array<{
      pickup_in_unguja: boolean;
      dropoff_in_unguja: boolean;
    }>;

    if (!geoCheck[0]?.pickup_in_unguja || !geoCheck[0]?.dropoff_in_unguja) {
      return NextResponse.json(
        {
          error: "OUTSIDE_UNGUJA_SERVICE_AREA",
          messageEn: "Both pickup and dropoff must be inside Unguja Island, Zanzibar.",
          messageSw: "Mahali pa kuchukuliwa na kushushwa lazima pawe ndani ya Kisiwa cha Unguja, Zanzibar.",
        },
        { status: 422 }
      );
    }

    const effLat = d.pickup.lat;
    const effLng = d.pickup.lng;
    const pickupSnapped = false;
    const snapGateName: string | null = null;
    const walkMeters = 0;

    const { distanceMeters, durationSeconds } = await estimateRoadRoute(
      { lat: effLat, lng: effLng },
      d.dropoff
    );

    // 2. Live Upfront TZS Tariff + Optional Promo
    const tariffRows = (await sql`
      SELECT base_fare_tzs, per_km_tzs, per_min_tzs, min_fare_tzs,
             commission_pct, active_multiplier, max_multiplier
      FROM pricing.tariffs
      WHERE transport_type = ${d.transportType}
      LIMIT 1
    `) as Array<{
      base_fare_tzs: number;
      per_km_tzs: number;
      per_min_tzs: number;
      min_fare_tzs: number;
      commission_pct: number;
      active_multiplier: number;
      max_multiplier: number;
    }>;

    const fallback = DEFAULT_TARIFFS_TZS[d.transportType];
    const tr = tariffRows[0];
    const base = tr?.base_fare_tzs ?? fallback.baseFareTzs;
    const perKm = tr?.per_km_tzs ?? fallback.perKmTzs;
    const perMin = tr?.per_min_tzs ?? fallback.perMinTzs;
    const minFare = tr?.min_fare_tzs ?? fallback.minFareTzs;
    const commissionPct = tr?.commission_pct ?? fallback.commissionPct;
    const mult = Math.min(
      tr?.max_multiplier ?? fallback.maxMultiplier,
      Math.max(1, tr?.active_multiplier ?? 1)
    );
    const step = PLATFORM_FINANCE.FARE_ROUNDING_STEP_TZS;
    const rawFare =
      (base + (distanceMeters / 1000) * perKm + (durationSeconds / 60) * perMin) *
      mult;
    const grossFareTzs = Math.max(minFare, Math.round(rawFare / step) * step);

    let discountTzs = 0;
    let appliedPromo: string | null = null;
    if (d.promoCode && d.promoCode.trim().length > 0) {
      const code = d.promoCode.trim().toUpperCase();
      const promoRows = (await sql`
        SELECT code, discount_type, discount_value, max_discount_tzs, min_fare_tzs
        FROM pricing.promo_codes
        WHERE code = ${code} AND active = TRUE
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
      `) as Array<{
        code: string;
        discount_type: "PERCENT" | "FLAT_TZS";
        discount_value: number;
        max_discount_tzs: number;
        min_fare_tzs: number;
      }>;
      const p = promoRows[0];
      if (p && grossFareTzs >= p.min_fare_tzs) {
        const rawDisc =
          p.discount_type === "PERCENT"
            ? Math.round((grossFareTzs * p.discount_value) / 100)
            : p.discount_value;
        const capped = Math.min(rawDisc, p.max_discount_tzs);
        const after = Math.max(500, Math.round((grossFareTzs - capped) / step) * step);
        discountTzs = Math.max(0, grossFareTzs - after);
        if (discountTzs > 0) appliedPromo = p.code;
      }
    }

    const estimatedFareTzs = grossFareTzs - discountTzs;
    const commissionTzs = Math.round((grossFareTzs * commissionPct) / 100);
    const operatorNetTzs = Math.max(0, grossFareTzs - commissionTzs);
    const tripCode = `GB-${randomInt(100000, 999999)}`;
    const startPin = String(randomInt(1000, 9999));
    const customerId = auth.customer.id;
    const operatorTitle = getOperatorTitle(d.transportType);

    // 3. Persist real Trip in trip.trips
    const inserted = (await sql`
      INSERT INTO trip.trips (
        trip_code, customer_id, transport_type, operator_title, status,
        pickup_lat, pickup_lng, pickup_label, pickup_snapped,
        pickup_effective_lat, pickup_effective_lng, pickup_snap_gate_name,
        pickup_walk_meters, pickup_note,
        dropoff_lat, dropoff_lng, dropoff_label,
        distance_meters, duration_seconds,
        payment_method, promo_code, gross_fare_tzs, discount_tzs,
        estimated_fare_tzs, commission_pct, commission_tzs, operator_net_tzs,
        start_pin
      )
      VALUES (
        ${tripCode}, ${customerId}::uuid, ${d.transportType}, ${operatorTitle}, 'SEARCHING',
        ${d.pickup.lat}, ${d.pickup.lng}, ${d.pickupLabel}, ${pickupSnapped},
        ${effLat}, ${effLng}, ${snapGateName}, ${walkMeters}, ${d.pickupNote},
        ${d.dropoff.lat}, ${d.dropoff.lng}, ${d.dropoffLabel},
        ${distanceMeters}, ${durationSeconds},
        ${d.paymentMethod}, ${appliedPromo}, ${grossFareTzs}, ${discountTzs},
        ${estimatedFareTzs}, ${commissionPct}, ${commissionTzs}, ${operatorNetTzs},
        ${startPin}
      )
      RETURNING
        id, trip_code AS "tripCode", customer_id AS "customerId",
        transport_type AS "transportType", operator_title AS "operatorTitle",
        status, distance_meters AS "distanceMeters",
        pickup_label AS "pickupLabel", pickup_snapped AS "pickupSnapped",
        pickup_snap_gate_name AS "pickupSnapGateName", pickup_walk_meters AS "pickupWalkMeters",
        dropoff_label AS "dropoffLabel", payment_method AS "paymentMethod",
        promo_code AS "promoCode", gross_fare_tzs AS "grossFareTzs",
        discount_tzs AS "discountTzs", estimated_fare_tzs AS "estimatedFareTzs",
        commission_tzs AS "commissionTzs", operator_net_tzs AS "operatorNetTzs",
        created_at AS "createdAt"
    `) as Array<Record<string, unknown>>;

    const trip = inserted[0]!;
    const tripId = String(trip.id);

    // 4. Fan out live dispatch offers to up to 5 nearby online Riders/Drivers
    const candidates = (await sql`
      SELECT
        operator_id AS "operatorId",
        rating_avg AS "ratingAvg",
        last_seen_at AS "lastSeenAt",
        ROUND(ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(${effLng}, ${effLat}), 4326)))::int AS "distanceMeters"
      FROM location.operator_positions
      WHERE transport_type = ${d.transportType}
        AND is_online = TRUE
        AND is_busy = FALSE
        AND is_demo = FALSE
        AND last_seen_at > NOW() - INTERVAL '90 seconds'
        AND ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint(${effLng}, ${effLat}), 4326)::geography,
          1500
        )
      ORDER BY
        ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(${effLng}, ${effLat}), 4326)) ASC,
        last_seen_at DESC,
        rating_avg DESC
      LIMIT 5
    `) as Array<{
      operatorId: string;
      ratingAvg: number;
      lastSeenAt: string | Date;
      distanceMeters: number;
    }>;

    const expiresAt = new Date(Date.now() + 30 * 1000).toISOString();
    for (const c of candidates) {
      const eta = Math.max(
        1,
        Math.ceil(
          (c.distanceMeters * 1.3) /
            (d.transportType === "BODABODA" ? 360 : 300)
        )
      );
      const gpsAgeSeconds = Math.max(
        0,
        (Date.now() - new Date(c.lastSeenAt).getTime()) / 1000
      );
      const matchScore = Math.max(
        0,
        Math.min(
          1,
          1 -
            0.65 * (c.distanceMeters / 1500) -
            0.2 * (gpsAgeSeconds / 90) +
            0.15 * ((Math.min(5, Number(c.ratingAvg) || 0) - 3) / 2)
        )
      );
      await sql`
        INSERT INTO dispatch.offers (
          trip_id, operator_id, transport_type, operator_title,
          search_radius_km, round_number, match_score, distance_meters, eta_minutes,
          pickup_label, dropoff_label, estimated_fare_tzs, payment_method, status, expires_at
        )
        VALUES (
          ${tripId}::uuid, ${c.operatorId}::uuid, ${d.transportType}, ${operatorTitle},
          1.5, 1, ${matchScore}, ${c.distanceMeters}, ${eta},
          ${d.pickupLabel}, ${d.dropoffLabel}, ${estimatedFareTzs}, ${d.paymentMethod},
          'PENDING', ${expiresAt}::timestamptz
        )
      `;
    }

    if (candidates.length > 0) {
      await sql`
        UPDATE trip.trips SET status = 'OFFERED_TO_OPERATOR', updated_at = NOW()
        WHERE id = ${tripId}::uuid
      `;
      trip.status = "OFFERED_TO_OPERATOR";
    }

    return NextResponse.json(
      {
        created: true,
        trip,
        offersDispatched: candidates.length,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "TRIP_CREATE_FAILED", message: err instanceof Error ? err.message : "Database error" },
      { status: 500 }
    );
  }
}
