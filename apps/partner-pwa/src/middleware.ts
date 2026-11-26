import { NextResponse, type NextRequest } from "next/server";
import {
  PARTNER_COOKIE_NAME,
  readPartnerSessionToken,
} from "./lib/partner-auth";

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

  // Legacy /en or /sw root -> set cookie and redirect to /partner/dashboard or /partner/login
  if (trimmedPath === "/en" || trimmedPath === "/sw") {
    const loc = trimmedPath === "/sw" ? "sw" : "en";
    const authed = await hasPartnerSession(request);
    const target = request.nextUrl.clone();
    target.pathname = authed ? "/partner/dashboard" : "/partner/login";
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
    } else if (stripped === "/dashboard") {
      target.pathname = "/partner/dashboard";
    } else {
      target.pathname = stripped;
    }
    return applyLocale(NextResponse.redirect(target), loc);
  }

  if (trimmedPath === "/safety") {
    return applyLocale(NextResponse.next(), lang);
  }

  // Root and shortcut aliases -> canonical /partner/* routes
  if (
    trimmedPath === "/" ||
    trimmedPath === "/partner" ||
    trimmedPath === "/login" ||
    trimmedPath === "/register" ||
    trimmedPath === "/partner/register" ||
    trimmedPath === "/dashboard"
  ) {
    const authed = await hasPartnerSession(request);
    return applyLocale(
      NextResponse.redirect(
        new URL(authed ? "/partner/dashboard" : "/partner/login", request.url)
      ),
      lang
    );
  }

  if (trimmedPath === "/partner/login") {
    const authed = await hasPartnerSession(request);
    if (authed) {
      return applyLocale(
        NextResponse.redirect(new URL("/partner/dashboard", request.url)),
        lang
      );
    }
    return applyLocale(NextResponse.next(), lang);
  }

  if (trimmedPath === "/partner/dashboard") {
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
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
