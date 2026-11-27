import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
const { default: pricingApp } = await import("../apps/monolith/src/server/domains/pricing/app.ts");
const { default: gatewayApp } = await import("../apps/monolith/src/server/gateway/app.ts");

const TEST_CUSTOMER_PHONE = "+255779000201";
const TEST_RIDER_PHONE = "+255779000202";
const TEST_ADMIN_PHONE = "+255779000203";
const TEST_PLATE = "Z 998 P2T";
const TEST_TRIP_ID = randomUUID();
const TEST_PROMO_CODE = "PHASE2TEST";

let originalBodaWaitFee = null;

async function cleanup() {
  const sql = getSql();
  await sql`DELETE FROM location.trip_breadcrumbs WHERE trip_id = ${TEST_TRIP_ID}::uuid`;
  await sql`DELETE FROM location.operator_positions WHERE plate_number = ${TEST_PLATE}`;
  await sql`DELETE FROM pricing.promo_codes WHERE code = ${TEST_PROMO_CODE}`;
  if (originalBodaWaitFee !== null) {
    await sql`
      UPDATE pricing.tariffs
      SET wait_fee_per_min_tzs = ${originalBodaWaitFee}
      WHERE transport_type = 'BODABODA'
    `;
  }
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
  return verRes.json();
}

async function runTests() {
  await cleanup();

  try {
    console.log("0. Minting test JWT sessions (Customer, Bodaboda Rider, Admin)...");
    const customerSession = await loginViaOtp(
      TEST_CUSTOMER_PHONE,
      "CUSTOMER",
      "Salma Rashid"
    );
    const riderSession = await loginViaOtp(
      TEST_RIDER_PHONE,
      "BODABODA_RIDER",
      "Juma Khamis"
    );
    const promoteRes = await authApp.inject({
      method: "POST",
      url: "/api/v1/auth/internal/promote-admin",
      headers: {
        "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
      },
      payload: { phone: TEST_ADMIN_PHONE, name: "Go.boda Phase2 Admin" },
    });
    assert.equal(promoteRes.statusCode, 200);
    const adminSession = await loginViaOtp(
      TEST_ADMIN_PHONE,
      "CUSTOMER",
      "Go.boda Phase2 Admin"
    );
    assert.equal(adminSession.user.role, "ADMIN");

    // -----------------------------------------------------------------------
    // 1. LOCATION-SERVICE (Nearby PostGIS, GPS Ping Geofence, Dispatch Candidates, Fleet)
    // -----------------------------------------------------------------------
    console.log("1. Testing location-service (PostGIS nearby, Unguja ping geofence, dispatch scoring)...");

    const locHealth = await locationApp.inject({ method: "GET", url: "/healthz" });
    assert.equal(locHealth.statusCode, 200);
    assert.equal(locHealth.json().databaseConnected, true);

    const nearbyRes = await locationApp.inject({
      method: "GET",
      url: "/api/v1/nearby?lat=-6.1649&lng=39.1936&radiusKm=8",
    });
    assert.equal(nearbyRes.statusCode, 200);
    const nearbyJson = nearbyRes.json();
    assert.ok(nearbyJson.summary.bodabodaCount >= 1);
    assert.ok(nearbyJson.summary.bajajiCount >= 1);
    assert.ok(nearbyJson.summary.nearestBodabodaEtaMin >= 1);
    assert.ok(nearbyJson.summary.nearestBajajiEtaMin >= 1);
    for (const v of nearbyJson.vehicles) {
      if (v.transportType === "BODABODA") assert.equal(v.operatorTitle, "RIDER");
      if (v.transportType === "BAJAJI") assert.equal(v.operatorTitle, "DRIVER");
    }
    console.log(
      `   [PASS] Nearby Stone Town: ${nearbyJson.summary.bodabodaCount} Bodaboda Riders (~${nearbyJson.summary.nearestBodabodaEtaMin}m) & ${nearbyJson.summary.bajajiCount} Bajaji Drivers (~${nearbyJson.summary.nearestBajajiEtaMin}m)`
    );

    // Customer cannot send operator GPS pings
    const custPing = await locationApp.inject({
      method: "POST",
      url: "/api/v1/location/ping",
      headers: { authorization: `Bearer ${customerSession.accessToken}` },
      payload: {
        transportType: "BODABODA",
        plateNumber: TEST_PLATE,
        lat: -6.165,
        lng: 39.194,
      },
    });
    assert.equal(custPing.statusCode, 403);

    // Rider ping outside Unguja (Dar es Salaam) must be rejected 422
    const outsidePing = await locationApp.inject({
      method: "POST",
      url: "/api/v1/location/ping",
      headers: { authorization: `Bearer ${riderSession.accessToken}` },
      payload: {
        transportType: "BODABODA",
        plateNumber: TEST_PLATE,
        homeKituo: "Darajani",
        lat: -6.7924,
        lng: 39.2803,
      },
    });
    assert.equal(outsidePing.statusCode, 422);
    assert.equal(outsidePing.json().error, "OUTSIDE_UNGUJA_SERVICE_AREA");

    // Rider ping inside Unguja with active trip breadcrumb
    const okPing = await locationApp.inject({
      method: "POST",
      url: "/api/v1/location/ping",
      headers: { authorization: `Bearer ${riderSession.accessToken}` },
      payload: {
        transportType: "BODABODA",
        plateNumber: TEST_PLATE,
        homeKituo: "Darajani / Creek Road Stage",
        lat: -6.1655,
        lng: 39.1942,
        heading: 120,
        speedKmh: 28,
        isOnline: true,
        isBusy: false,
        activeTripId: TEST_TRIP_ID,
        ratingAvg: 4.95,
      },
    });
    assert.equal(okPing.statusCode, 200);
    assert.equal(okPing.json().recorded, true);
    assert.equal(okPing.json().operatorTitle, "RIDER");

    // Live trip breadcrumb snapshot
    const tripLoc = await locationApp.inject({
      method: "GET",
      url: `/api/v1/location/trip/${TEST_TRIP_ID}`,
    });
    assert.equal(tripLoc.statusCode, 200);
    assert.equal(tripLoc.json().currentPosition.plateNumber, TEST_PLATE);
    assert.ok(tripLoc.json().breadcrumbs.length >= 1);

    // Internal dispatch candidate discovery requires INTERNAL_SERVICE_SECRET
    const badInternal = await locationApp.inject({
      method: "POST",
      url: "/api/v1/location/internal/candidates",
      payload: { lat: -6.1649, lng: 39.1936, transportType: "BODABODA" },
    });
    assert.equal(badInternal.statusCode, 403);

    const bodaCandidates = await locationApp.inject({
      method: "POST",
      url: "/api/v1/location/internal/candidates",
      headers: {
        "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
      },
      payload: {
        lat: -6.1649,
        lng: 39.1936,
        transportType: "BODABODA",
        radiusKm: 8,
        excludeOperatorIds: [riderSession.user.id],
      },
    });
    assert.equal(bodaCandidates.statusCode, 200);
    const candJson = bodaCandidates.json();
    assert.ok(candJson.count >= 1);
    for (let i = 0; i < candJson.candidates.length; i++) {
      assert.equal(candJson.candidates[i].transportType, "BODABODA");
      assert.notEqual(candJson.candidates[i].operatorId, riderSession.user.id);
      if (i > 0) {
        assert.ok(candJson.candidates[i - 1].matchScore >= candJson.candidates[i].matchScore);
      }
    }

    const bajajiCandidates = await locationApp.inject({
      method: "POST",
      url: "/api/v1/location/internal/candidates",
      headers: {
        "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
      },
      payload: {
        lat: -6.1649,
        lng: 39.1936,
        transportType: "BAJAJI",
        radiusKm: 8,
      },
    });
    assert.equal(bajajiCandidates.statusCode, 200);
    assert.ok(bajajiCandidates.json().count >= 1);
    for (const c of bajajiCandidates.json().candidates) {
      assert.equal(c.transportType, "BAJAJI");
      assert.equal(c.operatorTitle, "DRIVER");
    }

    // Admin fleet endpoint RBAC
    const fleetForbidden = await locationApp.inject({
      method: "GET",
      url: "/api/v1/location/admin/fleet",
      headers: { authorization: `Bearer ${customerSession.accessToken}` },
    });
    assert.equal(fleetForbidden.statusCode, 403);

    const fleetOk = await locationApp.inject({
      method: "GET",
      url: "/api/v1/location/admin/fleet",
      headers: { authorization: `Bearer ${adminSession.accessToken}` },
    });
    assert.equal(fleetOk.statusCode, 200);
    assert.ok(fleetOk.json().summary.onlineRiders >= 1);
    assert.ok(fleetOk.json().summary.onlineDrivers >= 1);
    console.log("   [PASS] GPS ping Unguja geofence, breadcrumbs, dispatch scoring & Admin fleet verified");

    // -----------------------------------------------------------------------
    // 2. PRICING-SERVICE (TZS Rounding, <=1.25x Surge Cap, Promos, Cancel Fee, Admin CRUD)
    // -----------------------------------------------------------------------
    console.log("2. Testing pricing-service (TZS tariffs, 500 TZS rounding, surge cap, promos, cancel fees)...");

    const priceHealth = await pricingApp.inject({ method: "GET", url: "/healthz" });
    assert.equal(priceHealth.statusCode, 200);
    assert.equal(priceHealth.json().databaseConnected, true);

    const tariffsRes = await pricingApp.inject({
      method: "GET",
      url: "/api/v1/pricing/tariffs",
    });
    assert.equal(tariffsRes.statusCode, 200);
    const tariffsJson = tariffsRes.json();
    assert.equal(tariffsJson.currency, "TZS");
    assert.equal(tariffsJson.roundingStepTzs, 500);
    const bodaTariff = tariffsJson.tariffs.find((t) => t.transport_type === "BODABODA");
    assert.ok(bodaTariff);
    originalBodaWaitFee = bodaTariff.wait_fee_per_min_tzs;

    // Standard upfront quote
    const baseQuoteRes = await pricingApp.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      payload: {
        distanceMeters: 6800,
        durationSeconds: 840,
      },
    });
    assert.equal(baseQuoteRes.statusCode, 200);
    const baseQuote = baseQuoteRes.json();
    const qBoda = baseQuote.quotes.BODABODA;
    const qBajaji = baseQuote.quotes.BAJAJI;
    assert.equal(qBoda.finalFareTzs % 500, 0);
    assert.equal(qBajaji.finalFareTzs % 500, 0);
    assert.ok(qBajaji.finalFareTzs > qBoda.finalFareTzs);
    assert.equal(qBoda.commissionPct, 12);
    assert.equal(qBoda.commissionTzs + qBoda.operatorNetTzs, qBoda.grossFareTzs);
    assert.equal(qBajaji.commissionTzs + qBajaji.operatorNetTzs, qBajaji.grossFareTzs);

    // Night + Rain surge must be capped at <= 1.25x
    const surgeQuoteRes = await pricingApp.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      payload: {
        distanceMeters: 6800,
        durationSeconds: 840,
        isNight: true,
        isRain: true,
      },
    });
    assert.equal(surgeQuoteRes.statusCode, 200);
    assert.ok(surgeQuoteRes.json().quotes.BODABODA.appliedMultiplier <= 1.25);
    assert.ok(surgeQuoteRes.json().quotes.BAJAJI.appliedMultiplier <= 1.25);

    // Seeded promo code KARIBUUNGUJA (15% off up to 2,000 TZS, commission still on gross)
    const promoQuoteRes = await pricingApp.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      payload: {
        distanceMeters: 6800,
        durationSeconds: 840,
        promoCode: "karibuunguja",
      },
    });
    assert.equal(promoQuoteRes.statusCode, 200);
    const promoJson = promoQuoteRes.json();
    assert.equal(promoJson.promoStatus, "APPLIED");
    assert.equal(promoJson.quotes.BODABODA.promoApplied, "KARIBUUNGUJA");
    assert.ok(promoJson.quotes.BODABODA.discountTzs > 0);
    assert.equal(promoJson.quotes.BODABODA.finalFareTzs % 500, 0);
    assert.equal(
      promoJson.quotes.BODABODA.operatorNetTzs,
      qBoda.operatorNetTzs
    );

    const badPromoRes = await pricingApp.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      payload: {
        distanceMeters: 6800,
        durationSeconds: 840,
        promoCode: "NOTREAL99",
      },
    });
    assert.equal(badPromoRes.statusCode, 200);
    assert.equal(badPromoRes.json().promoStatus, "INVALID");
    assert.equal(badPromoRes.json().quotes.BODABODA.discountTzs, 0);

    // Cancellation fee rules
    const cancelFree = await pricingApp.inject({
      method: "POST",
      url: "/api/v1/pricing/cancel-fee",
      payload: {
        transportType: "BODABODA",
        tripStatus: "ASSIGNED",
        secondsSinceAssigned: 60,
      },
    });
    assert.equal(cancelFree.statusCode, 200);
    assert.equal(cancelFree.json().cancelFeeTzs, 0);

    const cancelArrivedBajaji = await pricingApp.inject({
      method: "POST",
      url: "/api/v1/pricing/cancel-fee",
      payload: {
        transportType: "BAJAJI",
        tripStatus: "ARRIVED_AT_PICKUP",
        secondsSinceAssigned: 300,
      },
    });
    assert.equal(cancelArrivedBajaji.statusCode, 200);
    assert.equal(cancelArrivedBajaji.json().cancelFeeTzs, 1000);

    // Admin tariff update & promo creation
    const nonAdminPatch = await pricingApp.inject({
      method: "PATCH",
      url: "/api/v1/pricing/admin/tariffs/BODABODA",
      headers: { authorization: `Bearer ${customerSession.accessToken}` },
      payload: { waitFeePerMinTzs: 150 },
    });
    assert.equal(nonAdminPatch.statusCode, 403);

    const adminPatch = await pricingApp.inject({
      method: "PATCH",
      url: "/api/v1/pricing/admin/tariffs/BODABODA",
      headers: { authorization: `Bearer ${adminSession.accessToken}` },
      payload: { waitFeePerMinTzs: 150 },
    });
    assert.equal(adminPatch.statusCode, 200);
    assert.equal(adminPatch.json().tariff.wait_fee_per_min_tzs, 150);

    const createPromoRes = await pricingApp.inject({
      method: "POST",
      url: "/api/v1/pricing/admin/promos",
      headers: { authorization: `Bearer ${adminSession.accessToken}` },
      payload: {
        code: TEST_PROMO_CODE,
        discountType: "FLAT_TZS",
        discountValue: 1000,
        maxDiscountTzs: 1000,
        minFareTzs: 1500,
      },
    });
    assert.equal(createPromoRes.statusCode, 201);
    console.log(
      `   [PASS] Pricing verified: Go.boda TZS ${qBoda.finalFareTzs} (net TZS ${qBoda.operatorNetTzs}) | Go.bajaji TZS ${qBajaji.finalFareTzs} | Promo KARIBUUNGUJA -TZS ${promoJson.quotes.BODABODA.discountTzs}`
    );

    // -----------------------------------------------------------------------
    // 3. API-GATEWAY EDGE RBAC FOR PHASE 2 ROUTES
    // -----------------------------------------------------------------------
    console.log("3. Testing api-gateway edge RBAC on Phase 2 location & pricing routes...");

    const gwNoAuthPing = await gatewayApp.inject({
      method: "POST",
      url: "/api/v1/location/ping",
      payload: {},
    });
    assert.equal(gwNoAuthPing.statusCode, 401);

    const gwCustPing = await gatewayApp.inject({
      method: "POST",
      url: "/api/v1/location/ping",
      headers: { authorization: `Bearer ${customerSession.accessToken}` },
      payload: {},
    });
    assert.equal(gwCustPing.statusCode, 403);

    const gwCustFleet = await gatewayApp.inject({
      method: "GET",
      url: "/api/v1/location/admin/fleet",
      headers: { authorization: `Bearer ${customerSession.accessToken}` },
    });
    assert.equal(gwCustFleet.statusCode, 403);

    const gwCustTariff = await gatewayApp.inject({
      method: "PATCH",
      url: "/api/v1/pricing/admin/tariffs/BODABODA",
      headers: { authorization: `Bearer ${customerSession.accessToken}` },
      payload: { baseFareTzs: 500 },
    });
    assert.equal(gwCustTariff.statusCode, 403);
    console.log("   [PASS] API Gateway blocks unauthorized /location/ping & /admin pricing/fleet routes");

    console.log("\nALL PHASE 2 INTEGRATION TESTS PASSED!");
  } finally {
    await cleanup();
    await Promise.all([
      authApp.close(),
      locationApp.close(),
      pricingApp.close(),
      gatewayApp.close(),
    ]);
  }
}

runTests().catch((err) => {
  console.error("PHASE 2 TEST FAILED:", err);
  process.exit(1);
});
