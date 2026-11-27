import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { getOperatorTitle, transportTypeSchema } from "@goboda/shared-types";
import { verifyPartnerRequest } from "@partner/lib/partner-auth";

export const dynamic = "force-dynamic";

const onboardingSchema = z.object({
  transportType: transportTypeSchema,
  fullName: z.string().trim().min(2).max(120),
  homeKituo: z.string().trim().min(2).max(120),
  nationalIdNo: z.string().trim().min(5).max(50),
  licenseNo: z.string().trim().min(4).max(50),
  licenseExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  plateNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^Z[\s-]?[A-Z0-9\s-]{2,12}$/, "Unguja vehicle plate must start with Z"),
  vehicleModel: z.string().trim().min(2).max(80),
  vehicleColor: z.string().trim().min(2).max(40),
  insuranceExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payoutMobileNumber: z.string().trim().min(9).max(20).optional(),
});

export async function POST(request: Request) {
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const operatorTitle = getOperatorTitle(d.transportType);
  const plate = d.plateNumber.replace(/\s+/g, " ").trim();
  const payoutPhone = d.payoutMobileNumber || auth.partner.phone;

  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      INSERT INTO operator.profiles (
        user_id, transport_type, operator_title, full_name, phone, home_kituo,
        national_id_no, license_no, license_expiry, plate_number, vehicle_model,
        vehicle_color, insurance_expiry, payout_mobile_number, kyc_status, rejection_reason
      )
      VALUES (
        ${auth.partner.id}::uuid, ${d.transportType}, ${operatorTitle}, ${d.fullName},
        ${auth.partner.phone}, ${d.homeKituo}, ${d.nationalIdNo}, ${d.licenseNo},
        ${d.licenseExpiry ?? null}, ${plate}, ${d.vehicleModel}, ${d.vehicleColor},
        ${d.insuranceExpiry ?? null}, ${payoutPhone}, 'PENDING_VERIFICATION', NULL
      )
      ON CONFLICT (user_id) DO UPDATE SET
        transport_type = EXCLUDED.transport_type,
        operator_title = EXCLUDED.operator_title,
        full_name = EXCLUDED.full_name,
        home_kituo = EXCLUDED.home_kituo,
        national_id_no = EXCLUDED.national_id_no,
        license_no = EXCLUDED.license_no,
        license_expiry = EXCLUDED.license_expiry,
        plate_number = EXCLUDED.plate_number,
        vehicle_model = EXCLUDED.vehicle_model,
        vehicle_color = EXCLUDED.vehicle_color,
        insurance_expiry = EXCLUDED.insurance_expiry,
        payout_mobile_number = EXCLUDED.payout_mobile_number,
        kyc_status = 'PENDING_VERIFICATION',
        rejection_reason = NULL,
        is_online = FALSE,
        updated_at = NOW()
      RETURNING
        id, user_id AS "userId", transport_type AS "transportType",
        operator_title AS "operatorTitle", full_name AS "fullName",
        plate_number AS "plateNumber", home_kituo AS "homeKituo",
        kyc_status AS "kycStatus", helmet_verified AS "helmetVerified"
    `;

    return NextResponse.json({ submitted: true, profile: rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "ONBOARDING_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
