import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getSql } from "./index.js";

function loadLocalEnv() {
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env.local"),
    resolve(process.cwd(), "../../.env"),
  ];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

async function migratePhase2() {
  loadLocalEnv();
  const sql = getSql();

  console.log("[Phase 2 Migrate] Running location & pricing migrations on Neon...");

  // =========================================================================
  // 1. LOCATION SCHEMA (owned by location-service — PostGIS real-time positions)
  // =========================================================================
  await sql`
    CREATE TABLE IF NOT EXISTS location.operator_positions (
      operator_id UUID PRIMARY KEY,
      transport_type TEXT NOT NULL CHECK (transport_type IN ('BODABODA', 'BAJAJI')),
      operator_title TEXT NOT NULL CHECK (operator_title IN ('RIDER', 'DRIVER')),
      plate_number TEXT NOT NULL,
      home_kituo TEXT NOT NULL DEFAULT '',
      is_online BOOLEAN NOT NULL DEFAULT TRUE,
      is_busy BOOLEAN NOT NULL DEFAULT FALSE,
      is_demo BOOLEAN NOT NULL DEFAULT FALSE,
      active_trip_id UUID,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      heading DOUBLE PRECISION NOT NULL DEFAULT 0,
      speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 0,
      rating_avg DOUBLE PRECISION NOT NULL DEFAULT 5.0,
      geom geometry(Point, 4326) NOT NULL,
      idle_since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_location_op_geom
    ON location.operator_positions USING GIST (geom)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_location_op_pool
    ON location.operator_positions (transport_type, is_online, is_busy, last_seen_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS location.trip_breadcrumbs (
      id BIGSERIAL PRIMARY KEY,
      trip_id UUID NOT NULL,
      operator_id UUID NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      heading DOUBLE PRECISION NOT NULL DEFAULT 0,
      speed_kmh DOUBLE PRECISION NOT NULL DEFAULT 0,
      recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_location_breadcrumbs_trip
    ON location.trip_breadcrumbs (trip_id, recorded_at DESC)
  `;

  // Seed realistic demo Unguja online Bodaboda Riders & Bajaji Drivers (flagged is_demo = TRUE)
  const demoFleet = [
    ["10000000-0000-4000-8000-000000000001", "BODABODA", "RIDER", "Z 104 AAB", "Darajani Stage", -6.1646, 39.1942, 45, 4.9],
    ["10000000-0000-4000-8000-000000000002", "BODABODA", "RIDER", "Z 218 AAC", "Creek Road", -6.1618, 39.1951, 180, 4.8],
    ["10000000-0000-4000-8000-000000000003", "BODABODA", "RIDER", "Z 342 AAD", "Malindi Ferry", -6.1582, 39.1929, 90, 5.0],
    ["10000000-0000-4000-8000-000000000004", "BODABODA", "RIDER", "Z 455 AAE", "Michenzani", -6.1681, 39.2015, 270, 4.7],
    ["10000000-0000-4000-8000-000000000005", "BODABODA", "RIDER", "Z 509 AAF", "Mwanakwerekwe", -6.1831, 39.2231, 120, 4.9],
    ["10000000-0000-4000-8000-000000000006", "BAJAJI", "DRIVER", "Z 612 BBA", "Darajani Gate", -6.1654, 39.1939, 30, 4.9],
    ["10000000-0000-4000-8000-000000000007", "BAJAJI", "DRIVER", "Z 724 BBB", "Mnazi Mmoja", -6.1686, 39.1918, 315, 4.8],
    ["10000000-0000-4000-8000-000000000008", "BAJAJI", "DRIVER", "Z 839 BBC", "Kisauni Airport", -6.2205, 39.2241, 15, 5.0],
    ["10000000-0000-4000-8000-000000000009", "BAJAJI", "DRIVER", "Z 915 BBD", "Paje Roundabout", -6.2695, 39.5322, 200, 4.9],
    ["10000000-0000-4000-8000-000000000010", "BODABODA", "RIDER", "Z 982 AAG", "Nungwi Village", -5.7271, 39.2981, 160, 4.8],
  ] as const;

  for (const [id, transportType, operatorTitle, plate, kituo, lat, lng, heading, rating] of demoFleet) {
    await sql`
      INSERT INTO location.operator_positions (
        operator_id, transport_type, operator_title, plate_number, home_kituo,
        is_online, is_busy, is_demo, lat, lng, heading, rating_avg, geom, last_seen_at
      )
      VALUES (
        ${id}::uuid, ${transportType}, ${operatorTitle}, ${plate}, ${kituo},
        TRUE, FALSE, TRUE, ${lat}, ${lng}, ${heading}, ${rating},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326), NOW()
      )
      ON CONFLICT (operator_id) DO UPDATE SET
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        geom = EXCLUDED.geom,
        is_online = TRUE,
        is_demo = TRUE,
        last_seen_at = NOW()
    `;
  }

  // =========================================================================
  // 2. PRICING SCHEMA EXPANSION (owned by pricing-service)
  // =========================================================================
  await sql`
    ALTER TABLE pricing.tariffs
      ADD COLUMN IF NOT EXISTS cancel_fee_tzs INTEGER NOT NULL DEFAULT 500,
      ADD COLUMN IF NOT EXISTS free_wait_minutes INTEGER NOT NULL DEFAULT 5,
      ADD COLUMN IF NOT EXISTS active_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.0,
      ADD COLUMN IF NOT EXISTS multiplier_reason TEXT NOT NULL DEFAULT 'NORMAL'
  `;

  await sql`
    UPDATE pricing.tariffs
    SET cancel_fee_tzs = CASE WHEN transport_type = 'BAJAJI' THEN 1000 ELSE 500 END
    WHERE cancel_fee_tzs IS NULL OR cancel_fee_tzs = 500
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pricing.promo_codes (
      code TEXT PRIMARY KEY,
      discount_type TEXT NOT NULL CHECK (discount_type IN ('PERCENT', 'FLAT_TZS')),
      discount_value INTEGER NOT NULL CHECK (discount_value > 0),
      max_discount_tzs INTEGER NOT NULL DEFAULT 2000,
      min_fare_tzs INTEGER NOT NULL DEFAULT 1500,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    INSERT INTO pricing.promo_codes (code, discount_type, discount_value, max_discount_tzs, min_fare_tzs, active)
    VALUES
      ('KARIBUUNGUJA', 'PERCENT', 15, 2000, 1500, TRUE),
      ('GOBODA500', 'FLAT_TZS', 500, 500, 1500, TRUE)
    ON CONFLICT (code) DO NOTHING
  `;

  const [fleetCount, promoCount] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM location.operator_positions WHERE is_online = TRUE`,
    sql`SELECT COUNT(*)::int AS count FROM pricing.promo_codes WHERE active = TRUE`,
  ]);

  console.log("[Phase 2 Migrate] Complete:", {
    onlineDemoOperators: (fleetCount[0] as { count: number })?.count,
    activePromoCodes: (promoCount[0] as { count: number })?.count,
  });
}

migratePhase2().catch((err) => {
  console.error("[Phase 2 Migrate] Failed:", err);
  process.exit(1);
});
