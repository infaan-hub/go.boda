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
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Username may only contain letters, numbers, dots, dashes and underscores"
    ),
  email: z.string().trim().email().max(254),
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
  const username = d.username.trim().toLowerCase();
  const email = d.email.trim().toLowerCase();
  const passwordHash = hashPassword(d.password);

  try {
    const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
    const existing = (await sql`
      SELECT id
      FROM auth.users
      WHERE phone = ${phone}
         OR LOWER(username) = LOWER(${username})
         OR LOWER(email) = LOWER(${email})
      LIMIT 1
    `) as Array<{ id: string }>;

    if (existing[0]) {
      return NextResponse.json(
        {
          error: "ACCOUNT_ALREADY_EXISTS",
          message:
            "An account with this username, email, or phone already exists. Please sign in instead.",
        },
        { status: 409 }
      );
    }

    const rows = (await sql`
      INSERT INTO auth.users (phone, email, username, password_hash, name, role, language)
      VALUES (${phone}, ${email}, ${username}, ${passwordHash}, ${d.name}, 'CUSTOMER', ${d.language})
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
