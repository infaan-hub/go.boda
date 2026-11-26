import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hashPassword, normalizeUsername, verifyPassword } from "@goboda/db";
import { getOperatorTitle } from "@goboda/shared-types";
import { normalizeTzPhone } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal(""));

const registerSchema = z.object({
  adminUsername: z.string().trim().min(3).max(60),
  adminPassword: z.string().min(1).max(200),

  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Username may only contain letters, numbers, dots, dashes and underscores"
    ),
  password: z.string().min(8).max(128),

  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(20),
  transportType: z.enum(["BODABODA", "BAJAJI"]),
  plateNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^Z[\s-]?[A-Z0-9\s-]{2,12}$/, "Unguja vehicle plate must start with Z"),
  homeKituo: z.string().trim().min(2).max(120),
  nationalIdNo: z.string().trim().min(5).max(50),
  licenseNo: z.string().trim().min(4).max(50),
  licenseExpiry: optionalDate,
  vehicleModel: z.string().trim().min(2).max(80),
  vehicleColor: z.string().trim().min(2).max(40),
  insuranceExpiry: optionalDate,
  payoutMobileNumber: z.string().trim().min(9).max(20),
  helmetVerified: z.boolean().default(false),
});

interface AdminRow {
  id: string;
  passwordHash: string | null;
}

interface ExistingUserRow {
  id: string;
  role: string;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const username = normalizeUsername(d.username);
  const phone = normalizeTzPhone(d.phone);
  const payoutPhone = normalizeTzPhone(d.payoutMobileNumber);
  const plate = d.plateNumber.replace(/\s+/g, " ").trim();
  const role = d.transportType === "BAJAJI" ? "BAJAJI_DRIVER" : "BODABODA_RIDER";
  const operatorTitle = getOperatorTitle(d.transportType);

  try {
    const sql = getSql();

    // Only a verified Go.boda ADMIN can register a Rider or Driver.
    const adminRows = (await sql`
      SELECT id, password_hash AS "passwordHash"
      FROM auth.users
      WHERE LOWER(username) = LOWER(${d.adminUsername})
        AND role = 'ADMIN'
      LIMIT 1
    `) as AdminRow[];

    const admin = adminRows[0];
    if (!admin || !verifyPassword(d.adminPassword, admin.passwordHash)) {
      return NextResponse.json(
        {
          error: "ADMIN_AUTHORIZATION_REQUIRED",
          message:
            "Partner registration is restricted to Go.boda Admins. Enter valid admin credentials.",
        },
        { status: 403 }
      );
    }

    const existingUsers = (await sql`
      SELECT id, role
      FROM auth.users
      WHERE LOWER(username) = LOWER(${username}) OR phone = ${phone}
      LIMIT 1
    `) as ExistingUserRow[];

    const existing = existingUsers[0];
    if (
      existing &&
      existing.role !== "BODABODA_RIDER" &&
      existing.role !== "BAJAJI_DRIVER"
    ) {
      return NextResponse.json(
        {
          error: "ACCOUNT_ROLE_CONFLICT",
          message:
            "This username or phone already belongs to a Customer/Admin account.",
        },
        { status: 409 }
      );
    }

    const plateOwners = (await sql`
      SELECT user_id AS "userId"
      FROM operator.profiles
      WHERE UPPER(REPLACE(plate_number, ' ', '')) =
            UPPER(REPLACE(${plate}, ' ', ''))
      LIMIT 1
    `) as Array<{ userId: string }>;

    if (plateOwners[0] && (!existing || plateOwners[0].userId !== existing.id)) {
      return NextResponse.json(
        {
          error: "PLATE_ALREADY_REGISTERED",
          message: `Plate ${plate} is already registered to another partner.`,
        },
        { status: 409 }
      );
    }

    const passwordHash = hashPassword(d.password);

    let userId: string;
    if (existing) {
      const updated = (await sql`
        UPDATE auth.users
        SET
          username = ${username},
          password_hash = ${passwordHash},
          phone = ${phone},
          name = ${d.fullName},
          role = ${role},
          status = 'ACTIVE',
          updated_at = NOW()
        WHERE id = ${existing.id}::uuid
        RETURNING id
      `) as Array<{ id: string }>;
      userId = updated[0]!.id;
    } else {
      const inserted = (await sql`
        INSERT INTO auth.users (phone, username, password_hash, name, role, language)
        VALUES (${phone}, ${username}, ${passwordHash}, ${d.fullName}, ${role}, 'sw')
        RETURNING id
      `) as Array<{ id: string }>;
      userId = inserted[0]!.id;
    }

    const profiles = (await sql`
      INSERT INTO operator.profiles (
        user_id, transport_type, operator_title, full_name, phone, home_kituo,
        national_id_no, license_no, license_expiry, plate_number, vehicle_model,
        vehicle_color, insurance_expiry, helmet_verified, payout_mobile_number,
        kyc_status, rejection_reason, approved_by, approved_at
      )
      VALUES (
        ${userId}::uuid, ${d.transportType}, ${operatorTitle}, ${d.fullName},
        ${phone}, ${d.homeKituo}, ${d.nationalIdNo}, ${d.licenseNo},
        ${d.licenseExpiry || null}, ${plate}, ${d.vehicleModel}, ${d.vehicleColor},
        ${d.insuranceExpiry || null}, ${d.helmetVerified}, ${payoutPhone},
        'APPROVED', NULL, ${admin.id}::uuid, NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        transport_type = EXCLUDED.transport_type,
        operator_title = EXCLUDED.operator_title,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        home_kituo = EXCLUDED.home_kituo,
        national_id_no = EXCLUDED.national_id_no,
        license_no = EXCLUDED.license_no,
        license_expiry = EXCLUDED.license_expiry,
        plate_number = EXCLUDED.plate_number,
        vehicle_model = EXCLUDED.vehicle_model,
        vehicle_color = EXCLUDED.vehicle_color,
        insurance_expiry = EXCLUDED.insurance_expiry,
        helmet_verified = EXCLUDED.helmet_verified,
        payout_mobile_number = EXCLUDED.payout_mobile_number,
        kyc_status = 'APPROVED',
        rejection_reason = NULL,
        approved_by = EXCLUDED.approved_by,
        approved_at = NOW(),
        is_online = FALSE,
        updated_at = NOW()
      RETURNING
        id, user_id AS "userId", transport_type AS "transportType",
        operator_title AS "operatorTitle", full_name AS "fullName",
        phone, home_kituo AS "homeKituo", plate_number AS "plateNumber",
        kyc_status AS "kycStatus", helmet_verified AS "helmetVerified"
    `) as Array<Record<string, unknown>>;

    // Wallets are optional at registration time; provisioning failures should
    // not block the admin from creating the partner account.
    try {
      await sql`
        INSERT INTO finance.wallet_accounts (owner_id, account_type, currency, balance_tzs)
        VALUES
          (${userId}::uuid, 'EARNINGS', 'TZS', 0),
          (${userId}::uuid, 'COMMISSION_FLOAT', 'TZS', 0)
        ON CONFLICT (owner_id, account_type) DO NOTHING
      `;
    } catch {
      // finance schema may not be migrated in a partial local environment
    }

    return NextResponse.json(
      {
        registered: true,
        partner: {
          id: userId,
          username,
          phone,
          name: d.fullName,
          role,
          transportType: d.transportType,
        },
        profile: profiles[0] ?? null,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "PARTNER_REGISTRATION_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
