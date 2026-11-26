import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hashPassword, normalizeUsername } from "@goboda/db";
import { getOperatorTitle } from "@goboda/shared-types";
import { normalizeTzPhone, verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const optionalDate = z.preprocess(
  (v) => {
    if (v == null) return "";
    const s = String(v).trim();
    if (!s) return "";
    const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return isoMatch ? isoMatch[1] : s;
  },
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .optional()
    .or(z.literal(""))
);

const cleanPhoneString = (v: unknown) =>
  typeof v === "string" ? v.replace(/[\s\-()]/g, "").trim() : v;

const registerSchema = z.object({
  username: z.preprocess(
    (v) =>
      typeof v === "string"
        ? v.trim().replace(/^@+/, "").replace(/\s+/g, "_")
        : v,
    z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(40, "Username must be at most 40 characters")
      .regex(
        /^[a-zA-Z0-9._-]+$/,
        "Username may only contain letters, numbers, dots, dashes and underscores"
      )
  ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),

  fullName: z.string().trim().min(2, "Full name is required").max(120),
  phone: z.preprocess(
    cleanPhoneString,
    z
      .string()
      .min(9, "Phone number must have at least 9 digits (e.g. +255770123456)")
      .max(20, "Phone number is too long")
  ),
  transportType: z.enum(["BODABODA", "BAJAJI"]),
  plateNumber: z.preprocess(
    (v) =>
      typeof v === "string"
        ? v.trim().toUpperCase().replace(/\s+/g, " ")
        : v,
    z
      .string()
      .regex(
        /^Z[\s-]?[A-Z0-9\s-]{1,14}$/,
        "Unguja vehicle plate must start with Z (e.g. Z 104 AAB)"
      )
  ),
  homeKituo: z.string().trim().min(2, "Home kituo is required").max(120),
  nationalIdNo: z.string().trim().min(2, "National ID is required").max(50),
  licenseNo: z.string().trim().min(2, "License number is required").max(50),
  licenseExpiry: optionalDate,
  vehicleModel: z.string().trim().min(2, "Vehicle model is required").max(80),
  vehicleColor: z.string().trim().min(2, "Vehicle color is required").max(40),
  insuranceExpiry: optionalDate,
  payoutMobileNumber: z.preprocess(
    (v) => {
      const cleaned = cleanPhoneString(v);
      return typeof cleaned === "string" ? cleaned : "";
    },
    z
      .string()
      .max(20, "Payout mobile number is too long")
      .refine(
        (val) => val === "" || val.length >= 9,
        "Payout mobile number must have at least 9 digits (or leave blank to use Phone)"
      )
      .optional()
      .default("")
  ),
  helmetVerified: z.boolean().default(false),
});

const FIELD_LABELS: Record<string, string> = {
  username: "Username",
  password: "Password",
  fullName: "Full name",
  phone: "Phone number",
  transportType: "Transport type",
  plateNumber: "Plate number",
  homeKituo: "Home kituo",
  nationalIdNo: "National ID",
  licenseNo: "License number",
  licenseExpiry: "License expiry",
  vehicleModel: "Vehicle model",
  vehicleColor: "Vehicle color",
  insuranceExpiry: "Insurance expiry",
  payoutMobileNumber: "Payout mobile number",
};

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const summary = parsed.error.issues
      .map((issue) => {
        const key = String(issue.path[0] ?? "");
        const label = FIELD_LABELS[key] || key || "Field";
        return `${label}: ${issue.message}`;
      })
      .join(" • ");

    return NextResponse.json(
      {
        error: "VALIDATION_ERROR",
        message: summary || "Please check the highlighted form fields.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const username = normalizeUsername(d.username);
  const phone = normalizeTzPhone(d.phone);
  const payoutPhone = normalizeTzPhone(d.payoutMobileNumber || d.phone);
  const plate = d.plateNumber.replace(/\s+/g, " ").trim();
  const role = d.transportType === "BAJAJI" ? "BAJAJI_DRIVER" : "BODABODA_RIDER";
  const operatorTitle = getOperatorTitle(d.transportType);

  try {
    const sql = getSql();

    const existingUsers = (await sql`
      SELECT id, role
      FROM auth.users
      WHERE LOWER(username) = LOWER(${username}) OR phone = ${phone}
      LIMIT 1
    `) as Array<{ id: string; role: string }>;

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
          message: `Plate ${plate} is already registered to another rider/driver.`,
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
        'APPROVED', NULL, ${auth.admin.id}::uuid, NOW()
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
        rider: {
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
        error: "RIDER_REGISTRATION_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
