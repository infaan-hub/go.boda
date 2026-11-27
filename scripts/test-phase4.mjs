import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local so Neon DATABASE_URL & secrets are active
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

process.env.OTP_DEV_ECHO = "true";
process.env.OTP_SKIP_COOLDOWN = "true";

const { getSql } = await import("../packages/db/dist/index.js");
const { default: authApp } = await import("../apps/monolith/src/server/domains/auth/app.ts");
const { default: locationApp } = await import("../apps/monolith/src/server/domains/location/app.ts");
const { default: tripApp } = await import("../apps/monolith/src/server/domains/trip/app.ts");
const { default: dispatchApp } = await import("../apps/monolith/src/server/domains/dispatch/app.ts");
const { default: safetyApp } = await import("../apps/monolith/src/server/domains/safety/app.ts");
const { default: gatewayApp } = await import("../apps/monolith/src/server/gateway/app.ts");

const TEST_CUSTOMER_PHONE = "+255779000401";
const TEST_RIDER_PHONE = "+255779000402";
const TEST_ADMIN_PHONE = "+255779000403";
const TEST_PLATE = "Z 401 P4S";

const createdTripIds = [];
const createdUserIds = [];

async function cleanup() {
  const sql = getSql();
  for (const tid of createdTripIds) {
    await sql`DELETE FROM safety.share_links WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM safety.sos_alerts WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM safety.helmet_compliance_logs WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM safety.outbox_events WHERE payload->>'tripId' = ${tid}`;
    await sql`DELETE FROM dispatch.offers WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM dispatch.trip_locks WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM dispatch.outbox_events WHERE payload->>'tripId' = ${tid}`;
    await sql`DELETE FROM trip.outbox_events WHERE payload->>'tripId' = ${tid}`;
    await sql`DELETE FROM trip.trips WHERE id = ${tid}::uuid`;
  }
  for (const uid of createdUserIds) {
    await sql`DELETE FROM safety.helmet_compliance_logs WHERE operator_id = ${uid}::uuid`;
    await sql`DELETE FROM safety.outbox_events WHERE payload->>'operatorId' = ${uid}`;
    await sql`DELETE FROM location.operator_positions WHERE operator_id = ${uid}::uuid`;
  }
  await sql`DELETE FROM location.operator_positions WHERE plate_number = ${TEST_PLATE}`;
  await sql`DELETE FROM auth.otp_codes WHERE phone IN (${TEST_CUSTOMER_PHONE}, ${TEST_RIDER_PHONE}, ${TEST_ADMIN_PHONE})`;
  await sql`DELETE FROM auth.users WHERE phone IN (${TEST_CUSTOMER_PHONE}, ${TEST_RIDER_PHONE}, ${TEST_ADMIN_PHONE})`;
}

async function loginViaOtp(phone, intendedRole, name) {
  const reqRes = await authApp.inject({
    method: "POST",
    url: "/api/v1/auth/otp/request",
    payload: { phone, channel: "WHATSAPP", locale: "en" },
  });
  assert.equal(reqRes.statusCode, 200);
  const { devOtp } = reqRes.json();

  const verRes = await authApp.inject({
    method: "POST",
    url: "/api/v1/auth/otp/verify",
    payload: { phone, code: devOtp, intendedRole, name },
  });
  assert.equal(verRes.statusCode, 200);
  const session = verRes.json();
  createdUserIds.push(session.user.id);
  return session;
}

async function createBodabodaTrip(customerToken) {
  const res = await tripApp.inject({
    method: "POST",
    url: "/api/v1/trips",
    headers: { authorization: `Bearer ${customerToken}` },
    payload: {
      transportType: "BODABODA",
      pickup: { lat: -6.1649, lng: 39.1936 },
      pickupLabel: "Darajani Market",
      dropoff: { lat: -6.222, lng: 39.2249 },
      dropoffLabel: "Abeid Amani Karume Airport (ZNZ)",
      paymentMethod: "CASH",
    },
  });
  assert.equal(res.statusCode, 201);
  const trip = res.json().trip;
  createdTripIds.push(trip.id);
  return trip;
}

async function runTests() {
  await cleanup();

  try {
    console.log("0. Minting Phase 4 test sessions & setting up active Unguja trip...");
    const customer = await loginViaOtp(TEST_CUSTOMER_PHONE, "CUSTOMER", "Zainab Mussa");
    const rider = await loginViaOtp(TEST_RIDER_PHONE, "BODABODA_RIDER", "Salim Omar");
    const promoteRes = await authApp.inject({
      method: "POST",
      url: "/api/v1/auth/internal/promote-admin",
      headers: {
        "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
      },
      payload: { phone: TEST_ADMIN_PHONE, name: "Go.boda Safety Admin" },
    });
    assert.equal(promoteRes.statusCode, 200);
    const admin = await loginViaOtp(TEST_ADMIN_PHONE, "CUSTOMER", "Go.boda Safety Admin");

    // Put Rider online near Darajani
    const pingRes = await locationApp.inject({
      method: "POST",
      url: "/api/v1/location/ping",
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: {
        transportType: "BODABODA",
        plateNumber: TEST_PLATE,
        homeKituo: "Darajani Stage",
        lat: -6.1652,
        lng: 39.1941,
        isOnline: true,
        isBusy: false,
        ratingAvg: 4.9,
      },
    });
    assert.equal(pingRes.statusCode, 200);

    // Create, dispatch, accept, arrive & PIN-start trip1 -> IN_PROGRESS
    const trip1 = await createBodabodaTrip(customer.accessToken);
    const dispRes = await dispatchApp.inject({
      method: "POST",
      url: "/api/v1/dispatch/start",
      headers: {
        "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
      },
      payload: { tripId: trip1.id, waveSize: 1, includeDemo: false },
    });
    assert.equal(dispRes.statusCode, 200);
    const offerId = dispRes.json().offers[0].id;

    const accRes = await dispatchApp.inject({
      method: "POST",
      url: `/api/v1/dispatch/offers/${offerId}/accept`,
      headers: { authorization: `Bearer ${rider.accessToken}` },
    });
    assert.equal(accRes.statusCode, 200);

    const arrRes = await tripApp.inject({
      method: "POST",
      url: `/api/v1/trips/${trip1.id}/arrive`,
      headers: { authorization: `Bearer ${rider.accessToken}` },
    });
    assert.equal(arrRes.statusCode, 200);

    const startRes = await tripApp.inject({
      method: "POST",
      url: `/api/v1/trips/${trip1.id}/start`,
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: { startPin: trip1.startPin },
    });
    assert.equal(startRes.statusCode, 200);

    // -----------------------------------------------------------------------
    // 1. PUBLIC WHATSAPP SHAREABLE LIVE TRACKING LINK (/track/:shareToken)
    // -----------------------------------------------------------------------
    console.log("1. Testing safety-service shareable WhatsApp live tracking link...");

    const shareRes = await safetyApp.inject({
      method: "POST",
      url: "/api/v1/safety/share-link",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: { tripId: trip1.id, ttlMinutes: 120, locale: "sw" },
    });
    assert.equal(shareRes.statusCode, 201);
    const shareJson = shareRes.json();
    assert.ok(shareJson.shareToken.length >= 12);
    assert.ok(shareJson.whatsappShareUrl.startsWith("https://wa.me/?text="));

    // Public read (no Authorization header!) must succeed & hide PII/PIN
    const trackRes = await safetyApp.inject({
      method: "GET",
      url: `/api/v1/track/${shareJson.shareToken}`,
    });
    assert.equal(trackRes.statusCode, 200);
    const trackJson = trackRes.json();
    assert.equal(trackJson.trip.tripCode, trip1.tripCode);
    assert.equal(trackJson.trip.operatorPlate, TEST_PLATE);
    assert.equal(trackJson.trip.status, "IN_PROGRESS");
    assert.equal(trackJson.trip.startPin, undefined);
    assert.ok(trackJson.livePosition?.lat);
    console.log(
      `   [PASS] Public /track/${shareJson.shareToken} live (plate=${trackJson.trip.operatorPlate}, zero PII exposed)`
    );

    // -----------------------------------------------------------------------
    // 2. IN-TRIP SOS ALERT, PUBLIC BANNER & ADMIN RESOLUTION
    // -----------------------------------------------------------------------
    console.log("2. Testing high-priority SOS trigger, live GPS capture & Admin resolution...");

    const sosRes = await safetyApp.inject({
      method: "POST",
      url: "/api/v1/safety/sos",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: { tripId: trip1.id, reason: "Unsafe speeding near Mwanakwerekwe" },
    });
    assert.equal(sosRes.statusCode, 201);
    const sosAlert = sosRes.json().alert;
    assert.match(sosAlert.alert_code, /^SOS-\d{5}$/);
    assert.equal(sosRes.json().emittedEvent, "safety.sos_triggered");

    // Public tracker immediately reflects SOS_ACTIVE
    const trackSos = await safetyApp.inject({
      method: "GET",
      url: `/api/v1/track/${shareJson.shareToken}`,
    });
    assert.equal(trackSos.statusCode, 200);
    assert.equal(trackSos.json().trip.status, "SOS_ACTIVE");
    assert.equal(trackSos.json().activeSos.alertCode, sosAlert.alert_code);

    // Non-admin blocked from Admin SOS Console
    const custAdminSos = await safetyApp.inject({
      method: "GET",
      url: "/api/v1/safety/admin/sos",
      headers: { authorization: `Bearer ${customer.accessToken}` },
    });
    assert.equal(custAdminSos.statusCode, 403);

    // Admin views & resolves SOS alert
    const adminSosList = await safetyApp.inject({
      method: "GET",
      url: "/api/v1/safety/admin/sos",
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    assert.equal(adminSosList.statusCode, 200);
    assert.ok(adminSosList.json().summary.openCount >= 1);

    const resolveRes = await safetyApp.inject({
      method: "PATCH",
      url: `/api/v1/safety/admin/sos/${sosAlert.id}`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: {
        status: "RESOLVED",
        resolutionNote: "Called Customer & Rider; confirmed safe arrival.",
      },
    });
    assert.equal(resolveRes.statusCode, 200);
    assert.equal(resolveRes.json().emittedEvent, "safety.sos_resolved");

    // Trip status restored to IN_PROGRESS
    const restoredTrip = await tripApp.inject({
      method: "GET",
      url: `/api/v1/trips/${trip1.id}`,
      headers: { authorization: `Bearer ${customer.accessToken}` },
    });
    assert.equal(restoredTrip.json().trip.status, "IN_PROGRESS");

    // Revoking share link expires public access immediately (410)
    const revokeRes = await safetyApp.inject({
      method: "DELETE",
      url: `/api/v1/safety/share-link/${shareJson.shareToken}`,
      headers: { authorization: `Bearer ${customer.accessToken}` },
    });
    assert.equal(revokeRes.statusCode, 200);

    const expiredTrack = await safetyApp.inject({
      method: "GET",
      url: `/api/v1/track/${shareJson.shareToken}`,
    });
    assert.equal(expiredTrack.statusCode, 410);
    console.log(
      `   [PASS] SOS ${sosAlert.alert_code} triggered -> surfaced publicly -> resolved by Admin -> share link revoked (410)`
    );

    // -----------------------------------------------------------------------
    // 3. BODABODA HELMET NON-COMPLIANCE REPEAT-OFFENDER FLAGGING (>= 3)
    // -----------------------------------------------------------------------
    console.log("3. Testing Bodaboda helmet non-compliance counter & repeat-offender flag (>= 3)...");

    const trip2 = await createBodabodaTrip(customer.accessToken);
    const trip3 = await createBodabodaTrip(customer.accessToken);

    const h1 = await safetyApp.inject({
      method: "POST",
      url: "/api/v1/safety/helmet-check",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: { tripId: trip1.id, operatorId: rider.user.id, helmetProvided: false },
    });
    assert.equal(h1.statusCode, 200);
    assert.equal(h1.json().missingCount30d, 1);
    assert.equal(h1.json().flagRaised, false);

    const h2 = await safetyApp.inject({
      method: "POST",
      url: "/api/v1/safety/helmet-check",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: { tripId: trip2.id, operatorId: rider.user.id, helmetProvided: false },
    });
    assert.equal(h2.statusCode, 200);
    assert.equal(h2.json().missingCount30d, 2);
    assert.equal(h2.json().flagRaised, false);

    const h3 = await safetyApp.inject({
      method: "POST",
      url: "/api/v1/safety/helmet-check",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: { tripId: trip3.id, operatorId: rider.user.id, helmetProvided: false },
    });
    assert.equal(h3.statusCode, 200);
    assert.equal(h3.json().missingCount30d, 3);
    assert.equal(h3.json().flagRaised, true);
    assert.equal(h3.json().emittedEvent, "safety.helmet_flag_raised");

    const flagsAdmin = await safetyApp.inject({
      method: "GET",
      url: "/api/v1/safety/admin/helmet-flags",
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    assert.equal(flagsAdmin.statusCode, 200);
    const foundFlag = flagsAdmin
      .json()
      .operators.find((o) => o.operatorId === rider.user.id);
    assert.ok(foundFlag && foundFlag.flaggedForReview === true);
    console.log("   [PASS] 3 missing-helmet reports raised safety.helmet_flag_raised & surfaced in Admin queue");

    // -----------------------------------------------------------------------
    // 4. API-GATEWAY PHASE 4 EDGE RBAC
    // -----------------------------------------------------------------------
    console.log("4. Testing api-gateway Phase 4 Safety RBAC...");

    const gwNoAuthSos = await gatewayApp.inject({
      method: "POST",
      url: "/api/v1/safety/sos",
      payload: {},
    });
    assert.equal(gwNoAuthSos.statusCode, 401);

    const gwCustAdminSos = await gatewayApp.inject({
      method: "GET",
      url: "/api/v1/safety/admin/sos",
      headers: { authorization: `Bearer ${customer.accessToken}` },
    });
    assert.equal(gwCustAdminSos.statusCode, 403);
    console.log("   [PASS] API Gateway enforces Safety & Admin SOS RBAC");

    console.log("\nALL PHASE 4 SAFETY, LIVE-SHARE & HELMET COMPLIANCE TESTS PASSED!");
  } finally {
    await cleanup();
    await Promise.all([
      authApp.close(),
      locationApp.close(),
      tripApp.close(),
      dispatchApp.close(),
      safetyApp.close(),
      gatewayApp.close(),
    ]);
  }
}

runTests().catch((err) => {
  console.error("PHASE 4 TEST FAILED:", err);
  process.exit(1);
});
