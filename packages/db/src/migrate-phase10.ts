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
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

async function migratePhase10() {
  loadLocalEnv();
  const sql = getSql();

  console.log(
    "[Phase 10 Migrate] Adding customer profiles, saved places, favorites, trip stops on Neon..."
  );

  // 1. Customer profile & preferences (owned by auth schema)
  await sql`
    CREATE TABLE IF NOT EXISTS auth.customer_profiles (
      user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      default_transport TEXT NOT NULL DEFAULT 'BODABODA' CHECK (default_transport IN ('BODABODA', 'BAJAJI')),
      default_payment_method TEXT NOT NULL DEFAULT 'CASH' CHECK (default_payment_method IN ('CASH', 'MOBILE_MONEY', 'CARD')),
      preferred_language TEXT NOT NULL DEFAULT 'sw' CHECK (preferred_language IN ('sw', 'en')),
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // 2. Saved places / favorite Unguja spots
  await sql`
    CREATE TABLE IF NOT EXISTS auth.customer_saved_places (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('HOME', 'WORK', 'HOTEL_VILLA', 'LANDMARK', 'CUSTOM')),
      landmark_id TEXT,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_customer_saved_places_user
    ON auth.customer_saved_places (user_id, created_at DESC)
  `;

  // 3. Favorite operators (5-star riders/drivers)
  await sql`
    CREATE TABLE IF NOT EXISTS auth.customer_favorite_operators (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      operator_id UUID NOT NULL,
      transport_type TEXT NOT NULL CHECK (transport_type IN ('BODABODA', 'BAJAJI')),
      operator_name TEXT NOT NULL DEFAULT '',
      operator_plate TEXT NOT NULL DEFAULT '',
      rating SMALLINT NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, operator_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_customer_favorite_operators_user
    ON auth.customer_favorite_operators (user_id, created_at DESC)
  `;

  // 4. Multi-stop trip stops
  await sql`
    CREATE TABLE IF NOT EXISTS trip.trip_stops (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id UUID NOT NULL REFERENCES trip.trips(id) ON DELETE CASCADE,
      stop_order INTEGER NOT NULL,
      label TEXT NOT NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      is_pickup BOOLEAN NOT NULL DEFAULT FALSE,
      is_dropoff BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_trip_stops_trip
    ON trip.trip_stops (trip_id, stop_order ASC)
  `;

  // 5. Ensure trip.trips has stops_count + multi-leg fare columns
  await sql`
    ALTER TABLE trip.trips
    ADD COLUMN IF NOT EXISTS stops_count INTEGER NOT NULL DEFAULT 0
  `;
  await sql`
    ALTER TABLE trip.trips
    ADD COLUMN IF NOT EXISTS multi_stop_fare_tzs INTEGER
  `;

  console.log("[Phase 10 Migrate] Complete!");
}

migratePhase10().catch((err) => {
  console.error("[Phase 10 Migrate] Failed:", err);
  process.exit(1);
});
