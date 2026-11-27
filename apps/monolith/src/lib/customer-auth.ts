import { NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";

export const CUSTOMER_COOKIE_NAME = "goboda_customer_session";
const JWT_ISSUER = "goboda-auth-service";
const JWT_AUDIENCE = "goboda-platform";

export interface CustomerSessionUser {
  id: string;
  phone: string;
  name: string;
  role: "CUSTOMER";
}

function getJwtSecretBytes(): Uint8Array {
  const secret = process.env["JWT_SECRET"];
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

export async function signCustomerSessionToken(
  customer: CustomerSessionUser
): Promise<string> {
  return new SignJWT({
    role: "CUSTOMER",
    phone: customer.phone,
    name: customer.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(customer.id)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecretBytes());
}

export async function readCustomerSessionToken(
  token: string
): Promise<CustomerSessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes(), {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (!payload.sub || payload.role !== "CUSTOMER") return null;
    return {
      id: payload.sub,
      phone: typeof payload.phone === "string" ? payload.phone : "",
      name: typeof payload.name === "string" ? payload.name : "Go.boda Customer",
      role: "CUSTOMER",
    };
  } catch {
    return null;
  }
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

export async function verifyCustomerRequest(
  request: Request
): Promise<
  | { ok: true; customer: CustomerSessionUser }
  | { ok: false; response: NextResponse }
> {
  const authHeader = request.headers.get("authorization");
  let token: string | null = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }
  if (!token) {
    token = parseCookieHeader(request.headers.get("cookie"), CUSTOMER_COOKIE_NAME);
  }
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "CUSTOMER_AUTH_REQUIRED", message: "Customer sign-in required." },
        { status: 401 }
      ),
    };
  }

  const customer = await readCustomerSessionToken(token);
  if (!customer) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "CUSTOMER_SESSION_INVALID" },
        { status: 401 }
      ),
    };
  }

  return { ok: true, customer };
}

export function attachCustomerCookie(
  response: NextResponse,
  token: string
): void {
  response.cookies.set({
    name: CUSTOMER_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearCustomerCookie(response: NextResponse): void {
  response.cookies.set({
    name: CUSTOMER_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
