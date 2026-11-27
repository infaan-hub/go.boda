import { NextResponse, type NextRequest } from "next/server";
import {
  PARTNER_COOKIE_NAME,
  readPartnerSessionToken,
} from "./lib/partner-auth";

const PROTECTED_PARTNER_PAGES = new Set([
  "/partner/shift",
  "/partner/hotspots",
  "/partner/trips",
  "/partner/earnings",
  "/partner/kyc",
  "/partner/notifications",
  "/partner/profile",
]);

function applyLocale(response: NextResponse, lang: string | null): NextResponse {
  if (lang === "sw" || lang === "en") {
    response.cookies.set("NEXT_LOCALE", lang, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

async function hasPartnerSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(PARTNER_COOKIE_NAME)?.value;
  if (!token) return false;
  return (await readPartnerSessionToken(token)) !== null;
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const trimmedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const lang = searchParams.get("lang");

  // Legacy /en or /sw root -> set cookie and redirect to /partner/shift or /partner/login
  if (trimmedPath === "/en" || trimmedPath === "/sw") {
    const loc = trimmedPath === "/sw" ? "sw" : "en";
    const authed = await hasPartnerSession(request);
    const target = request.nextUrl.clone();
    target.pathname = authed ? "/partner/shift" : "/partner/login";
    return applyLocale(NextResponse.redirect(target), loc);
  }

  // Strip /en/* or /sw/* from any path -> set cookie and redirect cleanly
  if (trimmedPath.startsWith("/en/") || trimmedPath.startsWith("/sw/")) {
    const loc = trimmedPath.startsWith("/sw/") ? "sw" : "en";
    const stripped = trimmedPath.slice(3) || "/";
    const target = request.nextUrl.clone();
    if (
      stripped === "/login" ||
      stripped === "/register" ||
      stripped === "/partner/register"
    ) {
      target.pathname = "/partner/login";
    } else if (stripped === "/dashboard" || stripped === "/partner/dashboard") {
      target.pathname = "/partner/shift";
    } else {
      target.pathname = stripped;
    }
    return applyLocale(NextResponse.redirect(target), loc);
  }

  if (trimmedPath === "/safety" || trimmedPath === "/partner/safety") {
    return applyLocale(NextResponse.next(), lang);
  }

  // Root, legacy dashboard, and shortcut aliases -> canonical /partner/shift or /partner/login
  if (
    trimmedPath === "/" ||
    trimmedPath === "/partner" ||
    trimmedPath === "/login" ||
    trimmedPath === "/register" ||
    trimmedPath === "/partner/register" ||
    trimmedPath === "/dashboard" ||
    trimmedPath === "/partner/dashboard"
  ) {
    const authed = await hasPartnerSession(request);
    return applyLocale(
      NextResponse.redirect(
        new URL(authed ? "/partner/shift" : "/partner/login", request.url)
      ),
      lang
    );
  }

  if (trimmedPath === "/partner/login") {
    const authed = await hasPartnerSession(request);
    if (authed) {
      return applyLocale(
        NextResponse.redirect(new URL("/partner/shift", request.url)),
        lang
      );
    }
    return applyLocale(NextResponse.next(), lang);
  }

  if (PROTECTED_PARTNER_PAGES.has(trimmedPath)) {
    const authed = await hasPartnerSession(request);
    if (!authed) {
      return applyLocale(
        NextResponse.redirect(new URL("/partner/login", request.url)),
        lang
      );
    }
    return applyLocale(NextResponse.next(), lang);
  }

  return applyLocale(NextResponse.next(), lang);
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
