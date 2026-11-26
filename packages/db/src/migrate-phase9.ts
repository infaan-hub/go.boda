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

async function migratePhase9() {
  loadLocalEnv();
  const sql = getSql();

  console.log(
    "[Phase 9 Migrate] Adding support_tickets, trusted_contacts, promo caps & vituo targets on Neon..."
  );

  // 1. Support & Lost-Item Tickets (owned by notification-service / notif schema)
  await sql`
    CREATE TABLE IF NOT EXISTS notif.support_tickets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id UUID,
      trip_code TEXT,
      reporter_role TEXT NOT NULL DEFAULT 'CUSTOMER',
      reporter_phone TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL CHECK (category IN ('LOST_ITEM', 'PAYMENT_DISPUTE', 'SAFETY', 'GENERAL')),
      subject TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_REVIEW', 'RESOLVED')),
      ops_reply_sw TEXT NOT NULL DEFAULT '',
      ops_reply_en TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_notif_support_tickets_status
    ON notif.support_tickets (status, created_at DESC)
  `;

  // 2. Trusted Emergency Contacts (owned by safety-service / safety schema — max 3 per owner_key)
  await sql`
    CREATE TABLE IF NOT EXISTS safety.trusted_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_key TEXT NOT NULL,
      owner_role TEXT NOT NULL CHECK (owner_role IN ('CUSTOMER', 'BODABODA_RIDER', 'BAJAJI_DRIVER')),
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      relationship TEXT NOT NULL DEFAULT 'Family',
      auto_share_trips BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_safety_trusted_contacts_owner
    ON safety.trusted_contacts (owner_key, owner_role, created_at ASC)
  `;

  // 3. Extend pricing.promo_codes with campaign caps for /admin/promos/analytics
  await sql`
    ALTER TABLE pricing.promo_codes
    ADD COLUMN IF NOT EXISTS max_redemptions INTEGER NOT NULL DEFAULT 1000
  `;
  await sql`
    ALTER TABLE pricing.promo_codes
    ADD COLUMN IF NOT EXISTS budget_cap_tzs BIGINT NOT NULL DEFAULT 2000000
  `;

  // 4. Extend geo.landmarks with target_supply for /admin/vituo
  await sql`
    ALTER TABLE geo.landmarks
    ADD COLUMN IF NOT EXISTS target_supply INTEGER NOT NULL DEFAULT 4
  `;

  console.log("[Phase 9 Migrate] Complete!");
}

migratePhase9().catch((err) => {
  console.error("[Phase 9 Migrate] Failed:", err);
  process.exit(1);
});
