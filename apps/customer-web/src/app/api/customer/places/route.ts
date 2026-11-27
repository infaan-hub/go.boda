import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyCustomerRequest } from "@/lib/customer-auth";
import { emitCustomerRealtimeEvent } from "@/lib/customer-realtime";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  label: z.string().trim().min(1).max(120),
  kind: z.enum(["HOME", "WORK", "HOTEL_VILLA", "LANDMARK", "CUSTOM"]).default("CUSTOM"),
  landmarkId: z.string().max(120).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isDefault: z.boolean().default(false),
});

export async function GET(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      SELECT id, label, kind, landmark_id AS "landmarkId", lat, lng, is_default AS "isDefault", created_at AS "createdAt"
      FROM auth.customer_saved_places
      WHERE user_id = ${auth.customer.id}::uuid
      ORDER BY is_default DESC, created_at DESC
    `;
    return NextResponse.json({ places: rows });
  } catch (err) {
    return NextResponse.json({ error: "PLACES_FETCH_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
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
    if (d.isDefault) {
      await sql`UPDATE auth.customer_saved_places SET is_default = FALSE WHERE user_id = ${auth.customer.id}::uuid`;
    }
    const rows = await sql`
      INSERT INTO auth.customer_saved_places (user_id, label, kind, landmark_id, lat, lng, is_default)
      VALUES (${auth.customer.id}::uuid, ${d.label}, ${d.kind}, ${d.landmarkId ?? null}, ${d.lat}, ${d.lng}, ${d.isDefault})
      RETURNING id, label, kind, landmark_id AS "landmarkId", lat, lng, is_default AS "isDefault", created_at AS "createdAt"
    `;
    emitCustomerRealtimeEvent({ customerId: auth.customer.id, reason: "saved_place_created" });
    return NextResponse.json({ place: rows[0] }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: "PLACE_CREATE_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}
