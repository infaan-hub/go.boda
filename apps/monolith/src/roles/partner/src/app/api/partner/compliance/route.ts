import { NextResponse } from "next/server";
import { z } from "zod";
import { metric } from "@vercel/functions";
import { getSql } from "@goboda/db";
import { verifyPartnerRequest } from "../../../../lib/partner-auth";
import {
  classifyComplianceBucket,
  daysUntilDate,
  emitPartnerRealtimeEvent,
} from "../../../../lib/partner-realtime";
import { deliverWebPushToUser } from "../../../../lib/partner-webpush";

export const dynamic = "force-dynamic";

interface ComplianceProfileRow {
  id: string;
  transportType: "BODABODA" | "BAJAJI";
  fullName: string;
  phone: string;
  homeKituo: string;
  plateNumber: string;
  licenseNo: string;
  licenseExpiry: string | null;
  insuranceExpiry: string | null;
  vehicleModel: string;
  vehicleColor: string;
  kycStatus: string;
  helmetVerified: boolean;
  rejectionReason: string | null;
  updatedAt: string;
}

interface KycDocRow {
  docType: string;
  status: string;
  storageKey: string;
  uploadedAt: string;
}

export async function GET(request: Request) {
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT
        id,
        transport_type AS "transportType",
        full_name AS "fullName",
        phone,
        home_kituo AS "homeKituo",
        plate_number AS "plateNumber",
        license_no AS "licenseNo",
        to_char(license_expiry, 'YYYY-MM-DD') AS "licenseExpiry",
        to_char(insurance_expiry, 'YYYY-MM-DD') AS "insuranceExpiry",
        vehicle_model AS "vehicleModel",
        vehicle_color AS "vehicleColor",
        kyc_status AS "kycStatus",
        helmet_verified AS "helmetVerified",
        rejection_reason AS "rejectionReason",
        updated_at AS "updatedAt"
      FROM operator.profiles
      WHERE user_id = ${auth.partner.id}::uuid
      LIMIT 1
    `) as ComplianceProfileRow[];

    const profile = rows[0] ?? null;
    const docs: KycDocRow[] = profile
      ? ((await sql`
          SELECT doc_type AS "docType",
                 status,
                 storage_key AS "storageKey",
                 uploaded_at AS "uploadedAt"
          FROM operator.kyc_documents
          WHERE operator_id = ${profile.id}::uuid
          ORDER BY uploaded_at DESC
        `) as KycDocRow[])
      : [];

    const licenseDaysLeft = daysUntilDate(profile?.licenseExpiry);
    const insuranceDaysLeft = daysUntilDate(profile?.insuranceExpiry);
    const licenseBucket = classifyComplianceBucket(licenseDaysLeft);
    const insuranceBucket = classifyComplianceBucket(insuranceDaysLeft);

    return NextResponse.json({
      profile,
      documents: docs,
      expiries: {
        license: {
          licenseNo: profile?.licenseNo ?? null,
          expiryDate: profile?.licenseExpiry ?? null,
          daysLeft: licenseDaysLeft,
          bucket: licenseBucket,
        },
        insurance: {
          expiryDate: profile?.insuranceExpiry ?? null,
          daysLeft: insuranceDaysLeft,
          bucket: insuranceBucket,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Partner compliance fetch failed:", err);
    return NextResponse.json(
      {
        error: "COMPLIANCE_FETCH_FAILED",
        message: err instanceof Error ? err.message : "DB error",
      },
      { status: 500 }
    );
  }
}

const renewSchema = z.object({
  licenseNo: z.string().trim().min(4).max(50).optional(),
  licenseExpiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
    .optional(),
  insuranceExpiry: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
    .optional(),
  renewedDocType: z
    .enum([
      "DRIVING_LICENSE",
      "INSURANCE",
      "HELMETS",
      "NATIONAL_ID",
      "VEHICLE_FRONT",
    ])
    .optional(),
  renewedFileName: z.string().trim().min(1).max(160).optional(),
});

export async function POST(request: Request) {
  const startedAt = performance.now();
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = renewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  if (!d.licenseNo && !d.licenseExpiry && !d.insuranceExpiry && !d.renewedDocType) {
    return NextResponse.json(
      { error: "NOTHING_TO_UPDATE", message: "Provide a renewal date or document." },
      { status: 400 }
    );
  }

  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    const existing = (await sql`
      SELECT id, transport_type AS "transportType", plate_number AS "plateNumber",
             license_no AS "licenseNo",
             to_char(license_expiry, 'YYYY-MM-DD') AS "licenseExpiry",
             to_char(insurance_expiry, 'YYYY-MM-DD') AS "insuranceExpiry"
      FROM operator.profiles
      WHERE user_id = ${auth.partner.id}::uuid
      LIMIT 1
    `) as Array<{
      id: string;
      transportType: "BODABODA" | "BAJAJI";
      plateNumber: string;
      licenseNo: string;
      licenseExpiry: string | null;
      insuranceExpiry: string | null;
    }>;

    const current = existing[0];
    if (!current) {
      return NextResponse.json(
        { error: "PROFILE_NOT_FOUND", message: "Submit KYC onboarding profile first." },
        { status: 404 }
      );
    }

    const nextLicenseNo = d.licenseNo ?? current.licenseNo;
    const nextLicenseExpiry = d.licenseExpiry ?? current.licenseExpiry;
    const nextInsuranceExpiry = d.insuranceExpiry ?? current.insuranceExpiry;

    const updated = (await sql`
      UPDATE operator.profiles
      SET license_no = ${nextLicenseNo},
          license_expiry = ${nextLicenseExpiry},
          insurance_expiry = ${nextInsuranceExpiry},
          updated_at = NOW()
      WHERE id = ${current.id}::uuid
      RETURNING
        id,
        license_no AS "licenseNo",
        to_char(license_expiry, 'YYYY-MM-DD') AS "licenseExpiry",
        to_char(insurance_expiry, 'YYYY-MM-DD') AS "insuranceExpiry",
        kyc_status AS "kycStatus"
    `) as Array<{
      id: string;
      licenseNo: string;
      licenseExpiry: string | null;
      insuranceExpiry: string | null;
      kycStatus: string;
    }>;

    if (d.renewedDocType) {
      const storageKey = `kyc/${auth.partner.id}/${d.renewedDocType.toLowerCase()}-${Date.now()}-${(
        d.renewedFileName ?? "renewal.jpg"
      ).replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      await sql`
        INSERT INTO operator.kyc_documents (operator_id, doc_type, storage_key, status, uploaded_at)
        VALUES (${current.id}::uuid, ${d.renewedDocType}, ${storageKey}, 'UPLOADED', NOW())
        ON CONFLICT (operator_id, doc_type) DO UPDATE SET
          storage_key = EXCLUDED.storage_key,
          status = 'UPLOADED',
          uploaded_at = NOW()
      `;
    }

    const titleEn = "Document Renewal Saved";
    const bodyEn = `Compliance dates updated for ${current.plateNumber}. Synced with Go.boda Ops.`;
    const titleSw = "Nyaraka Zimesasishwa";
    const bodySw = `Tarehe za leseni/bima za ${current.plateNumber} zimehifadhiwa na kusawazishwa na Go.boda Ops.`;

    await sql`
      INSERT INTO notif.messages (
        user_id, phone, channel, event_subject, locale, title, body, payload, status, provider_ref
      )
      VALUES (
        ${auth.partner.id}::uuid,
        ${auth.partner.phone},
        'WEB_PUSH',
        'compliance.document_renewed',
        'en',
        ${titleEn},
        ${bodyEn},
        ${JSON.stringify({
          titleSw,
          bodySw,
          titleEn,
          bodyEn,
          url: "/partner/kyc",
          licenseExpiry: nextLicenseExpiry,
          insuranceExpiry: nextInsuranceExpiry,
        })}::jsonb,
        'SENT',
        'partner-compliance-renewal'
      )
    `.catch(() => null);

    emitPartnerRealtimeEvent({
      operatorId: auth.partner.id,
      transportType: current.transportType,
      reason: "compliance_renewed",
    });

    void deliverWebPushToUser(auth.partner.id, {
      title: titleEn,
      body: bodyEn,
      url: "/partner/kyc",
      eventSubject: "compliance.document_renewed",
    }).catch(() => null);

    const licenseDaysLeft = daysUntilDate(nextLicenseExpiry);
    const insuranceDaysLeft = daysUntilDate(nextInsuranceExpiry);

    metric("partner.compliance.renew", 1, { outcome: "success" });
    metric("partner.compliance.duration_ms", Math.round(performance.now() - startedAt), {
      outcome: "success",
    });

    return NextResponse.json({
      updated: true,
      profile: updated[0],
      expiries: {
        license: {
          licenseNo: nextLicenseNo,
          expiryDate: nextLicenseExpiry,
          daysLeft: licenseDaysLeft,
          bucket: classifyComplianceBucket(licenseDaysLeft),
        },
        insurance: {
          expiryDate: nextInsuranceExpiry,
          daysLeft: insuranceDaysLeft,
          bucket: classifyComplianceBucket(insuranceDaysLeft),
        },
      },
    });
  } catch (err) {
    console.error("Partner compliance renewal failed:", err);
    metric("partner.compliance.renew", 1, { outcome: "error" });
    return NextResponse.json(
      {
        error: "COMPLIANCE_UPDATE_FAILED",
        message: err instanceof Error ? err.message : "DB error",
      },
      { status: 500 }
    );
  }
}
