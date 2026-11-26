import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const resolveSchema = z.object({
  status: z.enum(["ACKNOWLEDGED", "RESOLVED", "FALSE_ALARM"]),
  resolutionNote: z.string().trim().max(400).default(""),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ alertId: string }> }
) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;

  const { alertId } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  try {
    const sql = getSql();
    const rows = (await sql`
      UPDATE safety.sos_alerts
      SET
        status = ${d.status},
        resolution_note = ${d.resolutionNote},
        acknowledged_at = COALESCE(acknowledged_at, NOW()),
        resolved_at = CASE WHEN ${d.status} IN ('RESOLVED', 'FALSE_ALARM') THEN NOW() ELSE resolved_at END,
        updated_at = NOW()
      WHERE id = ${alertId}::uuid
      RETURNING id, alert_code AS "alertCode", trip_id AS "tripId", status, resolution_note AS "resolutionNote"
    `) as Array<{
      id: string;
      alertCode: string;
      tripId: string;
      status: string;
      resolutionNote: string;
    }>;

    const alert = rows[0];
    if (!alert) {
      return NextResponse.json({ error: "SOS_ALERT_NOT_FOUND" }, { status: 404 });
    }

    if (d.status === "RESOLVED" || d.status === "FALSE_ALARM") {
      await sql`
        UPDATE trip.trips
        SET status = 'IN_PROGRESS', updated_at = NOW()
        WHERE id = ${alert.tripId}::uuid AND status = 'SOS_ACTIVE'
      `;
    }

    return NextResponse.json({ updated: true, alert });
  } catch (err) {
    return NextResponse.json(
      {
        error: "SOS_RESOLVE_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
