import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, verifyPassword } from "@goboda/db";
import {
  attachPartnerCookie,
  normalizeTzPhone,
  signPartnerSessionToken,
} from "@partner/lib/partner-auth";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  username: z.string().trim().min(3).max(60),
  password: z.string().min(1).max(200),
});

interface PartnerCredentialRow {
  id: string;
  phone: string | null;
  name: string | null;
  role: string;
  status: string;
  passwordHash: string | null;
  transportType: string | null;
  operatorTitle: string | null;
  fullName: string | null;
  plateNumber: string | null;
  homeKituo: string | null;
  kycStatus: string | null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const identifier = parsed.data.username.trim();
  const phoneLike = /^[+\d][\d\s-]*$/.test(identifier);
  const phone = phoneLike ? normalizeTzPhone(identifier) : null;

  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT
        u.id,
        u.phone,
        u.name,
        u.role,
        u.status,
        u.password_hash AS "passwordHash",
        p.transport_type AS "transportType",
        p.operator_title AS "operatorTitle",
        p.full_name AS "fullName",
        p.plate_number AS "plateNumber",
        p.home_kituo AS "homeKituo",
        p.kyc_status AS "kycStatus"
      FROM auth.users u
      LEFT JOIN operator.profiles p ON p.user_id = u.id
      WHERE (LOWER(u.username) = LOWER(${identifier}) OR u.phone = ${phone})
        AND u.role IN ('BODABODA_RIDER', 'BAJAJI_DRIVER')
      LIMIT 1
    `) as PartnerCredentialRow[];

    const row = rows[0];
    if (!row || !verifyPassword(parsed.data.password, row.passwordHash)) {
      return NextResponse.json(
        {
          error: "INVALID_PARTNER_CREDENTIALS",
          message: "Invalid partner username or password.",
        },
        { status: 401 }
      );
    }

    if (row.status === "SUSPENDED") {
      return NextResponse.json(
        {
          error: "ACCOUNT_SUSPENDED",
          message: "This partner account is suspended. Contact Go.boda operations.",
        },
        { status: 403 }
      );
    }

    if (!row.transportType) {
      return NextResponse.json(
        {
          error: "PARTNER_PROFILE_NOT_FOUND",
          message:
            "No Rider/Driver profile is linked to this account. Ask a Go.boda admin to complete registration.",
        },
        { status: 403 }
      );
    }

    const role =
      row.role === "BAJAJI_DRIVER" ? "BAJAJI_DRIVER" : "BODABODA_RIDER";
    const transportType =
      row.transportType === "BAJAJI" ? "BAJAJI" : "BODABODA";

    const partner = {
      id: row.id,
      phone: row.phone ?? "",
      name: row.fullName || row.name || "Go.boda Operator",
      role: role as "BODABODA_RIDER" | "BAJAJI_DRIVER",
      transportType: transportType as "BODABODA" | "BAJAJI",
    };

    const token = await signPartnerSessionToken(partner);
    const response = NextResponse.json({
      authenticated: true,
      partner,
      profile: {
        transportType: row.transportType,
        operatorTitle: row.operatorTitle,
        fullName: row.fullName,
        plateNumber: row.plateNumber,
        homeKituo: row.homeKituo,
        kycStatus: row.kycStatus,
      },
    });
    attachPartnerCookie(response, token);
    return response;
  } catch (err) {
    return NextResponse.json(
      {
        error: "PARTNER_LOGIN_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
