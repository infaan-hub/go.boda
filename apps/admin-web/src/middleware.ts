import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const ADMIN_COOKIE_NAME = "goboda_admin_session";
const JWT_ISSUER = "goboda-auth-service";
const JWT_AUDIENCE = "goboda-platform";

const SECTION_REDIRECTS: Record<string, string> = {
  "/admin/compliance": "/admin/compliance/expiries",
  "/admin/fleet": "/admin/fleet/telemetry",
  "/admin/pricing": "/admin/pricing/simulator",
  "/admin/promos": "/admin/promos/analytics",
  "/admin/dispatch": "/admin/dispatch/queue",
  "/admin/support": "/admin/support/inbox",
  "/admin/safety": "/admin/safety/helmets",
};

function getJwtSecretBytes(): Uint8Array {
  const secret =
    process.env["ADMIN_JWT_SECRET"] ||
    process.env["JWT_SECRET"] ||
    "dev-only-insecure-goboda-jwt-secret";
  return new TextEncoder().encode(secret);
}

async function hasValidAdminCookie(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    return payload.role === "ADMIN" && Boolean(payload.sub);
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const trimmedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  // Handle clean cookie-based bilingual toggle (?lang=sw or ?lang=en) without /en prefix
  const langParam = searchParams.get("lang");
  if (langParam === "sw" || langParam === "en") {
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.searchParams.delete("lang");
    if (
      cleanUrl.pathname === "/" ||
      cleanUrl.pathname === "/en" ||
      cleanUrl.pathname === "/sw"
    ) {
      cleanUrl.pathname = "/admin/dashboard";
    }
    const res = NextResponse.redirect(cleanUrl);
    res.cookies.set("NEXT_LOCALE", langParam, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  }

  const isAuthenticated = await hasValidAdminCookie(request);

  // Strip legacy /en/* or /sw/* prefixes on any path
  if (trimmedPath.startsWith("/en/") || trimmedPath.startsWith("/sw/")) {
    const loc = trimmedPath.startsWith("/sw/") ? "sw" : "en";
    const rest = trimmedPath.slice(3) || "/";
    const target = request.nextUrl.clone();
    if (rest === "/login") {
      target.pathname = isAuthenticated ? "/admin/dashboard" : "/admin/login";
    } else if (rest.startsWith("/admin")) {
      target.pathname = rest;
    } else {
      target.pathname = `/admin${rest}`;
    }
    const res = NextResponse.redirect(target);
    res.cookies.set("NEXT_LOCALE", loc, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  }

  // Legacy locale URLs (/en, /sw), root (/), /admin, /login, /dashboard -> redirect cleanly
  if (
    trimmedPath === "/" ||
    trimmedPath === "/admin" ||
    trimmedPath === "/en" ||
    trimmedPath === "/sw" ||
    trimmedPath === "/login" ||
    trimmedPath === "/dashboard"
  ) {
    const target = request.nextUrl.clone();
    target.pathname = isAuthenticated ? "/admin/dashboard" : "/admin/login";
    const res = NextResponse.redirect(target);
    if (trimmedPath === "/sw") {
      res.cookies.set("NEXT_LOCALE", "sw", { path: "/", sameSite: "lax" });
    } else if (trimmedPath === "/en") {
      res.cookies.set("NEXT_LOCALE", "en", { path: "/", sameSite: "lax" });
    }
    return res;
  }

  // Dedicated login page: if already signed in, send straight to /admin/dashboard
  if (trimmedPath === "/admin/login") {
    if (isAuthenticated) {
      const target = request.nextUrl.clone();
      target.pathname = "/admin/dashboard";
      return NextResponse.redirect(target);
    }
    return NextResponse.next();
  }

  // Protect all /admin/* portal pages at the edge
  if (trimmedPath.startsWith("/admin/")) {
    if (!isAuthenticated) {
      const target = request.nextUrl.clone();
      target.pathname = "/admin/login";
      return NextResponse.redirect(target);
    }
    const sectionTarget = SECTION_REDIRECTS[trimmedPath];
    if (sectionTarget) {
      const target = request.nextUrl.clone();
      target.pathname = sectionTarget;
      return NextResponse.redirect(target);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
