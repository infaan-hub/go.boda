import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import {
  DEFAULT_TARIFFS_TZS,
  PLATFORM_FINANCE,
} from "@goboda/shared-types";
import { verifyAdminRequest } from "@admin/lib/admin-auth";

export const dynamic = "force-dynamic";

const MAX_SURGE_CAP = 1.25;

const simulateSchema = z.object({
  pickup: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  dropoff: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  multiplier: z.number().min(1).max(3).default(1),
  promoCode: z.string().trim().max(32).optional(),
  override: z
    .object({
      transportType: z.enum(["BODABODA", "BAJAJI"]),
      baseFareTzs: z.number().int().min(500).max(20000).optional(),
      perKmTzs: z.number().int().min(100).max(5000).optional(),
      perMinTzs: z.number().int().min(0).max(1000).optional(),
      minFareTzs: z.number().int().min(500).max(20000).optional(),
      commissionPct: z.number().min(0).max(30).optional(),
    })
    .optional(),
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

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = simulateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);

    // 1. Strict Unguja PostGIS polygon check + Stone Town Smart Snap
    const geoRows = (await sql`
      SELECT
        ST_Contains(
          (SELECT geom FROM geo.zones WHERE id = 'unguja-island'),
          ST_SetSRID(ST_MakePoint(${d.pickup.lng}, ${d.pickup.lat}), 4326)
        ) AS pickup_in_unguja,
        ST_Contains(
          (SELECT geom FROM geo.zones WHERE id = 'unguja-island'),
          ST_SetSRID(ST_MakePoint(${d.dropoff.lng}, ${d.dropoff.lat}), 4326)
        ) AS dropoff_in_unguja,
        ST_Contains(
          (SELECT geom FROM geo.zones WHERE id = 'stone-town-pedestrian'),
          ST_SetSRID(ST_MakePoint(${d.pickup.lng}, ${d.pickup.lat}), 4326)
        ) AS pickup_in_st
    `) as Array<{
      pickup_in_unguja: boolean;
      dropoff_in_unguja: boolean;
      pickup_in_st: boolean;
    }>;

    if (!geoRows[0]?.pickup_in_unguja || !geoRows[0]?.dropoff_in_unguja) {
      return NextResponse.json(
        {
          error: "OUTSIDE_UNGUJA_SERVICE_AREA",
          message:
            "Both pickup and dropoff coordinates must lie inside Unguja Island, Zanzibar.",
        },
        { status: 422 }
      );
    }

    let effLat = d.pickup.lat;
    let effLng = d.pickup.lng;
    let smartSnapped = false;
    let snapGateName: string | null = null;
    let walkMeters = 0;

    if (geoRows[0].pickup_in_st) {
      const snap = (await sql`
        SELECT
          name_en AS "nameEn",
          lat,
          lng,
          ROUND(ST_DistanceSphere(geom, ST_SetSRID(ST_MakePoint(${d.pickup.lng}, ${d.pickup.lat}), 4326)))::int AS "walkMeters"
        FROM geo.snap_points
        WHERE zone_id = 'stone-town-pedestrian'
        ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${d.pickup.lng}, ${d.pickup.lat}), 4326)
        LIMIT 1
      `) as Array<{ nameEn: string; lat: number; lng: number; walkMeters: number }>;
      if (snap[0]) {
        effLat = snap[0].lat;
        effLng = snap[0].lng;
        smartSnapped = true;
        snapGateName = snap[0].nameEn;
        walkMeters = snap[0].walkMeters;
      }
    }

    const straightMeters = Math.max(
      400,
      haversineMeters({ lat: effLat, lng: effLng }, d.dropoff)
    );
    const distanceMeters = Math.round(straightMeters * 1.24);
    const distanceKm = Number((distanceMeters / 1000).toFixed(2));
    const durationMinutes = Math.max(3, Math.round((distanceKm / 24) * 60));

    // 2. Load live Neon tariffs + optional promo
    const [tariffRows, promoRows] = await Promise.all([
      sql`
        SELECT
          transport_type AS "transportType",
          base_fare_tzs AS "baseFareTzs",
          per_km_tzs AS "perKmTzs",
          per_min_tzs AS "perMinTzs",
          min_fare_tzs AS "minFareTzs",
          commission_pct AS "commissionPct",
          max_multiplier AS "maxMultiplier"
        FROM pricing.tariffs
      `,
      d.promoCode && d.promoCode.trim().length > 0
        ? sql`
            SELECT
              code, discount_type AS "discountType",
              discount_value AS "discountValue",
              max_discount_tzs AS "maxDiscountTzs",
              min_fare_tzs AS "minFareTzs", active
            FROM pricing.promo_codes
            WHERE code = ${d.promoCode.trim().toUpperCase()}
            LIMIT 1
          `
        : Promise.resolve([]),
    ]);

    const tariffMap = new Map<
      string,
      {
        baseFareTzs: number;
        perKmTzs: number;
        perMinTzs: number;
        minFareTzs: number;
        commissionPct: number;
        maxMultiplier: number;
      }
    >();
    for (const row of tariffRows as Array<{
      transportType: string;
      baseFareTzs: number;
      perKmTzs: number;
      perMinTzs: number;
      minFareTzs: number;
      commissionPct: number;
      maxMultiplier: number;
    }>) {
      tariffMap.set(row.transportType, row);
    }

    const promo = (
      promoRows as Array<{
        code: string;
        discountType: "PERCENT" | "FLAT_TZS";
        discountValue: number;
        maxDiscountTzs: number;
        minFareTzs: number;
        active: boolean;
      }>
    )[0];

    const multiplierApplied = Number(
      Math.min(MAX_SURGE_CAP, Math.max(1, d.multiplier)).toFixed(2)
    );
    const capEnforced = d.multiplier > MAX_SURGE_CAP;
    const step = PLATFORM_FINANCE.FARE_ROUNDING_STEP_TZS;

    const computeTier = (transportType: "BODABODA" | "BAJAJI") => {
      const fb = DEFAULT_TARIFFS_TZS[transportType];
      const live = tariffMap.get(transportType);
      const ov =
        d.override?.transportType === transportType ? d.override : undefined;

      const baseFareTzs = ov?.baseFareTzs ?? live?.baseFareTzs ?? fb.baseFareTzs;
      const perKmTzs = ov?.perKmTzs ?? live?.perKmTzs ?? fb.perKmTzs;
      const perMinTzs = ov?.perMinTzs ?? live?.perMinTzs ?? fb.perMinTzs;
      const minFareTzs = ov?.minFareTzs ?? live?.minFareTzs ?? fb.minFareTzs;
      const commissionPct =
        ov?.commissionPct ?? live?.commissionPct ?? fb.commissionPct;

      const rawBase = baseFareTzs + distanceKm * perKmTzs + durationMinutes * perMinTzs;
      const surged = rawBase * multiplierApplied;
      const grossFareTzs = Math.max(minFareTzs, Math.round(surged / step) * step);

      let discountTzs = 0;
      let promoApplied: string | null = null;
      if (promo && promo.active && grossFareTzs >= promo.minFareTzs) {
        const rawDisc =
          promo.discountType === "PERCENT"
            ? Math.round((grossFareTzs * promo.discountValue) / 100)
            : promo.discountValue;
        const capped = Math.min(rawDisc, promo.maxDiscountTzs);
        const after = Math.max(500, Math.round((grossFareTzs - capped) / step) * step);
        discountTzs = Math.max(0, grossFareTzs - after);
        if (discountTzs > 0) promoApplied = promo.code;
      }

      const customerPaysTzs = grossFareTzs - discountTzs;
      // Platform absorbs promo subsidy — Operator ALWAYS earns 88% (100 - commissionPct) of grossFareTzs!
      const commissionTzs = Math.round((grossFareTzs * commissionPct) / 100);
      const operatorNetTzs = Math.max(0, grossFareTzs - commissionTzs);
      const platformNetRevenueTzs = commissionTzs - discountTzs;

      return {
        transportType,
        operatorRole: transportType === "BODABODA" ? "Bodaboda Rider" : "Bajaji Driver",
        tariffUsed: {
          baseFareTzs,
          perKmTzs,
          perMinTzs,
          minFareTzs,
          commissionPct,
        },
        grossFareTzs,
        discountTzs,
        promoApplied,
        customerPaysTzs,
        commissionTzs,
        platformSubsidyTzs: discountTzs,
        platformNetRevenueTzs,
        operatorNetTzs,
        operatorGrossProtected: true,
      };
    };

    return NextResponse.json({
      currency: "TZS",
      multiplierRequested: d.multiplier,
      multiplierApplied,
      maxSurgeCap: MAX_SURGE_CAP,
      capEnforced,
      promoStatus: !d.promoCode
        ? "NONE"
        : promo && promo.active
          ? "VALID"
          : "INVALID_OR_PAUSED",
      route: {
        distanceMeters,
        distanceKm,
        durationMinutes,
        smartSnapped,
        snapGateName,
        walkMeters,
      },
      simulation: {
        BODABODA: computeTier("BODABODA"),
        BAJAJI: computeTier("BAJAJI"),
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "PRICING_SIMULATE_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
