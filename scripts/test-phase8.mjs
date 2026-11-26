import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local so Neon DATABASE_URL & JWT_SECRET are active
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

const { getSql } = await import("../packages/db/dist/index.js");
const { signAccessToken } = await import("../services/auth-service/dist/crypto.js");

const PILOT_ADMIN_PHONE = "+255770000112";
const TEST_RIDER_PHONE = "+255779000802";
const TEST_PLATE = "Z 802 P8X";

const PORTS = {
  customer: 3110,
  partner: 3111,
  admin: 3112,
};

const children = [];
let createdTripId = null;
let createdRiderUserId = null;

function startNextApp(appDir, port) {
  const nextBin = resolve(process.cwd(), appDir, "node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: resolve(process.cwd(), appDir),
    env: {
      ...process.env,
      NODE_ENV: "production",
      OTP_DEV_ECHO: "true",
      OTP_SKIP_COOLDOWN: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  return child;
}

async function waitForHttp(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status > 0) return;
    } catch {
      // still booting
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function extractCookie(res, name) {
  const raw = res.headers.get("set-cookie") || "";
  const match = raw.match(new RegExp(`${name}=([^;]+)`));
  return match ? `${name}=${match[1]}` : null;
}

async function cleanup() {
  const sql = getSql();
  if (createdTripId) {
    await sql`DELETE FROM finance.ledger_entries WHERE trip_id = ${createdTripId}::uuid`;
    await sql`DELETE FROM finance.payments WHERE trip_id = ${createdTripId}::uuid`;
    await sql`DELETE FROM safety.helmet_compliance_logs WHERE trip_id = ${createdTripId}::uuid`;
    await sql`DELETE FROM safety.sos_alerts WHERE trip_id = ${createdTripId}::uuid`;
    await sql`DELETE FROM safety.share_links WHERE trip_id = ${createdTripId}::uuid`;
    await sql`DELETE FROM dispatch.offers WHERE trip_id = ${createdTripId}::uuid`;
    await sql`DELETE FROM dispatch.trip_locks WHERE trip_id = ${createdTripId}::uuid`;
    await sql`DELETE FROM trip.ratings WHERE trip_id = ${createdTripId}::uuid`;
    await sql`DELETE FROM trip.trips WHERE id = ${createdTripId}::uuid`;
  }
  if (createdRiderUserId) {
    await sql`
      DELETE FROM finance.ledger_entries
      WHERE journal_id IN (
        SELECT DISTINCT journal_id FROM finance.ledger_entries WHERE owner_id = ${createdRiderUserId}::uuid
      )
    `;
    await sql`DELETE FROM finance.wallet_accounts WHERE owner_id = ${createdRiderUserId}::uuid`;
    await sql`DELETE FROM location.operator_positions WHERE operator_id = ${createdRiderUserId}::uuid`;
    await sql`DELETE FROM operator.profiles WHERE user_id = ${createdRiderUserId}::uuid`;
  }
  await sql`
    UPDATE finance.wallet_accounts a
    SET balance_tzs = COALESCE(
      (SELECT SUM(delta_tzs) FROM finance.ledger_entries e WHERE e.account_id = a.id),
      0
    )
    WHERE owner_id = '00000000-0000-4000-8000-000000000000'::uuid
  `;
  await sql`DELETE FROM operator.profiles WHERE plate_number = ${TEST_PLATE}`;
  await sql`DELETE FROM location.operator_positions WHERE plate_number = ${TEST_PLATE}`;
  await sql`DELETE FROM auth.otp_codes WHERE phone IN (${PILOT_ADMIN_PHONE}, ${TEST_RIDER_PHONE})`;
  await sql`DELETE FROM auth.users WHERE phone = ${TEST_RIDER_PHONE}`;
}

async function runTests() {
  await cleanup();

  console.log("0. Booting built Next.js production servers (customer-web, partner-pwa, admin-web)...");
  startNextApp("apps/customer-web", PORTS.customer);
  startNextApp("apps/partner-pwa", PORTS.partner);
  startNextApp("apps/admin-web", PORTS.admin);

  const custUrl = `http://127.0.0.1:${PORTS.customer}`;
  const partUrl = `http://127.0.0.1:${PORTS.partner}`;
  const admUrl = `http://127.0.0.1:${PORTS.admin}`;

  try {
    await Promise.all([
      waitForHttp(`${custUrl}/en`),
      waitForHttp(`${partUrl}/sw`),
      waitForHttp(`${admUrl}/api/ops/auth/me`),
    ]);

    // -----------------------------------------------------------------------
    // 1. ADMIN AUTH GATE (401 UNAUTHENTICATED, 403 NON-ADMIN, 200 OTP COOKIE)
    // -----------------------------------------------------------------------
    console.log("1. Testing Admin Auth Gate (401 lock, 403 non-admin, HttpOnly OTP cookie login)...");

    const lockedOverview = await fetch(`${admUrl}/api/ops/overview`);
    assert.equal(lockedOverview.status, 401, "Unauthenticated /api/ops/overview MUST return 401");

    // Mint a CUSTOMER JWT and prove /api/ops/overview rejects it 403
    const custJwt = await signAccessToken({
      sub: "11111111-1111-4111-8111-111111111111",
      role: "CUSTOMER",
      phone: "+255779999999",
    });

    const forbiddenOverview = await fetch(`${admUrl}/api/ops/overview`, {
      headers: { authorization: `Bearer ${custJwt}` },
    });
    assert.equal(forbiddenOverview.status, 403, "CUSTOMER JWT MUST be rejected 403 on /api/ops/overview");

    // Non-admin phone rejected 403 on OTP request
    const nonAdminOtp = await fetch(`${admUrl}/api/ops/auth/otp/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "+255779999999" }),
    });
    assert.equal(nonAdminOtp.status, 403);

    // Real Pilot Ops Admin OTP request & verify -> HttpOnly cookie
    const otpReq = await fetch(`${admUrl}/api/ops/auth/otp/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: PILOT_ADMIN_PHONE }),
    });
    assert.equal(otpReq.status, 200);
    const { pilotOtp } = await otpReq.json();
    assert.match(pilotOtp, /^\d{6}$/);

    const otpVer = await fetch(`${admUrl}/api/ops/auth/otp/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: PILOT_ADMIN_PHONE, code: pilotOtp }),
    });
    assert.equal(otpVer.status, 200);
    const adminCookie = extractCookie(otpVer, "goboda_admin_session");
    assert.ok(adminCookie, "Admin verify must set goboda_admin_session HttpOnly cookie");

    const unlockedOverview = await fetch(`${admUrl}/api/ops/overview`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(unlockedOverview.status, 200);
    const ovJson = await unlockedOverview.json();
    assert.equal(ovJson.dbHealth.connected, true);
    console.log("   [PASS] Admin Auth Gate enforces 401/403 and unlocks via signed HttpOnly OTP cookie");

    // -----------------------------------------------------------------------
    // 2. LIVE CROSS-APP FLOW: PARTNER PWA <-> ADMIN WEB <-> CUSTOMER WEB
    // -----------------------------------------------------------------------
    console.log("2. Testing real cross-app flow (Partner KYC -> Admin Approve -> Go Online -> Customer Book -> Complete -> Share -> SOS -> Resolve)...");

    // 2a. Partner signs in & submits real KYC into Neon
    const partAuthRes = await fetch(`${partUrl}/api/partner/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: TEST_RIDER_PHONE,
        name: "Khamis Vuai",
        transportType: "BODABODA",
      }),
    });
    assert.equal(partAuthRes.status, 200);
    const partAuthJson = await partAuthRes.json();
    createdRiderUserId = partAuthJson.partner.id;
    const partnerCookie = extractCookie(partAuthRes, "goboda_partner_session");
    assert.ok(partnerCookie);

    const kycRes = await fetch(`${partUrl}/api/partner/onboarding`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: partnerCookie },
      body: JSON.stringify({
        transportType: "BODABODA",
        fullName: "Khamis Vuai",
        homeKituo: "Darajani Gate",
        nationalIdNo: "ZNZ-19920411-8802",
        licenseNo: "ZN-DL-80200",
        licenseExpiry: "2029-12-31",
        plateNumber: TEST_PLATE,
        vehicleModel: "Boxer BM150",
        vehicleColor: "Blue",
        insuranceExpiry: "2028-06-30",
      }),
    });
    assert.equal(kycRes.status, 201);
    const operatorProfileId = (await kycRes.json()).profile.id;

    // Unapproved Rider blocked 403 from going online
    const blockedOnline = await fetch(`${partUrl}/api/partner/availability`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: partnerCookie },
      body: JSON.stringify({ isOnline: true, lat: -6.1649, lng: 39.1936 }),
    });
    assert.equal(blockedOnline.status, 403);

    // 2b. Admin approves Rider in admin-web
    const apprRes = await fetch(`${admUrl}/api/ops/operators/${operatorProfileId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ decision: "APPROVED", helmetVerified: true }),
    });
    assert.equal(apprRes.status, 200);

    // Pemba GPS blocked 422, Darajani Unguja GPS succeeds 200
    const pembaOnline = await fetch(`${partUrl}/api/partner/availability`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: partnerCookie },
      body: JSON.stringify({ isOnline: true, lat: -5.2458, lng: 39.7666 }),
    });
    assert.equal(pembaOnline.status, 422);

    const ungujaOnline = await fetch(`${partUrl}/api/partner/availability`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: partnerCookie },
      body: JSON.stringify({ isOnline: true, lat: -6.1649, lng: 39.1936 }),
    });
    assert.equal(ungujaOnline.status, 200);

    // 2c. Customer books real Stone Town -> ZNZ Airport trip in customer-web
    const bookRes = await fetch(`${custUrl}/api/trips`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        transportType: "BODABODA",
        pickup: { lat: -6.1622, lng: 39.1892 }, // Stone Town pedestrian alley -> Smart Snap!
        pickupLabel: "Hurumzi Alley, Stone Town",
        dropoff: { lat: -6.222, lng: 39.2249 },
        dropoffLabel: "ZNZ Airport",
        paymentMethod: "CASH",
      }),
    });
    assert.equal(bookRes.status, 201);
    const bookJson = await bookRes.json();
    createdTripId = bookJson.trip.id;
    assert.equal(bookJson.trip.pickupSnapped, true);
    assert.ok(bookJson.offersDispatched >= 1);

    // 2d. Partner sees live offer in /api/partner/state & accepts, arrives, starts with PIN
    const stateRes = await fetch(`${partUrl}/api/partner/state`, {
      headers: { cookie: partnerCookie },
    });
    assert.equal(stateRes.status, 200);
    const stateJson = await stateRes.json();
    const myOffer = stateJson.pendingOffers.find((o) => o.tripId === createdTripId);
    assert.ok(myOffer, "Rider must receive the live Customer dispatch offer");

    assert.equal(
      (
        await fetch(`${partUrl}/api/partner/trip-action`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: partnerCookie },
          body: JSON.stringify({ action: "ACCEPT_OFFER", offerId: myOffer.id }),
        })
      ).status,
      200
    );
    assert.equal(
      (
        await fetch(`${partUrl}/api/partner/trip-action`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: partnerCookie },
          body: JSON.stringify({ action: "ARRIVE", tripId: createdTripId }),
        })
      ).status,
      200
    );
    assert.equal(
      (
        await fetch(`${partUrl}/api/partner/trip-action`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: partnerCookie },
          body: JSON.stringify({
            action: "START",
            tripId: createdTripId,
            startPin: bookJson.trip.startPin,
          }),
        })
      ).status,
      200
    );

    // 2e. Customer creates REAL WhatsApp share link & verifies public /api/track/:token
    const shareRes = await fetch(`${custUrl}/api/trips/${createdTripId}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: "sw" }),
    });
    assert.equal(shareRes.status, 201);
    const { shareToken } = await shareRes.json();

    const trackRes = await fetch(`${custUrl}/api/track/${shareToken}`);
    assert.equal(trackRes.status, 200);
    assert.equal((await trackRes.json()).trip.operatorPlate, TEST_PLATE);

    // 2f. Customer triggers REAL SOS -> Admin sees & resolves -> Rider completes Cash trip -> Zero Drift!
    const sosRes = await fetch(`${custUrl}/api/trips/${createdTripId}/sos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "Phase 8 cross-app SOS check" }),
    });
    assert.equal(sosRes.status, 201);
    const alertId = (await sosRes.json()).alert.id;

    const resolveRes = await fetch(`${admUrl}/api/ops/sos/${alertId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ status: "RESOLVED", resolutionNote: "Verified safe" }),
    });
    assert.equal(resolveRes.status, 200);

    const completeRes = await fetch(`${partUrl}/api/partner/trip-action`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: partnerCookie },
      body: JSON.stringify({ action: "COMPLETE_CASH", tripId: createdTripId }),
    });
    assert.equal(completeRes.status, 200);

    // Customer submits 5-star + helmet rating
    const rateRes = await fetch(`${custUrl}/api/trips/${createdTripId}/rate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stars: 5, helmetProvided: true, comment: "Safiri salama!" }),
    });
    assert.equal(rateRes.status, 200);

    // Final Admin Overview check: Zero-Drift Double-Entry Ledger!
    const finalOverview = await (
      await fetch(`${admUrl}/api/ops/overview`, { headers: { cookie: adminCookie } })
    ).json();
    assert.equal(finalOverview.kpis.ledgerBalanced, true);
    assert.equal(finalOverview.kpis.totalLedgerDriftTzs, 0);

    console.log(
      "   [PASS] Real cross-app Customer <-> Partner <-> Admin persistence & zero-drift Cash settlement PASSED!"
    );
    console.log("\nALL PHASE 8 ADMIN AUTH GATE & LIVE CROSS-APP TESTS PASSED!");
  } finally {
    for (const c of children) {
      c.kill("SIGTERM");
    }
    await cleanup();
  }
}

runTests().catch((err) => {
  console.error("PHASE 8 TEST FAILED:", err);
  for (const c of children) {
    c.kill("SIGTERM");
  }
  process.exit(1);
});
