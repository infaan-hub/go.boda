import { NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";

export const PARTNER_COOKIE_NAME = "goboda_partner_session";
const JWT_ISSUER = "goboda-auth-service";
const JWT_AUDIENCE = "goboda-platform";

export interface PartnerSessionUser {
  id: string;
  phone: string;
  name: string;
  role: "BODABODA_RIDER" | "BAJAJI_DRIVER";
  transportType: "BODABODA" | "BAJAJI";
}

function getJwtSecretBytes(): Uint8Array {
  const secret = process.env.JWT_SECRET;
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

export async function signPartnerSessionToken(
  partner: PartnerSessionUser
): Promise<string> {
  return new SignJWT({
    role: partner.role,
    phone: partner.phone,
    name: partner.name,
    transportType: partner.transportType,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(partner.id)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getJwtSecretBytes());
}

function parseCookieHeader(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export async function readPartnerSessionToken(
  token: string
): Promise<PartnerSessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (
      !payload.sub ||
      (payload.role !== "BODABODA_RIDER" && payload.role !== "BAJAJI_DRIVER")
    ) {
      return null;
    }
    const role = payload.role as "BODABODA_RIDER" | "BAJAJI_DRIVER";
    return {
      id: payload.sub,
      phone: typeof payload.phone === "string" ? payload.phone : "",
      name: typeof payload.name === "string" ? payload.name : "Go.boda Operator",
      role,
      transportType: role === "BAJAJI_DRIVER" ? "BAJAJI" : "BODABODA",
    };
  } catch {
    return null;
  }
}

export async function verifyPartnerRequest(
  request: Request
): Promise<
  | { ok: true; partner: PartnerSessionUser }
  | { ok: false; response: NextResponse }
> {
  const authHeader = request.headers.get("authorization");
  let token: string | null = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    token = parseCookieHeader(request.headers.get("cookie"), PARTNER_COOKIE_NAME);
  }
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "PARTNER_AUTH_REQUIRED", message: "Partner sign-in required." },
        { status: 401 }
      ),
    };
  }

  const partner = await readPartnerSessionToken(token);
  if (!partner) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "PARTNER_SESSION_INVALID" },
        { status: 401 }
      ),
    };
  }

  return { ok: true, partner };
}

export function attachPartnerCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: PARTNER_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

export function clearPartnerCookie(response: NextResponse): void {
  response.cookies.set({
    name: PARTNER_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
