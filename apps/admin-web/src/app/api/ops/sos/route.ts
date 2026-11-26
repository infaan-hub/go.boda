import { randomInt, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";

export const dynamic = "force-dynamic";

// Trigger a controlled Unguja Test SOS Drill for Ops Incident Room verification
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    reason?: string;
    transportType?: "BODABODA" | "BAJAJI";
    lat?: number;
    lng?: number;
  };

  const alertCode = `SOS-${randomInt(10000, 99999)}`;
  const transportType =
    body.transportType === "BAJAJI" ? "BAJAJI" : "BODABODA";
  const lat = Number.isFinite(body.lat) ? Number(body.lat) : -6.1742;
  const lng = Number.isFinite(body.lng) ? Number(body.lng) : 39.2085;
  const reason =
    (body.reason ?? "").trim() ||
    "OPS DRILL: Test SOS incident near Michenzani Roundabout";

  try {
    const sql = getSql();
    const rows = await sql`
      INSERT INTO safety.sos_alerts (
        alert_code, trip_id, triggered_by_user_id, triggered_by_role,
        transport_type, operator_plate, lat, lng, reason, status
      )
      VALUES (
        ${alertCode}, ${randomUUID()}::uuid, ${randomUUID()}::uuid, 'CUSTOMER',
        ${transportType}, ${transportType === "BODABODA" ? "Z 104 AAB" : "Z 612 BBA"},
        ${lat}, ${lng}, ${reason}, 'OPEN'
      )
      RETURNING
        id, alert_code AS "alertCode", transport_type AS "transportType",
        operator_plate AS "operatorPlate", lat, lng, reason, status,
        created_at AS "createdAt"
    `;

    return NextResponse.json({ created: true, alert: rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error: "SOS_DRILL_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
