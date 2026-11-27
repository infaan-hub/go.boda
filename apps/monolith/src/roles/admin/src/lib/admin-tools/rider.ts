import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyAdminRequest } from "@admin/lib/admin-auth";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(6).max(32).optional(),
  transportType: z.enum(["BODABODA", "BAJAJI"]).optional(),
  plateNumber: z.string().trim().max(24).optional(),
  homeKituo: z.string().trim().max(120).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.success ? undefined : parsed.error.flatten() }, { status: 400 });
  }
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const profiles = await sql`
      UPDATE operator.profiles SET
        full_name = COALESCE(${parsed.data.fullName ?? null}, full_name),
        phone = COALESCE(${parsed.data.phone ?? null}, phone),
        transport_type = COALESCE(${parsed.data.transportType ?? null}, transport_type),
        operator_title = CASE WHEN ${parsed.data.transportType ?? null} = 'BAJAJI' THEN 'BAJAJI_DRIVER' WHEN ${parsed.data.transportType ?? null} = 'BODABODA' THEN 'BODABODA_RIDER' ELSE operator_title END,
        plate_number = COALESCE(${parsed.data.plateNumber ?? null}, plate_number),
        home_kituo = COALESCE(${parsed.data.homeKituo ?? null}, home_kituo),
        kyc_status = CASE WHEN ${parsed.data.status ?? null} = 'SUSPENDED' THEN 'SUSPENDED' WHEN ${parsed.data.status ?? null} = 'ACTIVE' AND kyc_status = 'SUSPENDED' THEN 'PENDING' ELSE kyc_status END,
        is_online = CASE WHEN ${parsed.data.status ?? null} = 'SUSPENDED' THEN FALSE ELSE is_online END,
        updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING user_id AS "userId", transport_type AS "transportType", full_name AS "fullName", phone
    ` as Array<{ userId: string; transportType: string; fullName: string; phone: string }>;
    const rider = profiles[0];
    if (!rider) return NextResponse.json({ error: "RIDER_NOT_FOUND" }, { status: 404 });
    await sql`
      UPDATE auth.users SET
        name = ${rider.fullName}, phone = ${rider.phone},
        role = ${rider.transportType === "BAJAJI" ? "BAJAJI_DRIVER" : "BODABODA_RIDER"},
        status = CASE WHEN ${parsed.data.status ?? null} IS NULL THEN status ELSE ${parsed.data.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE"} END
      WHERE id = ${rider.userId}::uuid
    `;
    if (parsed.data.status === "SUSPENDED") {
      await sql`UPDATE location.operator_positions SET is_online = FALSE WHERE operator_id = ${rider.userId}::uuid`;
      await sql`UPDATE notif.push_subscriptions SET active = FALSE, updated_at = NOW() WHERE user_id = ${rider.userId}::uuid`;
    }
    return NextResponse.json({ updated: true });
  } catch (error) {
    return NextResponse.json({ error: "RIDER_UPDATE_FAILED", message: error instanceof Error ? error.message : "Database error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      UPDATE operator.profiles SET kyc_status = 'SUSPENDED', is_online = FALSE, updated_at = NOW()
      WHERE id = ${id}::uuid
      RETURNING user_id AS "userId"
    ` as Array<{ userId: string }>;
    if (!rows[0]) return NextResponse.json({ error: "RIDER_NOT_FOUND" }, { status: 404 });
    await sql`UPDATE auth.users SET status = 'SUSPENDED' WHERE id = ${rows[0].userId}::uuid`;
    await sql`UPDATE location.operator_positions SET is_online = FALSE WHERE operator_id = ${rows[0].userId}::uuid`;
    await sql`UPDATE notif.push_subscriptions SET active = FALSE, updated_at = NOW() WHERE user_id = ${rows[0].userId}::uuid`;
    return NextResponse.json({ deleted: true, softDeleted: true });
  } catch (error) {
    return NextResponse.json({ error: "RIDER_DELETE_FAILED", message: error instanceof Error ? error.message : "Database error" }, { status: 500 });
  }
}
