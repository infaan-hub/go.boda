import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(30, Math.max(1, Number(searchParams.get("limit") ?? 12) || 12));

  // 1. Try geo-zone-service first
  const geoUrl = process.env.GEO_ZONE_SERVICE_URL;
  if (geoUrl) {
    try {
      const upstream = await fetch(
        `${geoUrl}/api/v1/geo/landmarks?q=${encodeURIComponent(q)}&limit=${limit}`,
        { cache: "no-store", signal: AbortSignal.timeout(2500) }
      );
      if (upstream.ok) {
        return NextResponse.json(await upstream.json());
      }
    } catch {
      // Fallback cleanly to Neon PostGIS
    }
  }

  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const pattern = q ? `%${q}%` : "%";
    const rows = await sql`
      SELECT
        id,
        name_sw AS "nameSw",
        name_en AS "nameEn",
        category,
        area,
        is_kituo AS "isKituo",
        lat,
        lng
      FROM geo.landmarks
      WHERE name_sw ILIKE ${pattern} OR name_en ILIKE ${pattern} OR area ILIKE ${pattern}
      ORDER BY is_kituo DESC, name_en ASC
      LIMIT ${limit}
    `;

    return NextResponse.json({
      count: rows.length,
      landmarks: rows,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "LANDMARKS_UNAVAILABLE",
        message: err instanceof Error ? err.message : "Database unavailable",
      },
      { status: 503 }
    );
  }
}
