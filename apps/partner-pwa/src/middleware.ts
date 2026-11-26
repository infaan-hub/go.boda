import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import {
  PARTNER_COOKIE_NAME,
  readPartnerSessionToken,
} from "./lib/partner-auth";

const intlMiddleware = createMiddleware(routing);

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
  const lang = searchParams.get("lang");

  if (pathname === "/safety" || pathname === "/safety/") {
    return applyLocale(NextResponse.next(), lang);
  }

  if (pathname === "/partner" || pathname === "/partner/") {
    const authed = await hasPartnerSession(request);
    return applyLocale(
      NextResponse.redirect(
        new URL(authed ? "/partner/dashboard" : "/partner/login", request.url)
      ),
      lang
    );
  }

  if (pathname === "/partner/login" || pathname === "/partner/login/") {
    const authed = await hasPartnerSession(request);
    if (authed) {
      return applyLocale(
        NextResponse.redirect(new URL("/partner/dashboard", request.url)),
        lang
      );
    }
    return applyLocale(NextResponse.next(), lang);
  }

  if (pathname === "/partner/register" || pathname === "/partner/register/") {
    return applyLocale(NextResponse.next(), lang);
  }

  if (
    pathname === "/partner/dashboard" ||
    pathname === "/partner/dashboard/"
  ) {
    const authed = await hasPartnerSession(request);
    if (!authed) {
      return applyLocale(
        NextResponse.redirect(new URL("/partner/login", request.url)),
        lang
      );
    }
    return applyLocale(NextResponse.next(), lang);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|offline|.*\\..*).*)"],
};
