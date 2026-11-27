import { NextResponse } from "next/server";
import { verifyAdminRequest } from "@admin/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.ok) {
    return NextResponse.json(
      { authenticated: false, error: "ADMIN_AUTH_REQUIRED" },
      { status: 401 }
    );
  }
  return NextResponse.json({
    authenticated: true,
    admin: auth.admin,
  });
}
