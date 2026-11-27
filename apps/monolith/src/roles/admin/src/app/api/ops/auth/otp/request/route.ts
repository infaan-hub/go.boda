import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import {
  generateOtpCode,
  hashOtp,
  normalizeTzPhone,
} from "@admin/lib/admin-auth";

export const dynamic = "force-dynamic";

const reqSchema = z.object({
  phone: z.string().trim().min(9).max(20),
  channel: z.enum(["WHATSAPP", "SMS"]).default("WHATSAPP"),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = reqSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const phone = normalizeTzPhone(parsed.data.phone);

  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    // Strictly require an existing ADMIN user in auth.users
    const adminRows = (await sql`
      SELECT id, phone, name, role
      FROM auth.users
      WHERE phone = ${phone} AND role = 'ADMIN'
      LIMIT 1
    `) as Array<{ id: string; phone: string; name: string | null; role: string }>;

    if (!adminRows[0]) {
      return NextResponse.json(
        {
          error: "ADMIN_ACCOUNT_NOT_FOUND",
          message:
            "This phone number is not authorized as a Go.boda Operations Admin.",
        },
        { status: 403 }
      );
    }

    // 30-second anti-spam cooldown (skipped only in explicit automated tests)
    if (process.env.OTP_SKIP_COOLDOWN !== "true") {
      const recent = await sql`
        SELECT id FROM auth.otp_codes
        WHERE phone = ${phone}
          AND consumed_at IS NULL
          AND created_at > NOW() - INTERVAL '30 seconds'
        LIMIT 1
      `;
      if (recent.length > 0) {
        return NextResponse.json(
          {
            error: "OTP_COOLDOWN",
            message: "Please wait 30 seconds before requesting another OTP.",
          },
          { status: 429 }
        );
      }
    }

    const code = generateOtpCode();
    const codeHash = hashOtp(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await sql`
      INSERT INTO auth.otp_codes (phone, code_hash, channel, expires_at)
      VALUES (${phone}, ${codeHash}, ${parsed.data.channel}, ${expiresAt})
    `;

    const echoOtp =
      process.env.OTP_DEV_ECHO === "true" ||
      process.env.NODE_ENV !== "production";

    return NextResponse.json({
      sent: true,
      phone,
      channel: parsed.data.channel,
      expiresInSeconds: 300,
      ...(echoOtp ? { pilotOtp: code } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "ADMIN_OTP_REQUEST_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
