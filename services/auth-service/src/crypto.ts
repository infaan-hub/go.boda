import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "@goboda/shared-types";

export interface AuthTokenClaims {
  sub: string;
  role: UserRole;
  phone: string | null;
  language: "sw" | "en";
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

/** Normalize Tanzanian (07xx/06xx -> +255...) or E.164 phone numbers */
export function normalizePhone(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.startsWith("255") && cleaned.length >= 12) {
    return `+${cleaned}`;
  }
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    return `+255${cleaned.slice(1)}`;
  }
  return `+${cleaned}`;
}

export function generateOtpCode(): string {
  return String(randomInt(100000, 1000000));
}

export function hashSecret(value: string): string {
  const pepper = process.env.JWT_SECRET ?? "goboda-dev-pepper";
  return createHash("sha256").update(`${pepper}:${value}`).digest("hex");
}

export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function signAccessToken(claims: AuthTokenClaims): Promise<string> {
  return new SignJWT({
    role: claims.role,
    phone: claims.phone,
    language: claims.language,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer("goboda-auth-service")
    .setAudience("goboda-platform")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getJwtSecretBytes());
}

export async function verifyAccessToken(
  token: string
): Promise<AuthTokenClaims> {
  const { payload } = await jwtVerify(token, getJwtSecretBytes(), {
    issuer: "goboda-auth-service",
    audience: "goboda-platform",
  });

  if (!payload.sub || typeof payload.role !== "string") {
    throw new Error("Invalid access token claims");
  }

  return {
    sub: payload.sub,
    role: payload.role as UserRole,
    phone: typeof payload.phone === "string" ? payload.phone : null,
    language: payload.language === "en" ? "en" : "sw",
  };
}
