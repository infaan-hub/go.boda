import { NextResponse } from "next/server";
import { clearAdminCookie } from "@admin/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ signedOut: true });
  clearAdminCookie(response);
  return response;
}
