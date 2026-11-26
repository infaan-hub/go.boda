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

async function migratePhase3() {
  loadLocalEnv();
  const sql = getSql();

  console.log(
    "[Phase 3 Migrate] Running trip, dispatch & notification migrations on Neon..."
  );

  // =========================================================================
  // 1. TRIP SCHEMA (owned by trip-service)
  // =========================================================================
  await sql`
    CREATE TABLE IF NOT EXISTS trip.trips (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_code TEXT UNIQUE NOT NULL,
      customer_id UUID NOT NULL,
      operator_id UUID,
      transport_type TEXT NOT NULL CHECK (transport_type IN ('BODABODA', 'BAJAJI')),
      operator_title TEXT NOT NULL CHECK (operator_title IN ('RIDER', 'DRIVER')),
      status TEXT NOT NULL CHECK (status IN (
        'DRAFT', 'SEARCHING', 'OFFERED_TO_OPERATOR', 'NO_OPERATOR_FOUND',
        'ASSIGNED', 'ARRIVED_AT_PICKUP', 'IN_PROGRESS', 'SOS_ACTIVE',
        'COMPLETED_UNPAID', 'PAID_COMPLETED', 'CANCELLED_BY_CUSTOMER',
        'CANCELLED_BY_OPERATOR', 'PAYMENT_DISPUTED'
      )),
      pickup_lat DOUBLE PRECISION NOT NULL,
      pickup_lng DOUBLE PRECISION NOT NULL,
      pickup_label TEXT NOT NULL,
      pickup_snapped BOOLEAN NOT NULL DEFAULT FALSE,
      pickup_effective_lat DOUBLE PRECISION NOT NULL,
      pickup_effective_lng DOUBLE PRECISION NOT NULL,
      pickup_snap_gate_name TEXT,
      pickup_walk_meters INTEGER NOT NULL DEFAULT 0,
      pickup_note TEXT NOT NULL DEFAULT '',
      dropoff_lat DOUBLE PRECISION NOT NULL,
      dropoff_lng DOUBLE PRECISION NOT NULL,
      dropoff_label TEXT NOT NULL,
      distance_meters INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'MOBILE_MONEY', 'CARD')),
      promo_code TEXT,
      gross_fare_tzs INTEGER NOT NULL,
      discount_tzs INTEGER NOT NULL DEFAULT 0,
      estimated_fare_tzs INTEGER NOT NULL,
      wait_fee_tzs INTEGER NOT NULL DEFAULT 0,
      cancel_fee_tzs INTEGER NOT NULL DEFAULT 0,
      final_fare_tzs INTEGER,
      commission_pct INTEGER NOT NULL DEFAULT 12,
      commission_tzs INTEGER NOT NULL DEFAULT 0,
      operator_net_tzs INTEGER NOT NULL DEFAULT 0,
      start_pin TEXT NOT NULL,
      pin_verified_at TIMESTAMPTZ,
      assigned_at TIMESTAMPTZ,
      arrived_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      cancel_reason TEXT,
      cancelled_by_role TEXT,
      operator_plate TEXT,
      operator_name TEXT,
      operator_phone TEXT,
      helmet_provided BOOLEAN,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_trip_trips_customer
    ON trip.trips (customer_id, created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_trip_trips_operator
    ON trip.trips (operator_id, status, created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_trip_trips_status
    ON trip.trips (status, created_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS trip.state_transitions (
      id BIGSERIAL PRIMARY KEY,
      trip_id UUID NOT NULL REFERENCES trip.trips(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      actor_id UUID,
      actor_role TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_trip_transitions_trip
    ON trip.state_transitions (trip_id, created_at ASC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS trip.ratings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id UUID NOT NULL REFERENCES trip.trips(id) ON DELETE CASCADE,
      rater_id UUID NOT NULL,
      rater_role TEXT NOT NULL,
      ratee_id UUID NOT NULL,
      stars INTEGER NOT NULL CHECK (stars >= 1 AND stars <= 5),
      helmet_provided BOOLEAN,
      comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (trip_id, rater_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS trip.outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subject TEXT NOT NULL,
      payload JSONB NOT NULL,
      correlation_id TEXT NOT NULL,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_trip_outbox_pending
    ON trip.outbox_events (created_at ASC)
    WHERE published_at IS NULL
  `;

  // =========================================================================
  // 2. DISPATCH SCHEMA (owned by dispatch-service — Atomic Locks & 20s Offers)
  // =========================================================================
  await sql`
    CREATE TABLE IF NOT EXISTS dispatch.trip_locks (
      trip_id UUID PRIMARY KEY,
      assigned_operator_id UUID NOT NULL,
      offer_id UUID NOT NULL,
      locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS dispatch.offers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id UUID NOT NULL,
      operator_id UUID NOT NULL,
      transport_type TEXT NOT NULL CHECK (transport_type IN ('BODABODA', 'BAJAJI')),
      operator_title TEXT NOT NULL CHECK (operator_title IN ('RIDER', 'DRIVER')),
      search_radius_km DOUBLE PRECISION NOT NULL,
      round_number INTEGER NOT NULL DEFAULT 1,
      match_score DOUBLE PRECISION NOT NULL DEFAULT 0,
      distance_meters INTEGER NOT NULL DEFAULT 0,
      eta_minutes INTEGER NOT NULL DEFAULT 2,
      pickup_label TEXT NOT NULL DEFAULT '',
      dropoff_label TEXT NOT NULL DEFAULT '',
      estimated_fare_tzs INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'CASH',
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SUPERSEDED')),
      expires_at TIMESTAMPTZ NOT NULL,
      responded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_dispatch_offers_operator_pending
    ON dispatch.offers (operator_id, status, expires_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_dispatch_offers_trip
    ON dispatch.offers (trip_id, created_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS dispatch.outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subject TEXT NOT NULL,
      payload JSONB NOT NULL,
      correlation_id TEXT NOT NULL,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // =========================================================================
  // 3. NOTIFICATION SCHEMA (owned by notification-service — VAPID, SMS/WA, Chat)
  // =========================================================================
  await sql`
    CREATE TABLE IF NOT EXISTS notif.push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      role TEXT NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth_key TEXT NOT NULL,
      user_agent TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_notif_push_user
    ON notif.push_subscriptions (user_id)
    WHERE active = TRUE
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notif.messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      phone TEXT,
      channel TEXT NOT NULL CHECK (channel IN ('WEB_PUSH', 'WHATSAPP', 'SMS')),
      event_subject TEXT NOT NULL,
      locale TEXT NOT NULL DEFAULT 'sw',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL CHECK (status IN ('QUEUED', 'SENT', 'SIMULATED', 'FAILED')),
      provider_ref TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_notif_messages_user
    ON notif.messages (user_id, created_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notif.trip_chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id UUID NOT NULL,
      sender_id UUID NOT NULL,
      sender_role TEXT NOT NULL,
      preset_key TEXT,
      body_sw TEXT NOT NULL DEFAULT '',
      body_en TEXT NOT NULL DEFAULT '',
      body_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_notif_chat_trip
    ON notif.trip_chat_messages (trip_id, created_at ASC)
  `;

  const counts = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = 'trip') AS trip_tables,
      (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = 'dispatch') AS dispatch_tables,
      (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = 'notif') AS notif_tables
  `;

  console.log("[Phase 3 Migrate] Complete:", counts[0]);
}

migratePhase3().catch((err) => {
  console.error("[Phase 3 Migrate] Failed:", err);
  process.exit(1);
});
