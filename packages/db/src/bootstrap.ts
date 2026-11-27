import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_TARIFFS_TZS } from "@goboda/shared-types";
import { getSql, MICROSERVICE_SCHEMAS } from "./index.js";

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

async function bootstrapNeon() {
  loadLocalEnv();
  const sql = getSql();

  console.log("[Go.boda DB] Connecting to Neon PostgreSQL...");

  // 1. Enable PostGIS for Unguja geofencing & Stone Town snapping
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS postgis`;
    console.log("[Go.boda DB] PostGIS extension enabled.");
  } catch (err) {
    console.warn(
      "[Go.boda DB] PostGIS warning:",
      err instanceof Error ? err.message : err
    );
  }

  // 2. Create isolated schemas for all 10 Go.boda microservices
  await sql`CREATE SCHEMA IF NOT EXISTS auth`;
  await sql`CREATE SCHEMA IF NOT EXISTS operator`;
  await sql`CREATE SCHEMA IF NOT EXISTS geo`;
  await sql`CREATE SCHEMA IF NOT EXISTS location`;
  await sql`CREATE SCHEMA IF NOT EXISTS pricing`;
  await sql`CREATE SCHEMA IF NOT EXISTS dispatch`;
  await sql`CREATE SCHEMA IF NOT EXISTS trip`;
  await sql`CREATE SCHEMA IF NOT EXISTS finance`;
  await sql`CREATE SCHEMA IF NOT EXISTS notif`;
  await sql`CREATE SCHEMA IF NOT EXISTS safety`;
  console.log(
    `[Go.boda DB] Provisioned ${MICROSERVICE_SCHEMAS.length} isolated microservice schemas.`
  );

  // 3. Provision foundational geo & pricing tables in their owning schemas
  await sql`
    CREATE TABLE IF NOT EXISTS geo.zones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      zone_type TEXT NOT NULL,
      geom geometry(Polygon, 4326) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_geo_zones_geom ON geo.zones USING GIST (geom)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS geo.snap_points (
      id TEXT PRIMARY KEY,
      zone_id TEXT NOT NULL REFERENCES geo.zones(id) ON DELETE CASCADE,
      name_sw TEXT NOT NULL,
      name_en TEXT NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      geom geometry(Point, 4326) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_geo_snap_points_geom ON geo.snap_points USING GIST (geom)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS geo.landmarks (
      id TEXT PRIMARY KEY,
      name_sw TEXT NOT NULL,
      name_en TEXT NOT NULL,
      category TEXT NOT NULL,
      area TEXT NOT NULL,
      is_kituo BOOLEAN NOT NULL DEFAULT FALSE,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      geom geometry(Point, 4326) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_geo_landmarks_geom ON geo.landmarks USING GIST (geom)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pricing.tariffs (
      transport_type TEXT PRIMARY KEY,
      operator_role TEXT NOT NULL,
      base_fare_tzs INTEGER NOT NULL,
      per_km_tzs INTEGER NOT NULL,
      per_min_tzs INTEGER NOT NULL,
      min_fare_tzs INTEGER NOT NULL,
      wait_fee_per_min_tzs INTEGER NOT NULL,
      commission_pct INTEGER NOT NULL,
      max_multiplier DOUBLE PRECISION NOT NULL,
      max_passengers INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // 4. Seed Unguja Island Boundary Polygon (strictly excludes Pemba & Mainland Tanzania)
  const ungujaPolygonWkt =
    "POLYGON((39.12 -6.18, 39.13 -6.08, 39.14 -5.96, 39.17 -5.85, 39.20 -5.76, 39.24 -5.69, 39.30 -5.64, 39.38 -5.64, 39.42 -5.71, 39.47 -5.84, 39.50 -5.98, 39.54 -6.10, 39.60 -6.20, 39.62 -6.34, 39.60 -6.42, 39.55 -6.50, 39.47 -6.52, 39.40 -6.52, 39.32 -6.46, 39.26 -6.37, 39.20 -6.29, 39.13 -6.22, 39.12 -6.18))";

  // Stone Town UNESCO Pedestrian-Restricted Core Polygon
  const stoneTownCoreWkt =
    "POLYGON((39.1858 -6.1658, 39.1862 -6.1588, 39.1932 -6.1585, 39.1950 -6.1632, 39.1920 -6.1672, 39.1858 -6.1658))";

  await sql`
    INSERT INTO geo.zones (id, name, zone_type, geom)
    VALUES
      ('unguja-island', 'Unguja Island Service Area', 'UNGUJA_BOUNDARY', ST_GeomFromText(${ungujaPolygonWkt}, 4326)),
      ('stone-town-pedestrian', 'Stone Town Pedestrian Core', 'STONE_TOWN_PEDESTRIAN', ST_GeomFromText(${stoneTownCoreWkt}, 4326))
    ON CONFLICT (id) DO NOTHING
  `;

  // 5. Seed Stone Town Perimeter Smart Snap Gates
  const snapPoints = [
    ["snap-darajani", "Lango la Soko la Darajani", "Darajani Market Gate", -6.1649, 39.1936],
    ["snap-creek-road", "Barabara ya Creek Road", "Creek Road Main Perimeter", -6.1631, 39.1948],
    ["snap-forodhani", "Ukingo wa Bustani ya Forodhani", "Forodhani Gardens Edge", -6.1605, 39.1886],
    ["snap-malindi-ferry", "Lango la Bandari ya Malindi", "Malindi Ferry Terminal Gate", -6.1578, 39.1924],
    ["snap-mnazi-mmoja", "Mzunguko wa Mnazi Mmoja", "Mnazi Mmoja Roundabout", -6.1684, 39.1912],
    ["snap-shangani", "Ukingo wa Shangani", "Shangani Perimeter Road", -6.1659, 39.1854],
  ] as const;

  for (const [id, nameSw, nameEn, lat, lng] of snapPoints) {
    await sql`
      INSERT INTO geo.snap_points (id, zone_id, name_sw, name_en, lat, lng, geom)
      VALUES (
        ${id},
        'stone-town-pedestrian',
        ${nameSw},
        ${nameEn},
        ${lat},
        ${lng},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // 6. Seed Starter Curated Unguja Landmarks & Vituo
  const landmarks = [
    ["lm-darajani", "Soko la Darajani", "Darajani Market", "MARKET", "Stone Town", true, -6.1649, 39.1936],
    ["lm-ferry", "Bandari ya Feri Zanzibar", "Zanzibar Ferry Terminal", "TRANSPORT", "Malindi", true, -6.1576, 39.1927],
    ["lm-znz-airport", "Uwanja wa Ndege wa Abeid Amani Karume (ZNZ)", "Abeid Amani Karume International Airport (ZNZ)", "AIRPORT", "Kisauni", true, -6.2220, 39.2249],
    ["lm-forodhani", "Bustani ya Forodhani", "Forodhani Gardens", "LANDMARK", "Stone Town", false, -6.1606, 39.1883],
    ["lm-mwanakwerekwe", "Soko la Mwanakwerekwe", "Mwanakwerekwe Market", "MARKET", "Urban West", true, -6.1837, 39.2238],
    ["lm-michenzani", "Michenzani Mall / Mapinduzi", "Michenzani Mall", "SHOPPING", "Ng'ambo", true, -6.1674, 39.2007],
    ["lm-bububu", "Kituo cha Bububu", "Bububu Stage", "KITUO", "Bububu", true, -6.1037, 39.2206],
    ["lm-fuoni", "Njia Panda ya Fuoni", "Fuoni Junction", "KITUO", "Fuoni", true, -6.1972, 39.2422],
    ["lm-chukwani", "Chukwani", "Chukwani", "NEIGHBORHOOD", "Urban West", false, -6.2440, 39.2165],
    ["lm-nungwi", "Ufukwe wa Nungwi", "Nungwi Village Center", "BEACH", "North Coast", true, -5.7265, 39.2987],
    ["lm-kendwa", "Kendwa", "Kendwa Beach Road", "BEACH", "North Coast", true, -5.7478, 39.2886],
    ["lm-kiwengwa", "Kiwengwa", "Kiwengwa Center", "BEACH", "East Coast", true, -5.9845, 39.3738],
    ["lm-paje", "Mzunguko wa Paje", "Paje Roundabout", "KITUO", "South-East Coast", true, -6.2698, 39.5327],
    ["lm-jambiani", "Jambiani", "Jambiani Main Road", "BEACH", "South-East Coast", true, -6.3177, 39.5469],
    ["lm-fumba", "Fumba Town", "Fumba Town", "NEIGHBORHOOD", "West Coast", true, -6.2896, 39.2775],
    ["lm-kizimkazi", "Kizimkazi", "Kizimkazi Dimbani", "BEACH", "South Coast", true, -6.4375, 39.4648],
  ] as const;

  for (const [id, nameSw, nameEn, category, area, isKituo, lat, lng] of landmarks) {
    await sql`
      INSERT INTO geo.landmarks (id, name_sw, name_en, category, area, is_kituo, lat, lng, geom)
      VALUES (
        ${id},
        ${nameSw},
        ${nameEn},
        ${category},
        ${area},
        ${isKituo},
        ${lat},
        ${lng},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      )
      ON CONFLICT (id) DO NOTHING
    `;
  }

  // 7. Seed Default TZS Tariffs for Bodaboda (Rider) & Bajaji (Driver)
  const boda = DEFAULT_TARIFFS_TZS.BODABODA;
  const bajaji = DEFAULT_TARIFFS_TZS.BAJAJI;

  await sql`
    INSERT INTO pricing.tariffs (
      transport_type, operator_role, base_fare_tzs, per_km_tzs, per_min_tzs,
      min_fare_tzs, wait_fee_per_min_tzs, commission_pct, max_multiplier, max_passengers
    )
    VALUES
      ('BODABODA', 'RIDER', ${boda.baseFareTzs}, ${boda.perKmTzs}, ${boda.perMinTzs}, ${boda.minFareTzs}, ${boda.waitFeePerMinTzs}, ${boda.commissionPct}, ${boda.maxMultiplier}, ${boda.maxPassengers}),
      ('BAJAJI', 'DRIVER', ${bajaji.baseFareTzs}, ${bajaji.perKmTzs}, ${bajaji.perMinTzs}, ${bajaji.minFareTzs}, ${bajaji.waitFeePerMinTzs}, ${bajaji.commissionPct}, ${bajaji.maxMultiplier}, ${bajaji.maxPassengers})
    ON CONFLICT (transport_type) DO NOTHING
  `;

  // Verify Unguja geofence test in PostGIS
  const testChecks = await sql`
    SELECT
      ST_Contains(
        (SELECT geom FROM geo.zones WHERE id = 'unguja-island'),
        ST_SetSRID(ST_MakePoint(39.1936, -6.1649), 4326)
      ) AS darajani_in_unguja,
      ST_Contains(
        (SELECT geom FROM geo.zones WHERE id = 'unguja-island'),
        ST_SetSRID(ST_MakePoint(39.2803, -6.7924), 4326)
      ) AS dar_es_salaam_in_unguja,
      ST_Contains(
        (SELECT geom FROM geo.zones WHERE id = 'unguja-island'),
        ST_SetSRID(ST_MakePoint(39.7700, -5.2459), 4326)
      ) AS pemba_in_unguja
  `;

  console.log("[Go.boda DB] PostGIS Geofence Verification:", testChecks[0]);
  console.log("[Go.boda DB] Bootstrap complete.");
}

bootstrapNeon().catch((err) => {
  console.error("[Go.boda DB] Bootstrap failed:", err);
  process.exit(1);
});
