import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import {
  PARTNER_COOKIE_NAME,
  readPartnerSessionToken,
} from "./lib/partner-auth";

const intlMiddleware = createMiddleware(routing);

async function hasPartnerSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(PARTNER_COOKIE_NAME)?.value;
  if (!token) return false;
  return (await readPartnerSessionToken(token)) !== null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/partner" || pathname === "/partner/") {
    const authed = await hasPartnerSession(request);
    return NextResponse.redirect(
      new URL(authed ? "/partner/dashboard" : "/partner/login", request.url)
    );
  }

  if (pathname === "/partner/login" || pathname === "/partner/login/") {
    const authed = await hasPartnerSession(request);
    if (authed) {
      return NextResponse.redirect(new URL("/partner/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/partner/register" || pathname === "/partner/register/") {
    return NextResponse.next();
  }

  if (
    pathname === "/partner/dashboard" ||
    pathname === "/partner/dashboard/"
  ) {
    const authed = await hasPartnerSession(request);
    if (!authed) {
      return NextResponse.redirect(new URL("/partner/login", request.url));
    }
    return NextResponse.next();
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|offline|.*\\..*).*)"],
};
