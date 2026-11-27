import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";

export const ADMIN_COOKIE_NAME = "goboda_admin_session";
const JWT_ISSUER = "goboda-auth-service";
const JWT_AUDIENCE = "goboda-platform";

export interface AdminSessionUser {
  id: string;
  phone: string;
  name: string;
  role: "ADMIN";
}

function getJwtSecretBytes(): Uint8Array {
  const secret =
    process.env["ADMIN_JWT_SECRET"] ?? process.env["JWT_SECRET"];
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET is required in production");
    }
    return new TextEncoder().encode("dev-only-insecure-goboda-jwt-secret");
  }
  return new TextEncoder().encode(secret);
}

export function normalizeTzPhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("255")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 10) {
    return `+255${digits.slice(1)}`;
  }
  return `+${digits}`;
}

export function generateOtpCode(): string {
  return String(randomInt(100000, 999999));
}

export function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function signAdminSessionToken(
  admin: AdminSessionUser
): Promise<string> {
  return new SignJWT({
    role: "ADMIN",
    phone: admin.phone,
    name: admin.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getJwtSecretBytes());
}

function parseCookieHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export async function verifyAdminRequest(
  request: Request
): Promise<
  | { ok: true; admin: AdminSessionUser }
  | { ok: false; response: NextResponse }
> {
  const authHeader = request.headers.get("authorization");
  let token: string | null = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    token = parseCookieHeader(request.headers.get("cookie"), ADMIN_COOKIE_NAME);
  }

  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "ADMIN_AUTH_REQUIRED",
          message: "Operations Admin sign-in required.",
        },
        { status: 401 }
      ),
    };
  }

  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (payload.role !== "ADMIN" || !payload.sub) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "ADMIN_ROLE_REQUIRED",
            message: "Only verified Go.boda Operations Admins may access this console.",
          },
          { status: 403 }
        ),
      };
    }
    return {
      ok: true,
      admin: {
        id: payload.sub,
        phone: typeof payload.phone === "string" ? payload.phone : "",
        name: typeof payload.name === "string" ? payload.name : "Go.boda Ops Admin",
        role: "ADMIN",
      },
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "ADMIN_SESSION_INVALID",
          message: "Session expired or invalid. Please sign in again.",
        },
        { status: 401 }
      ),
    };
  }
}

export function attachAdminCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function clearAdminCookie(response: NextResponse): void {
  response.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
