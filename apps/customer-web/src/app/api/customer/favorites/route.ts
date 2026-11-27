import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyCustomerRequest } from "@/lib/customer-auth";
import { emitCustomerRealtimeEvent } from "@/lib/customer-realtime";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  operatorId: z.string().uuid(),
  transportType: z.enum(["BODABODA", "BAJAJI"]),
  operatorName: z.string().trim().max(120).default(""),
  operatorPlate: z.string().trim().max(40).default(""),
  rating: z.number().int().min(1).max(5).default(5),
});

export async function GET(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      SELECT id, operator_id AS "operatorId", transport_type AS "transportType",
             operator_name AS "operatorName", operator_plate AS "operatorPlate",
             rating, created_at AS "createdAt"
      FROM auth.customer_favorite_operators
      WHERE user_id = ${auth.customer.id}::uuid
      ORDER BY created_at DESC
    `;
    return NextResponse.json({ favorites: rows });
  } catch (err) {
    return NextResponse.json({ error: "FAVORITES_FETCH_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      INSERT INTO auth.customer_favorite_operators (user_id, operator_id, transport_type, operator_name, operator_plate, rating)
      VALUES (${auth.customer.id}::uuid, ${d.operatorId}::uuid, ${d.transportType}, ${d.operatorName}, ${d.operatorPlate}, ${d.rating})
      ON CONFLICT (user_id, operator_id) DO UPDATE SET
        transport_type = EXCLUDED.transport_type,
        operator_name = EXCLUDED.operator_name,
        operator_plate = EXCLUDED.operator_plate,
        rating = EXCLUDED.rating
      RETURNING id, operator_id AS "operatorId", transport_type AS "transportType",
                operator_name AS "operatorName", operator_plate AS "operatorPlate", rating, created_at AS "createdAt"
    `;
    emitCustomerRealtimeEvent({ customerId: auth.customer.id, reason: "favorite_saved" });
    return NextResponse.json({ favorite: rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "FAVORITE_SAVE_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const operatorId = searchParams.get("operatorId");
  if (!operatorId) return NextResponse.json({ error: "MISSING_OPERATOR_ID" }, { status: 400 });
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    await sql`DELETE FROM auth.customer_favorite_operators WHERE user_id = ${auth.customer.id}::uuid AND operator_id = ${operatorId}::uuid`;
    emitCustomerRealtimeEvent({ customerId: auth.customer.id, reason: "favorite_removed" });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: "FAVORITE_DELETE_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}
