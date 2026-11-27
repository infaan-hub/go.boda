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
const { default: operatorApp } = await import(
  "../apps/monolith/src/server/domains/operator/app.ts"
);
const { default: locationApp } = await import(
  "../apps/monolith/src/server/domains/location/app.ts"
);
const { default: pricingApp } = await import(
  "../apps/monolith/src/server/domains/pricing/app.ts"
);
const { default: tripApp } = await import("../apps/monolith/src/server/domains/trip/app.ts");
const { default: safetyApp } = await import(
  "../apps/monolith/src/server/domains/safety/app.ts"
);
const { default: payApp } = await import(
  "../apps/monolith/src/server/domains/payment-wallet/app.ts"
);

const TEST_CUSTOMER_PHONE = "+255779000601";
const TEST_RIDER_PHONE = "+255779000602";
const TEST_ADMIN_PHONE = "+255779000603";
const TEST_PLATE = "Z 601 P6A";
const TEST_PROMO_CODE = "PHASE6OPS";

const createdUserIds = [];
const createdTripIds = [];
const createdSosIds = [];
let originalBodabodaBaseFare = null;

async function cleanup() {
  const sql = getSql();
  if (originalBodabodaBaseFare !== null) {
    await sql`
      UPDATE pricing.tariffs
      SET base_fare_tzs = ${originalBodabodaBaseFare}, updated_at = NOW()
      WHERE transport_type = 'BODABODA'
    `;
  }
  await sql`DELETE FROM pricing.promo_codes WHERE code = ${TEST_PROMO_CODE}`;

  for (const sid of createdSosIds) {
    await sql`DELETE FROM safety.outbox_events WHERE payload->>'alertId' = ${sid}`;
    await sql`DELETE FROM safety.sos_alerts WHERE id = ${sid}::uuid`;
  }
  for (const tid of createdTripIds) {
    await sql`DELETE FROM safety.sos_alerts WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM trip.state_transitions WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM trip.outbox_events WHERE payload->>'tripId' = ${tid}`;
    await sql`DELETE FROM trip.trips WHERE id = ${tid}::uuid`;
  }
  for (const uid of createdUserIds) {
    await sql`DELETE FROM finance.wallet_accounts WHERE owner_id = ${uid}::uuid`;
    await sql`DELETE FROM location.operator_positions WHERE operator_id = ${uid}::uuid`;
    await sql`DELETE FROM operator.outbox_events WHERE payload->>'userId' = ${uid}`;
    await sql`DELETE FROM operator.profiles WHERE user_id = ${uid}::uuid`;
  }
  await sql`DELETE FROM operator.profiles WHERE plate_number = ${TEST_PLATE}`;
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

async function runTests() {
  await cleanup();

  try {
    console.log("0. Minting Phase 6 Customer, Bodaboda Rider & Operations Admin sessions...");
    const customer = await loginViaOtp(
      TEST_CUSTOMER_PHONE,
      "CUSTOMER",
      "Asha Khamis"
    );
    const rider = await loginViaOtp(
      TEST_RIDER_PHONE,
      "BODABODA_RIDER",
      "Salim Bakari"
    );
    const promoteRes = await authApp.inject({
      method: "POST",
      url: "/api/v1/auth/internal/promote-admin",
      headers: {
        "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
      },
      payload: { phone: TEST_ADMIN_PHONE, name: "Go.boda Ops Admin" },
    });
    assert.equal(promoteRes.statusCode, 200);
    const admin = await loginViaOtp(
      TEST_ADMIN_PHONE,
      "CUSTOMER",
      "Go.boda Ops Admin"
    );

    // -----------------------------------------------------------------------
    // 1. OPERATOR ONBOARDING -> ADMIN KYC APPROVAL -> WALLET PROVISIONING
    // -----------------------------------------------------------------------
    console.log(
      "1. Testing Operator onboarding -> Admin KYC approval -> wallet provisioning & go-online..."
    );
    const onboardRes = await operatorApp.inject({
      method: "POST",
      url: "/api/v1/operators/onboarding",
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: {
        transportType: "BODABODA",
        fullName: "Salim Bakari",
        phone: TEST_RIDER_PHONE,
        homeKituo: "Darajani Market Stage",
        nationalIdNo: "ZNZ-19950214-0091",
        licenseNo: "ZN-DL-77210",
        licenseExpiry: "2028-12-31",
        plateNumber: TEST_PLATE,
        vehicleModel: "Boxer BM150",
        vehicleColor: "Red",
        insuranceExpiry: "2027-06-30",
        payoutMobileNumber: TEST_RIDER_PHONE,
      },
    });
    assert.equal(onboardRes.statusCode, 200);
    const operatorProfileId = onboardRes.json().profile.id;
    assert.equal(onboardRes.json().profile.operator_title, "RIDER");

    // Non-admin blocked from Admin KYC queue
    const custQueue = await operatorApp.inject({
      method: "GET",
      url: "/api/v1/operators/admin/queue",
      headers: { authorization: `Bearer ${customer.accessToken}` },
    });
    assert.equal(custQueue.statusCode, 403);

    // Admin sees Rider in pending queue
    const queueRes = await operatorApp.inject({
      method: "GET",
      url: "/api/v1/operators/admin/queue?status=PENDING_VERIFICATION",
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    assert.equal(queueRes.statusCode, 200);
    assert.ok(
      queueRes.json().operators.some((o) => o.id === operatorProfileId),
      "New Bodaboda Rider should appear in Admin PENDING_VERIFICATION queue"
    );

    // Admin approves Rider
    const approveRes = await operatorApp.inject({
      method: "POST",
      url: `/api/v1/operators/admin/${operatorProfileId}/review`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { decision: "APPROVED", helmetVerified: true },
    });
    assert.equal(approveRes.statusCode, 200);
    assert.equal(approveRes.json().operator.kyc_status, "APPROVED");
    assert.equal(approveRes.json().operator.helmet_verified, true);

    // Provision EARNINGS + COMMISSION_FLOAT wallets on approval
    const provRes = await payApp.inject({
      method: "POST",
      url: "/api/v1/wallets/internal/provision",
      headers: {
        "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
      },
      payload: { operatorId: rider.user.id },
    });
    assert.equal(provRes.statusCode, 200);
    assert.equal(provRes.json().earningsBalanceTzs, 0);
    assert.equal(provRes.json().commissionFloatTzs, 0);

    // Approved Rider can now toggle Online
    const onlineRes = await operatorApp.inject({
      method: "PATCH",
      url: "/api/v1/operators/availability",
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: { isOnline: true },
    });
    assert.equal(onlineRes.statusCode, 200);
    assert.equal(onlineRes.json().availability.is_online, true);
    console.log(
      "   [PASS] Bodaboda Rider approved by Admin, wallets provisioned, and online shift unlocked"
    );

    // -----------------------------------------------------------------------
    // 2. LIVE TARIFF EDIT -> IMMEDIATE QUOTE CHANGE -> SAFE RESTORE + PROMO
    // -----------------------------------------------------------------------
    console.log(
      "2. Testing live Admin TZS tariff edit, immediate quote recalculation & promo creation..."
    );
    const tariffsRes = await pricingApp.inject({
      method: "GET",
      url: "/api/v1/pricing/tariffs",
    });
    assert.equal(tariffsRes.statusCode, 200);
    const bodaTariff = tariffsRes
      .json()
      .tariffs.find((t) => t.transport_type === "BODABODA");
    assert.ok(bodaTariff, "BODABODA tariff must exist");
    originalBodabodaBaseFare = Number(bodaTariff.base_fare_tzs);

    const quoteBefore = await pricingApp.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      payload: { distanceMeters: 4000, durationSeconds: 600 },
    });
    assert.equal(quoteBefore.statusCode, 200);
    const fareBefore = quoteBefore.json().quotes.BODABODA.finalFareTzs;

    // Admin bumps BODABODA baseFareTzs by +1,000 TZS live
    const patchTariff = await pricingApp.inject({
      method: "PATCH",
      url: "/api/v1/pricing/admin/tariffs/BODABODA",
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { baseFareTzs: originalBodabodaBaseFare + 1000 },
    });
    assert.equal(patchTariff.statusCode, 200);

    const quoteAfter = await pricingApp.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      payload: { distanceMeters: 4000, durationSeconds: 600 },
    });
    assert.equal(quoteAfter.statusCode, 200);
    const fareAfter = quoteAfter.json().quotes.BODABODA.finalFareTzs;
    assert.equal(
      fareAfter,
      fareBefore + 1000,
      "Upfront TZS quote must immediately reflect Admin live tariff update"
    );

    // Admin creates promo code & quote applies it
    const promoRes = await pricingApp.inject({
      method: "POST",
      url: "/api/v1/pricing/admin/promos",
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: {
        code: TEST_PROMO_CODE,
        discountType: "FLAT_TZS",
        discountValue: 1000,
        maxDiscountTzs: 1000,
        minFareTzs: 1500,
        active: true,
      },
    });
    assert.equal(promoRes.statusCode, 201);

    const quotePromo = await pricingApp.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      payload: {
        distanceMeters: 4000,
        durationSeconds: 600,
        promoCode: TEST_PROMO_CODE,
      },
    });
    assert.equal(quotePromo.statusCode, 200);
    assert.equal(quotePromo.json().promoStatus, "APPLIED");
    assert.equal(
      quotePromo.json().quotes.BODABODA.finalFareTzs,
      fareAfter - 1000
    );

    // Restore original baseFareTzs immediately
    const restoreRes = await pricingApp.inject({
      method: "PATCH",
      url: "/api/v1/pricing/admin/tariffs/BODABODA",
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { baseFareTzs: originalBodabodaBaseFare },
    });
    assert.equal(restoreRes.statusCode, 200);
    originalBodabodaBaseFare = null;
    console.log(
      `   [PASS] Live tariff bumped fare TZS ${fareBefore} -> TZS ${fareAfter}, promo discounted -TZS 1,000, original tariff restored`
    );

    // -----------------------------------------------------------------------
    // 3. LIVE UNGUJA FLEET & TRIPS ADMIN OVERVIEW
    // -----------------------------------------------------------------------
    console.log(
      "3. Testing Admin Live Unguja Fleet & Trips Overview endpoints..."
    );
    const fleetRes = await locationApp.inject({
      method: "GET",
      url: "/api/v1/location/admin/fleet",
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    assert.equal(fleetRes.statusCode, 200);
    assert.ok(
      fleetRes.json().summary.totalOnline >= 1,
      "At least 1 Unguja fleet vehicle should be online"
    );

    const tripsOverview = await tripApp.inject({
      method: "GET",
      url: "/api/v1/trips/admin/overview",
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    assert.equal(tripsOverview.statusCode, 200);
    assert.equal(typeof tripsOverview.json().summary.totalTrips, "number");

    const custTripsOverview = await tripApp.inject({
      method: "GET",
      url: "/api/v1/trips/admin/overview",
      headers: { authorization: `Bearer ${customer.accessToken}` },
    });
    assert.equal(custTripsOverview.statusCode, 403);
    console.log(
      `   [PASS] Live fleet (${fleetRes.json().summary.onlineRiders} Riders, ${fleetRes.json().summary.onlineDrivers} Drivers) & Trips Admin overview verified`
    );

    // -----------------------------------------------------------------------
    // 4. SOS INCIDENT ROOM LIFECYCLE & ZERO-DRIFT FINANCE LEDGER AUDIT
    // -----------------------------------------------------------------------
    console.log(
      "4. Testing SOS Incident Room triage/resolution & Zero-Drift Finance Ledger Audit..."
    );
    const createTrip = await tripApp.inject({
      method: "POST",
      url: "/api/v1/trips",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: {
        transportType: "BODABODA",
        pickup: { lat: -6.1649, lng: 39.1936 },
        pickupLabel: "Darajani Market",
        dropoff: { lat: -6.1742, lng: 39.2085 },
        dropoffLabel: "Michenzani Roundabout",
        paymentMethod: "CASH",
      },
    });
    assert.equal(createTrip.statusCode, 201);
    const trip = createTrip.json().trip;
    createdTripIds.push(trip.id);

    // Assign & start trip
    const assignRes = await tripApp.inject({
      method: "POST",
      url: `/api/v1/trips/internal/${trip.id}/assign`,
      headers: {
        "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
      },
      payload: {
        operatorId: rider.user.id,
        operatorPlate: TEST_PLATE,
        operatorName: "Salim Bakari",
        operatorPhone: TEST_RIDER_PHONE,
      },
    });
    assert.equal(assignRes.statusCode, 200);

    await tripApp.inject({
      method: "POST",
      url: `/api/v1/trips/${trip.id}/arrive`,
      headers: { authorization: `Bearer ${rider.accessToken}` },
    });
    await tripApp.inject({
      method: "POST",
      url: `/api/v1/trips/${trip.id}/start`,
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: { startPin: trip.startPin },
    });

    // Customer triggers SOS
    const sosRes = await safetyApp.inject({
      method: "POST",
      url: "/api/v1/safety/sos",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: {
        tripId: trip.id,
        lat: -6.171,
        lng: 39.201,
        reason: "Phase 6 Admin SOS drill",
      },
    });
    assert.equal(sosRes.statusCode, 201);
    const alertId = sosRes.json().alert.id;
    createdSosIds.push(alertId);

    // Admin sees OPEN alert
    const sosFeed = await safetyApp.inject({
      method: "GET",
      url: "/api/v1/safety/admin/sos",
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    assert.equal(sosFeed.statusCode, 200);
    assert.ok(sosFeed.json().alerts.some((a) => a.id === alertId && a.status === "OPEN"));

    // Admin resolves SOS -> restores trip to IN_PROGRESS
    const resolveSos = await safetyApp.inject({
      method: "PATCH",
      url: `/api/v1/safety/admin/sos/${alertId}`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: {
        status: "RESOLVED",
        resolutionNote: "Confirmed safe by Go.boda Unguja Ops Desk",
      },
    });
    assert.equal(resolveSos.statusCode, 200);
    assert.equal(resolveSos.json().alert.status, "RESOLVED");

    const tripCheck = await tripApp.inject({
      method: "GET",
      url: `/api/v1/trips/${trip.id}`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    assert.equal(tripCheck.statusCode, 200);
    assert.equal(tripCheck.json().trip.status, "IN_PROGRESS");

    // Admin Zero-Drift Double-Entry Finance Ledger Audit
    const ledgerAudit = await payApp.inject({
      method: "GET",
      url: "/api/v1/payments/admin/ledger-audit",
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    assert.equal(ledgerAudit.statusCode, 200);
    assert.equal(ledgerAudit.json().ledgerBalanced, true);
    assert.equal(ledgerAudit.json().totalLedgerDriftTzs, 0);
    console.log(
      "   [PASS] SOS alert triaged & resolved (trip restored to IN_PROGRESS); Finance Ledger Audit PASSED (0 TZS drift)"
    );

    console.log("\nALL PHASE 6 OPERATIONS COMMAND CENTER TESTS PASSED!");
  } finally {
    await cleanup();
    await Promise.all([
      authApp.close(),
      operatorApp.close(),
      locationApp.close(),
      pricingApp.close(),
      tripApp.close(),
      safetyApp.close(),
      payApp.close(),
    ]);
  }
}

runTests().catch((err) => {
  console.error("PHASE 6 TEST FAILED:", err);
  process.exit(1);
});
