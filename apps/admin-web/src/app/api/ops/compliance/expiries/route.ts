import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24));
}

function classifyBucket(days: number | null): "EXPIRED" | "7D" | "14D" | "30D" | "VALID" | "MISSING" {
  if (days === null) return "MISSING";
  if (days < 0) return "EXPIRED";
  if (days <= 7) return "7D";
  if (days <= 14) return "14D";
  if (days <= 30) return "30D";
  return "VALID";
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT
        id, user_id AS "userId", transport_type AS "transportType",
        operator_title AS "operatorTitle", full_name AS "fullName", phone,
        home_kituo AS "homeKituo", plate_number AS "plateNumber",
        license_no AS "licenseNo", license_expiry AS "licenseExpiry",
        insurance_expiry AS "insuranceExpiry", kyc_status AS "kycStatus",
        is_online AS "isOnline"
      FROM operator.profiles
      ORDER BY LEAST(
        COALESCE(license_expiry, '2099-01-01'::date),
        COALESCE(insurance_expiry, '2099-01-01'::date)
      ) ASC
      LIMIT 150
    `) as Array<{
      id: string;
      userId: string;
      transportType: "BODABODA" | "BAJAJI";
      operatorTitle: "RIDER" | "DRIVER";
      fullName: string;
      phone: string;
      homeKituo: string;
      plateNumber: string;
      licenseNo: string;
      licenseExpiry: string | null;
      insuranceExpiry: string | null;
      kycStatus: string;
      isOnline: boolean;
    }>;

    const items = rows.map((r) => {
      const licenseDays = daysUntil(r.licenseExpiry);
      const insuranceDays = daysUntil(r.insuranceExpiry);
      const minDays =
        licenseDays !== null && insuranceDays !== null
          ? Math.min(licenseDays, insuranceDays)
          : (licenseDays ?? insuranceDays);
      const bucket = classifyBucket(minDays);
      const roleWord = r.transportType === "BODABODA" ? "Bodaboda Rider" : "Bajaji Driver";
      const waText = `Habari ${r.fullName} (${roleWord}, ${r.plateNumber}). Tafadhali sasisha leseni au bima yako ya Go.boda Unguja kabla ya muda wake kuisha ili kuendelea kupokea safari.`;
      return {
        ...r,
        licenseDaysLeft: licenseDays,
        insuranceDaysLeft: insuranceDays,
        minDaysLeft: minDays,
        bucket,
        whatsappUrl: `https://wa.me/${r.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(waText)}`,
      };
    });

    const summary = {
      expired: items.filter((i) => i.bucket === "EXPIRED").length,
      within7d: items.filter((i) => i.bucket === "7D").length,
      within14d: items.filter((i) => i.bucket === "14D").length,
      within30d: items.filter((i) => i.bucket === "30D").length,
      valid: items.filter((i) => i.bucket === "VALID").length,
      missing: items.filter((i) => i.bucket === "MISSING").length,
    };

    return NextResponse.json({ summary, items });
  } catch (err) {
    return NextResponse.json(
      { error: "EXPIRIES_FETCH_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("AUTO_PAUSE_EXPIRED") }),
  z.object({
    action: z.literal("LOG_REMINDER"),
    operatorId: z.string().uuid(),
    phone: z.string().min(9).max(20),
    fullName: z.string().min(2).max(120),
    plateNumber: z.string().min(2).max(24),
  }),
]);

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    if (parsed.data.action === "AUTO_PAUSE_EXPIRED") {
      const paused = (await sql`
        UPDATE operator.profiles
        SET kyc_status = 'SUSPENDED',
            is_online = FALSE,
            rejection_reason = 'Auto-paused: Driving license or insurance expired',
            updated_at = NOW()
        WHERE kyc_status = 'APPROVED'
          AND (
            (license_expiry IS NOT NULL AND license_expiry < CURRENT_DATE)
            OR (insurance_expiry IS NOT NULL AND insurance_expiry < CURRENT_DATE)
          )
        RETURNING id, user_id AS "userId", full_name AS "fullName", plate_number AS "plateNumber"
      `) as Array<{ id: string; userId: string }>;

      for (const p of paused) {
        await sql`
          UPDATE location.operator_positions
          SET is_online = FALSE
          WHERE operator_id = ${p.userId}::uuid
        `;
      }
      return NextResponse.json({ pausedCount: paused.length, paused });
    }

    const d = parsed.data;
    await sql`
      INSERT INTO notif.messages (
        phone, channel, event_subject, locale, title, body, payload, status, provider_ref
      )
      VALUES (
        ${d.phone}, 'WHATSAPP', 'compliance.expiry_reminder', 'sw',
        'Sasisha Leseni / Bima — Go.boda Unguja',
        ${`Habari ${d.fullName} (${d.plateNumber}), tafadhali sasisha leseni au bima yako kabla ya muda kuisha.`},
        ${JSON.stringify({ operatorId: d.operatorId, sentByAdmin: auth.admin.id })}::jsonb,
        'SENT', 'ops-whatsapp-reminder'
      )
    `;
    return NextResponse.json({ logged: true });
  } catch (err) {
    return NextResponse.json(
      { error: "COMPLIANCE_ACTION_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
