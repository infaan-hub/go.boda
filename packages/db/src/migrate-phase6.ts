import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getSql } from "./index.js";
import { hashPassword } from "./password.js";

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

async function migratePhase6() {
  loadLocalEnv();
  const sql = getSql();

  console.log("[Phase 6 Migrate] Adding username/password credentials to auth.users...");

  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

  // Defensive: phase 1 normally creates auth.users. Recreate the minimal shape
  // if a fresh database skipped the earlier phase.
  await sql`
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone TEXT UNIQUE,
      email TEXT UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'CUSTOMER'
        CHECK (role IN ('CUSTOMER', 'BODABODA_RIDER', 'BAJAJI_DRIVER', 'ADMIN')),
      language TEXT NOT NULL DEFAULT 'sw' CHECK (language IN ('sw', 'en')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED')),
      rating_avg DOUBLE PRECISION NOT NULL DEFAULT 5.0,
      rating_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS username TEXT`;
  await sql`ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS password_hash TEXT`;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_username_unique
    ON auth.users (LOWER(username))
    WHERE username IS NOT NULL
  `;

  const username = (process.env.ADMIN_BOOTSTRAP_USERNAME || "admin504").trim();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || "Admin009@504";
  const phone = process.env.ADMIN_BOOTSTRAP_PHONE || "+255770000112";
  const name =
    process.env.ADMIN_BOOTSTRAP_NAME || "Go.boda Unguja Ops Desk";

  const passwordHash = hashPassword(password);

  const existingRows = (await sql`
    SELECT id
    FROM auth.users
    WHERE LOWER(username) = LOWER(${username}) OR phone = ${phone}
    LIMIT 1
  `) as Array<{ id: string }>;

  const existing = existingRows[0];

  const adminRows = existing
    ? ((await sql`
        UPDATE auth.users
        SET
          username = ${username},
          password_hash = ${passwordHash},
          role = 'ADMIN',
          name = ${name},
          status = 'ACTIVE',
          updated_at = NOW()
        WHERE id = ${existing.id}::uuid
        RETURNING id, phone, username, role, name
      `) as Array<{
        id: string;
        phone: string | null;
        username: string | null;
        role: string;
        name: string;
      }>)
    : ((await sql`
        INSERT INTO auth.users (phone, username, password_hash, role, name, language)
        VALUES (${phone}, ${username}, ${passwordHash}, 'ADMIN', ${name}, 'en')
        RETURNING id, phone, username, role, name
      `) as Array<{
        id: string;
        phone: string | null;
        username: string | null;
        role: string;
        name: string;
      }>);

  console.log("[Phase 6 Migrate] Admin credentials ready:", adminRows[0]);
  console.log(
    `[Phase 6 Migrate] Login with username "${username}" and the configured ADMIN_BOOTSTRAP_PASSWORD.`
  );
}

migratePhase6().catch((err) => {
  console.error("[Phase 6 Migrate] Failed:", err);
  process.exit(1);
});
