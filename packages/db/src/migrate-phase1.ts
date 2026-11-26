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

async function migratePhase1() {
  loadLocalEnv();
  const sql = getSql();

  console.log("[Phase 1 Migrate] Running auth, operator & geo migrations on Neon...");

  // Ensure UUID generation extension
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;

  // =========================================================================
  // 1. AUTH SCHEMA (owned by auth-service)
  // =========================================================================
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

  await sql`
    CREATE TABLE IF NOT EXISTS auth.otp_codes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'WHATSAPP' CHECK (channel IN ('WHATSAPP', 'SMS')),
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      consumed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_auth_otp_phone_created
    ON auth.otp_codes (phone, created_at DESC)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_auth_refresh_user
    ON auth.refresh_tokens (user_id)
  `;

  // =========================================================================
  // 2. OPERATOR SCHEMA (owned by operator-service — Bodaboda Riders & Bajaji Drivers)
  // =========================================================================
  await sql`
    CREATE TABLE IF NOT EXISTS operator.profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL UNIQUE,
      transport_type TEXT NOT NULL CHECK (transport_type IN ('BODABODA', 'BAJAJI')),
      operator_title TEXT NOT NULL CHECK (operator_title IN ('RIDER', 'DRIVER')),
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      home_kituo TEXT NOT NULL,
      national_id_no TEXT NOT NULL,
      license_no TEXT NOT NULL,
      license_expiry DATE,
      plate_number TEXT NOT NULL UNIQUE,
      vehicle_model TEXT NOT NULL,
      vehicle_color TEXT NOT NULL,
      insurance_expiry DATE,
      helmet_verified BOOLEAN NOT NULL DEFAULT FALSE,
      payout_mobile_number TEXT NOT NULL,
      kyc_status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION'
        CHECK (kyc_status IN ('NOT_SUBMITTED', 'PENDING_VERIFICATION', 'APPROVED', 'REJECTED', 'SUSPENDED')),
      rejection_reason TEXT,
      float_blocked BOOLEAN NOT NULL DEFAULT FALSE,
      is_online BOOLEAN NOT NULL DEFAULT FALSE,
      rating_avg DOUBLE PRECISION NOT NULL DEFAULT 5.0,
      approved_by UUID,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_operator_kyc_status
    ON operator.profiles (kyc_status, transport_type)
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS operator.kyc_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      operator_id UUID NOT NULL REFERENCES operator.profiles(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL
        CHECK (doc_type IN ('SELFIE', 'NATIONAL_ID', 'DRIVING_LICENSE', 'VEHICLE_FRONT', 'VEHICLE_REAR', 'INSURANCE', 'HELMETS')),
      storage_key TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'image/jpeg',
      status TEXT NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('PENDING_UPLOAD', 'UPLOADED', 'VERIFIED', 'REJECTED')),
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (operator_id, doc_type)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS operator.outbox_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subject TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // =========================================================================
  // 3. GEO SCHEMA EXPANSION (Stone Town Snap Gates + Expanded Unguja Landmarks)
  // =========================================================================
  const extraSnapPoints = [
    ["snap-kiponda", "Ukingo wa Kiponda", "Kiponda Perimeter Edge", -6.1591, 39.1904],
    ["snap-vikokotoni", "Makutano ya Vikokotoni", "Vikokotoni Junction Gate", -6.1628, 39.1961],
    ["snap-jamhuri", "Bustani ya Jamhuri", "Jamhuri Gardens Perimeter", -6.1669, 39.1931],
    ["snap-kelelengombe", "Barabara ya Kelele Square Edge", "Shangani South Access Gate", -6.1671, 39.1874],
  ] as const;

  for (const [id, nameSw, nameEn, lat, lng] of extraSnapPoints) {
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

  // Expanded curated Unguja landmarks, stages (vituo), hospitals, universities & coastal hubs
  const extraLandmarks = [
    // Stone Town & Urban West
    ["lm-mnazi-mmoja-hosp", "Hospitali ya Mnazi Mmoja", "Mnazi Mmoja Referral Hospital", "HOSPITAL", "Stone Town", true, -6.1687, 39.1903],
    ["lm-kikwajuni", "Kikwajuni", "Kikwajuni Residential", "NEIGHBORHOOD", "Urban West", true, -6.1712, 39.1968],
    ["lm-mwembe-ladu", "Mwembe Ladu", "Mwembe Ladu Junction", "KITUO", "Ng'ambo", true, -6.1689, 39.2039],
    ["lm-kwahani", "Kwahani", "Kwahani Stage", "KITUO", "Urban West", true, -6.1755, 39.2082],
    ["lm-amani-stadium", "Uwanja wa Amaan", "Amaan Stadium", "LANDMARK", "Urban West", true, -6.1704, 39.2169],
    ["lm-magomeni", "Magomeni", "Magomeni Roundabout", "KITUO", "Urban West", true, -6.1695, 39.2111],
    ["lm-jangombe", "Jang'ombe", "Jang'ombe Stage", "KITUO", "Urban West", true, -6.1763, 39.2034],
    ["lm-kilimani", "Kilimani", "Kilimani", "NEIGHBORHOOD", "Urban West", false, -6.1835, 39.2055],
    ["lm-mbweni", "Mbweni", "Mbweni Ruins & Coast", "NEIGHBORHOOD", "Urban West", true, -6.2121, 39.2046],
    ["lm-mazizini", "Mazizini", "Mazizini Junction", "KITUO", "Urban West", true, -6.2008, 39.2125],
    ["lm-mombasa-znz", "Mombasa (Zanzibar)", "Mombasa Junction Zanzibar", "KITUO", "Urban West", true, -6.1912, 39.2225],
    ["lm-kiembesamaki", "Kiembe Samaki", "Kiembe Samaki (Near Airport)", "KITUO", "Kisauni", true, -6.2165, 39.2202],
    ["lm-kisauni", "Kisauni", "Kisauni Market", "MARKET", "Kisauni", true, -6.2248, 39.2281],
    ["lm-tomondo", "Tomondo", "Tomondo Stage", "KITUO", "Urban West", true, -6.1995, 39.2335],
    ["lm-meli-nne", "Meli Nne", "Meli Nne Junction", "KITUO", "Urban West", true, -6.1885, 39.2349],
    ["lm-kwerekwe-daladala", "Kituo Kikuu Mwanakwerekwe", "Mwanakwerekwe Main Hub", "KITUO", "Urban West", true, -6.1829, 39.2249],
    ["lm-maruhubi", "Maruhubi", "Maruhubi Palace & Coast", "LANDMARK", "Urban West", true, -6.1432, 39.2067],
    ["lm-saateni", "Saateni", "Saateni Junction", "KITUO", "Urban West", true, -6.1502, 39.2059],
    ["lm-mtoni", "Mtoni", "Mtoni Marine & Stage", "KITUO", "Urban West", true, -6.1292, 39.2124],
    ["lm-kibweni", "Kibweni", "Kibweni Stage", "KITUO", "Bububu", true, -6.1155, 39.2179],
    ["lm-chuini", "Chuini", "Chuini Ruins Road", "NEIGHBORHOOD", "West Coast", false, -6.0772, 39.2128],
    ["lm-kizimbani", "Kizimbani", "Kizimbani Spice Farms", "LANDMARK", "Central", false, -6.0885, 39.2612],
    ["lm-dole", "Dole", "Dole Junction", "KITUO", "Central", true, -6.1241, 39.2673],
    ["lm-mwera", "Mwera", "Mwera Market & Stage", "KITUO", "Central", true, -6.1538, 39.2742],
    ["lm-suza-tunguu", "Chuo Kikuu SUZA (Tunguu)", "SUZA Tunguu Main Campus", "EDUCATION", "Central", true, -6.2089, 39.3278],
    ["lm-zu-tunguu", "Chuo Kikuu cha Zanzibar (ZU)", "Zanzibar University Tunguu", "EDUCATION", "Central", true, -6.2185, 39.3189],
    ["lm-tunguu-jct", "Njia Panda ya Tunguu", "Tunguu Main Junction", "KITUO", "Central", true, -6.2054, 39.3198],
    ["lm-dunga", "Dunga", "Dunga Village Center", "KITUO", "Central", true, -6.1421, 39.3356],
    ["lm-koani", "Koani", "Koani Stage", "KITUO", "Central", true, -6.1319, 39.2981],
    ["lm-mahonda", "Mahonda", "Mahonda Town Center", "KITUO", "North B", true, -5.9958, 39.2564],
    ["lm-mfenesini", "Mfenesini", "Mfenesini Junction", "KITUO", "North B", true, -6.0468, 39.2471],
    ["lm-kinyasini", "Kinyasini", "Kinyasini Market", "MARKET", "North A", true, -5.9682, 39.3119],
    ["lm-mKokotoni", "Mkokotoni", "Mkokotoni Harbor & Market", "KITUO", "North Coast", true, -5.8758, 39.2775],
    ["lm-matemwe", "Matemwe", "Matemwe Village Road", "BEACH", "North-East Coast", true, -5.8691, 39.3548],
    ["lm-pwani-mchangani", "Pwani Mchangani", "Pwani Mchangani Beach Road", "BEACH", "East Coast", true, -5.9154, 39.3665],
    ["lm-pongwe", "Pongwe", "Pongwe Bay Road", "BEACH", "East Coast", false, -6.0389, 39.4235],
    ["lm-uroa", "Uroa", "Uroa Village & Stage", "KITUO", "East Coast", true, -6.0982, 39.4241],
    ["lm-chwaka", "Chwaka", "Chwaka Bay & Market", "KITUO", "East Coast", true, -6.1667, 39.4333],
    ["lm-jozani", "Msitu wa Jozani", "Jozani Forest Gate", "LANDMARK", "South-Central", true, -6.2665, 39.4168],
    ["lm-kitogani", "Kitogani", "Kitogani Roundabout", "KITUO", "South-Central", true, -6.2712, 39.4256],
    ["lm-bwejuu", "Bwejuu", "Bwejuu Village Main Road", "BEACH", "South-East Coast", true, -6.2452, 39.5321],
    ["lm-dongwe", "Dongwe", "Dongwe Coast Road", "BEACH", "South-East Coast", false, -6.1912, 39.5218],
    ["lm-michamvi", "Michamvi", "Michamvi Kae / Pingwe", "BEACH", "South-East Coast", false, -6.1435, 39.4952],
    ["lm-makunduchi", "Makunduchi", "Makunduchi Town Center", "KITUO", "South Coast", true, -6.4165, 39.5461],
    ["lm-mtende", "Mtende", "Mtende Beach Road", "BEACH", "South Coast", false, -6.4589, 39.5322],
    ["lm-kombeni", "Kombeni", "Kombeni Junction", "KITUO", "West Coast", true, -6.2591, 39.2612],
    ["lm-shakani", "Shakani", "Shakani", "NEIGHBORHOOD", "West Coast", false, -6.2462, 39.2421],
    ["lm-fumbe-nyamanzi", "Nyamanzi", "Nyamanzi Village", "KITUO", "West Coast", true, -6.2835, 39.2681],
  ] as const;

  for (const [id, nameSw, nameEn, category, area, isKituo, lat, lng] of extraLandmarks) {
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

  const [snapCount, lmCount] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count FROM geo.snap_points`,
    sql`SELECT COUNT(*)::int AS count FROM geo.landmarks`,
  ]);

  console.log("[Phase 1 Migrate] Complete:", {
    stoneTownSnapPoints: (snapCount[0] as { count: number })?.count,
    ungujaLandmarks: (lmCount[0] as { count: number })?.count,
  });
}

migratePhase1().catch((err) => {
  console.error("[Phase 1 Migrate] Failed:", err);
  process.exit(1);
});
