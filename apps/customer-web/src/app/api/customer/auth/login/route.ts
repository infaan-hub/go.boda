import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, verifyPassword } from "@goboda/db";
import {
  attachCustomerCookie,
  normalizeTzPhone,
  signCustomerSessionToken,
} from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(60),
  password: z.string().min(1).max(200),
});

interface CustomerCredentialRow {
  id: string;
  phone: string | null;
  name: string;
  role: string;
  status: string;
  passwordHash: string | null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "VALIDATION_ERROR", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const identifier = parsed.data.identifier.trim();
  const phoneLike = /^[+\d][\d\s-]*$/.test(identifier);
  const phone = phoneLike ? normalizeTzPhone(identifier) : null;

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT id, phone, name, role, status, password_hash AS "passwordHash"
      FROM auth.users
      WHERE role = 'CUSTOMER'
        AND (LOWER(username) = LOWER(${identifier}) OR phone = ${phone})
      LIMIT 1
    `) as CustomerCredentialRow[];

    const customerRow = rows[0];
    if (
      !customerRow ||
      !verifyPassword(parsed.data.password, customerRow.passwordHash)
    ) {
      return NextResponse.json(
        {
          error: "INVALID_CUSTOMER_CREDENTIALS",
          message: "Invalid phone/username or password.",
        },
        { status: 401 }
      );
    }

    if (customerRow.status === "SUSPENDED") {
      return NextResponse.json(
        {
          error: "ACCOUNT_SUSPENDED",
          message: "This account is suspended. Contact Go.boda support.",
        },
        { status: 403 }
      );
    }

    const customer = {
      id: customerRow.id,
      phone: customerRow.phone ?? phone ?? "",
      name: customerRow.name,
      role: "CUSTOMER" as const,
    };

    const token = await signCustomerSessionToken(customer);
    const response = NextResponse.json({
      authenticated: true,
      customer,
    });
    attachCustomerCookie(response, token);
    return response;
  } catch (err) {
    return NextResponse.json(
      {
        error: "CUSTOMER_LOGIN_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
