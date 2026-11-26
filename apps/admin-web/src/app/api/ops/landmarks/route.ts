import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";

export const dynamic = "force-dynamic";

const landmarkSchema = z.object({
  nameSw: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(40).default("KITUO"),
  area: z.string().trim().min(2).max(80),
  isKituo: z.boolean().default(true),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = landmarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  try {
    const sql = getSql();
    // Strictly enforce Unguja Island boundary via PostGIS
    const geoCheck = await sql`
      SELECT ST_Contains(
        (SELECT geom FROM geo.zones WHERE id = 'unguja-island'),
        ST_SetSRID(ST_MakePoint(${d.lng}, ${d.lat}), 4326)
      ) AS in_unguja
    `;
    if (!(geoCheck[0] as { in_unguja?: boolean })?.in_unguja) {
      return NextResponse.json(
        {
          error: "OUTSIDE_UNGUJA_SERVICE_AREA",
          message: "Landmarks & Vituo must be inside Unguja Island, Zanzibar.",
        },
        { status: 422 }
      );
    }

    const id = `lm-${d.nameEn
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-${Date.now().toString(36).slice(-4)}`;

    const rows = await sql`
      INSERT INTO geo.landmarks (
        id, name_sw, name_en, category, area, is_kituo, lat, lng, geom
      )
      VALUES (
        ${id}, ${d.nameSw}, ${d.nameEn}, ${d.category.toUpperCase()},
        ${d.area}, ${d.isKituo}, ${d.lat}, ${d.lng},
        ST_SetSRID(ST_MakePoint(${d.lng}, ${d.lat}), 4326)
      )
      RETURNING id, name_sw AS "nameSw", name_en AS "nameEn", category, area, is_kituo AS "isKituo", lat, lng
    `;

    return NextResponse.json({ created: true, landmark: rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: "LANDMARK_CREATE_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
