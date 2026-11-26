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

async function migratePhase4() {
  loadLocalEnv();
  const sql = getSql();

  console.log("[Phase 4 Migrate] Running safety schema migrations on Neon...");

  // 1. Public time-limited live trip tracking share tokens (/track/[shareToken])
  await sql`
    CREATE TABLE IF NOT EXISTS safety.share_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id UUID NOT NULL,
      token TEXT UNIQUE NOT NULL,
      created_by_user_id UUID NOT NULL,
      created_by_role TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      views_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_safety_share_trip
    ON safety.share_links (trip_id, created_at DESC)
  `;

  // 2. High-priority In-Trip SOS Alerts
  await sql`
    CREATE TABLE IF NOT EXISTS safety.sos_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      alert_code TEXT UNIQUE NOT NULL,
      trip_id UUID NOT NULL,
      triggered_by_user_id UUID NOT NULL,
      triggered_by_role TEXT NOT NULL,
      transport_type TEXT NOT NULL CHECK (transport_type IN ('BODABODA', 'BAJAJI')),
      operator_id UUID,
      operator_plate TEXT,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      reason TEXT NOT NULL DEFAULT 'EMERGENCY_SOS',
      status TEXT NOT NULL CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_ALARM')) DEFAULT 'OPEN',
      resolution_note TEXT NOT NULL DEFAULT '',
      resolved_by_admin_id UUID,
      acknowledged_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_safety_sos_status
    ON safety.sos_alerts (status, created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_safety_sos_trip
    ON safety.sos_alerts (trip_id, created_at DESC)
  `;

  // 3. Bodaboda Helmet Compliance Tracking & Repeat-Offender Flags
  await sql`
    CREATE TABLE IF NOT EXISTS safety.helmet_compliance_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id UUID UNIQUE NOT NULL,
      operator_id UUID NOT NULL,
      customer_id UUID NOT NULL,
      helmet_provided BOOLEAN NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_safety_helmet_operator
    ON safety.helmet_compliance_logs (operator_id, helmet_provided, created_at DESC)
  `;

  // 4. Transactional Outbox for safety.sos_triggered, safety.sos_resolved, safety.helmet_flag_raised
  await sql`
    CREATE TABLE IF NOT EXISTS safety.outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subject TEXT NOT NULL,
      payload JSONB NOT NULL,
      correlation_id TEXT NOT NULL,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const counts = await sql`
    SELECT COUNT(*)::int AS safety_tables
    FROM information_schema.tables
    WHERE table_schema = 'safety'
  `;

  console.log("[Phase 4 Migrate] Complete:", counts[0]);
}

migratePhase4().catch((err) => {
  console.error("[Phase 4 Migrate] Failed:", err);
  process.exit(1);
});
