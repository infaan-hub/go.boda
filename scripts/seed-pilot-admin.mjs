import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim().replace(/^"(.*)"$/, "$1");
    if (!process.env[k]) process.env[k] = v;
  }
}

const { getSql, hashPassword } = await import("../packages/db/dist/index.js");

const PILOT_ADMIN_PHONE = process.env.ADMIN_BOOTSTRAP_PHONE || "+255770000112";
const PILOT_ADMIN_NAME = process.env.ADMIN_BOOTSTRAP_NAME || "Go.boda Unguja Ops Desk";
const PILOT_ADMIN_USERNAME = process.env.ADMIN_BOOTSTRAP_USERNAME || "admin504";
const PILOT_ADMIN_PASSWORD =
  process.env.ADMIN_BOOTSTRAP_PASSWORD || "Admin009@504";

const sql = getSql();
const passwordHash = hashPassword(PILOT_ADMIN_PASSWORD);
const rows = await sql`
  INSERT INTO auth.users (phone, username, password_hash, role, name, language)
  VALUES (
    ${PILOT_ADMIN_PHONE},
    ${PILOT_ADMIN_USERNAME},
    ${passwordHash},
    'ADMIN',
    ${PILOT_ADMIN_NAME},
    'en'
  )
  ON CONFLICT (phone) DO UPDATE SET
    username = EXCLUDED.username,
    password_hash = EXCLUDED.password_hash,
    role = 'ADMIN',
    name = EXCLUDED.name,
    status = 'ACTIVE',
    updated_at = NOW()
  RETURNING id, phone, username, role, name
`;

console.log("[Seed Admin] Pilot Operations Admin ready:", rows[0]);
