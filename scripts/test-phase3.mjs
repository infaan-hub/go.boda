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
const { default: notifApp } = await import("../apps/monolith/src/server/domains/notification/app.ts");
const { default: gatewayApp } = await import("../apps/monolith/src/server/gateway/app.ts");

const TEST_CUSTOMER_PHONE = "+255779000301";
const TEST_RIDER_A_PHONE = "+255779000302";
const TEST_RIDER_B_PHONE = "+255779000303";
const TEST_DRIVER_C_PHONE = "+255779000304";
const TEST_ADMIN_PHONE = "+255779000305";

const PLATE_A = "Z 301 P3A";
const PLATE_B = "Z 302 P3B";
const PLATE_C = "Z 303 P3C";

const createdTripIds = [];
const createdUserIds = [];

async function cleanup() {
  const sql = getSql();
  for (const tid of createdTripIds) {
    await sql`DELETE FROM notif.trip_chat_messages WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM dispatch.offers WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM dispatch.trip_locks WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM dispatch.outbox_events WHERE payload->>'tripId' = ${tid}`;
    await sql`DELETE FROM trip.outbox_events WHERE payload->>'tripId' = ${tid}`;
    await sql`DELETE FROM trip.trips WHERE id = ${tid}::uuid`;
  }
  for (const uid of createdUserIds) {
    await sql`DELETE FROM notif.push_subscriptions WHERE user_id = ${uid}::uuid`;
    await sql`DELETE FROM notif.messages WHERE user_id = ${uid}::uuid`;
    await sql`DELETE FROM location.operator_positions WHERE operator_id = ${uid}::uuid`;
  }
  await sql`DELETE FROM location.operator_positions WHERE plate_number IN (${PLATE_A}, ${PLATE_B}, ${PLATE_C})`;
  await sql`DELETE FROM auth.otp_codes WHERE phone IN (${TEST_CUSTOMER_PHONE}, ${TEST_RIDER_A_PHONE}, ${TEST_RIDER_B_PHONE}, ${TEST_DRIVER_C_PHONE}, ${TEST_ADMIN_PHONE})`;
  await sql`DELETE FROM auth.users WHERE phone IN (${TEST_CUSTOMER_PHONE}, ${TEST_RIDER_A_PHONE}, ${TEST_RIDER_B_PHONE}, ${TEST_DRIVER_C_PHONE}, ${TEST_ADMIN_PHONE})`;
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

async function pingOperator(token, payload) {
  const res = await locationApp.inject({
    method: "POST",
    url: "/api/v1/location/ping",
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
  assert.equal(res.statusCode, 200);
}

async function runTests() {
  await cleanup();

  try {
    console.log("0. Minting Phase 3 test sessions (Customer, Rider A, Rider B, Bajaji Driver C, Admin)...");
    const customer = await loginViaOtp(TEST_CUSTOMER_PHONE, "CUSTOMER", "Fatma Omar");
    const riderA = await loginViaOtp(TEST_RIDER_A_PHONE, "BODABODA_RIDER", "Ali Juma");
    const riderB = await loginViaOtp(TEST_RIDER_B_PHONE, "BODABODA_RIDER", "Musa Said");
    const driverC = await loginViaOtp(TEST_DRIVER_C_PHONE, "BAJAJI_DRIVER", "Khamis Bakari");

    const promoteRes = await authApp.inject({
      method: "POST",
      url: "/api/v1/auth/internal/promote-admin",
      headers: {
        "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
      },
      payload: { phone: TEST_ADMIN_PHONE, name: "Go.boda Phase3 Admin" },
    });
    assert.equal(promoteRes.statusCode, 200);
    const admin = await loginViaOtp(TEST_ADMIN_PHONE, "CUSTOMER", "Go.boda Phase3 Admin");
    assert.equal(admin.user.role, "ADMIN");

    // Position operators on Unguja around Stone Town / Forodhani Edge (-6.1613, 39.1885):
    // - Bajaji Driver C: ~100m away (wrong transport pool for BODABODA trip!)
    // - Bodaboda Rider A: ~350m away (within 1.5km ring)
    // - Bodaboda Rider B: ~2.4km away (outside 1.5km, inside 3.0km expanding ring!)
    await pingOperator(driverC.accessToken, {
      transportType: "BAJAJI",
      plateNumber: PLATE_C,
      homeKituo: "Forodhani Edge",
      lat: -6.1615,
      lng: 39.1892,
      isOnline: true,
      isBusy: false,
      ratingAvg: 5.0,
    });
    await pingOperator(riderA.accessToken, {
      transportType: "BODABODA",
      plateNumber: PLATE_A,
      homeKituo: "Darajani Stage",
      lat: -6.1635,
      lng: 39.1908,
      isOnline: true,
      isBusy: false,
      ratingAvg: 4.9,
    });
    await pingOperator(riderB.accessToken, {
      transportType: "BODABODA",
      plateNumber: PLATE_B,
      homeKituo: "Amani Stadium",
      lat: -6.1785,
      lng: 39.2035,
      isOnline: true,
      isBusy: false,
      ratingAvg: 4.85,
    });

    // -----------------------------------------------------------------------
    // 1. TRIP CREATION & UNGUJA GEOFENCE + STONE TOWN SMART SNAP
    // -----------------------------------------------------------------------
    console.log("1. Testing trip-service creation, Unguja geofence & Stone Town Smart Snap...");

    const outsideTrip = await tripApp.inject({
      method: "POST",
      url: "/api/v1/trips",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: {
        transportType: "BODABODA",
        pickup: { lat: -5.2459, lng: 39.77 }, // Pemba Island
        pickupLabel: "Chake Chake, Pemba",
        dropoff: { lat: -6.1649, lng: 39.1936 },
        dropoffLabel: "Darajani",
        paymentMethod: "CASH",
      },
    });
    assert.equal(outsideTrip.statusCode, 422);
    assert.equal(outsideTrip.json().error, "OUTSIDE_UNGUJA_SERVICE_AREA");

    const createTripRes = await tripApp.inject({
      method: "POST",
      url: "/api/v1/trips",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: {
        transportType: "BODABODA",
        pickup: { lat: -6.1622, lng: 39.1895 }, // Interior Stone Town alley -> Smart Snap!
        pickupLabel: "Hurumzi Alley, Stone Town",
        pickupNote: "Near the spice shop",
        dropoff: { lat: -6.222, lng: 39.2249 }, // ZNZ Airport
        dropoffLabel: "Abeid Amani Karume Airport (ZNZ)",
        paymentMethod: "CASH",
        promoCode: "KARIBUUNGUJA",
      },
    });
    assert.equal(createTripRes.statusCode, 201);
    const trip1 = createTripRes.json().trip;
    createdTripIds.push(trip1.id);
    assert.equal(trip1.status, "SEARCHING");
    assert.equal(trip1.pickup.snapped, true);
    assert.equal(trip1.operatorTitle, "RIDER");
    assert.match(trip1.startPin, /^\d{4}$/);
    assert.equal(trip1.pricing.estimatedFareTzs % 500, 0);
    assert.ok(trip1.pricing.discountTzs > 0);
    console.log(
      `   [PASS] Trip ${trip1.tripCode} created (Smart Snap -> ${trip1.pickup.snapGateName}, PIN=${trip1.startPin}, TZS ${trip1.pricing.estimatedFareTzs})`
    );

    // -----------------------------------------------------------------------
    // 2. EXPANDING-RADIUS DISPATCH, POOL ISOLATION & DECLINE AUTO-REQUEUE
    // -----------------------------------------------------------------------
    console.log("2. Testing dispatch-service expanding radius (1.5km -> 3km), strict pool isolation & decline requeue...");

    const dispatch1 = await dispatchApp.inject({
      method: "POST",
      url: "/api/v1/dispatch/start",
      headers: {
        "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
      },
      payload: {
        tripId: trip1.id,
        waveSize: 1,
        includeDemo: false,
      },
    });
    assert.equal(dispatch1.statusCode, 200);
    const d1Json = dispatch1.json();
    assert.equal(d1Json.status, "OFFERED");
    assert.equal(d1Json.radiusKm, 1.5);
    assert.equal(d1Json.offers.length, 1);
    // MUST pick Bodaboda Rider A, NEVER closer Bajaji Driver C!
    assert.equal(d1Json.offers[0].operator_id, riderA.user.id);

    // Rider A sees pending offer
    const pendingA = await dispatchApp.inject({
      method: "GET",
      url: "/api/v1/dispatch/offers/pending",
      headers: { authorization: `Bearer ${riderA.accessToken}` },
    });
    assert.equal(pendingA.statusCode, 200);
    assert.equal(pendingA.json().count, 1);
    const offer1Id = pendingA.json().offers[0].id;

    // Rider A declines -> auto-requeues expanding radius to 3.0km -> offers to Rider B!
    const declineRes = await dispatchApp.inject({
      method: "POST",
      url: `/api/v1/dispatch/offers/${offer1Id}/decline`,
      headers: { authorization: `Bearer ${riderA.accessToken}` },
      payload: { includeDemo: false },
    });
    assert.equal(declineRes.statusCode, 200);
    const decJson = declineRes.json();
    assert.equal(decJson.declined, true);
    assert.equal(decJson.requeueResult.status, "OFFERED");
    assert.equal(decJson.requeueResult.radiusKm, 3);
    assert.equal(decJson.requeueResult.offers[0].operator_id, riderB.user.id);
    const offerForRiderBId = decJson.requeueResult.offers[0].id;
    console.log(
      "   [PASS] Strict BODABODA pool isolated from Bajaji Driver; Rider A decline auto-expanded 1.5km -> 3.0km to Rider B"
    );

    // -----------------------------------------------------------------------
    // 3. CONCURRENCY TEST: SIMULTANEOUS ACCEPT ATOMIC LOCK (Promise.all)
    // -----------------------------------------------------------------------
    console.log("3. Testing simultaneous Accept concurrency lock (2 Riders racing via Promise.all)...");

    // Move Rider B close to Darajani so both Rider A & Rider B are in the same 1.5km wave for trip2
    await pingOperator(riderB.accessToken, {
      transportType: "BODABODA",
      plateNumber: PLATE_B,
      homeKituo: "Darajani",
      lat: -6.1642,
      lng: 39.1932,
      isOnline: true,
      isBusy: false,
      ratingAvg: 4.85,
    });

    const createTrip2 = await tripApp.inject({
      method: "POST",
      url: "/api/v1/trips",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: {
        transportType: "BODABODA",
        pickup: { lat: -6.1649, lng: 39.1936 },
        pickupLabel: "Darajani Market",
        dropoff: { lat: -6.158, lng: 39.1885 },
        dropoffLabel: "Zanzibar Ferry Terminal",
        paymentMethod: "MOBILE_MONEY",
      },
    });
    assert.equal(createTrip2.statusCode, 201);
    const trip2 = createTrip2.json().trip;
    createdTripIds.push(trip2.id);

    const wave2 = await dispatchApp.inject({
      method: "POST",
      url: "/api/v1/dispatch/start",
      headers: {
        "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
      },
      payload: {
        tripId: trip2.id,
        waveSize: 2,
        includeDemo: false,
      },
    });
    assert.equal(wave2.statusCode, 200);
    const raceOffers = wave2.json().offers;
    assert.equal(raceOffers.length, 2);

    const offerForA = raceOffers.find((o) => o.operator_id === riderA.user.id);
    const offerForB = raceOffers.find((o) => o.operator_id === riderB.user.id);
    assert.ok(offerForA && offerForB);

    // Fire BOTH accept calls concurrently!
    const [raceResA, raceResB] = await Promise.all([
      dispatchApp.inject({
        method: "POST",
        url: `/api/v1/dispatch/offers/${offerForA.id}/accept`,
        headers: { authorization: `Bearer ${riderA.accessToken}` },
      }),
      dispatchApp.inject({
        method: "POST",
        url: `/api/v1/dispatch/offers/${offerForB.id}/accept`,
        headers: { authorization: `Bearer ${riderB.accessToken}` },
      }),
    ]);

    const statusCodes = [raceResA.statusCode, raceResB.statusCode].sort();
    assert.deepEqual(statusCodes, [200, 409]);
    const winner = raceResA.statusCode === 200 ? riderA : riderB;
    const loserRes = raceResA.statusCode === 409 ? raceResA : raceResB;
    assert.equal(loserRes.json().error, "TRIP_ALREADY_ASSIGNED");
    console.log(
      `   [PASS] Concurrency race verified: 1 winner (200 OK) & 1 loser (409 TRIP_ALREADY_ASSIGNED)`
    );

    // Winner cancels trip2 post-accept -> lock released & trip requeues to SEARCHING!
    const opCancelRes = await tripApp.inject({
      method: "POST",
      url: `/api/v1/trips/${trip2.id}/cancel`,
      headers: { authorization: `Bearer ${winner.accessToken}` },
      payload: { reason: "Mechanical check", requeue: true },
    });
    assert.equal(opCancelRes.statusCode, 200);
    assert.equal(opCancelRes.json().requeued, true);
    assert.equal(opCancelRes.json().trip.status, "SEARCHING");
    console.log("   [PASS] Post-accept Operator cancel released atomic lock & requeued trip2 to SEARCHING");

    // -----------------------------------------------------------------------
    // 4. FULL TRIP LIFECYCLE SAGA + 4-DIGIT PIN + RECEIPT + HELMET RATING
    // -----------------------------------------------------------------------
    console.log("4. Testing trip-service State Machine, PIN security, digital receipt & helmet rating...");

    // Rider B accepts trip1
    const acceptTrip1 = await dispatchApp.inject({
      method: "POST",
      url: `/api/v1/dispatch/offers/${offerForRiderBId}/accept`,
      headers: { authorization: `Bearer ${riderB.accessToken}` },
    });
    assert.equal(acceptTrip1.statusCode, 200);
    assert.equal(acceptTrip1.json().assigned, true);

    // Rider B viewing trip1 must NOT see Customer's startPin!
    const riderView = await tripApp.inject({
      method: "GET",
      url: `/api/v1/trips/${trip1.id}`,
      headers: { authorization: `Bearer ${riderB.accessToken}` },
    });
    assert.equal(riderView.statusCode, 200);
    assert.equal(riderView.json().trip.startPin, null);
    assert.equal(riderView.json().trip.status, "ASSIGNED");

    // Cannot start trip before arriving at pickup
    const prematureStart = await tripApp.inject({
      method: "POST",
      url: `/api/v1/trips/${trip1.id}/start`,
      headers: { authorization: `Bearer ${riderB.accessToken}` },
      payload: { startPin: trip1.startPin },
    });
    assert.equal(prematureStart.statusCode, 409);
    assert.equal(prematureStart.json().error, "INVALID_STATE_TRANSITION");

    // Rider B arrives at pickup gate
    const arriveRes = await tripApp.inject({
      method: "POST",
      url: `/api/v1/trips/${trip1.id}/arrive`,
      headers: { authorization: `Bearer ${riderB.accessToken}` },
    });
    assert.equal(arriveRes.statusCode, 200);
    assert.equal(arriveRes.json().trip.status, "ARRIVED_AT_PICKUP");

    // Wrong 4-digit PIN must be rejected
    const wrongPin = trip1.startPin === "0000" ? "1111" : "0000";
    const badPinRes = await tripApp.inject({
      method: "POST",
      url: `/api/v1/trips/${trip1.id}/start`,
      headers: { authorization: `Bearer ${riderB.accessToken}` },
      payload: { startPin: wrongPin },
    });
    assert.equal(badPinRes.statusCode, 400);
    assert.equal(badPinRes.json().error, "INVALID_START_PIN");

    // Valid 4-digit PIN starts the trip
    const goodPinRes = await tripApp.inject({
      method: "POST",
      url: `/api/v1/trips/${trip1.id}/start`,
      headers: { authorization: `Bearer ${riderB.accessToken}` },
      payload: { startPin: trip1.startPin },
    });
    assert.equal(goodPinRes.statusCode, 200);
    assert.equal(goodPinRes.json().trip.status, "IN_PROGRESS");

    // Complete trip -> COMPLETED_UNPAID + Digital Receipt
    const completeRes = await tripApp.inject({
      method: "POST",
      url: `/api/v1/trips/${trip1.id}/complete`,
      headers: { authorization: `Bearer ${riderB.accessToken}` },
    });
    assert.equal(completeRes.statusCode, 200);
    const compJson = completeRes.json();
    assert.equal(compJson.trip.status, "COMPLETED_UNPAID");
    assert.equal(compJson.receipt.commissionPct, 12);
    assert.equal(
      compJson.receipt.commissionTzs + compJson.receipt.operatorNetTzs,
      compJson.receipt.grossFareTzs
    );

    // Customer rates Bodaboda Rider + helmet compliance
    const rateRes = await tripApp.inject({
      method: "POST",
      url: `/api/v1/trips/${trip1.id}/rate`,
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: { stars: 5, helmetProvided: true, comment: "Clean helmet, smooth ride!" },
    });
    assert.equal(rateRes.statusCode, 200);
    assert.equal(rateRes.json().helmetFlagged, false);

    // Admin overview
    const adminOverview = await tripApp.inject({
      method: "GET",
      url: "/api/v1/trips/admin/overview",
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    assert.equal(adminOverview.statusCode, 200);
    console.log(
      `   [PASS] Full trip saga verified (ASSIGNED -> ARRIVED -> PIN -> IN_PROGRESS -> COMPLETED_UNPAID | Receipt TZS ${compJson.receipt.finalFareTzs}, Net TZS ${compJson.receipt.operatorNetTzs})`
    );

    // -----------------------------------------------------------------------
    // 5. NOTIFICATION-SERVICE (VAPID Subscription, Alerts & Bilingual Quick-Chat)
    // -----------------------------------------------------------------------
    console.log("5. Testing notification-service (Web Push subscription, alert dispatch & bilingual quick-chat)...");

    const subRes = await notifApp.inject({
      method: "POST",
      url: "/api/v1/notifications/subscriptions",
      headers: { authorization: `Bearer ${riderB.accessToken}` },
      payload: {
        endpoint: `https://push.example.test/sub/${riderB.user.id}`,
        keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQ", auth: "tBHItJI5svbpez7KI4CCXg" },
        userAgent: "Go.boda Partner PWA Test",
      },
    });
    assert.equal(subRes.statusCode, 201);

    const sendRes = await notifApp.inject({
      method: "POST",
      url: "/api/v1/notifications/internal/send",
      headers: {
        "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
      },
      payload: {
        userId: riderB.user.id,
        channel: "WEB_PUSH",
        eventSubject: "dispatch.offer_sent",
        locale: "sw",
        title: "Ombi Jipya la Safari!",
        body: "Forodhani Edge -> ZNZ Airport (TZS 4,500)",
        payload: { tripId: trip1.id },
      },
    });
    assert.equal(sendRes.statusCode, 201);
    assert.ok(sendRes.json().matchedSubscriptions >= 1);

    const inboxRes = await notifApp.inject({
      method: "GET",
      url: "/api/v1/notifications/me",
      headers: { authorization: `Bearer ${riderB.accessToken}` },
    });
    assert.equal(inboxRes.statusCode, 200);
    assert.ok(inboxRes.json().count >= 1);

    const presetsRes = await notifApp.inject({
      method: "GET",
      url: "/api/v1/notifications/chat/presets",
    });
    assert.equal(presetsRes.statusCode, 200);
    assert.equal(presetsRes.json().count, 6);

    const chatOp = await notifApp.inject({
      method: "POST",
      url: `/api/v1/notifications/chat/${trip1.id}`,
      headers: { authorization: `Bearer ${riderB.accessToken}` },
      payload: { presetKey: "ON_THE_WAY" },
    });
    assert.equal(chatOp.statusCode, 201);

    const chatCust = await notifApp.inject({
      method: "POST",
      url: `/api/v1/notifications/chat/${trip1.id}`,
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: { presetKey: "STONE_TOWN_WALK" },
    });
    assert.equal(chatCust.statusCode, 201);

    const chatThread = await notifApp.inject({
      method: "GET",
      url: `/api/v1/notifications/chat/${trip1.id}`,
      headers: { authorization: `Bearer ${customer.accessToken}` },
    });
    assert.equal(chatThread.statusCode, 200);
    assert.equal(chatThread.json().count, 2);
    assert.ok(chatThread.json().messages[0].bodySw.length > 0);
    assert.ok(chatThread.json().messages[0].bodyEn.length > 0);
    console.log("   [PASS] VAPID subscription, Web Push dispatch & bilingual quick-chat verified");

    // -----------------------------------------------------------------------
    // 6. API-GATEWAY PHASE 3 EDGE RBAC & INTERNAL ROUTE ISOLATION
    // -----------------------------------------------------------------------
    console.log("6. Testing api-gateway Phase 3 edge RBAC & internal route blocking...");

    const gwInternalBlocked = await gatewayApp.inject({
      method: "POST",
      url: `/api/v1/trips/internal/${trip1.id}/assign`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: {},
    });
    assert.equal(gwInternalBlocked.statusCode, 403);
    assert.equal(gwInternalBlocked.json().error, "INTERNAL_ROUTE_FORBIDDEN");

    const gwNoAuthTrips = await gatewayApp.inject({
      method: "GET",
      url: "/api/v1/trips",
    });
    assert.equal(gwNoAuthTrips.statusCode, 401);

    const gwCustOffers = await gatewayApp.inject({
      method: "GET",
      url: "/api/v1/dispatch/offers/pending",
      headers: { authorization: `Bearer ${customer.accessToken}` },
    });
    assert.equal(gwCustOffers.statusCode, 403);
    console.log("   [PASS] API Gateway blocks public /internal/* routes & enforces Trip/Dispatch RBAC");

    console.log("\nALL PHASE 3 INTEGRATION & CONCURRENCY TESTS PASSED!");
  } finally {
    await cleanup();
    await Promise.all([
      authApp.close(),
      locationApp.close(),
      tripApp.close(),
      dispatchApp.close(),
      notifApp.close(),
      gatewayApp.close(),
    ]);
  }
}

runTests().catch((err) => {
  console.error("PHASE 3 TEST FAILED:", err);
  process.exit(1);
});
