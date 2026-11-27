import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import {
  attachPartnerCookie,
  clearPartnerCookie,
  normalizeTzPhone,
  signPartnerSessionToken,
} from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

const authSchema = z.object({
  phone: z.string().trim().min(9).max(20),
  name: z.string().trim().min(2).max(120).default("Go.boda Operator"),
  transportType: z.enum(["BODABODA", "BAJAJI"]).default("BODABODA"),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = authSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const phone = normalizeTzPhone(d.phone);
  const role =
    d.transportType === "BAJAJI" ? "BAJAJI_DRIVER" : "BODABODA_RIDER";

  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    const userRows = (await sql`
      INSERT INTO auth.users (phone, role, name, language)
      VALUES (${phone}, ${role}, ${d.name}, 'sw')
      ON CONFLICT (phone) DO UPDATE SET
        name = COALESCE(NULLIF(auth.users.name, ''), EXCLUDED.name),
        updated_at = NOW()
      RETURNING id, phone, role, name
    `) as Array<{ id: string; phone: string; role: string; name: string | null }>;

    const user = userRows[0]!;
    const effectiveRole =
      user.role === "BAJAJI_DRIVER" ? "BAJAJI_DRIVER" : "BODABODA_RIDER";
    const effectiveType =
      effectiveRole === "BAJAJI_DRIVER" ? "BAJAJI" : "BODABODA";

    // Ensure operator wallet accounts exist
    await sql`
      INSERT INTO finance.wallet_accounts (owner_id, account_type, currency, balance_tzs)
      VALUES
        (${user.id}::uuid, 'EARNINGS', 'TZS', 0),
        (${user.id}::uuid, 'COMMISSION_FLOAT', 'TZS', 0)
      ON CONFLICT (owner_id, account_type) DO NOTHING
    `;

    const profileRows = await sql`
      SELECT id, transport_type AS "transportType", operator_title AS "operatorTitle",
             full_name AS "fullName", plate_number AS "plateNumber", home_kituo AS "homeKituo",
             kyc_status AS "kycStatus", helmet_verified AS "helmetVerified",
             is_online AS "isOnline"
      FROM operator.profiles
      WHERE user_id = ${user.id}::uuid
      LIMIT 1
    `;

    const partner = {
      id: user.id,
      phone: user.phone,
      name: user.name || d.name,
      role: effectiveRole as "BODABODA_RIDER" | "BAJAJI_DRIVER",
      transportType: effectiveType as "BODABODA" | "BAJAJI",
    };

    const token = await signPartnerSessionToken(partner);
    const response = NextResponse.json({
      authenticated: true,
      partner,
      profile: profileRows[0] ?? null,
    });
    attachPartnerCookie(response, token);
    return response;
  } catch (err) {
    return NextResponse.json(
      { error: "PARTNER_AUTH_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ signedOut: true });
  clearPartnerCookie(response);
  return response;
}
