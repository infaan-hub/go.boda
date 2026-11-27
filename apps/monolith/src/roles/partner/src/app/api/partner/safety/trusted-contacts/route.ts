import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql } from "@goboda/db";
import {
  normalizeTzPhone,
  verifyPartnerRequest,
} from "@partner/lib/partner-auth";

export const dynamic = "force-dynamic";

const MAX_TRUSTED_CONTACTS = 3;

const addPartnerContactSchema = z.object({
  ownerKey: z.string().trim().min(4).max(120).optional(),
  ownerRole: z.enum(["BODABODA_RIDER", "BAJAJI_DRIVER"]).optional(),
  contactName: z.string().trim().min(2).max(80),
  contactPhone: z.string().trim().min(7).max(24),
  relationship: z.string().trim().min(2).max(40).default("Family"),
  autoShareTrips: z.boolean().default(true),
});

async function resolveOwner(
  request: Request,
  fallbackKey?: string | null,
  fallbackRole?: string | null
): Promise<{
  ownerKey: string | null;
  ownerRole: "BODABODA_RIDER" | "BAJAJI_DRIVER";
}> {
  const auth = await verifyPartnerRequest(request);
  if (auth.ok) {
    return {
      ownerKey: auth.partner.id,
      ownerRole: auth.partner.role,
    };
  }
  const cleaned = fallbackKey?.trim();
  const role =
    fallbackRole === "BAJAJI_DRIVER" ? "BAJAJI_DRIVER" : "BODABODA_RIDER";
  return {
    ownerKey: cleaned && cleaned.length >= 4 ? cleaned : null,
    ownerRole: role,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { ownerKey, ownerRole } = await resolveOwner(
    request,
    searchParams.get("ownerKey"),
    searchParams.get("ownerRole")
  );
  if (!ownerKey) {
    return NextResponse.json({
      ownerKey: null,
      ownerRole,
      maxContacts: MAX_TRUSTED_CONTACTS,
      count: 0,
      contacts: [],
    });
  }

  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    const contacts = await sql`
      SELECT
        id, owner_key AS "ownerKey", owner_role AS "ownerRole",
        contact_name AS "contactName", contact_phone AS "contactPhone",
        relationship, auto_share_trips AS "autoShareTrips",
        created_at AS "createdAt"
      FROM safety.trusted_contacts
      WHERE owner_key = ${ownerKey}
        AND owner_role IN ('BODABODA_RIDER', 'BAJAJI_DRIVER')
      ORDER BY created_at ASC
      LIMIT 10
    `;
    return NextResponse.json({
      ownerKey,
      ownerRole,
      maxContacts: MAX_TRUSTED_CONTACTS,
      count: contacts.length,
      contacts,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "PARTNER_TRUSTED_CONTACTS_FETCH_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = addPartnerContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const { ownerKey, ownerRole } = await resolveOwner(
    request,
    d.ownerKey,
    d.ownerRole
  );
  if (!ownerKey) {
    return NextResponse.json(
      {
        error: "OWNER_KEY_REQUIRED",
        messageEn: "Sign in or provide a partner device key.",
        messageSw: "Ingia au weka utambulisho wa kifaa chako.",
      },
      { status: 400 }
    );
  }

  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    const existing = (await sql`
      SELECT COUNT(*)::int AS cnt
      FROM safety.trusted_contacts
      WHERE owner_key = ${ownerKey}
        AND owner_role IN ('BODABODA_RIDER', 'BAJAJI_DRIVER')
    `) as Array<{ cnt: number }>;

    if ((existing[0]?.cnt ?? 0) >= MAX_TRUSTED_CONTACTS) {
      return NextResponse.json(
        {
          error: "MAX_TRUSTED_CONTACTS_REACHED",
          maxContacts: MAX_TRUSTED_CONTACTS,
          messageEn: "You can save up to 3 Trusted Contacts.",
          messageSw: "Unaweza kuhifadhi hadi Watu 3 wa Kuaminika.",
        },
        { status: 409 }
      );
    }

    const phone = normalizeTzPhone(d.contactPhone);
    const rows = (await sql`
      INSERT INTO safety.trusted_contacts (
        owner_key, owner_role, contact_name, contact_phone,
        relationship, auto_share_trips
      )
      VALUES (
        ${ownerKey}, ${ownerRole}, ${d.contactName}, ${phone},
        ${d.relationship}, ${d.autoShareTrips}
      )
      RETURNING
        id, owner_key AS "ownerKey", owner_role AS "ownerRole",
        contact_name AS "contactName", contact_phone AS "contactPhone",
        relationship, auto_share_trips AS "autoShareTrips",
        created_at AS "createdAt"
    `) as Array<Record<string, unknown>>;

    return NextResponse.json(
      { created: true, contact: rows[0] },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "PARTNER_TRUSTED_CONTACT_CREATE_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim();
  const { ownerKey } = await resolveOwner(
    request,
    searchParams.get("ownerKey"),
    searchParams.get("ownerRole")
  );

  if (!id || !ownerKey) {
    return NextResponse.json(
      { error: "MISSING_PARAMETERS" },
      { status: 400 }
    );
  }

  try {
    const sql = getSql(process.env.PARTNER_DATABASE_URL ?? process.env.DATABASE_URL);
    const deleted = (await sql`
      DELETE FROM safety.trusted_contacts
      WHERE id = ${id}::uuid
        AND owner_key = ${ownerKey}
        AND owner_role IN ('BODABODA_RIDER', 'BAJAJI_DRIVER')
      RETURNING id
    `) as Array<{ id: string }>;

    if (!deleted[0]) {
      return NextResponse.json(
        { error: "CONTACT_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ deleted: true, id: deleted[0].id });
  } catch (err) {
    return NextResponse.json(
      {
        error: "PARTNER_TRUSTED_CONTACT_DELETE_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
