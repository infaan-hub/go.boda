import { NextResponse } from "next/server";
import { getSql } from "@goboda/db";
import { verifyCustomerRequest } from "@/lib/customer-auth";
import { emitCustomerRealtimeEvent } from "@/lib/customer-realtime";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    await sql`DELETE FROM auth.customer_saved_places WHERE id = ${id}::uuid AND user_id = ${auth.customer.id}::uuid`;
    emitCustomerRealtimeEvent({ customerId: auth.customer.id, reason: "saved_place_deleted" });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: "PLACE_DELETE_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}
