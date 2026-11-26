import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import {
  CUSTOMER_COOKIE_NAME,
  readCustomerSessionToken,
} from "./lib/customer-auth";

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

async function hasCustomerSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
  if (!token) return false;
  return (await readCustomerSessionToken(token)) !== null;
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const lang = searchParams.get("lang");

  if (pathname === "/login" || pathname === "/login/") {
    if (await hasCustomerSession(request)) {
      return applyLocale(
        NextResponse.redirect(new URL("/dashboard", request.url)),
        lang
      );
    }
    return applyLocale(NextResponse.next(), lang);
  }

  if (pathname === "/register" || pathname === "/register/") {
    if (await hasCustomerSession(request)) {
      return applyLocale(
        NextResponse.redirect(new URL("/dashboard", request.url)),
        lang
      );
    }
    return applyLocale(NextResponse.next(), lang);
  }

  if (
    pathname === "/dashboard" ||
    pathname === "/dashboard/" ||
    pathname === "/trips" ||
    pathname === "/trips/"
  ) {
    if (!(await hasCustomerSession(request))) {
      return applyLocale(
        NextResponse.redirect(new URL("/login", request.url)),
        lang
      );
    }
    return applyLocale(NextResponse.next(), lang);
  }

  if (pathname === "/safety" || pathname === "/safety/") {
    return applyLocale(NextResponse.next(), lang);
  }

  if (pathname === "/") {
    const authed = await hasCustomerSession(request);
    return applyLocale(
      NextResponse.redirect(
        new URL(authed ? "/dashboard" : "/login", request.url)
      ),
      lang
    );
  }

  const response = intlMiddleware(request);
  if (lang === "sw" || lang === "en") {
    response.cookies.set("NEXT_LOCALE", lang, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|offline|track|.*\\..*).*)"],
};
