import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import {
  DEFAULT_TARIFFS_TZS,
  PLATFORM_FINANCE,
  type Coordinates,
} from "@goboda/shared-types";

export const dynamic = "force-dynamic";

function haversineMeters(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

async function resolvePointPostgis(point: Coordinates) {
  const sql = getSql();
  const checkRows = await sql`
    SELECT
      ST_Contains(
        (SELECT geom FROM geo.zones WHERE id = 'unguja-island'),
        ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)
      ) AS in_unguja,
      ST_Contains(
        (SELECT geom FROM geo.zones WHERE id = 'stone-town-pedestrian'),
        ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)
      ) AS in_stone_town
  `;
  const row = checkRows[0] as { in_unguja?: boolean; in_stone_town?: boolean } | undefined;
  const inUnguja = Boolean(row?.in_unguja);
  const inStoneTownPedestrian = Boolean(row?.in_stone_town);

  if (!inUnguja || !inStoneTownPedestrian) {
    return {
      inUnguja,
      inStoneTownPedestrian,
      snapped: false,
      original: point,
      effective: point,
      snapGate: null,
    };
  }

  const snapRows = await sql`
    SELECT
      id,
      name_sw AS "nameSw",
      name_en AS "nameEn",
      lat,
      lng,
      ROUND(
        ST_DistanceSphere(
          geom,
          ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)
        )
      )::int AS "walkingDistanceMeters"
    FROM geo.snap_points
    WHERE zone_id = 'stone-town-pedestrian'
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)
    LIMIT 1
  `;

  const gate = snapRows[0] as
    | {
        id: string;
        nameSw: string;
        nameEn: string;
        lat: number;
        lng: number;
        walkingDistanceMeters: number;
      }
    | undefined;

  if (!gate) {
    return {
      inUnguja: true,
      inStoneTownPedestrian: true,
      snapped: false,
      original: point,
      effective: point,
      snapGate: null,
    };
  }

  return {
    inUnguja: true,
    inStoneTownPedestrian: true,
    snapped: true,
    original: point,
    effective: { lat: gate.lat, lng: gate.lng },
    snapGate: {
      id: gate.id,
      nameSw: gate.nameSw,
      nameEn: gate.nameEn,
      walkingDistanceMeters: gate.walkingDistanceMeters,
      walkingMinutes: Math.max(1, Math.ceil(gate.walkingDistanceMeters / 80)),
    },
  };
}

async function computeRouteOsrm(from: Coordinates, to: Coordinates) {
  const osrmBase = process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org";
  try {
    const res = await fetch(
      `${osrmBase}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`,
      { cache: "no-store", signal: AbortSignal.timeout(3000) }
    );
    if (res.ok) {
      const json = (await res.json()) as {
        routes?: Array<{ distance: number; duration: number; geometry?: unknown }>;
      };
      const first = json.routes?.[0];
      if (first && first.distance > 0) {
        return {
          distanceMeters: Math.round(first.distance),
          durationSeconds: Math.round(first.duration),
          source: "osrm" as const,
          geometry: first.geometry ?? null,
        };
      }
    }
  } catch {
    // Fallback cleanly to Haversine road-factor estimate
  }

  const roadMeters = Math.max(200, Math.round(haversineMeters(from, to) * 1.35));
  return {
    distanceMeters: roadMeters,
    durationSeconds: Math.max(60, Math.round(roadMeters / 7.5)),
    source: "haversine-fallback" as const,
    geometry: {
      type: "LineString",
      coordinates: [
        [from.lng, from.lat],
        [to.lng, to.lat],
      ],
    },
  };
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    pickup?: Coordinates;
    dropoff?: Coordinates;
    promoCode?: string;
  } | null;

  if (
    !body?.pickup ||
    !body?.dropoff ||
    !Number.isFinite(body.pickup.lat) ||
    !Number.isFinite(body.pickup.lng) ||
    !Number.isFinite(body.dropoff.lat) ||
    !Number.isFinite(body.dropoff.lng)
  ) {
    return NextResponse.json({ error: "INVALID_COORDINATES" }, { status: 400 });
  }

  try {
    const [pickup, dropoff] = await Promise.all([
      resolvePointPostgis(body.pickup),
      resolvePointPostgis(body.dropoff),
    ]);

    if (!pickup.inUnguja || !dropoff.inUnguja) {
      return NextResponse.json(
        {
          error: "OUTSIDE_UNGUJA_SERVICE_AREA",
          messageEn:
            "Both pickup and dropoff must be inside Unguja Island, Zanzibar.",
          messageSw:
            "Mahali pa kuchukuliwa na kushushwa lazima pawe ndani ya Kisiwa cha Unguja, Zanzibar.",
          pickup,
          dropoff,
        },
        { status: 422 }
      );
    }

    const route = await computeRouteOsrm(pickup.effective, dropoff.effective);
    const km = route.distanceMeters / 1000;
    const mins = route.durationSeconds / 60;
    const step = PLATFORM_FINANCE.FARE_ROUNDING_STEP_TZS;

    const sql = getSql();
    interface PromoRecord {
      code: string;
      discount_type: "PERCENT" | "FLAT_TZS";
      discount_value: number;
      max_discount_tzs: number;
      min_fare_tzs: number;
    }
    let promoStatus: "NONE" | "APPLIED" | "INVALID" = "NONE";
    let promo: PromoRecord | null = null;

    if (body.promoCode && body.promoCode.trim().length > 0) {
      const code = body.promoCode.trim().toUpperCase();
      const promoRows = await sql`
        SELECT code, discount_type, discount_value, max_discount_tzs, min_fare_tzs
        FROM pricing.promo_codes
        WHERE code = ${code} AND active = TRUE
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1
      `;
      if (promoRows[0]) {
        promo = promoRows[0] as unknown as PromoRecord;
        promoStatus = "APPLIED";
      } else {
        promoStatus = "INVALID";
      }
    }

    const tariffRows = (await sql`
      SELECT transport_type, operator_role, base_fare_tzs, per_km_tzs, per_min_tzs,
             min_fare_tzs, commission_pct, active_multiplier, max_multiplier, max_passengers
      FROM pricing.tariffs
    `) as Array<{
      transport_type: "BODABODA" | "BAJAJI";
      operator_role: "RIDER" | "DRIVER";
      base_fare_tzs: number;
      per_km_tzs: number;
      per_min_tzs: number;
      min_fare_tzs: number;
      commission_pct: number;
      active_multiplier: number;
      max_multiplier: number;
      max_passengers: number;
    }>;

    const buildQuote = (type: "BODABODA" | "BAJAJI") => {
      const dbRow = tariffRows.find((t) => t.transport_type === type);
      const fallback = DEFAULT_TARIFFS_TZS[type];
      const base = dbRow?.base_fare_tzs ?? fallback.baseFareTzs;
      const perKm = dbRow?.per_km_tzs ?? fallback.perKmTzs;
      const perMin = dbRow?.per_min_tzs ?? fallback.perMinTzs;
      const minFare = dbRow?.min_fare_tzs ?? fallback.minFareTzs;
      const mult = Math.min(
        dbRow?.max_multiplier ?? fallback.maxMultiplier,
        Math.max(1, dbRow?.active_multiplier ?? 1)
      );
      const raw = (base + km * perKm + mins * perMin) * mult;
      const grossFareTzs = Math.max(minFare, Math.round(raw / step) * step);

      let discountTzs = 0;
      let promoApplied: string | null = null;
      if (promo && grossFareTzs >= promo.min_fare_tzs) {
        const rawDiscount =
          promo.discount_type === "PERCENT"
            ? Math.round((grossFareTzs * promo.discount_value) / 100)
            : promo.discount_value;
        const capped = Math.min(rawDiscount, promo.max_discount_tzs);
        const after = Math.max(500, Math.round((grossFareTzs - capped) / step) * step);
        discountTzs = Math.max(0, grossFareTzs - after);
        if (discountTzs > 0) promoApplied = promo.code;
      }

      return {
        transportType: type,
        operatorRole: type === "BODABODA" ? "RIDER" : "DRIVER",
        currency: "TZS",
        grossFareTzs,
        discountTzs,
        promoApplied,
        finalFareTzs: grossFareTzs - discountTzs,
        maxPassengers: dbRow?.max_passengers ?? fallback.maxPassengers,
      };
    };

    return NextResponse.json({
      pickup,
      dropoff,
      promoStatus,
      route: {
        distanceMeters: route.distanceMeters,
        distanceKm: Number(km.toFixed(2)),
        durationSeconds: route.durationSeconds,
        durationMinutes: Math.max(1, Math.round(mins)),
        source: route.source,
        geometry: route.geometry,
      },
      quotes: {
        BODABODA: buildQuote("BODABODA"),
        BAJAJI: buildQuote("BAJAJI"),
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "QUOTE_FAILED",
        message: err instanceof Error ? err.message : "Unable to calculate quote",
      },
      { status: 503 }
    );
  }
}
