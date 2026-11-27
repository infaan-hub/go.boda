import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

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

// Import ALL 10 microservices + api-gateway + shared packages
const { getSql } = await import("../packages/db/dist/index.js");
const { enMessages, swMessages } = await import("../packages/i18n/dist/index.js");
const { default: authApp } = await import("../apps/monolith/src/server/domains/auth/app.ts");
const { default: operatorApp } = await import("../apps/monolith/src/server/domains/operator/app.ts");
const { default: geoApp } = await import("../apps/monolith/src/server/domains/geo-zone/app.ts");
const { default: locationApp } = await import("../apps/monolith/src/server/domains/location/app.ts");
const { default: pricingApp } = await import("../apps/monolith/src/server/domains/pricing/app.ts");
const { default: dispatchApp } = await import("../apps/monolith/src/server/domains/dispatch/app.ts");
const { default: tripApp } = await import("../apps/monolith/src/server/domains/trip/app.ts");
const { default: payApp, computeWebhookSignature } = await import(
  "../apps/monolith/src/server/domains/payment-wallet/app.ts"
);
const { default: notifApp } = await import("../apps/monolith/src/server/domains/notification/app.ts");
const { default: safetyApp } = await import("../apps/monolith/src/server/domains/safety/app.ts");
const { default: gatewayApp } = await import("../apps/monolith/src/server/gateway/app.ts");

const TEST_CUSTOMER_PHONE = "+255779000701";
const TEST_RIDER_PHONE = "+255779000702";
const TEST_ADMIN_PHONE = "+255779000703";
const TEST_PLATE = "Z 701 E2E";

const createdUserIds = [];
const createdTripIds = [];

function walkFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "dist") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkFiles(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(full);
  }
  return out;
}

function flattenKeys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object" ? flattenKeys(v, key) : [key];
  });
}

async function cleanup() {
  const sql = getSql();
  for (const tid of createdTripIds) {
    await sql`DELETE FROM finance.ledger_entries WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM finance.payments WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM finance.outbox_events WHERE payload->>'tripId' = ${tid}`;
    await sql`DELETE FROM safety.helmet_compliance_logs WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM safety.sos_alerts WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM safety.share_links WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM safety.outbox_events WHERE payload->>'tripId' = ${tid}`;
    await sql`DELETE FROM notif.trip_chat_messages WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM dispatch.offers WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM dispatch.trip_locks WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM dispatch.outbox_events WHERE payload->>'tripId' = ${tid}`;
    await sql`DELETE FROM trip.ratings WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM trip.state_transitions WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM trip.outbox_events WHERE payload->>'tripId' = ${tid}`;
    await sql`DELETE FROM trip.trips WHERE id = ${tid}::uuid`;
  }
  for (const uid of createdUserIds) {
    await sql`
      DELETE FROM finance.ledger_entries
      WHERE journal_id IN (
        SELECT DISTINCT journal_id FROM finance.ledger_entries WHERE owner_id = ${uid}::uuid
      )
    `;
    await sql`DELETE FROM finance.payouts WHERE operator_id = ${uid}::uuid`;
    await sql`DELETE FROM finance.outbox_events WHERE payload->>'operatorId' = ${uid}`;
    await sql`DELETE FROM finance.wallet_accounts WHERE owner_id = ${uid}::uuid`;
    await sql`DELETE FROM location.operator_positions WHERE operator_id = ${uid}::uuid`;
    await sql`DELETE FROM operator.outbox_events WHERE payload->>'userId' = ${uid}`;
    await sql`DELETE FROM operator.profiles WHERE user_id = ${uid}::uuid`;
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
  await sql`DELETE FROM auth.otp_codes WHERE phone IN (${TEST_CUSTOMER_PHONE}, ${TEST_RIDER_PHONE}, ${TEST_ADMIN_PHONE})`;
  await sql`DELETE FROM auth.users WHERE phone IN (${TEST_CUSTOMER_PHONE}, ${TEST_RIDER_PHONE}, ${TEST_ADMIN_PHONE})`;
}

async function loginViaOtp(phone, intendedRole, name) {
  const reqRes = await authApp.inject({
    method: "POST",
    url: "/api/v1/auth/otp/request",
    payload: { phone, channel: "WHATSAPP", locale: "sw" },
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
    // -----------------------------------------------------------------------
    // 1. CANONICAL DOMAIN TERMINOLOGY & BILINGUAL i18n PARITY AUDIT
    // -----------------------------------------------------------------------
    console.log("1. Auditing canonical domain rules, i18n parity & PWA manifests...");
    const enKeys = flattenKeys(enMessages).sort();
    const swKeys = flattenKeys(swMessages).sort();
    assert.deepEqual(enKeys, swKeys, "English and Kiswahili i18n keys must match 1:1");

    const forbiddenRegex = /\b(tourist|local rider|zanzibar authorities)\b/i;
    for (const root of ["apps", "packages", "services"]) {
      for (const file of walkFiles(resolve(process.cwd(), root))) {
        const content = readFileSync(file, "utf8");
        assert.ok(
          !forbiddenRegex.test(content),
          `Forbidden terminology found in ${file}`
        );
      }
    }

    // Verify all 3 PWA manifests exist & parse as valid JSON
    for (const appName of ["customer-web", "partner-pwa", "admin-web"]) {
      const mPath = resolve(process.cwd(), "apps", appName, "public", "manifest.webmanifest");
      assert.ok(existsSync(mPath), `Missing manifest.webmanifest in apps/${appName}`);
      const m = JSON.parse(readFileSync(mPath, "utf8"));
      assert.ok(m.name && m.short_name && m.display === "standalone");
    }
    console.log(
      `   [PASS] ${enKeys.length} bilingual SW/EN keys in 1:1 parity, 0 forbidden terms, 3/3 PWA manifests valid`
    );

    // -----------------------------------------------------------------------
    // 2. ALL 10 MICROSERVICES + API GATEWAY HEALTH CHECKS
    // -----------------------------------------------------------------------
    console.log("2. Checking /healthz across all 10 microservices + api-gateway...");
    const services = [
      ["auth-service", authApp],
      ["operator-service", operatorApp],
      ["geo-zone-service", geoApp],
      ["location-service", locationApp],
      ["pricing-service", pricingApp],
      ["dispatch-service", dispatchApp],
      ["trip-service", tripApp],
      ["payment-wallet-service", payApp],
      ["notification-service", notifApp],
      ["safety-service", safetyApp],
      ["api-gateway", gatewayApp],
    ];
    for (const [name, app] of services) {
      const res = await app.inject({ method: "GET", url: "/healthz" });
      assert.equal(res.statusCode, 200, `${name} /healthz must return 200`);
      assert.equal(res.json().status, "ok", `${name} status must be ok`);
    }
    console.log("   [PASS] All 11/11 Fastify services report /healthz status: ok");

    // -----------------------------------------------------------------------
    // 3. FULL 10-SERVICE UNGUJA JOURNEY (AUTH -> KYC -> SMART SNAP -> DISPATCH
    //    -> PIN -> LIVE SHARE -> CHAT -> SOS -> MOBILE MONEY -> PAYOUT -> AUDIT)
    // -----------------------------------------------------------------------
    console.log("3. Executing full 10-service Stone Town -> ZNZ Airport Unguja journey...");

    const customer = await loginViaOtp(TEST_CUSTOMER_PHONE, "CUSTOMER", "Fatma Said");
    const rider = await loginViaOtp(TEST_RIDER_PHONE, "BODABODA_RIDER", "Hassan Juma");
    await authApp.inject({
      method: "POST",
      url: "/api/v1/auth/internal/promote-admin",
      headers: { "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET },
      payload: { phone: TEST_ADMIN_PHONE, name: "Go.boda Pilot Admin" },
    });
    const admin = await loginViaOtp(TEST_ADMIN_PHONE, "CUSTOMER", "Go.boda Pilot Admin");

    // 3a. Operator KYC onboarding + Admin approval + Wallet provisioning
    const ob = await operatorApp.inject({
      method: "POST",
      url: "/api/v1/operators/onboarding",
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: {
        transportType: "BODABODA",
        fullName: "Hassan Juma",
        phone: TEST_RIDER_PHONE,
        homeKituo: "Darajani Gate",
        nationalIdNo: "ZNZ-19940101-7701",
        licenseNo: "ZN-DL-90701",
        licenseExpiry: "2029-01-01",
        plateNumber: TEST_PLATE,
        vehicleModel: "TVS HLX 150",
        vehicleColor: "Black",
        insuranceExpiry: "2028-01-01",
        payoutMobileNumber: TEST_RIDER_PHONE,
      },
    });
    assert.equal(ob.statusCode, 200);
    const opId = ob.json().profile.id;

    const appr = await operatorApp.inject({
      method: "POST",
      url: `/api/v1/operators/admin/${opId}/review`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { decision: "APPROVED", helmetVerified: true },
    });
    assert.equal(appr.statusCode, 200);

    await payApp.inject({
      method: "POST",
      url: "/api/v1/wallets/internal/provision",
      headers: { "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET },
      payload: { operatorId: rider.user.id },
    });

    // 3b. Geo-Zone Stone Town Smart Snap & Pemba/Mainland Geofence Reject
    const pembaValidate = await geoApp.inject({
      method: "POST",
      url: "/api/v1/geo/validate",
      payload: { point: { lat: -5.2458, lng: 39.7666 } },
    });
    assert.equal(pembaValidate.statusCode, 200);
    assert.equal(pembaValidate.json().valid, false);
    assert.equal(pembaValidate.json().error, "OUTSIDE_UNGUJA_SERVICE_AREA");

    const darResolve = await geoApp.inject({
      method: "POST",
      url: "/api/v1/geo/resolve-point",
      payload: { lat: -6.7924, lng: 39.2083 }, // Dar es Salaam Mainland
    });
    assert.equal(darResolve.statusCode, 422);
    assert.equal(darResolve.json().error, "OUTSIDE_UNGUJA_SERVICE_AREA");

    const stoneTownRes = await geoApp.inject({
      method: "POST",
      url: "/api/v1/geo/resolve-point",
      payload: { lat: -6.1622, lng: 39.1892 }, // Deep inside Stone Town alleys
    });
    assert.equal(stoneTownRes.statusCode, 200);
    assert.equal(stoneTownRes.json().snapped, true);

    // 3c. Rider goes online near Darajani Gate (location-service)
    const ping = await locationApp.inject({
      method: "POST",
      url: "/api/v1/location/ping",
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: {
        transportType: "BODABODA",
        plateNumber: TEST_PLATE,
        homeKituo: "Darajani Gate",
        lat: -6.1649,
        lng: 39.1936,
        isOnline: true,
        isBusy: false,
        ratingAvg: 4.9,
      },
    });
    assert.equal(ping.statusCode, 200);

    // 3d. Pricing quote with KARIBUUNGUJA promo (pricing-service)
    const quoteRes = await pricingApp.inject({
      method: "POST",
      url: "/api/v1/pricing/quote",
      payload: {
        distanceMeters: 7500,
        durationSeconds: 900,
        promoCode: "KARIBUUNGUJA",
      },
    });
    assert.equal(quoteRes.statusCode, 200);
    assert.equal(quoteRes.json().promoStatus, "APPLIED");
    assert.ok(quoteRes.json().quotes.BODABODA.discountTzs > 0);

    // 3e. Trip Create with Stone Town pickup -> ZNZ Airport (trip-service)
    const cr = await tripApp.inject({
      method: "POST",
      url: "/api/v1/trips",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: {
        transportType: "BODABODA",
        pickup: { lat: -6.1622, lng: 39.1892 },
        pickupLabel: "Hurumzi Alley, Stone Town",
        dropoff: { lat: -6.222, lng: 39.2249 },
        dropoffLabel: "Abeid Amani Karume Airport (ZNZ)",
        paymentMethod: "MOBILE_MONEY",
        promoCode: "KARIBUUNGUJA",
      },
    });
    assert.equal(cr.statusCode, 201);
    const trip = cr.json().trip;
    createdTripIds.push(trip.id);
    assert.equal(trip.pickup.snapped, true, "Stone Town pickup must auto-snap");

    // 3f. Dispatch & Atomic Lock Accept (dispatch-service)
    const disp = await dispatchApp.inject({
      method: "POST",
      url: "/api/v1/dispatch/start",
      headers: { "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET },
      payload: { tripId: trip.id, waveSize: 1, includeDemo: false },
    });
    assert.equal(disp.statusCode, 200);
    const offerId = disp.json().offers[0].id;

    const acc = await dispatchApp.inject({
      method: "POST",
      url: `/api/v1/dispatch/offers/${offerId}/accept`,
      headers: { authorization: `Bearer ${rider.accessToken}` },
    });
    assert.equal(acc.statusCode, 200);

    // 3g. Bilingual Quick-Chat (notification-service)
    const chatRes = await notifApp.inject({
      method: "POST",
      url: `/api/v1/notifications/chat/${trip.id}`,
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: { presetKey: "ARRIVED_GATE" },
    });
    assert.equal(chatRes.statusCode, 201);

    // 3h. Arrive + 4-Digit Start PIN verification
    assert.equal(
      (
        await tripApp.inject({
          method: "POST",
          url: `/api/v1/trips/${trip.id}/arrive`,
          headers: { authorization: `Bearer ${rider.accessToken}` },
        })
      ).statusCode,
      200
    );
    assert.equal(
      (
        await tripApp.inject({
          method: "POST",
          url: `/api/v1/trips/${trip.id}/start`,
          headers: { authorization: `Bearer ${rider.accessToken}` },
          payload: { startPin: trip.startPin },
        })
      ).statusCode,
      200
    );

    // 3i. Public WhatsApp Live Share Link (safety-service) — zero PII exposed!
    const shareRes = await safetyApp.inject({
      method: "POST",
      url: "/api/v1/safety/share-link",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: { tripId: trip.id },
    });
    assert.equal(shareRes.statusCode, 201);
    const shareToken = shareRes.json().shareToken;

    const pubTrack = await safetyApp.inject({
      method: "GET",
      url: `/api/v1/track/${shareToken}`,
    });
    assert.equal(pubTrack.statusCode, 200);
    const pubJson = JSON.stringify(pubTrack.json());
    assert.ok(!pubJson.includes(TEST_CUSTOMER_PHONE), "Public tracker must NEVER leak Customer phone");
    assert.ok(!pubJson.includes(TEST_RIDER_PHONE), "Public tracker must NEVER leak Rider phone");

    // 3j. In-Trip SOS -> Admin Resolve -> Trip Complete
    const sos = await safetyApp.inject({
      method: "POST",
      url: "/api/v1/safety/sos",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: { tripId: trip.id, lat: -6.191, lng: 39.212, reason: "E2E safety check" },
    });
    assert.equal(sos.statusCode, 201);
    const resolveSos = await safetyApp.inject({
      method: "PATCH",
      url: `/api/v1/safety/admin/sos/${sos.json().alert.id}`,
      headers: { authorization: `Bearer ${admin.accessToken}` },
      payload: { status: "RESOLVED", resolutionNote: "Verified safe" },
    });
    assert.equal(resolveSos.statusCode, 200);

    const comp = await tripApp.inject({
      method: "POST",
      url: `/api/v1/trips/${trip.id}/complete`,
      headers: { authorization: `Bearer ${rider.accessToken}` },
    });
    assert.equal(comp.statusCode, 200);
    const receipt = comp.json().receipt;

    // 3k. Mobile Money STK Push -> Valid HMAC Webhook -> Instant Payout -> Rating + Helmet Check
    const mmInit = await payApp.inject({
      method: "POST",
      url: "/api/v1/payments/mobile-money/initiate",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: {
        tripId: trip.id,
        customerPhone: TEST_CUSTOMER_PHONE,
        provider: "AZAMPAY",
      },
    });
    assert.equal(mmInit.statusCode, 202);
    const hookBody = JSON.stringify({
      providerRef: mmInit.json().providerRef,
      status: "SUCCESS",
      amountTzs: receipt.finalFareTzs,
    });
    const hookRes = await payApp.inject({
      method: "POST",
      url: "/api/v1/payments/webhooks/provider",
      headers: {
        "content-type": "application/json",
        "x-goboda-signature": computeWebhookSignature(hookBody),
      },
      payload: hookBody,
    });
    assert.equal(hookRes.statusCode, 200);
    assert.equal(hookRes.json().status, "CONFIRMED");

    const payoutRes = await payApp.inject({
      method: "POST",
      url: "/api/v1/wallets/payouts/withdraw",
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: {
        amountTzs: 2000,
        payoutChannel: "MPESA",
        destinationPhone: TEST_RIDER_PHONE,
      },
    });
    assert.equal(payoutRes.statusCode, 201);

    const rateRes = await tripApp.inject({
      method: "POST",
      url: `/api/v1/trips/${trip.id}/rate`,
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: { stars: 5, helmetProvided: true, comment: "Haraka na salama!" },
    });
    assert.equal(rateRes.statusCode, 200);

    // Revoke share link -> must return 410 Gone
    await safetyApp.inject({
      method: "DELETE",
      url: `/api/v1/safety/share-link/${shareToken}`,
      headers: { authorization: `Bearer ${customer.accessToken}` },
    });
    const revokedTrack = await safetyApp.inject({
      method: "GET",
      url: `/api/v1/track/${shareToken}`,
    });
    assert.equal(revokedTrack.statusCode, 410);

    // 3l. Zero-Drift Finance Ledger Audit
    const audit = await payApp.inject({
      method: "GET",
      url: "/api/v1/payments/admin/ledger-audit",
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    assert.equal(audit.statusCode, 200);
    assert.equal(audit.json().ledgerBalanced, true);
    assert.equal(audit.json().totalLedgerDriftTzs, 0);

    console.log(
      `   [PASS] Full 10-service journey succeeded (Fare TZS ${receipt.finalFareTzs}, Net TZS ${receipt.operatorNetTzs}, Payout TZS 2,000, 0 TZS ledger drift)`
    );

    // -----------------------------------------------------------------------
    // 4. API GATEWAY RBAC & SECURITY MATRIX
    // -----------------------------------------------------------------------
    console.log("4. Verifying API Gateway security & RBAC matrix...");
    assert.equal(
      (await gatewayApp.inject({ method: "GET", url: "/api/v1/trips" })).statusCode,
      401
    );
    assert.equal(
      (
        await gatewayApp.inject({
          method: "GET",
          url: "/api/v1/operators/admin/queue",
          headers: { authorization: `Bearer ${customer.accessToken}` },
        })
      ).statusCode,
      403
    );
    assert.equal(
      (
        await gatewayApp.inject({
          method: "GET",
          url: "/api/v1/safety/admin/sos",
          headers: { authorization: `Bearer ${rider.accessToken}` },
        })
      ).statusCode,
      403
    );
    assert.equal(
      (
        await gatewayApp.inject({
          method: "GET",
          url: "/api/v1/wallets/me",
          headers: { authorization: `Bearer ${customer.accessToken}` },
        })
      ).statusCode,
      403
    );
    console.log("   [PASS] API Gateway RBAC blocks 401/403 unauthorized callers cleanly");

    console.log("\nALL PHASE 7 FULL-PLATFORM E2E QA & SECURITY CHECKS PASSED!");
  } finally {
    await cleanup();
    await Promise.all([
      authApp.close(),
      operatorApp.close(),
      geoApp.close(),
      locationApp.close(),
      pricingApp.close(),
      dispatchApp.close(),
      tripApp.close(),
      payApp.close(),
      notifApp.close(),
      safetyApp.close(),
      gatewayApp.close(),
    ]);
  }
}

runTests().catch((err) => {
  console.error("PHASE 7 E2E QA FAILED:", err);
  process.exit(1);
});
