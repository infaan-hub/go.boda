import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hashPassword } from "@goboda/db";
import {
  attachCustomerCookie,
  normalizeTzPhone,
  signCustomerSessionToken,
} from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(20),
  password: z.string().min(8).max(128),
  language: z.enum(["sw", "en"]).default("sw"),
});

interface UserRow {
  id: string;
  phone: string | null;
  name: string;
  role: string;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const phone = normalizeTzPhone(d.phone);
  const passwordHash = hashPassword(d.password);

  try {
    const sql = getSql();
    const existing = (await sql`
      SELECT id
      FROM auth.users
      WHERE phone = ${phone} OR LOWER(username) = LOWER(${phone})
      LIMIT 1
    `) as Array<{ id: string }>;

    if (existing[0]) {
      return NextResponse.json(
        {
          error: "ACCOUNT_ALREADY_EXISTS",
          message:
            "An account with this phone number already exists. Please sign in instead.",
        },
        { status: 409 }
      );
    }

    const rows = (await sql`
      INSERT INTO auth.users (phone, username, password_hash, name, role, language)
      VALUES (${phone}, ${phone}, ${passwordHash}, ${d.name}, 'CUSTOMER', ${d.language})
      RETURNING id, phone, name, role
    `) as UserRow[];

    const user = rows[0];
    if (!user) {
      return NextResponse.json(
        { error: "CUSTOMER_PROVISION_FAILED" },
        { status: 500 }
      );
    }

    const customer = {
      id: user.id,
      phone: user.phone ?? phone,
      name: user.name,
      role: "CUSTOMER" as const,
    };

    const token = await signCustomerSessionToken(customer);
    const response = NextResponse.json(
      { registered: true, customer },
      { status: 201 }
    );
    attachCustomerCookie(response, token);
    return response;
  } catch (err) {
    return NextResponse.json(
      {
        error: "CUSTOMER_REGISTRATION_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
