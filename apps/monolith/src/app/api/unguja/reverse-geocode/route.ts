import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 || lat > 90 ||
    lng < -180 || lng > 180
  ) {
    return NextResponse.json({ error: "INVALID_COORDINATES" }, { status: 400 });
  }

  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      WITH point AS (
        SELECT ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) AS geom
      )
      SELECT landmark.id,
             landmark.name_sw AS "nameSw",
             landmark.name_en AS "nameEn",
             landmark.category,
             landmark.area,
             ST_DistanceSphere(landmark.geom, point.geom)::int AS "distanceMeters"
      FROM geo.landmarks landmark
      CROSS JOIN point
      WHERE ST_Contains(
        (SELECT geom FROM geo.zones WHERE id = 'unguja-island'),
        point.geom
      )
      ORDER BY
        CASE WHEN ST_DistanceSphere(landmark.geom, point.geom) <= 300 THEN 0 ELSE 1 END,
        CASE
          WHEN landmark.category IN ('place', 'street', 'university', 'college', 'hospital', 'marketplace', 'bus_station') THEN 0
          ELSE 1
        END,
        landmark.geom <-> point.geom
      LIMIT 1
    ` as Array<{
      id: string;
      nameSw: string;
      nameEn: string;
      category: string;
      area: string;
      distanceMeters: number;
    }>;

    if (!rows[0]) {
      return NextResponse.json({ error: "LOCATION_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ location: rows[0] });
  } catch (err) {
    return NextResponse.json(
      {
        error: "REVERSE_GEOCODE_UNAVAILABLE",
        message: err instanceof Error ? err.message : "Database unavailable",
      },
      { status: 503 }
    );
  }
}
