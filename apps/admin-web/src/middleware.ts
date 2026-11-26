import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const ADMIN_COOKIE_NAME = "goboda_admin_session";
const JWT_ISSUER = "goboda-auth-service";
const JWT_AUDIENCE = "goboda-platform";

function getJwtSecretBytes(): Uint8Array {
  const secret =
    process.env.JWT_SECRET || "dev-only-insecure-goboda-jwt-secret";
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

  // Legacy locale URLs (/en, /sw), root (/), and /admin -> redirect cleanly
  if (
    pathname === "/" ||
    pathname === "/admin" ||
    pathname === "/admin/" ||
    pathname === "/en" ||
    pathname === "/en/" ||
    pathname === "/sw" ||
    pathname === "/sw/"
  ) {
    const target = request.nextUrl.clone();
    target.pathname = isAuthenticated ? "/admin/dashboard" : "/admin/login";
    const res = NextResponse.redirect(target);
    if (pathname.startsWith("/sw")) {
      res.cookies.set("NEXT_LOCALE", "sw", { path: "/", sameSite: "lax" });
    } else if (pathname.startsWith("/en")) {
      res.cookies.set("NEXT_LOCALE", "en", { path: "/", sameSite: "lax" });
    }
    return res;
  }

  // Dedicated login page: if already signed in, send straight to /admin/dashboard
  if (pathname === "/admin/login" || pathname === "/admin/login/") {
    if (isAuthenticated) {
      const target = request.nextUrl.clone();
      target.pathname = "/admin/dashboard";
      return NextResponse.redirect(target);
    }
    return NextResponse.next();
  }

  // Protect all /admin/* portal pages at the edge
  if (pathname.startsWith("/admin/")) {
    if (!isAuthenticated) {
      const target = request.nextUrl.clone();
      target.pathname = "/admin/login";
      return NextResponse.redirect(target);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
