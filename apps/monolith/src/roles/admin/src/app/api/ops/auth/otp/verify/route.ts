import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import {
  attachAdminCookie,
  hashOtp,
  normalizeTzPhone,
  safeEqual,
  signAdminSessionToken,
} from "@admin/lib/admin-auth";

export const dynamic = "force-dynamic";

const verifySchema = z.object({
  phone: z.string().trim().min(9).max(20),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit OTP code"),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const phone = normalizeTzPhone(parsed.data.phone);

  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const adminRows = (await sql`
      SELECT id, phone, name, role
      FROM auth.users
      WHERE phone = ${phone} AND role = 'ADMIN'
      LIMIT 1
    `) as Array<{ id: string; phone: string; name: string | null; role: string }>;

    const admin = adminRows[0];
    if (!admin) {
      return NextResponse.json(
        { error: "ADMIN_ACCOUNT_NOT_FOUND" },
        { status: 403 }
      );
    }

    const otpRows = (await sql`
      SELECT id, code_hash, attempts, expires_at
      FROM auth.otp_codes
      WHERE phone = ${phone} AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `) as Array<{
      id: string;
      code_hash: string;
      attempts: number;
      expires_at: string;
    }>;

    const record = otpRows[0];
    if (!record) {
      return NextResponse.json(
        { error: "OTP_NOT_FOUND", message: "Request a new OTP code." },
        { status: 401 }
      );
    }
    if (new Date(record.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "OTP_EXPIRED", message: "OTP code expired." },
        { status: 401 }
      );
    }
    if (record.attempts >= 5) {
      return NextResponse.json(
        { error: "OTP_MAX_ATTEMPTS", message: "Too many failed OTP attempts." },
        { status: 429 }
      );
    }

    const candidateHash = hashOtp(parsed.data.code);
    if (!safeEqual(candidateHash, record.code_hash)) {
      await sql`
        UPDATE auth.otp_codes SET attempts = attempts + 1 WHERE id = ${record.id}
      `;
      return NextResponse.json(
        { error: "OTP_INVALID", message: "Incorrect 6-digit OTP code." },
        { status: 401 }
      );
    }

    await sql`
      UPDATE auth.otp_codes SET consumed_at = NOW() WHERE id = ${record.id}
    `;

    const adminUser = {
      id: admin.id,
      phone: admin.phone,
      name: admin.name || "Go.boda Ops Admin",
      role: "ADMIN" as const,
    };
    const token = await signAdminSessionToken(adminUser);

    const response = NextResponse.json({
      authenticated: true,
      admin: adminUser,
    });
    attachAdminCookie(response, token);
    return response;
  } catch (err) {
    return NextResponse.json(
      {
        error: "ADMIN_OTP_VERIFY_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
