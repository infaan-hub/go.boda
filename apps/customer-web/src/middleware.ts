import { NextResponse, type NextRequest } from "next/server";
import {
  CUSTOMER_COOKIE_NAME,
  readCustomerSessionToken,
} from "./lib/customer-auth";

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

async function hasCustomerSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
  if (!token) return false;
  return (await readCustomerSessionToken(token)) !== null;
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const trimmedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const lang = searchParams.get("lang");

  // Legacy /en or /sw root -> set cookie and redirect to /dashboard or /login
  if (trimmedPath === "/en" || trimmedPath === "/sw") {
    const loc = trimmedPath === "/sw" ? "sw" : "en";
    const authed = await hasCustomerSession(request);
    const target = request.nextUrl.clone();
    target.pathname = authed ? "/dashboard" : "/login";
    return applyLocale(NextResponse.redirect(target), loc);
  }

  // Strip /en/* or /sw/* from any path -> set cookie and redirect cleanly
  if (trimmedPath.startsWith("/en/") || trimmedPath.startsWith("/sw/")) {
    const loc = trimmedPath.startsWith("/sw/") ? "sw" : "en";
    const stripped = trimmedPath.slice(3) || "/";
    const target = request.nextUrl.clone();
    target.pathname = stripped;
    return applyLocale(NextResponse.redirect(target), loc);
  }

  if (trimmedPath === "/login" || trimmedPath === "/register") {
    if (await hasCustomerSession(request)) {
      return applyLocale(
        NextResponse.redirect(new URL("/dashboard", request.url)),
        lang
      );
    }
    return applyLocale(NextResponse.next(), lang);
  }

  if (trimmedPath === "/dashboard" || trimmedPath === "/trips") {
    if (!(await hasCustomerSession(request))) {
      return applyLocale(
        NextResponse.redirect(new URL("/login", request.url)),
        lang
      );
    }
    return applyLocale(NextResponse.next(), lang);
  }

  if (trimmedPath === "/") {
    return applyLocale(NextResponse.next(), lang);
  }

  return applyLocale(NextResponse.next(), lang);
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
