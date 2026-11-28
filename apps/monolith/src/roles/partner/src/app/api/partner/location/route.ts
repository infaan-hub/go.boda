import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyPartnerRequest } from "../../../../lib/partner-auth";
import { emitPartnerRealtimeEvent } from "../../../../lib/partner-realtime";

export const dynamic = "force-dynamic";

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function POST(request: Request) {
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  const parsed = locationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { lat, lng } = parsed.data;
  const operatorId = auth.partner.id;

  try {
    const sql = getSql(process.env.DATABASE_URL ?? process.env.PARTNER_DATABASE_URL);
    const geoRows = (await sql`
      SELECT ST_Contains(
        (SELECT geom FROM geo.zones WHERE id = 'unguja-island'),
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      ) AS in_unguja
    `) as Array<{ in_unguja: boolean }>;

    if (!geoRows[0]?.in_unguja) {
      return NextResponse.json(
        { error: "OUTSIDE_UNGUJA_SERVICE_AREA", message: "GPS position must be inside Unguja Island, Zanzibar." },
        { status: 422 }
      );
    }

    const updated = await sql`
      UPDATE location.operator_positions p
      SET lat = ${lat}, lng = ${lng},
          geom = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
          last_seen_at = NOW()
      FROM operator.profiles profile
      WHERE p.operator_id = ${operatorId}::uuid
        AND profile.user_id = ${operatorId}::uuid
        AND profile.is_online = TRUE
        AND p.is_online = TRUE
      RETURNING p.operator_id
    `;

    if (updated.length === 0) {
      return NextResponse.json({ error: "OPERATOR_OFFLINE" }, { status: 409 });
    }

    emitPartnerRealtimeEvent({
      operatorId,
      transportType: auth.partner.transportType,
      reason: "location_updated",
    });

    return NextResponse.json({ updated: true, lastSeenAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { error: "LOCATION_UPDATE_FAILED", message: error instanceof Error ? error.message : "DB error" },
      { status: 500 }
    );
  }
}
