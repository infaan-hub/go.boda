import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
const TEST_CUST_PHONE = "+255779000951";
const TEST_PARTNER_PHONE = "+255779000952";

const PORTS = {
  customer: 3130,
  partner: 3131,
  admin: 3132,
};

const children = [];

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
      // booting
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

async function resolveFinalStatus(baseUrl, path, cookie) {
  let current = `${baseUrl}${path}`;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(current, {
      headers: cookie ? { cookie } : {},
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { status: res.status, finalUrl: current };
      current = new URL(loc, current).toString();
      continue;
    }
    return { status: res.status, finalUrl: current };
  }
  return { status: 508, finalUrl: current };
}

async function cleanup() {
  const sql = getSql();
  await sql`DELETE FROM auth.otp_codes WHERE phone IN (${PILOT_ADMIN_PHONE}, ${TEST_CUST_PHONE}, ${TEST_PARTNER_PHONE})`;
  await sql`DELETE FROM auth.users WHERE phone IN (${TEST_CUST_PHONE}, ${TEST_PARTNER_PHONE})`;
}

async function run() {
  await cleanup();
  console.log("Booting customer-web, partner-pwa, and admin-web for full 404 route audit...");
  startNextApp("apps/customer-web", PORTS.customer);
  startNextApp("apps/partner-pwa", PORTS.partner);
  startNextApp("apps/admin-web", PORTS.admin);

  const custUrl = `http://127.0.0.1:${PORTS.customer}`;
  const partUrl = `http://127.0.0.1:${PORTS.partner}`;
  const admUrl = `http://127.0.0.1:${PORTS.admin}`;

  try {
    await Promise.all([
      waitForHttp(`${custUrl}/login`),
      waitForHttp(`${partUrl}/partner/login`),
      waitForHttp(`${admUrl}/admin/login`),
    ]);

    // Authenticate all 3 roles
    const otpReq = await fetch(`${admUrl}/api/ops/auth/otp/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: PILOT_ADMIN_PHONE }),
    });
    const { pilotOtp } = await otpReq.json();
    const otpVer = await fetch(`${admUrl}/api/ops/auth/otp/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: PILOT_ADMIN_PHONE, code: pilotOtp }),
    });
    const adminCookie = extractCookie(otpVer, "goboda_admin_session");
    assert.ok(adminCookie, "Admin session cookie required");

    const custReg = await fetch(`${custUrl}/api/customer/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Route Audit Customer",
        username: `route_cust_${Date.now().toString(36)}`,
        email: `route_cust_${Date.now().toString(36)}@goboda.tz`,
        phone: TEST_CUST_PHONE,
        password: "UngujaPassword123!",
      }),
    });
    const customerCookie = extractCookie(custReg, "goboda_customer_session");
    assert.ok(customerCookie, "Customer session cookie required");

    const partAuth = await fetch(`${partUrl}/api/partner/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: TEST_PARTNER_PHONE,
        name: "Route Audit Rider",
        transportType: "BODABODA",
      }),
    });
    const partnerCookie = extractCookie(partAuth, "goboda_partner_session");
    assert.ok(partnerCookie, "Partner session cookie required");

    const adminRoutes = [
      "/",
      "/login",
      "/dashboard",
      "/en",
      "/sw",
      "/en/login",
      "/sw/dashboard",
      "/en/admin/vituo",
      "/sw/admin/pricing/simulator",
      "/admin",
      "/admin/login",
      "/admin/dashboard",
      "/admin/live-map",
      "/admin/operators",
      "/admin/compliance",
      "/admin/compliance/expiries",
      "/admin/vituo",
      "/admin/heatmap",
      "/admin/fleet",
      "/admin/fleet/telemetry",
      "/admin/zones",
      "/admin/pricing",
      "/admin/pricing/simulator",
      "/admin/promos",
      "/admin/promos/analytics",
      "/admin/dispatch",
      "/admin/dispatch/queue",
      "/admin/dispatch/performance",
      "/admin/trips",
      "/admin/finance",
      "/admin/broadcasts",
      "/admin/support",
      "/admin/support/inbox",
      "/admin/safety",
      "/admin/safety/helmets",
      "/admin/sos",
    ];

    const customerRoutes = [
      "/",
      "/login",
      "/register",
      "/dashboard",
      "/trips",
      "/safety",
      "/track",
      "/track/demo-unguja",
      "/offline",
      "/en",
      "/sw",
      "/en/login",
      "/sw/login",
      "/en/register",
      "/sw/register",
      "/en/dashboard",
      "/sw/dashboard",
      "/en/trips",
      "/sw/trips",
      "/en/safety",
      "/sw/safety",
      "/en/track",
      "/sw/track/demo-unguja",
    ];

    const partnerRoutes = [
      "/",
      "/login",
      "/register",
      "/dashboard",
      "/partner",
      "/partner/login",
      "/partner/register",
      "/partner/dashboard",
      "/safety",
      "/offline",
      "/en",
      "/sw",
      "/en/login",
      "/sw/login",
      "/en/partner/login",
      "/sw/partner/register",
      "/en/partner/dashboard",
      "/sw/safety",
    ];

    const suites = [
      { name: "admin-web", base: admUrl, cookie: adminCookie, routes: adminRoutes },
      { name: "customer-web", base: custUrl, cookie: customerCookie, routes: customerRoutes },
      { name: "partner-pwa", base: partUrl, cookie: partnerCookie, routes: partnerRoutes },
    ];

    let totalChecked = 0;
    for (const s of suites) {
      for (const r of s.routes) {
        const resAuthed = await resolveFinalStatus(s.base, r, s.cookie);
        assert.equal(
          resAuthed.status,
          200,
          `[${s.name}] AUTHED ${r} ended on HTTP ${resAuthed.status} (${resAuthed.finalUrl})`
        );
        const resGuest = await resolveFinalStatus(s.base, r, null);
        assert.equal(
          resGuest.status,
          200,
          `[${s.name}] GUEST ${r} ended on HTTP ${resGuest.status} (${resGuest.finalUrl})`
        );
        totalChecked += 2;
      }
      console.log(`   [PASS] ${s.name}: ${s.routes.length}/${s.routes.length} routes verified (authed + guest, zero 404s)`);
    }

    console.log(`\nZERO 404s CONFIRMED ACROSS ALL ${totalChecked} ROUTE CHECKS!`);
  } finally {
    for (const c of children) c.kill("SIGTERM");
    await cleanup();
  }
}

run().catch((err) => {
  console.error("ROUTE 404 AUDIT FAILED:", err);
  for (const c of children) c.kill("SIGTERM");
  process.exit(1);
});
