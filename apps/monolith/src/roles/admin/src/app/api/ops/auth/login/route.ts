import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, verifyPassword } from "@goboda/db";
import { attachAdminCookie, signAdminSessionToken } from "@admin/lib/admin-auth";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  username: z.string().trim().min(3).max(60),
  password: z.string().min(1).max(200),
});

interface AdminCredentialRow {
  id: string;
  phone: string | null;
  name: string | null;
  role: string;
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

  try {
    const sql = getSql(process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL);
    const rows = (await sql`
      SELECT id, phone, name, role, password_hash AS "passwordHash"
      FROM auth.users
      WHERE LOWER(username) = LOWER(${parsed.data.username})
        AND role = 'ADMIN'
      LIMIT 1
    `) as AdminCredentialRow[];

    const admin = rows[0];
    if (!admin || !verifyPassword(parsed.data.password, admin.passwordHash)) {
      return NextResponse.json(
        {
          error: "INVALID_ADMIN_CREDENTIALS",
          message: "Invalid admin username or password.",
        },
        { status: 401 }
      );
    }

    const adminUser = {
      id: admin.id,
      phone: admin.phone ?? "",
      name: admin.name || "Go.boda Ops Admin",
      role: "ADMIN" as const,
    };

    const token = await signAdminSessionToken(adminUser);
    const response = NextResponse.json({
      authenticated: true,
      admin: adminUser,
    });
    attachAdminCookie(response, token);
    return response;
  } catch (err) {
    return NextResponse.json(
      {
        error: "ADMIN_LOGIN_FAILED",
        message: err instanceof Error ? err.message : "Database error",
      },
      { status: 500 }
    );
  }
}
