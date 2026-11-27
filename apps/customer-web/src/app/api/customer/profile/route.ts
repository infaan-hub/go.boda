import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import { verifyCustomerRequest } from "@/lib/customer-auth";
import { emitCustomerRealtimeEvent } from "@/lib/customer-realtime";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  displayName: z.string().trim().max(120).optional(),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  defaultTransport: z.enum(["BODABODA", "BAJAJI"]).optional(),
  defaultPaymentMethod: z.enum(["CASH", "MOBILE_MONEY", "CARD"]).optional(),
  preferredLanguage: z.enum(["sw", "en"]).optional(),
});

export async function GET(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = await sql`
      SELECT u.id, u.phone, u.name, u.created_at AS "createdAt",
             p.display_name AS "displayName", p.email, p.default_transport AS "defaultTransport",
             p.default_payment_method AS "defaultPaymentMethod", p.preferred_language AS "preferredLanguage",
             p.avatar_url AS "avatarUrl", p.updated_at AS "updatedAt"
      FROM auth.users u
      LEFT JOIN auth.customer_profiles p ON p.user_id = u.id
      WHERE u.id = ${auth.customer.id}::uuid
      LIMIT 1
    `;
    const row = (rows[0] as Record<string, unknown>) ?? {};
    return NextResponse.json({
      profile: {
        id: auth.customer.id,
        phone: auth.customer.phone,
        name: auth.customer.name,
        displayName: (row.displayName as string) ?? auth.customer.name,
        email: (row.email as string) ?? "",
        defaultTransport: (row.defaultTransport as string) ?? "BODABODA",
        defaultPaymentMethod: (row.defaultPaymentMethod as string) ?? "CASH",
        preferredLanguage: (row.preferredLanguage as string) ?? "sw",
        avatarUrl: (row.avatarUrl as string) ?? null,
        createdAt: row.createdAt ?? null,
        updatedAt: row.updatedAt ?? null,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "PROFILE_FETCH_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    await sql`
      INSERT INTO auth.customer_profiles (user_id, display_name, email, default_transport, default_payment_method, preferred_language)
      VALUES (
        ${auth.customer.id}::uuid,
        ${d.displayName ?? auth.customer.name},
        ${d.email ?? ""},
        ${d.defaultTransport ?? "BODABODA"},
        ${d.defaultPaymentMethod ?? "CASH"},
        ${d.preferredLanguage ?? "sw"}
      )
      ON CONFLICT (user_id) DO UPDATE SET
        display_name = COALESCE(${d.displayName ?? null}, auth.customer_profiles.display_name),
        email = COALESCE(${d.email ?? null}, auth.customer_profiles.email),
        default_transport = COALESCE(${d.defaultTransport ?? null}, auth.customer_profiles.default_transport),
        default_payment_method = COALESCE(${d.defaultPaymentMethod ?? null}, auth.customer_profiles.default_payment_method),
        preferred_language = COALESCE(${d.preferredLanguage ?? null}, auth.customer_profiles.preferred_language),
        updated_at = NOW()
    `;
    emitCustomerRealtimeEvent({ customerId: auth.customer.id, reason: "profile_updated" });
    return NextResponse.json({ updated: true });
  } catch (err) {
    return NextResponse.json({ error: "PROFILE_UPDATE_FAILED", message: err instanceof Error ? err.message : "DB error" }, { status: 500 });
  }
}
