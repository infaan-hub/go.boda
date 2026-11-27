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
const { default: payApp, computeWebhookSignature } = await import(
  "../apps/monolith/src/server/domains/payment-wallet/app.ts"
);
const { default: gatewayApp } = await import("../apps/monolith/src/server/gateway/app.ts");

const TEST_CUSTOMER_PHONE = "+255779000501";
const TEST_RIDER_PHONE = "+255779000502";
const TEST_ADMIN_PHONE = "+255779000503";
const TEST_PLATE = "Z 501 P5W";

const createdTripIds = [];
const createdUserIds = [];

async function cleanup() {
  const sql = getSql();
  for (const tid of createdTripIds) {
    await sql`DELETE FROM finance.ledger_entries WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM finance.payments WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM finance.outbox_events WHERE payload->>'tripId' = ${tid}`;
    await sql`DELETE FROM dispatch.offers WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM dispatch.trip_locks WHERE trip_id = ${tid}::uuid`;
    await sql`DELETE FROM dispatch.outbox_events WHERE payload->>'tripId' = ${tid}`;
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
  }
  // Re-sync platform system account cached balances from remaining ledger entries
  await sql`
    UPDATE finance.wallet_accounts a
    SET balance_tzs = COALESCE(
      (SELECT SUM(delta_tzs) FROM finance.ledger_entries e WHERE e.account_id = a.id),
      0
    )
    WHERE owner_id = '00000000-0000-4000-8000-000000000000'::uuid
  `;
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

async function runCompletedTrip({
  customer,
  rider,
  paymentMethod,
  dropoff,
  dropoffLabel,
}) {
  // Ensure Rider is online near Darajani
  const ping = await locationApp.inject({
    method: "POST",
    url: "/api/v1/location/ping",
    headers: { authorization: `Bearer ${rider.accessToken}` },
    payload: {
      transportType: "BODABODA",
      plateNumber: TEST_PLATE,
      homeKituo: "Darajani",
      lat: -6.1649,
      lng: 39.1938,
      isOnline: true,
      isBusy: false,
      ratingAvg: 4.95,
    },
  });
  assert.equal(ping.statusCode, 200);

  const cr = await tripApp.inject({
    method: "POST",
    url: "/api/v1/trips",
    headers: { authorization: `Bearer ${customer.accessToken}` },
    payload: {
      transportType: "BODABODA",
      pickup: { lat: -6.1649, lng: 39.1936 },
      pickupLabel: "Darajani Market",
      dropoff,
      dropoffLabel,
      paymentMethod,
    },
  });
  assert.equal(cr.statusCode, 201);
  const trip = cr.json().trip;
  createdTripIds.push(trip.id);

  const disp = await dispatchApp.inject({
    method: "POST",
    url: "/api/v1/dispatch/start",
    headers: {
      "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
    },
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

  const arr = await tripApp.inject({
    method: "POST",
    url: `/api/v1/trips/${trip.id}/arrive`,
    headers: { authorization: `Bearer ${rider.accessToken}` },
  });
  assert.equal(arr.statusCode, 200);

  const st = await tripApp.inject({
    method: "POST",
    url: `/api/v1/trips/${trip.id}/start`,
    headers: { authorization: `Bearer ${rider.accessToken}` },
    payload: { startPin: trip.startPin },
  });
  assert.equal(st.statusCode, 200);

  const comp = await tripApp.inject({
    method: "POST",
    url: `/api/v1/trips/${trip.id}/complete`,
    headers: { authorization: `Bearer ${rider.accessToken}` },
  });
  assert.equal(comp.statusCode, 200);
  return comp.json();
}

async function runTests() {
  await cleanup();

  try {
    console.log("0. Minting Phase 5 test sessions & provisioning Operator wallets...");
    const customer = await loginViaOtp(TEST_CUSTOMER_PHONE, "CUSTOMER", "Mwanaisha Ali");
    const rider = await loginViaOtp(TEST_RIDER_PHONE, "BODABODA_RIDER", "Juma Nassor");
    const promoteRes = await authApp.inject({
      method: "POST",
      url: "/api/v1/auth/internal/promote-admin",
      headers: {
        "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
      },
      payload: { phone: TEST_ADMIN_PHONE, name: "Go.boda Finance Admin" },
    });
    assert.equal(promoteRes.statusCode, 200);
    const admin = await loginViaOtp(TEST_ADMIN_PHONE, "CUSTOMER", "Go.boda Finance Admin");

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

    // -----------------------------------------------------------------------
    // 1. CASH SETTLEMENT, IDEMPOTENCY & FLOAT AUTO-BLOCK (< -5,000 TZS)
    // -----------------------------------------------------------------------
    console.log("1. Testing Cash settlement, duplicate replay idempotency & -5,000 TZS float auto-block...");

    // Trip 1: Stone Town -> Nungwi (~4,500 TZS commission -> still above -5,000 TZS limit)
    const cashTrip1 = await runCompletedTrip({
      customer,
      rider,
      paymentMethod: "CASH",
      dropoff: { lat: -5.7265, lng: 39.2987 },
      dropoffLabel: "Nungwi Beach",
    });

    const cashConfirm1 = await payApp.inject({
      method: "POST",
      url: "/api/v1/payments/cash/confirm",
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: { tripId: cashTrip1.trip.id },
    });
    assert.equal(cashConfirm1.statusCode, 200);
    const c1 = cashConfirm1.json();
    assert.equal(c1.commissionFloatTzs, -cashTrip1.receipt.commissionTzs);

    // Duplicate Cash confirm replay must NOT debit float twice!
    const cashReplay = await payApp.inject({
      method: "POST",
      url: "/api/v1/payments/cash/confirm",
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: { tripId: cashTrip1.trip.id },
    });
    assert.equal(cashReplay.statusCode, 200);
    assert.equal(cashReplay.json().idempotentReplay, true);
    assert.equal(cashReplay.json().commissionFloatTzs, c1.commissionFloatTzs);

    // Trip 2: Stone Town -> Paje pushes cumulative negative float strictly below -5,000 TZS!
    let totalCashCommission = cashTrip1.receipt.commissionTzs;
    let finalFloatAfterCash = c1.commissionFloatTzs;
    if (!c1.isFloatBlocked) {
      const cashTrip2 = await runCompletedTrip({
        customer,
        rider,
        paymentMethod: "CASH",
        dropoff: { lat: -6.222, lng: 39.2249 },
        dropoffLabel: "ZNZ Airport",
      });
      const cashConfirm2 = await payApp.inject({
        method: "POST",
        url: "/api/v1/payments/cash/confirm",
        headers: { authorization: `Bearer ${rider.accessToken}` },
        payload: { tripId: cashTrip2.trip.id },
      });
      assert.equal(cashConfirm2.statusCode, 200);
      const c2 = cashConfirm2.json();
      totalCashCommission += cashTrip2.receipt.commissionTzs;
      finalFloatAfterCash = c2.commissionFloatTzs;
      assert.equal(c2.isFloatBlocked, true);
      assert.equal(c2.floatEvent, "wallet.float_blocked");
    }
    console.log(
      `   [PASS] Cash settled (total commission -TZS ${totalCashCommission}) -> float blocked (${finalFloatAfterCash} TZS); replay idempotent`
    );

    // -----------------------------------------------------------------------
    // 2. MOBILE MONEY STK PUSH, HMAC WEBHOOK, REPLAY & AUTO-OFFSETTING FLOAT
    // -----------------------------------------------------------------------
    console.log("2. Testing Mobile Money STK Push, HMAC webhook, replay guard & negative-float auto-offset...");

    // Long Stone Town -> Paje trip (~48 km -> operatorNet > 25,000 TZS -> clears entire negative float!)
    const mmTrip = await runCompletedTrip({
      customer,
      rider,
      paymentMethod: "MOBILE_MONEY",
      dropoff: { lat: -6.269, lng: 39.532 },
      dropoffLabel: "Paje Beach",
    });

    const mmInit = await payApp.inject({
      method: "POST",
      url: "/api/v1/payments/mobile-money/initiate",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: {
        tripId: mmTrip.trip.id,
        customerPhone: TEST_CUSTOMER_PHONE,
        provider: "AZAMPAY",
      },
    });
    assert.equal(mmInit.statusCode, 202);
    const providerRef = mmInit.json().providerRef;

    const webhookPayload = JSON.stringify({
      providerRef,
      status: "SUCCESS",
      amountTzs: mmTrip.receipt.finalFareTzs,
    });

    // Bad HMAC signature MUST fail 401
    const badSigRes = await payApp.inject({
      method: "POST",
      url: "/api/v1/payments/webhooks/provider",
      headers: {
        "content-type": "application/json",
        "x-goboda-signature": "00000000000000000000000000000000",
      },
      payload: webhookPayload,
    });
    assert.equal(badSigRes.statusCode, 401);

    // Valid HMAC signature settles digital payment & auto-offsets negative float to 0!
    const validSig = computeWebhookSignature(webhookPayload);
    const okWebhook = await payApp.inject({
      method: "POST",
      url: "/api/v1/payments/webhooks/provider",
      headers: {
        "content-type": "application/json",
        "x-goboda-signature": validSig,
      },
      payload: webhookPayload,
    });
    assert.equal(okWebhook.statusCode, 200);
    const wJson = okWebhook.json();
    assert.equal(wJson.status, "CONFIRMED");
    assert.equal(wJson.floatOffsetTzs, totalCashCommission);
    assert.equal(wJson.commissionFloatTzs, 0);
    assert.equal(wJson.isFloatBlocked, false);
    assert.equal(wJson.floatEvent, "wallet.float_restored");
    assert.equal(
      wJson.withdrawableCreditTzs,
      mmTrip.receipt.operatorNetTzs - wJson.floatOffsetTzs
    );

    // Duplicate webhook replay MUST NOT double-credit EARNINGS!
    const replayWebhook = await payApp.inject({
      method: "POST",
      url: "/api/v1/payments/webhooks/provider",
      headers: {
        "content-type": "application/json",
        "x-goboda-signature": validSig,
      },
      payload: webhookPayload,
    });
    assert.equal(replayWebhook.statusCode, 200);
    assert.equal(replayWebhook.json().idempotentReplay, true);
    console.log(
      `   [PASS] Mobile Money webhook offset TZS ${wJson.floatOffsetTzs} negative float (restored!) & credited TZS ${wJson.withdrawableCreditTzs} net; replay safe`
    );

    // -----------------------------------------------------------------------
    // 3. DIGITAL TIMEOUT MUTUAL FALLBACK TO CASH
    // -----------------------------------------------------------------------
    console.log("3. Testing digital STK timeout -> mutual fallback to Cash...");

    const fallbackTrip = await runCompletedTrip({
      customer,
      rider,
      paymentMethod: "MOBILE_MONEY",
      dropoff: { lat: -6.222, lng: 39.2249 },
      dropoffLabel: "ZNZ Airport",
    });

    const fbInit = await payApp.inject({
      method: "POST",
      url: "/api/v1/payments/mobile-money/initiate",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: {
        tripId: fallbackTrip.trip.id,
        customerPhone: TEST_CUSTOMER_PHONE,
        provider: "CLICKPESA",
      },
    });
    assert.equal(fbInit.statusCode, 202);

    const failBody = JSON.stringify({
      providerRef: fbInit.json().providerRef,
      status: "FAILED",
    });
    const failHook = await payApp.inject({
      method: "POST",
      url: "/api/v1/payments/webhooks/provider",
      headers: {
        "content-type": "application/json",
        "x-goboda-signature": computeWebhookSignature(failBody),
      },
      payload: failBody,
    });
    assert.equal(failHook.statusCode, 200);
    assert.equal(failHook.json().fallbackAvailable, true);

    const swCash = await payApp.inject({
      method: "POST",
      url: "/api/v1/payments/fallback-cash",
      headers: { authorization: `Bearer ${customer.accessToken}` },
      payload: { tripId: fallbackTrip.trip.id, reason: "STK push timed out" },
    });
    assert.equal(swCash.statusCode, 200);
    assert.equal(swCash.json().switchedToCash, true);

    const settleCash = await payApp.inject({
      method: "POST",
      url: "/api/v1/payments/cash/confirm",
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: { tripId: fallbackTrip.trip.id },
    });
    assert.equal(settleCash.statusCode, 200);
    console.log("   [PASS] Failed STK Push converted to Cash & settled cleanly");

    // -----------------------------------------------------------------------
    // 4. FLOAT TOP-UP, INSTANT PAYOUT & ZERO-DRIFT DOUBLE-ENTRY LEDGER AUDIT
    // -----------------------------------------------------------------------
    console.log("4. Testing Float Top-Up, Instant Earnings Withdrawal & Zero-Drift Ledger Audit...");

    const topupRes = await payApp.inject({
      method: "POST",
      url: "/api/v1/wallets/float/topup",
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: {
        amountTzs: 5000,
        channel: "MPESA",
        phone: TEST_RIDER_PHONE,
      },
    });
    assert.equal(topupRes.statusCode, 200);
    assert.ok(topupRes.json().commissionFloatTzs > 0);

    // Excessive withdrawal must be blocked 409
    const overdraw = await payApp.inject({
      method: "POST",
      url: "/api/v1/wallets/payouts/withdraw",
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: {
        amountTzs: 1999000,
        payoutChannel: "MPESA",
        destinationPhone: TEST_RIDER_PHONE,
      },
    });
    assert.equal(overdraw.statusCode, 409);
    assert.equal(overdraw.json().error, "INSUFFICIENT_EARNINGS_BALANCE");

    const withdrawRes = await payApp.inject({
      method: "POST",
      url: "/api/v1/wallets/payouts/withdraw",
      headers: { authorization: `Bearer ${rider.accessToken}` },
      payload: {
        amountTzs: 3000,
        payoutChannel: "MPESA",
        destinationPhone: TEST_RIDER_PHONE,
      },
    });
    assert.equal(withdrawRes.statusCode, 201);
    assert.equal(withdrawRes.json().emittedEvent, "payout.completed");

    const myWallet = await payApp.inject({
      method: "GET",
      url: "/api/v1/wallets/me",
      headers: { authorization: `Bearer ${rider.accessToken}` },
    });
    assert.equal(myWallet.statusCode, 200);
    assert.equal(
      myWallet.json().earningsBalanceTzs,
      wJson.withdrawableCreditTzs - 3000
    );
    assert.ok(myWallet.json().payouts.length >= 1);

    // Admin Zero-Drift Audit
    const auditRes = await payApp.inject({
      method: "GET",
      url: "/api/v1/payments/admin/ledger-audit",
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    assert.equal(auditRes.statusCode, 200);
    const audit = auditRes.json();
    assert.equal(audit.ledgerBalanced, true);
    assert.equal(audit.totalLedgerDriftTzs, 0);
    assert.equal(audit.unbalancedJournals.length, 0);
    console.log(
      `   [PASS] Instant payout TZS 3,000 succeeded; Double-Entry Ledger Audit PASSED (drift = TZS ${audit.totalLedgerDriftTzs})`
    );

    // -----------------------------------------------------------------------
    // 5. API-GATEWAY PHASE 5 RBAC
    // -----------------------------------------------------------------------
    console.log("5. Testing api-gateway Phase 5 Wallet & Payment RBAC...");

    const gwCustWallet = await gatewayApp.inject({
      method: "GET",
      url: "/api/v1/wallets/me",
      headers: { authorization: `Bearer ${customer.accessToken}` },
    });
    assert.equal(gwCustWallet.statusCode, 403);

    const gwNoAuthPay = await gatewayApp.inject({
      method: "POST",
      url: "/api/v1/payments/cash/confirm",
      payload: {},
    });
    assert.equal(gwNoAuthPay.statusCode, 401);

    const gwCustAudit = await gatewayApp.inject({
      method: "GET",
      url: "/api/v1/payments/admin/ledger-audit",
      headers: { authorization: `Bearer ${customer.accessToken}` },
    });
    assert.equal(gwCustAudit.statusCode, 403);
    console.log("   [PASS] API Gateway enforces Wallet & Admin Ledger RBAC");

    console.log("\nALL PHASE 5 PAYMENT, DOUBLE-ENTRY LEDGER & PAYOUT TESTS PASSED!");
  } finally {
    await cleanup();
    await Promise.all([
      authApp.close(),
      locationApp.close(),
      tripApp.close(),
      dispatchApp.close(),
      payApp.close(),
      gatewayApp.close(),
    ]);
  }
}

runTests().catch((err) => {
  console.error("PHASE 5 TEST FAILED:", err);
  process.exit(1);
});
