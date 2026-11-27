import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT
        l.id,
        l.name_sw AS "nameSw",
        l.name_en AS "nameEn",
        l.category,
        l.area,
        l.lat,
        l.lng,
        COALESCE(l.target_supply, 4)::int AS "targetSupply",
        COUNT(p.operator_id) FILTER (
          WHERE p.is_online = TRUE AND p.transport_type = 'BODABODA'
        )::int AS "onlineRiders",
        COUNT(p.operator_id) FILTER (
          WHERE p.is_online = TRUE AND p.transport_type = 'BAJAJI'
        )::int AS "onlineDrivers",
        COUNT(p.operator_id) FILTER (
          WHERE p.is_online = TRUE AND p.is_busy = FALSE
        )::int AS "idleAvailable"
      FROM geo.landmarks l
      LEFT JOIN location.operator_positions p
        ON p.is_online = TRUE
       AND ST_DWithin(l.geom::geography, p.geom::geography, 2500)
      WHERE l.is_kituo = TRUE
      GROUP BY l.id, l.name_sw, l.name_en, l.category, l.area, l.lat, l.lng, l.target_supply
      ORDER BY l.area ASC, l.name_en ASC
      LIMIT 80
    `) as Array<{
      id: string;
      nameSw: string;
      nameEn: string;
      category: string;
      area: string;
      lat: number;
      lng: number;
      targetSupply: number;
      onlineRiders: number;
      onlineDrivers: number;
      idleAvailable: number;
    }>;

    const vituo = rows.map((r) => {
      const totalOnline = r.onlineRiders + r.onlineDrivers;
      const deficit = Math.max(0, r.targetSupply - totalOnline);
      return {
        ...r,
        totalOnline,
        deficit,
        supplyStatus:
          totalOnline === 0
            ? ("EMPTY" as const)
            : deficit > 0
              ? ("LOW_SUPPLY" as const)
              : ("HEALTHY" as const),
      };
    });

    return NextResponse.json({
      summary: {
        totalVituo: vituo.length,
        healthyCount: vituo.filter((v) => v.supplyStatus === "HEALTHY").length,
        lowSupplyCount: vituo.filter((v) => v.supplyStatus === "LOW_SUPPLY").length,
        emptyCount: vituo.filter((v) => v.supplyStatus === "EMPTY").length,
      },
      vituo,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "VITUO_FETCH_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}

const patchSchema = z.object({
  id: z.string().min(2).max(120),
  targetSupply: z.number().int().min(1).max(100),
});

export async function PATCH(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR" }, { status: 400 });
  }

  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      UPDATE geo.landmarks
      SET target_supply = ${parsed.data.targetSupply}
      WHERE id = ${parsed.data.id}
      RETURNING id, name_en AS "nameEn", target_supply AS "targetSupply"
    `;
    if (!rows[0]) {
      return NextResponse.json({ error: "KITUO_NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ updated: true, kituo: rows[0] });
  } catch (err) {
    return NextResponse.json(
      { error: "KITUO_UPDATE_FAILED", message: err instanceof Error ? err.message : "DB error" },
      { status: 500 }
    );
  }
}
