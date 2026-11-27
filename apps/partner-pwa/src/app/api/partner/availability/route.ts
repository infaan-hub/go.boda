import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyPartnerRequest } from "@/lib/partner-auth";

export const dynamic = "force-dynamic";

const availabilitySchema = z.object({
  isOnline: z.boolean(),
  lat: z.number().min(-90).max(90).default(-6.1649),
  lng: z.number().min(-180).max(180).default(39.1936),
});

export async function POST(request: Request) {
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = availabilitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const operatorId = auth.partner.id;

  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    const profileRows = (await sql`
      SELECT id, transport_type AS "transportType", operator_title AS "operatorTitle",
             plate_number AS "plateNumber", home_kituo AS "homeKituo",
             kyc_status AS "kycStatus"
      FROM operator.profiles
      WHERE user_id = ${operatorId}::uuid
      LIMIT 1
    `) as Array<{
      id: string;
      transportType: "BODABODA" | "BAJAJI";
      operatorTitle: "RIDER" | "DRIVER";
      plateNumber: string;
      homeKituo: string;
      kycStatus: string;
    }>;

    const profile = profileRows[0];
    if (!profile) {
      return NextResponse.json(
        { error: "KYC_REQUIRED", message: "Complete KYC onboarding first." },
        { status: 403 }
      );
    }

    if (d.isOnline) {
      if (profile.kycStatus !== "APPROVED") {
        return NextResponse.json(
          {
            error: "KYC_NOT_APPROVED",
            kycStatus: profile.kycStatus,
            message: "Account must be approved by Go.boda Operations Admin before going online.",
          },
          { status: 403 }
        );
      }

      const floatRows = (await sql`
        SELECT is_float_blocked AS "isFloatBlocked", balance_tzs::int AS "balanceTzs"
        FROM finance.wallet_accounts
        WHERE owner_id = ${operatorId}::uuid AND account_type = 'COMMISSION_FLOAT'
        LIMIT 1
      `) as Array<{ isFloatBlocked: boolean; balanceTzs: number }>;

      if (floatRows[0]?.isFloatBlocked) {
        return NextResponse.json(
          {
            error: "COMMISSION_FLOAT_BLOCKED",
            balanceTzs: floatRows[0].balanceTzs,
            message: "Commission float is below -5,000 TZS. Top up to go online.",
          },
          { status: 403 }
        );
      }

      // Enforce Unguja Island PostGIS boundary
      const geoRows = (await sql`
        SELECT ST_Contains(
          (SELECT geom FROM geo.zones WHERE id = 'unguja-island'),
          ST_SetSRID(ST_MakePoint(${d.lng}, ${d.lat}), 4326)
        ) AS in_unguja
      `) as Array<{ in_unguja: boolean }>;

      if (!geoRows[0]?.in_unguja) {
        return NextResponse.json(
          {
            error: "OUTSIDE_UNGUJA_SERVICE_AREA",
            message: "GPS position must be inside Unguja Island, Zanzibar.",
          },
          { status: 422 }
        );
      }
    }

    await sql`
      UPDATE operator.profiles
      SET is_online = ${d.isOnline}, updated_at = NOW()
      WHERE id = ${profile.id}::uuid
    `;

    await sql`
      INSERT INTO location.operator_positions (
        operator_id, transport_type, operator_title, plate_number, home_kituo,
        is_online, is_busy, is_demo, lat, lng, geom, last_seen_at
      )
      VALUES (
        ${operatorId}::uuid, ${profile.transportType}, ${profile.operatorTitle},
        ${profile.plateNumber}, ${profile.homeKituo}, ${d.isOnline}, FALSE, FALSE,
        ${d.lat}, ${d.lng}, ST_SetSRID(ST_MakePoint(${d.lng}, ${d.lat}), 4326), NOW()
      )
      ON CONFLICT (operator_id) DO UPDATE SET
        is_online = EXCLUDED.is_online,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        geom = EXCLUDED.geom,
        last_seen_at = NOW()
    `;

    return NextResponse.json({
      updated: true,
      isOnline: d.isOnline,
      plateNumber: profile.plateNumber,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "AVAILABILITY_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
