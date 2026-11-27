import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyCustomerRequest } from "@/lib/customer-auth";
import { emitCustomerRealtimeEvent } from "@/lib/customer-realtime";

export const dynamic = "force-dynamic";

const cancelSchema = z.object({ reason: z.string().trim().max(200).default("") });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = cancelSchema.safeParse(body);
  const reason = parsed.success ? parsed.data.reason : "";

  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      UPDATE trip.trips
      SET status = 'CANCELLED_BY_CUSTOMER', cancelled_at = NOW(), cancel_reason = ${reason}, updated_at = NOW()
      WHERE id = ${id}::uuid AND customer_id = ${auth.customer.id}::uuid
        AND status IN ('SEARCHING','OFFERED_TO_OPERATOR','ASSIGNED')
      RETURNING id, trip_code AS "tripCode", status
    ` as Array<{ id: string; tripCode: string; status: string }>;
    if (!rows[0]) {
      return NextResponse.json({ error: "CANCEL_NOT_ALLOWED" }, { status: 409 });
    }
    // free operator if assigned
    await sql`
      UPDATE location.operator_positions
      SET is_busy = FALSE, active_trip_id = NULL, last_seen_at = NOW()
      WHERE active_trip_id = ${id}::uuid
    `.catch(() => null);
    emitCustomerRealtimeEvent({ customerId: auth.customer.id, tripId: id, reason: "trip_cancelled" });
    return NextResponse.json({ cancelled: true, trip: rows[0] });
  } catch (err) {
    return NextResponse.json({ error: "TRIP_CANCEL_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}
