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

const { getSql, verifyPassword } = await import("../packages/db/dist/index.js");

const PORTS = {
  customer: 3110,
  partner: 3110,
  admin: 3110,
};

const stamp = String(Date.now()).slice(-7);
const TEST_PARTNER = {
  username: `auth_test_${stamp}`,
  password: "PartnerPass123!",
  phone: `+2557799${stamp.slice(-5)}`,
  fullName: "Auth Flow Test Rider",
  plate: `Z ${stamp.slice(-3)} AFT`,
  homeKituo: "Darajani Test Stage",
  nationalIdNo: `19900101-${stamp}-00001-12`,
  licenseNo: `ZN-A-${stamp}`,
  vehicleModel: "Honda CG 125",
  vehicleColor: "Red",
  payoutMobileNumber: `+2557799${stamp.slice(-5)}`,
};
const TEST_CUSTOMER = {
  name: "Auth Flow Test Customer",
  phone: `+2557788${stamp.slice(-5)}`,
  password: "CustomerPass123!",
};

const children = [];
let partnerUserId = null;
let customerUserId = null;

function startNextApp(appDir, port) {
  const nextBin = resolve(process.cwd(), appDir, "node_modules/next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"],
    {
      cwd: resolve(process.cwd(), appDir),
      env: { ...process.env, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  children.push(child);
  return child;
}

async function waitForHttp(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0) return;
    } catch {
      // still booting
    }
    await new Promise((r) => setTimeout(r, 500));
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
  if (partnerUserId) {
    await sql`DELETE FROM notif.push_subscriptions WHERE user_id = ${partnerUserId}::uuid`.catch(() => null);
    await sql`DELETE FROM notif.messages WHERE user_id = ${partnerUserId}::uuid`.catch(() => null);
    await sql`DELETE FROM finance.wallet_accounts WHERE owner_id = ${partnerUserId}::uuid`.catch(() => null);
    await sql`DELETE FROM operator.profiles WHERE user_id = ${partnerUserId}::uuid`.catch(() => null);
    await sql`DELETE FROM auth.users WHERE id = ${partnerUserId}::uuid`.catch(() => null);
  }
  if (customerUserId) {
    await sql`DELETE FROM auth.users WHERE id = ${customerUserId}::uuid`.catch(() => null);
  }
}

try {
  console.log("0. Booting the Go.boda monolith production server...");
  startNextApp("apps/monolith", PORTS.customer);

  const custUrl = `http://127.0.0.1:${PORTS.customer}`;
  const partUrl = `http://127.0.0.1:${PORTS.partner}`;
  const admUrl = `http://127.0.0.1:${PORTS.admin}`;

  await Promise.all([
    waitForHttp(`${custUrl}/login`),
    waitForHttp(`${partUrl}/partner/login`),
    waitForHttp(`${admUrl}/admin/login`),
  ]);
  console.log("   Servers are up.");

  /* ================= ADMIN ================= */
  console.log("\n1. Admin: unauthenticated gating");
  const admDashAnon = await fetch(`${admUrl}/admin/dashboard`, { redirect: "manual" });
  assert.equal(admDashAnon.status, 307, "anon /admin/dashboard must redirect");
  assert.ok(
    (admDashAnon.headers.get("location") || "").endsWith("/admin/login"),
    "anon /admin/dashboard -> /admin/login"
  );

  const admRootAnon = await fetch(`${admUrl}/`, { redirect: "manual" });
  assert.equal(admRootAnon.status, 200, "monolith / remains the customer homepage");

  console.log("2. Admin: wrong credentials rejected");
  const admBad = await fetch(`${admUrl}/api/ops/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin504", password: "wrong-password" }),
  });
  assert.equal(admBad.status, 401, "wrong admin password -> 401");
  assert.equal(extractCookie(admBad, "goboda_admin_session"), null);

  console.log("3. Admin: admin504 / Admin009@504 login");
  const admLogin = await fetch(`${admUrl}/api/ops/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin504", password: "Admin009@504" }),
  });
  assert.equal(admLogin.status, 200, "admin login -> 200");
  const admJson = await admLogin.json();
  assert.equal(admJson.authenticated, true);
  assert.equal(admJson.admin.role, "ADMIN");
  const admCookie = extractCookie(admLogin, "goboda_admin_session");
  assert.ok(admCookie, "admin session cookie set");

  const admDashAuthed = await fetch(`${admUrl}/admin/dashboard`, {
    redirect: "manual",
    headers: { cookie: admCookie },
  });
  assert.equal(admDashAuthed.status, 200, "authed /admin/dashboard -> 200");

  const admLoginAuthed = await fetch(`${admUrl}/admin/login`, {
    redirect: "manual",
    headers: { cookie: admCookie },
  });
  assert.equal(admLoginAuthed.status, 307, "authed /admin/login redirects");
  assert.ok((admLoginAuthed.headers.get("location") || "").endsWith("/admin/dashboard"));

  console.log("4. Admin: session /me + logout");
  const admMe = await fetch(`${admUrl}/api/ops/auth/me`, { headers: { cookie: admCookie } });
  assert.equal(admMe.status, 200);
  assert.equal((await admMe.json()).authenticated, true);

  /* ================= PARTNER ================= */
  console.log("\n5. Partner: unauthenticated gating");
  for (const protectedRoute of [
    "/partner/shift",
    "/partner/hotspots",
    "/partner/trips",
    "/partner/earnings",
    "/partner/kyc",
    "/partner/notifications",
    "/partner/dashboard",
  ]) {
    const anonRes = await fetch(`${partUrl}${protectedRoute}`, { redirect: "manual" });
    assert.equal(anonRes.status, 307, `anon ${protectedRoute} must redirect`);
    assert.ok(
      (anonRes.headers.get("location") || "").endsWith("/partner/login"),
      `anon ${protectedRoute} -> /partner/login`
    );
  }

  const partLoginPage = await fetch(`${partUrl}/partner/login`, { redirect: "manual" });
  assert.equal(partLoginPage.status, 200, "/partner/login renders 200");

  const partRegisterPage = await fetch(`${partUrl}/partner/register`, { redirect: "manual" });
  assert.equal(partRegisterPage.status, 307, "/partner/register redirects to /partner/login");
  assert.ok((partRegisterPage.headers.get("location") || "").endsWith("/partner/login"));

  console.log("6. Partner: registration requires valid admin credentials");
  const regNoAdmin = await fetch(`${partUrl}/api/partner/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      adminUsername: "admin504",
      adminPassword: "nope",
      username: TEST_PARTNER.username,
      password: TEST_PARTNER.password,
      fullName: TEST_PARTNER.fullName,
      phone: TEST_PARTNER.phone,
      transportType: "BODABODA",
      plateNumber: TEST_PARTNER.plate,
      homeKituo: TEST_PARTNER.homeKituo,
      nationalIdNo: TEST_PARTNER.nationalIdNo,
      licenseNo: TEST_PARTNER.licenseNo,
      vehicleModel: TEST_PARTNER.vehicleModel,
      vehicleColor: TEST_PARTNER.vehicleColor,
      payoutMobileNumber: TEST_PARTNER.payoutMobileNumber,
      helmetVerified: true,
    }),
  });
  assert.equal(regNoAdmin.status, 403, "bad admin password -> 403");

  console.log("7. Partner: admin registers a new rider with full info");
  const regRes = await fetch(`${partUrl}/api/partner/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      adminUsername: "admin504",
      adminPassword: "Admin009@504",
      username: TEST_PARTNER.username,
      password: TEST_PARTNER.password,
      fullName: TEST_PARTNER.fullName,
      phone: TEST_PARTNER.phone,
      transportType: "BODABODA",
      plateNumber: TEST_PARTNER.plate,
      homeKituo: TEST_PARTNER.homeKituo,
      nationalIdNo: TEST_PARTNER.nationalIdNo,
      licenseNo: TEST_PARTNER.licenseNo,
      vehicleModel: TEST_PARTNER.vehicleModel,
      vehicleColor: TEST_PARTNER.vehicleColor,
      payoutMobileNumber: TEST_PARTNER.payoutMobileNumber,
      helmetVerified: true,
    }),
  });
  const regJson = await regRes.json();
  assert.equal(regRes.status, 201, `partner register -> 201 (got ${regRes.status}: ${JSON.stringify(regJson)})`);
  assert.equal(regJson.registered, true);
  assert.equal(regJson.partner.username, TEST_PARTNER.username);
  assert.equal(regJson.partner.role, "BODABODA_RIDER");
  partnerUserId = regJson.partner.id;
  assert.ok(partnerUserId, "partner user id returned");

  const sql = getSql();
  const partnerRows = await sql`
    SELECT u.username, u.role, u.password_hash AS "passwordHash",
           p.kyc_status AS "kycStatus", p.plate_number AS "plateNumber",
           p.full_name AS "fullName", p.helmet_verified AS "helmetVerified",
           p.payout_mobile_number AS "payoutPhone"
    FROM auth.users u
    JOIN operator.profiles p ON p.user_id = u.id
    WHERE u.id = ${partnerUserId}::uuid
  `;
  assert.equal(partnerRows.length, 1, "partner profile row exists");
  assert.equal(partnerRows[0].username, TEST_PARTNER.username);
  assert.equal(partnerRows[0].role, "BODABODA_RIDER");
  assert.equal(partnerRows[0].kycStatus, "APPROVED");
  assert.equal(partnerRows[0].plateNumber, TEST_PARTNER.plate);
  assert.ok(partnerRows[0].passwordHash.startsWith("scrypt$"), "password stored hashed");
  assert.equal(verifyPassword(TEST_PARTNER.password, partnerRows[0].passwordHash), true);

  console.log("8. Partner: wrong password rejected");
  const partBadLogin = await fetch(`${partUrl}/api/partner/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: TEST_PARTNER.username, password: "wrong" }),
  });
  assert.equal(partBadLogin.status, 401, "wrong partner password -> 401");

  console.log("9. Partner: username/password login -> dedicated pages (/partner/shift, /earnings, /kyc, /safety)");
  const partLogin = await fetch(`${partUrl}/api/partner/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: TEST_PARTNER.username,
      password: TEST_PARTNER.password,
    }),
  });
  const partLoginJson = await partLogin.json();
  assert.equal(partLogin.status, 200, `partner login -> 200 (got ${partLogin.status}: ${JSON.stringify(partLoginJson)})`);
  assert.equal(partLoginJson.authenticated, true);
  assert.equal(partLoginJson.partner.transportType, "BODABODA");
  const partCookie = extractCookie(partLogin, "goboda_partner_session");
  assert.ok(partCookie, "partner session cookie set");

  for (const subPage of [
    "/partner/shift",
    "/partner/hotspots",
    "/partner/trips",
    "/partner/earnings",
    "/partner/kyc",
    "/partner/notifications",
    "/partner/safety",
  ]) {
    const subRes = await fetch(`${partUrl}${subPage}`, {
      redirect: "manual",
      headers: { cookie: partCookie },
    });
    assert.equal(subRes.status, 200, `authed ${subPage} -> 200`);
    const subHtml = await subRes.text();
    assert.ok(
      subHtml.includes('href="/partner/shift"') &&
        subHtml.includes('href="/partner/hotspots"') &&
        subHtml.includes('href="/partner/trips"') &&
        subHtml.includes('href="/partner/earnings"') &&
        subHtml.includes('href="/partner/kyc"') &&
        subHtml.includes('href="/partner/notifications"') &&
        subHtml.includes('href="/partner/safety"'),
      `${subPage} renders all 7 dedicated sidebar links`
    );
    assert.ok(
      !subHtml.includes("Commission Float") && !subHtml.includes(">Wallet<"),
      `${subPage} has wallet feature removed`
    );
    if (subPage === "/partner/shift") {
      assert.ok(
        subHtml.includes(TEST_PARTNER.fullName),
        "partner shift page renders the registered partner name"
      );
    }
  }

  console.log("9b. Partner: live APIs (hotspots, trips, compliance renewal, Web Push, notifications, realtime WS/SSE)");
  const hotspotsRes = await fetch(`${partUrl}/api/partner/hotspots`, {
    headers: { cookie: partCookie },
  });
  assert.equal(hotspotsRes.status, 200, "/api/partner/hotspots -> 200");
  const hotspotsJson = await hotspotsRes.json();
  assert.equal(hotspotsJson.transportType, "BODABODA");
  assert.ok(Array.isArray(hotspotsJson.hotspots) && hotspotsJson.hotspots.length > 0, "returns live Unguja vituo");

  const tripsRes = await fetch(`${partUrl}/api/partner/trips?range=all&status=ALL`, {
    headers: { cookie: partCookie },
  });
  assert.equal(tripsRes.status, 200, "/api/partner/trips -> 200");
  const tripsJson = await tripsRes.json();
  assert.equal(tripsJson.transportType, "BODABODA");
  assert.ok(Array.isArray(tripsJson.trips), "returns trips array");

  const nextYear = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const compPost = await fetch(`${partUrl}/api/partner/compliance`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: partCookie },
    body: JSON.stringify({
      licenseExpiry: nextYear,
      insuranceExpiry: nextYear,
      renewedDocType: "DRIVING_LICENSE",
      renewedFileName: "renewed-license.jpg",
    }),
  });
  assert.equal(compPost.status, 200, "POST /api/partner/compliance -> 200");
  const compJson = await compPost.json();
  assert.equal(compJson.updated, true);
  assert.equal(compJson.expiries.license.bucket, "30D");

  const pushSubRes = await fetch(`${partUrl}/api/partner/push/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: partCookie },
    body: JSON.stringify({
      endpoint: `https://fcm.googleapis.com/fcm/send/test-${stamp}`,
      keys: {
        p256dh: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
        auth: "tBHItJI5svbpez7KI4CCXg",
      },
      userAgent: "auth-flow-test",
    }),
  });
  assert.equal(pushSubRes.status, 201, "POST /api/partner/push/subscribe -> 201");
  assert.equal((await pushSubRes.json()).subscribed, true);

  const testPushRes = await fetch(`${partUrl}/api/partner/notifications`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: partCookie },
    body: JSON.stringify({ action: "SEND_TEST_PUSH", locale: "en" }),
  });
  assert.equal(testPushRes.status, 201, "POST /api/partner/notifications SEND_TEST_PUSH -> 201");

  const notifsRes = await fetch(`${partUrl}/api/partner/notifications`, {
    headers: { cookie: partCookie },
  });
  assert.equal(notifsRes.status, 200);
  const notifsJson = await notifsRes.json();
  assert.ok(notifsJson.unreadCount >= 1, "new test push notification shows unread");

  const markAllRes = await fetch(`${partUrl}/api/partner/notifications`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: partCookie },
    body: JSON.stringify({ action: "MARK_READ", all: true }),
  });
  assert.equal(markAllRes.status, 200);
  const notifsAfter = await (await fetch(`${partUrl}/api/partner/notifications`, {
    headers: { cookie: partCookie },
  })).json();
  assert.equal(notifsAfter.unreadCount, 0, "mark all read clears unread count");

  const pushDelRes = await fetch(`${partUrl}/api/partner/push/subscribe`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie: partCookie },
    body: JSON.stringify({ endpoint: `https://fcm.googleapis.com/fcm/send/test-${stamp}` }),
  });
  assert.equal(pushDelRes.status, 200);

  // Realtime WebSocket non-upgrade local fallback returns clean 426 with SSE fallback URL
  const wsCheck = await fetch(`${partUrl}/api/partner/realtime/ws`, {
    headers: { cookie: partCookie },
  });
  assert.equal(wsCheck.status, 426, "plain HTTP /api/partner/realtime/ws returns 426 fallback");
  assert.equal((await wsCheck.json()).fallback, "/api/partner/realtime/stream");

  // Realtime SSE stream immediately emits initial snapshot event
  const sseAbort = new AbortController();
  const sseRes = await fetch(`${partUrl}/api/partner/realtime/stream`, {
    headers: { cookie: partCookie },
    signal: sseAbort.signal,
  });
  assert.equal(sseRes.status, 200, "GET /api/partner/realtime/stream -> 200");
  assert.ok(
    (sseRes.headers.get("content-type") || "").includes("text/event-stream"),
    "SSE content-type is text/event-stream"
  );
  const reader = sseRes.body.getReader();
  const firstChunk = await reader.read();
  const decoded = new TextDecoder().decode(firstChunk.value || new Uint8Array());
  sseAbort.abort();
  assert.ok(
    decoded.includes("event: snapshot") && decoded.includes(TEST_PARTNER.plate),
    "SSE stream emits initial live partner snapshot"
  );

  const partDashRedirect = await fetch(`${partUrl}/partner/dashboard`, {
    redirect: "manual",
    headers: { cookie: partCookie },
  });
  assert.equal(partDashRedirect.status, 307, "authed /partner/dashboard redirects to /partner/shift");
  assert.ok((partDashRedirect.headers.get("location") || "").endsWith("/partner/shift"));

  const partLoginAuthed = await fetch(`${partUrl}/partner/login`, {
    redirect: "manual",
    headers: { cookie: partCookie },
  });
  assert.equal(partLoginAuthed.status, 307, "authed /partner/login redirects");
  assert.ok((partLoginAuthed.headers.get("location") || "").endsWith("/partner/shift"));

  console.log("10. Partner: duplicate plate rejected");
  const dupRes = await fetch(`${partUrl}/api/partner/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      adminUsername: "admin504",
      adminPassword: "Admin009@504",
      username: `${TEST_PARTNER.username}_2`,
      password: TEST_PARTNER.password,
      fullName: "Duplicate Plate Rider",
      phone: `${TEST_PARTNER.phone}9`,
      transportType: "BODABODA",
      plateNumber: TEST_PARTNER.plate,
      homeKituo: TEST_PARTNER.homeKituo,
      nationalIdNo: TEST_PARTNER.nationalIdNo,
      licenseNo: TEST_PARTNER.licenseNo,
      vehicleModel: TEST_PARTNER.vehicleModel,
      vehicleColor: TEST_PARTNER.vehicleColor,
      payoutMobileNumber: TEST_PARTNER.payoutMobileNumber,
    }),
  });
  assert.equal(dupRes.status, 409, "duplicate plate -> 409");

  /* ================= CUSTOMER ================= */
  console.log("\n11. Customer: unauthenticated gating");
  const custDashAnon = await fetch(`${custUrl}/dashboard`, { redirect: "manual" });
  assert.equal(custDashAnon.status, 307, "anon /dashboard must redirect");
  assert.ok(
    (custDashAnon.headers.get("location") || "").endsWith("/login"),
    "anon /dashboard -> /login"
  );

  const custRootAnon = await fetch(`${custUrl}/`, { redirect: "manual" });
  assert.equal(custRootAnon.status, 200, "anon / renders home view (200)");

  const custLoginPage = await fetch(`${custUrl}/login`, { redirect: "manual" });
  assert.equal(custLoginPage.status, 200, "/login renders 200");
  const custRegisterPage = await fetch(`${custUrl}/register`, { redirect: "manual" });
  assert.equal(custRegisterPage.status, 200, "/register renders 200");

  console.log("12. Customer: self-registration -> dashboard");
  const custReg = await fetch(`${custUrl}/api/customer/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: TEST_CUSTOMER.name,
      username: `cust_${stamp}`,
      email: `cust_${stamp}@example.com`,
      phone: TEST_CUSTOMER.phone,
      password: TEST_CUSTOMER.password,
      language: "en",
    }),
  });
  const custRegJson = await custReg.json();
  assert.equal(custReg.status, 201, `customer register -> 201 (got ${custReg.status}: ${JSON.stringify(custRegJson)})`);
  assert.equal(custRegJson.registered, true);
  customerUserId = custRegJson.customer.id;
  assert.ok(customerUserId);
  const custCookie = extractCookie(custReg, "goboda_customer_session");
  assert.ok(custCookie, "customer session cookie set on register");

  const custDashAuthed = await fetch(`${custUrl}/dashboard`, {
    redirect: "manual",
    headers: { cookie: custCookie },
  });
  assert.equal(custDashAuthed.status, 200, "authed /dashboard -> 200");
  const custDashHtml = await custDashAuthed.text();
  assert.ok(
    custDashHtml.includes(TEST_CUSTOMER.name),
    "customer dashboard renders the registered customer name"
  );

  const custRows = await sql`
    SELECT phone, username, role, password_hash AS "passwordHash"
    FROM auth.users WHERE id = ${customerUserId}::uuid
  `;
  assert.equal(custRows.length, 1);
  assert.equal(custRows[0].role, "CUSTOMER");
  assert.equal(custRows[0].phone, TEST_CUSTOMER.phone);
  assert.ok(custRows[0].passwordHash.startsWith("scrypt$"));

  console.log("13. Customer: duplicate phone rejected");
  const custDup = await fetch(`${custUrl}/api/customer/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Dup Customer",
      username: `cust_${stamp}`,
      email: `cust_${stamp}@example.com`,
      phone: TEST_CUSTOMER.phone,
      password: TEST_CUSTOMER.password,
    }),
  });
  assert.equal(custDup.status, 409, "duplicate phone -> 409");

  console.log("14. Customer: logout then login again");
  const custLogout = await fetch(`${custUrl}/api/customer/auth/logout`, {
    method: "POST",
    headers: { cookie: custCookie },
  });
  assert.equal(custLogout.status, 200);
  const clearedCookie = custLogout.headers.get("set-cookie") || "";
  assert.ok(
    /goboda_customer_session=;/.test(clearedCookie) || /Max-Age=0/i.test(clearedCookie),
    "logout clears customer cookie"
  );

  const custBadLogin = await fetch(`${custUrl}/api/customer/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier: TEST_CUSTOMER.phone,
      password: "wrong-password",
    }),
  });
  assert.equal(custBadLogin.status, 401, "wrong customer password -> 401");

  const custLogin = await fetch(`${custUrl}/api/customer/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier: TEST_CUSTOMER.phone,
      password: TEST_CUSTOMER.password,
    }),
  });
  const custLoginJson = await custLogin.json();
  assert.equal(custLogin.status, 200, `customer login -> 200 (got ${custLogin.status}: ${JSON.stringify(custLoginJson)})`);
  assert.equal(custLoginJson.authenticated, true);
  const custCookie2 = extractCookie(custLogin, "goboda_customer_session");
  assert.ok(custCookie2);

  const custLoginAuthed = await fetch(`${custUrl}/login`, {
    redirect: "manual",
    headers: { cookie: custCookie2 },
  });
  assert.equal(custLoginAuthed.status, 307, "authed /login redirects");
  assert.ok((custLoginAuthed.headers.get("location") || "").endsWith("/dashboard"));

  console.log("\nAll auth flow runtime checks passed.");
} finally {
  await cleanup().catch((err) => console.error("Cleanup error:", err));
  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
}
