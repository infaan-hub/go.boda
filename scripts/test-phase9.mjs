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

const PILOT_ADMIN_PHONE = "+255770000112";
const TEST_CUST_PHONE = "+255779000901";
const TEST_RIDER_PHONE = "+255779000902";
const TEST_ADMIN_REG_PHONE = "+255779000903";
const TEST_PLATE = "Z 902 P9X";
const TEST_ADMIN_REG_PLATE = "Z 903 P9R";
const TEST_TRUSTED_OWNER_CUST = "phase9-cust-owner-test";
const TEST_TRUSTED_OWNER_PARTNER = "phase9-partner-owner-test";

const PORTS = {
  customer: 3120,
  partner: 3121,
  admin: 3122,
};

const children = [];
let createdCustomerUserId = null;
let createdRiderUserId = null;
let createdOperatorProfileId = null;
let createdTripId = null;
let createdTicketId = null;
let createdBroadcastId = null;
let originalVituoTarget = null;
let updatedVituoId = null;

function startNextApp(appDir, port) {
  const nextBin = resolve(process.cwd(), appDir, "node_modules/next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"],
    {
      cwd: resolve(process.cwd(), appDir),
      env: {
        ...process.env,
        NODE_ENV: "production",
        OTP_DEV_ECHO: "true",
        OTP_SKIP_COOLDOWN: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  children.push(child);
  return child;
}

async function waitForHttp(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
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
  if (updatedVituoId && originalVituoTarget != null) {
    await sql`
      UPDATE geo.landmarks
      SET target_supply = ${originalVituoTarget}
      WHERE id = ${updatedVituoId}
    `;
  }
  if (createdTicketId) {
    await sql`DELETE FROM notif.support_tickets WHERE id = ${createdTicketId}::uuid`;
  }
  await sql`DELETE FROM notif.support_tickets WHERE reporter_phone = ${TEST_CUST_PHONE}`;
  if (createdBroadcastId) {
    await sql`DELETE FROM notif.messages WHERE id = ${createdBroadcastId}::uuid`;
  }
  await sql`DELETE FROM notif.messages WHERE phone IN (${TEST_CUST_PHONE}, ${TEST_RIDER_PHONE})`;
  await sql`
    DELETE FROM safety.trusted_contacts
    WHERE owner_key IN (${TEST_TRUSTED_OWNER_CUST}, ${TEST_TRUSTED_OWNER_PARTNER})
  `;
  if (createdCustomerUserId) {
    await sql`DELETE FROM safety.trusted_contacts WHERE owner_key = ${createdCustomerUserId}`;
  }
  if (createdRiderUserId) {
    await sql`DELETE FROM safety.trusted_contacts WHERE owner_key = ${createdRiderUserId}`;
  }
  if (createdTripId) {
    await sql`DELETE FROM trip.state_transitions WHERE trip_id = ${createdTripId}::uuid`;
    await sql`DELETE FROM dispatch.offers WHERE trip_id = ${createdTripId}::uuid`;
    await sql`DELETE FROM dispatch.trip_locks WHERE trip_id = ${createdTripId}::uuid`;
    await sql`DELETE FROM safety.helmet_compliance_logs WHERE trip_id = ${createdTripId}::uuid`;
    await sql`DELETE FROM trip.trips WHERE id = ${createdTripId}::uuid`;
  }
  if (createdRiderUserId) {
    await sql`DELETE FROM location.operator_positions WHERE operator_id = ${createdRiderUserId}::uuid`;
    await sql`DELETE FROM operator.profiles WHERE user_id = ${createdRiderUserId}::uuid`;
  }
  await sql`DELETE FROM operator.profiles WHERE plate_number IN (${TEST_PLATE}, ${TEST_ADMIN_REG_PLATE})`;
  await sql`DELETE FROM location.operator_positions WHERE plate_number IN (${TEST_PLATE}, ${TEST_ADMIN_REG_PLATE})`;
  await sql`
    DELETE FROM finance.wallet_accounts
    WHERE owner_id IN (SELECT id FROM auth.users WHERE phone = ${TEST_ADMIN_REG_PHONE})
  `;
  await sql`DELETE FROM auth.otp_codes WHERE phone IN (${PILOT_ADMIN_PHONE}, ${TEST_CUST_PHONE}, ${TEST_RIDER_PHONE}, ${TEST_ADMIN_REG_PHONE})`;
  await sql`DELETE FROM auth.users WHERE phone IN (${TEST_CUST_PHONE}, ${TEST_RIDER_PHONE}, ${TEST_ADMIN_REG_PHONE})`;
}

async function runTests() {
  await cleanup();

  console.log("0. Booting built Next.js servers for Phase 9 (customer-web, partner-pwa, admin-web)...");
  startNextApp("apps/customer-web", PORTS.customer);
  startNextApp("apps/partner-pwa", PORTS.partner);
  startNextApp("apps/admin-web", PORTS.admin);

  const custUrl = `http://127.0.0.1:${PORTS.customer}`;
  const partUrl = `http://127.0.0.1:${PORTS.partner}`;
  const admUrl = `http://127.0.0.1:${PORTS.admin}`;

  try {
    await Promise.all([
      waitForHttp(`${custUrl}/safety`),
      waitForHttp(`${partUrl}/safety`),
      waitForHttp(`${admUrl}/admin/login`),
    ]);

    // -----------------------------------------------------------------------
    // 1. AUTHENTICATE PILOT ADMIN & TEST OPERATOR / CUSTOMER / TRIP FIXTURES
    // -----------------------------------------------------------------------
    console.log("1. Authenticating Pilot Ops Admin, Test Customer, and Test Bodaboda Rider...");

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
    assert.ok(adminCookie, "Admin cookie must be set");

    // Register test Customer
    const custRegRes = await fetch(`${custUrl}/api/customer/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Asha Salum",
        phone: TEST_CUST_PHONE,
        password: "UngujaPassword123!",
      }),
    });
    assert.equal(custRegRes.status, 201);
    const custRegJson = await custRegRes.json();
    createdCustomerUserId = custRegJson.customer.id;
    const customerCookie = extractCookie(custRegRes, "goboda_customer_session");
    assert.ok(customerCookie, "Customer cookie must be set");

    // Sign in test Partner Rider & create KYC profile
    const partAuthRes = await fetch(`${partUrl}/api/partner/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: TEST_RIDER_PHONE,
        name: "Suleiman Juma",
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
        fullName: "Suleiman Juma",
        homeKituo: "Mwanakwerekwe Stage",
        nationalIdNo: "ZNZ-19930512-9902",
        licenseNo: "ZN-DL-90200",
        licenseExpiry: "2029-12-31",
        plateNumber: TEST_PLATE,
        vehicleModel: "Boxer BM150",
        vehicleColor: "Red",
        insuranceExpiry: "2028-06-30",
      }),
    });
    assert.equal(kycRes.status, 201);
    createdOperatorProfileId = (await kycRes.json()).profile.id;

    // Create a live Unguja Trip for /admin/trips/[id] & /trips
    const tripRes = await fetch(`${custUrl}/api/trips`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: customerCookie },
      body: JSON.stringify({
        customerId: createdCustomerUserId,
        transportType: "BODABODA",
        pickup: { lat: -6.1622, lng: 39.1895 },
        pickupLabel: "Stone Town Alley",
        dropoff: { lat: -6.222, lng: 39.2249 },
        dropoffLabel: "ZNZ Airport",
        paymentMethod: "CASH",
      }),
    });
    assert.equal(tripRes.status, 201);
    const tripJson = await tripRes.json();
    createdTripId = tripJson.trip.id;
    const createdTripCode = tripJson.trip.tripCode;

    // -----------------------------------------------------------------------
    // 2. ALL 13 NEW /admin/* PAGES (307 UNAUTH -> /admin/login, 200 AUTHED)
    // -----------------------------------------------------------------------
    console.log("2. Verifying Edge auth gate (307) & 200 OK render on all 13 new /admin/* pages...");
    const phase9AdminPages = [
      `/admin/operators/${createdOperatorProfileId}`,
      "/admin/compliance/expiries",
      "/admin/vituo",
      "/admin/heatmap",
      "/admin/fleet/telemetry",
      "/admin/pricing/simulator",
      "/admin/promos/analytics",
      "/admin/dispatch/queue",
      "/admin/dispatch/performance",
      `/admin/trips/${createdTripId}`,
      "/admin/broadcasts",
      "/admin/support/inbox",
      "/admin/safety/helmets",
    ];

    for (const path of phase9AdminPages) {
      const unauth = await fetch(`${admUrl}${path}`, { redirect: "manual" });
      assert.equal(unauth.status, 307, `Unauthenticated ${path} must redirect 307`);
      assert.ok(
        (unauth.headers.get("location") || "").endsWith("/admin/login"),
        `${path} must redirect to /admin/login`
      );

      const authed = await fetch(`${admUrl}${path}`, {
        headers: { cookie: adminCookie },
        redirect: "manual",
      });
      assert.equal(authed.status, 200, `Authenticated ${path} must return 200 OK`);

      // Also verify Next.js App Router RSC prefetch (?_rsc=...) returns 200 OK (never 404)
      const rscRes = await fetch(`${admUrl}${path}?_rsc=phase9test`, {
        headers: {
          cookie: adminCookie,
          RSC: "1",
          "Next-Router-Prefetch": "1",
        },
        redirect: "manual",
      });
      assert.equal(rscRes.status, 200, `RSC prefetch ${path}?_rsc=... must return 200 OK`);
    }
    console.log(`   [PASS] All ${phase9AdminPages.length}/13 new /admin/* pages enforce auth & return 200 OK (HTML + RSC prefetch)!`);

    // Verify Admin Rider-Driver Registration endpoint (clear 400 validation + forgiving 201 create)
    const badReg = await fetch(`${admUrl}/api/ops/operators/register`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        username: "bad_plate_test",
        password: "UngujaPassword123!",
        fullName: "Test Rider",
        phone: TEST_ADMIN_REG_PHONE,
        transportType: "BODABODA",
        plateNumber: "T 123 ABC",
        homeKituo: "Darajani",
        nationalIdNo: "ZNZ123",
        licenseNo: "DL12",
        vehicleModel: "Boxer 150",
        vehicleColor: "Black",
        payoutMobileNumber: "",
        helmetVerified: true,
      }),
    });
    assert.equal(badReg.status, 400);
    const badRegJson = await badReg.json();
    assert.ok(
      typeof badRegJson.message === "string" && badRegJson.message.includes("Plate number"),
      "400 validation response must return clear human-readable field message"
    );

    const goodReg = await fetch(`${admUrl}/api/ops/operators/register`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        username: "@Phase9 Rider",
        password: "UngujaPassword123!",
        fullName: "Mussa Hamad",
        phone: "+255 779 000 903",
        transportType: "BODABODA",
        plateNumber: "z 903 p9r",
        homeKituo: "Darajani",
        nationalIdNo: "ZNZ-903",
        licenseNo: "ZN-903",
        licenseExpiry: "",
        insuranceExpiry: "",
        vehicleModel: "Honda CG 125",
        vehicleColor: "Red",
        payoutMobileNumber: "",
        helmetVerified: true,
      }),
    });
    assert.equal(goodReg.status, 201, "Admin Rider-Driver registration must normalize spaces/blank payout and return 201");
    console.log("   [PASS] Admin /api/ops/operators/register validation messages & forgiving input normalization verified!");

    // -----------------------------------------------------------------------
    // 3. ALL 13 NEW /api/ops/* ENDPOINTS (401 LOCK + LIVE NEON INTERACTIONS)
    // -----------------------------------------------------------------------
    console.log("3. Testing all 13 new /api/ops/* endpoints (401 lock + Neon CRUD)...");

    const getOpsEndpoints = [
      `/api/ops/operators/${createdOperatorProfileId}`,
      "/api/ops/compliance/expiries",
      "/api/ops/vituo",
      "/api/ops/location/heatmap",
      "/api/ops/location/telemetry",
      "/api/ops/promos/analytics",
      "/api/ops/dispatch/queue",
      "/api/ops/dispatch/performance",
      `/api/ops/trips/${createdTripId}`,
      "/api/ops/broadcasts",
      "/api/ops/support/inbox",
      "/api/ops/safety/helmets",
    ];

    for (const ep of getOpsEndpoints) {
      const locked = await fetch(`${admUrl}${ep}`);
      assert.equal(locked.status, 401, `Unauthenticated GET ${ep} must return 401`);
      const unlocked = await fetch(`${admUrl}${ep}`, {
        headers: { cookie: adminCookie },
      });
      assert.equal(unlocked.status, 200, `Authenticated GET ${ep} must return 200`);
    }

    // 3a. Pricing Simulator: 401 unauth, 422 outside Unguja, 1.25x cap & Operator 88% net protection
    assert.equal(
      (
        await fetch(`${admUrl}/api/ops/pricing/simulate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pickup: { lat: -6.1649, lng: 39.1936 },
            dropoff: { lat: -6.269, lng: 39.532 },
          }),
        })
      ).status,
      401
    );

    const simDar = await fetch(`${admUrl}/api/ops/pricing/simulate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        pickup: { lat: -6.1649, lng: 39.1936 },
        dropoff: { lat: -6.7924, lng: 39.2803 }, // Dar es Salaam -> must reject 422
      }),
    });
    assert.equal(simDar.status, 422, "Simulator must reject outside-Unguja routes 422");

    const simPaje = await fetch(`${admUrl}/api/ops/pricing/simulate`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        pickup: { lat: -6.1622, lng: 39.1895 }, // Stone Town Alley -> Smart Snap!
        dropoff: { lat: -6.269, lng: 39.532 }, // Paje Beach
        multiplier: 1.5, // Exceeds cap -> must auto-cap to 1.25x!
      }),
    });
    assert.equal(simPaje.status, 200);
    const simJson = await simPaje.json();
    assert.equal(simJson.multiplierApplied, 1.25, "Surge must cap strictly at 1.25x");
    assert.equal(simJson.capEnforced, true);
    assert.equal(simJson.route.smartSnapped, true);
    assert.equal(simJson.simulation.BODABODA.operatorGrossProtected, true);
    assert.ok(simJson.simulation.BAJAJI.grossFareTzs > simJson.simulation.BODABODA.grossFareTzs);

    // 3b. Vituo Target Supply PATCH
    const vituoRes = await fetch(`${admUrl}/api/ops/vituo`, {
      headers: { cookie: adminCookie },
    });
    const vituoJson = await vituoRes.json();
    assert.ok(vituoJson.vituo.length > 0, "At least one Unguja Kituo must be seeded");
    const firstKituo = vituoJson.vituo[0];
    updatedVituoId = firstKituo.id;
    originalVituoTarget = firstKituo.targetSupply;

    const patchKituoRes = await fetch(`${admUrl}/api/ops/vituo`, {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({ id: firstKituo.id, targetSupply: 9 }),
    });
    assert.equal(patchKituoRes.status, 200);
    assert.equal((await patchKituoRes.json()).kituo.targetSupply, 9);

    // 3c. Trip Forensics Dispute Adjustment POST
    const adjRes = await fetch(`${admUrl}/api/ops/trips/${createdTripId}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        adjustedFareTzs: 5000,
        note: "Phase 9 automated dispute resolution audit check",
      }),
    });
    assert.equal(adjRes.status, 200);
    const forensicsAfter = await (
      await fetch(`${admUrl}/api/ops/trips/${createdTripId}`, {
        headers: { cookie: adminCookie },
      })
    ).json();
    assert.equal(Number(forensicsAfter.trip.finalFareTzs), 5000);
    assert.ok(forensicsAfter.transitions.length >= 1);

    // 3d. Bilingual Ops Broadcast POST
    const bcastRes = await fetch(`${admUrl}/api/ops/broadcasts`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        segment: "BODABODA_RIDERS",
        channel: "WHATSAPP",
        titleSw: "Tahadhari ya Mvua Unguja",
        bodySw: "Endesha kwa uangalifu na hakikisha helmeti 2 safi.",
        titleEn: "Unguja Rain Advisory",
        bodyEn: "Ride safely and keep 2 clean helmets ready.",
      }),
    });
    assert.equal(bcastRes.status, 201);
    createdBroadcastId = (await bcastRes.json()).broadcast.id;

    // 3e. Bodaboda Helmet Safety Badge POST
    const helmetRes = await fetch(`${admUrl}/api/ops/safety/helmets`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        profileId: createdOperatorProfileId,
        action: "AWARD_SAFE_BADGE",
        note: "Verified 2 clean helmets",
      }),
    });
    assert.equal(helmetRes.status, 200);
    assert.equal((await helmetRes.json()).rider.helmetVerified, true);
    console.log("   [PASS] All 13 /api/ops/* endpoints verified (401 lock + live Neon operations)!");

    // -----------------------------------------------------------------------
    // 4. CUSTOMER /trips + LOST-ITEM -> ADMIN /admin/support/inbox CROSS-APP
    // -----------------------------------------------------------------------
    console.log("4. Verifying Customer /trips, Lost-Item submission -> Admin Support Inbox resolution...");

    // Unauthenticated /trips redirects to /login; Authenticated /trips returns 200 OK
    const tripsUnauth = await fetch(`${custUrl}/trips`, { redirect: "manual" });
    assert.equal(tripsUnauth.status, 307);
    assert.ok((tripsUnauth.headers.get("location") || "").endsWith("/login"));

    const tripsAuthed = await fetch(`${custUrl}/trips`, {
      headers: { cookie: customerCookie },
      redirect: "manual",
    });
    assert.equal(tripsAuthed.status, 200, "Authenticated Customer /trips must return 200 OK");

    // Customer submits lost-item ticket
    const lostRes = await fetch(`${custUrl}/api/support/lost-item`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: customerCookie },
      body: JSON.stringify({
        tripId: createdTripId,
        tripCode: createdTripCode,
        category: "LOST_ITEM",
        subject: "Left black sunglasses on Bodaboda",
        description: "Dropped near ZNZ Airport dropoff gate.",
      }),
    });
    assert.equal(lostRes.status, 201);
    const lostJson = await lostRes.json();
    createdTicketId = lostJson.ticket.id;

    // Admin sees ticket in /api/ops/support/inbox & resolves it bilingually
    const inboxJson = await (
      await fetch(`${admUrl}/api/ops/support/inbox`, {
        headers: { cookie: adminCookie },
      })
    ).json();
    const foundTicket = inboxJson.tickets.find((t) => t.id === createdTicketId);
    assert.ok(foundTicket, "Customer lost-item ticket MUST appear live in /admin/support/inbox");

    const replyRes = await fetch(`${admUrl}/api/ops/support/inbox`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: adminCookie },
      body: JSON.stringify({
        ticketId: createdTicketId,
        status: "RESOLVED",
        opsReplySw: "Tumewasiliana na Rider, miwani yako ipo salama Darajani.",
        opsReplyEn: "We contacted your Rider — your sunglasses are safe at Darajani.",
      }),
    });
    assert.equal(replyRes.status, 200);

    // Customer sees Admin's bilingual reply on GET /api/support/lost-item
    const custTickets = await (
      await fetch(`${custUrl}/api/support/lost-item`, {
        headers: { cookie: customerCookie },
      })
    ).json();
    const resolvedTicket = custTickets.tickets.find((t) => t.id === createdTicketId);
    assert.equal(resolvedTicket.status, "RESOLVED");
    assert.ok(resolvedTicket.opsReplyEn.includes("Darajani"));
    console.log("   [PASS] Customer /trips Lost-Item <-> Admin /admin/support/inbox synced end-to-end!");

    // -----------------------------------------------------------------------
    // 5. CUSTOMER & PARTNER /safety + TRUSTED CONTACTS (MAX 3 ENFORCED)
    // -----------------------------------------------------------------------
    console.log("5. Verifying /safety on both customer-web & partner-pwa + Max 3 Trusted Contacts...");

    assert.equal((await fetch(`${custUrl}/safety`)).status, 200, "Customer /safety must return 200 OK");
    assert.equal((await fetch(`${partUrl}/safety`)).status, 200, "Partner /safety must return 200 OK");

    // Customer adds 3 Trusted Contacts -> 4th MUST fail 409 MAX_TRUSTED_CONTACTS_REACHED
    const custContactIds = [];
    for (let i = 1; i <= 3; i++) {
      const addRes = await fetch(`${custUrl}/api/safety/trusted-contacts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerKey: TEST_TRUSTED_OWNER_CUST,
          contactName: `Family Contact ${i}`,
          contactPhone: `+25577700010${i}`,
          relationship: "Family",
        }),
      });
      assert.equal(addRes.status, 201);
      custContactIds.push((await addRes.json()).contact.id);
    }

    const fourthCust = await fetch(`${custUrl}/api/safety/trusted-contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerKey: TEST_TRUSTED_OWNER_CUST,
        contactName: "Fourth Contact Blocked",
        contactPhone: "+255777000104",
        relationship: "Friend",
      }),
    });
    assert.equal(fourthCust.status, 409, "4th Customer Trusted Contact MUST fail 409");

    // Delete 1 Customer Trusted Contact -> count drops to 2
    const delCust = await fetch(
      `${custUrl}/api/safety/trusted-contacts?id=${custContactIds[0]}&ownerKey=${TEST_TRUSTED_OWNER_CUST}`,
      { method: "DELETE" }
    );
    assert.equal(delCust.status, 200);
    const afterDelCust = await (
      await fetch(`${custUrl}/api/safety/trusted-contacts?ownerKey=${TEST_TRUSTED_OWNER_CUST}`)
    ).json();
    assert.equal(afterDelCust.count, 2);

    // Partner adds 3 Trusted Contacts -> 4th MUST fail 409 MAX_TRUSTED_CONTACTS_REACHED
    for (let i = 1; i <= 3; i++) {
      const addRes = await fetch(`${partUrl}/api/safety/trusted-contacts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerKey: TEST_TRUSTED_OWNER_PARTNER,
          ownerRole: "BODABODA_RIDER",
          contactName: `Kituo Contact ${i}`,
          contactPhone: `+25577800020${i}`,
          relationship: "Kituo Leader",
        }),
      });
      assert.equal(addRes.status, 201);
    }

    const fourthPart = await fetch(`${partUrl}/api/safety/trusted-contacts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ownerKey: TEST_TRUSTED_OWNER_PARTNER,
        ownerRole: "BODABODA_RIDER",
        contactName: "Fourth Partner Contact Blocked",
        contactPhone: "+255778000204",
        relationship: "Family",
      }),
    });
    assert.equal(fourthPart.status, 409, "4th Partner Trusted Contact MUST fail 409");

    console.log("   [PASS] Customer & Partner /safety pages + Max-3 Trusted Contacts CRUD verified!");
    console.log("\nALL PHASE 9 (15 SERVICE-MAPPED PAGES & LIVE NEON FLOWS) TESTS PASSED!");
  } finally {
    for (const c of children) {
      c.kill("SIGTERM");
    }
    await cleanup();
  }
}

runTests().catch((err) => {
  console.error("PHASE 9 TEST FAILED:", err);
  for (const c of children) {
    c.kill("SIGTERM");
  }
  process.exit(1);
});
