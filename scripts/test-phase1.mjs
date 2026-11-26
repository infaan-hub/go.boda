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
const { default: authApp } = await import("../services/auth-service/dist/app.js");
const { default: operatorApp } = await import("../services/operator-service/dist/app.js");
const { default: geoApp } = await import("../services/geo-zone-service/dist/app.js");
const { default: gatewayApp } = await import("../services/api-gateway/dist/app.js");

const TEST_CUSTOMER_PHONE = "+255779000101";
const TEST_RIDER_PHONE = "+255779000102";
const TEST_ADMIN_PHONE = "+255779000103";
const TEST_PLATE = "Z 999 P1T";

async function cleanup() {
  const sql = getSql();
  await sql`DELETE FROM operator.profiles WHERE plate_number = ${TEST_PLATE} OR phone = ${TEST_RIDER_PHONE}`;
  await sql`DELETE FROM auth.otp_codes WHERE phone IN (${TEST_CUSTOMER_PHONE}, ${TEST_RIDER_PHONE}, ${TEST_ADMIN_PHONE})`;
  await sql`DELETE FROM auth.users WHERE phone IN (${TEST_CUSTOMER_PHONE}, ${TEST_RIDER_PHONE}, ${TEST_ADMIN_PHONE})`;
}

async function runTests() {
  await cleanup();

  try {
    // -----------------------------------------------------------------------
    // 1. GEO-ZONE-SERVICE (PostGIS Unguja Polygon, Stone Town Snap & Route)
    // -----------------------------------------------------------------------
    console.log("1. Testing geo-zone-service (Unguja PostGIS geofence & Stone Town snap)...");

    const ungujaOk = await geoApp.inject({
      method: "POST",
      url: "/api/v1/geo/validate",
      payload: {
        pickup: { lat: -6.1649, lng: 39.1936 }, // Darajani, Stone Town
        dropoff: { lat: -5.7265, lng: 39.2987 }, // Nungwi
      },
    });
    assert.equal(ungujaOk.statusCode, 200);
    assert.equal(ungujaOk.json().valid, true);

    const darBlocked = await geoApp.inject({
      method: "POST",
      url: "/api/v1/geo/validate",
      payload: { point: { lat: -6.7924, lng: 39.2803 } }, // Dar es Salaam
    });
    assert.equal(darBlocked.statusCode, 200);
    assert.equal(darBlocked.json().valid, false);
    assert.equal(darBlocked.json().error, "OUTSIDE_UNGUJA_SERVICE_AREA");

    const pembaBlocked = await geoApp.inject({
      method: "POST",
      url: "/api/v1/geo/validate",
      payload: { point: { lat: -5.2459, lng: 39.77 } }, // Pemba Island
    });
    assert.equal(pembaBlocked.statusCode, 200);
    assert.equal(pembaBlocked.json().valid, false);

    const stoneTownSnap = await geoApp.inject({
      method: "POST",
      url: "/api/v1/geo/resolve-point",
      payload: { lat: -6.1622, lng: 39.1895 }, // Interior Stone Town alley
    });
    assert.equal(stoneTownSnap.statusCode, 200);
    const snapJson = stoneTownSnap.json();
    assert.equal(snapJson.inUnguja, true);
    assert.equal(snapJson.inStoneTownPedestrian, true);
    assert.equal(snapJson.snapped, true);
    assert.ok(snapJson.snapGate?.id);
    assert.ok(snapJson.snapGate?.walkingDistanceMeters > 0);
    console.log(
      `   [PASS] Stone Town alley snapped to ${snapJson.snapGate.nameEn} (${snapJson.snapGate.walkingDistanceMeters}m / ${snapJson.snapGate.walkingMinutes} min walk)`
    );

    const landmarksRes = await geoApp.inject({
      method: "GET",
      url: "/api/v1/geo/landmarks?q=darajani",
    });
    assert.equal(landmarksRes.statusCode, 200);
    assert.ok(landmarksRes.json().count >= 1);

    const snapListRes = await geoApp.inject({
      method: "GET",
      url: "/api/v1/geo/snap-points",
    });
    assert.equal(snapListRes.statusCode, 200);
    assert.equal(snapListRes.json().count, 10);

    const routeRes = await geoApp.inject({
      method: "POST",
      url: "/api/v1/geo/route",
      payload: {
        pickup: { lat: -6.1622, lng: 39.1895 }, // Stone Town interior (auto-snapped)
        dropoff: { lat: -6.222, lng: 39.2249 }, // ZNZ Airport
      },
    });
    assert.equal(routeRes.statusCode, 200);
    const routeJson = routeRes.json();
    assert.equal(routeJson.pickup.snapped, true);
    assert.equal(routeJson.quotes.BODABODA.operatorRole, "RIDER");
    assert.equal(routeJson.quotes.BAJAJI.operatorRole, "DRIVER");
    assert.ok(routeJson.quotes.BODABODA.estimatedFareTzs >= 1500);
    assert.ok(
      routeJson.quotes.BAJAJI.estimatedFareTzs >
        routeJson.quotes.BODABODA.estimatedFareTzs
    );
    console.log(
      `   [PASS] Route Stone Town -> ZNZ Airport: ${routeJson.route.distanceKm} km (${routeJson.route.source}) | Go.boda TZS ${routeJson.quotes.BODABODA.estimatedFareTzs} | Go.bajaji TZS ${routeJson.quotes.BAJAJI.estimatedFareTzs}`
    );

    // -----------------------------------------------------------------------
    // 2. AUTH-SERVICE (Phone OTP, JWT Issuance, Refresh Rotation & Admin Seed)
    // -----------------------------------------------------------------------
    console.log("2. Testing auth-service (OTP, JWT, refresh rotation, RBAC roles)...");

    async function loginViaOtp(phone, intendedRole, name) {
      const reqRes = await authApp.inject({
        method: "POST",
        url: "/api/v1/auth/otp/request",
        payload: { phone, channel: "WHATSAPP", locale: "sw" },
      });
      assert.equal(reqRes.statusCode, 200);
      const { devOtp } = reqRes.json();
      assert.match(devOtp, /^\d{6}$/);

      const verRes = await authApp.inject({
        method: "POST",
        url: "/api/v1/auth/otp/verify",
        payload: { phone, code: devOtp, intendedRole, name },
      });
      assert.equal(verRes.statusCode, 200);
      return verRes.json();
    }

    const customerSession = await loginViaOtp(
      "0779000101", // tests 07xx -> +2557xx normalization
      "CUSTOMER",
      "Amina Juma"
    );
    assert.equal(customerSession.user.phone, TEST_CUSTOMER_PHONE);
    assert.equal(customerSession.user.role, "CUSTOMER");

    const meRes = await authApp.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${customerSession.accessToken}` },
    });
    assert.equal(meRes.statusCode, 200);

    const refreshRes = await authApp.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: customerSession.refreshToken },
    });
    assert.equal(refreshRes.statusCode, 200);
    // Replaying old rotated refresh token must fail
    const replayRes = await authApp.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken: customerSession.refreshToken },
    });
    assert.equal(replayRes.statusCode, 401);

    const riderSession = await loginViaOtp(
      TEST_RIDER_PHONE,
      "BODABODA_RIDER",
      "Hassan Ali"
    );
    assert.equal(riderSession.user.role, "BODABODA_RIDER");

    // Promote test Admin using INTERNAL_SERVICE_SECRET then login
    const promoteRes = await authApp.inject({
      method: "POST",
      url: "/api/v1/auth/internal/promote-admin",
      headers: {
        "x-internal-service-secret": process.env.INTERNAL_SERVICE_SECRET,
      },
      payload: { phone: TEST_ADMIN_PHONE, name: "Go.boda Ops Admin" },
    });
    assert.equal(promoteRes.statusCode, 200);
    const adminSession = await loginViaOtp(
      TEST_ADMIN_PHONE,
      "CUSTOMER", // existing ADMIN role must be preserved
      "Go.boda Ops Admin"
    );
    assert.equal(adminSession.user.role, "ADMIN");
    console.log("   [PASS] Auth OTP, +255 normalization, JWT, refresh rotation & Admin role verified");

    // -----------------------------------------------------------------------
    // 3. OPERATOR-SERVICE (Bodaboda Rider KYC, Availability Gate & Admin Approval)
    // -----------------------------------------------------------------------
    console.log("3. Testing operator-service (Bodaboda Rider KYC, helmet checklist & approval)...");

    const onboardRes = await operatorApp.inject({
      method: "POST",
      url: "/api/v1/operators/onboarding",
      headers: { authorization: `Bearer ${riderSession.accessToken}` },
      payload: {
        transportType: "BODABODA",
        fullName: "Hassan Ali",
        phone: TEST_RIDER_PHONE,
        homeKituo: "Darajani / Creek Road Stage",
        nationalIdNo: "ZAN-19950101-0001",
        licenseNo: "ZN-A-12345",
        licenseExpiry: "2029-12-31",
        plateNumber: TEST_PLATE,
        vehicleModel: "Boxer BM 150",
        vehicleColor: "Red",
        insuranceExpiry: "2027-12-31",
        payoutMobileNumber: TEST_RIDER_PHONE,
      },
    });
    assert.equal(onboardRes.statusCode, 200);
    const onboardJson = onboardRes.json();
    assert.equal(onboardJson.profile.operator_title, "RIDER");
    assert.equal(onboardJson.profile.kyc_status, "PENDING_VERIFICATION");
    assert.ok(onboardJson.requiredDocuments.includes("HELMETS"));

    // Presign helmet photo upload
    const presignRes = await operatorApp.inject({
      method: "POST",
      url: "/api/v1/operators/documents/presign",
      headers: { authorization: `Bearer ${riderSession.accessToken}` },
      payload: { docType: "HELMETS", contentType: "image/jpeg" },
    });
    assert.equal(presignRes.statusCode, 200);

    // Must NOT be able to go online before Admin approval
    const blockedOnline = await operatorApp.inject({
      method: "PATCH",
      url: "/api/v1/operators/availability",
      headers: { authorization: `Bearer ${riderSession.accessToken}` },
      payload: { isOnline: true },
    });
    assert.equal(blockedOnline.statusCode, 403);
    assert.equal(blockedOnline.json().error, "KYC_NOT_APPROVED");

    // Admin approves Bodaboda Rider
    const approveRes = await operatorApp.inject({
      method: "POST",
      url: `/api/v1/operators/admin/${onboardJson.profile.id}/review`,
      headers: { authorization: `Bearer ${adminSession.accessToken}` },
      payload: { decision: "APPROVED", helmetVerified: true },
    });
    assert.equal(approveRes.statusCode, 200);
    assert.equal(approveRes.json().emittedEvent, "operator.approved");

    // Now Rider CAN go online!
    const allowedOnline = await operatorApp.inject({
      method: "PATCH",
      url: "/api/v1/operators/availability",
      headers: { authorization: `Bearer ${riderSession.accessToken}` },
      payload: { isOnline: true },
    });
    assert.equal(allowedOnline.statusCode, 200);
    assert.equal(allowedOnline.json().availability.is_online, true);
    console.log("   [PASS] Operator onboarding, HELMETS checklist, approval gate & availability verified");

    // -----------------------------------------------------------------------
    // 4. API-GATEWAY EDGE RBAC ENFORCEMENT
    // -----------------------------------------------------------------------
    console.log("4. Testing api-gateway edge JWT & RBAC guards...");

    const gwNoAuthAdmin = await gatewayApp.inject({
      method: "GET",
      url: "/api/v1/operators/admin/queue",
    });
    assert.equal(gwNoAuthAdmin.statusCode, 401);

    const gwCustAdmin = await gatewayApp.inject({
      method: "GET",
      url: "/api/v1/operators/admin/queue",
      headers: { authorization: `Bearer ${customerSession.accessToken}` },
    });
    assert.equal(gwCustAdmin.statusCode, 403);

    const gwCustOp = await gatewayApp.inject({
      method: "GET",
      url: "/api/v1/operators/me",
      headers: { authorization: `Bearer ${customerSession.accessToken}` },
    });
    assert.equal(gwCustOp.statusCode, 403);
    console.log("   [PASS] API Gateway RBAC blocks unauthorized /admin and /operators access");

    console.log("\nALL PHASE 1 INTEGRATION TESTS PASSED!");
  } finally {
    await cleanup();
    await Promise.all([
      authApp.close(),
      operatorApp.close(),
      geoApp.close(),
      gatewayApp.close(),
    ]);
  }
}

runTests().catch((err) => {
  console.error("PHASE 1 TEST FAILED:", err);
  process.exit(1);
});
