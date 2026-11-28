import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import { verifyCustomerRequest } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      UPDATE trip.trips
      SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
      WHERE id = ${id}::uuid
        AND customer_id = ${auth.customer.id}::uuid
        AND status IN ('SEARCHING', 'OFFERED_TO_OPERATOR', 'NO_OPERATOR_FOUND', 'ASSIGNED')
      RETURNING id
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "TRIP_NOT_CANCELLABLE" }, { status: 409 });
    }
    await sql`
      UPDATE dispatch.offers
      SET status = 'SUPERSEDED', responded_at = NOW()
      WHERE trip_id = ${id}::uuid AND status = 'PENDING'
    `;
    await sql`
      UPDATE location.operator_positions
      SET is_busy = FALSE, active_trip_id = NULL
      WHERE active_trip_id = ${id}::uuid
    `;
    return NextResponse.json({ cancelled: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: "TRIP_CANCEL_FAILED",
        message: error instanceof Error ? error.message : "Database error",
      },
      { status: 500 }
    );
  }
}
