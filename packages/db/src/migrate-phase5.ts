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

export const PLATFORM_OWNER_ID = "00000000-0000-4000-8000-000000000000";

async function migratePhase5() {
  loadLocalEnv();
  const sql = getSql();

  console.log(
    "[Phase 5 Migrate] Running ACID double-entry finance ledger migrations on Neon..."
  );

  // 1. Wallet Accounts (Operator EARNINGS + COMMISSION_FLOAT & Go.boda System Clearing Accounts)
  await sql`
    CREATE TABLE IF NOT EXISTS finance.wallet_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id UUID NOT NULL,
      account_type TEXT NOT NULL CHECK (account_type IN (
        'EARNINGS',
        'COMMISSION_FLOAT',
        'PLATFORM_COMMISSION',
        'CLEARING_CASH',
        'CLEARING_DIGITAL',
        'PROMO_SUBSIDY'
      )),
      currency TEXT NOT NULL DEFAULT 'TZS',
      balance_tzs BIGINT NOT NULL DEFAULT 0,
      is_float_blocked BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (owner_id, account_type)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_finance_wallet_owner
    ON finance.wallet_accounts (owner_id, account_type)
  `;

  // 2. Immutable Double-Entry Ledger Journal (SUM(delta_tzs) per journal_id == 0)
  await sql`
    CREATE TABLE IF NOT EXISTS finance.ledger_entries (
      id BIGSERIAL PRIMARY KEY,
      journal_id UUID NOT NULL,
      idempotency_key TEXT NOT NULL,
      account_id UUID NOT NULL REFERENCES finance.wallet_accounts(id),
      owner_id UUID NOT NULL,
      account_type TEXT NOT NULL,
      delta_tzs BIGINT NOT NULL,
      balance_after_tzs BIGINT NOT NULL,
      entry_type TEXT NOT NULL,
      trip_id UUID,
      reference TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (idempotency_key, account_id, entry_type)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_finance_ledger_owner
    ON finance.ledger_entries (owner_id, created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_finance_ledger_journal
    ON finance.ledger_entries (journal_id)
  `;

  // 3. Trip Payments (Cash TZS, Mobile Money STK Push, Card)
  await sql`
    CREATE TABLE IF NOT EXISTS finance.payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      idempotency_key TEXT UNIQUE NOT NULL,
      trip_id UUID UNIQUE NOT NULL,
      customer_id UUID NOT NULL,
      operator_id UUID NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'MOBILE_MONEY', 'CARD')),
      provider TEXT NOT NULL,
      gross_fare_tzs INTEGER NOT NULL,
      discount_tzs INTEGER NOT NULL DEFAULT 0,
      customer_paid_tzs INTEGER NOT NULL,
      commission_tzs INTEGER NOT NULL,
      operator_net_tzs INTEGER NOT NULL,
      float_offset_tzs INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'INITIATED', 'CONFIRMED', 'FAILED', 'DISPUTED')),
      provider_ref TEXT UNIQUE,
      customer_phone TEXT,
      confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_finance_payments_operator
    ON finance.payments (operator_id, created_at DESC)
  `;

  // 4. Instant Rider/Driver Payouts (Mobile Money Disbursements)
  await sql`
    CREATE TABLE IF NOT EXISTS finance.payouts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      idempotency_key TEXT UNIQUE NOT NULL,
      operator_id UUID NOT NULL,
      amount_tzs INTEGER NOT NULL CHECK (amount_tzs > 0),
      payout_channel TEXT NOT NULL CHECK (payout_channel IN (
        'MPESA', 'TIGO_PESA', 'AIRTEL_MONEY', 'HALOPESA', 'EZYPESA'
      )),
      destination_phone TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
      provider_ref TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_finance_payouts_operator
    ON finance.payouts (operator_id, created_at DESC)
  `;

  // 5. Transactional Outbox for payment.confirmed, wallet.float_blocked, wallet.float_restored, payout.completed
  await sql`
    CREATE TABLE IF NOT EXISTS finance.outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subject TEXT NOT NULL,
      payload JSONB NOT NULL,
      correlation_id TEXT NOT NULL,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Seed Go.boda System Double-Entry Accounts
  const systemTypes = [
    "PLATFORM_COMMISSION",
    "CLEARING_CASH",
    "CLEARING_DIGITAL",
    "PROMO_SUBSIDY",
  ] as const;

  for (const accountType of systemTypes) {
    await sql`
      INSERT INTO finance.wallet_accounts (owner_id, account_type, currency, balance_tzs)
      VALUES (${PLATFORM_OWNER_ID}::uuid, ${accountType}, 'TZS', 0)
      ON CONFLICT (owner_id, account_type) DO NOTHING
    `;
  }

  const counts = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = 'finance') AS finance_tables,
      (SELECT COUNT(*)::int FROM finance.wallet_accounts WHERE owner_id = ${PLATFORM_OWNER_ID}::uuid) AS system_accounts
  `;

  console.log("[Phase 5 Migrate] Complete:", counts[0]);
}

migratePhase5().catch((err) => {
  console.error("[Phase 5 Migrate] Failed:", err);
  process.exit(1);
});
