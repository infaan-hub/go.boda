import { NextResponse } from "next/server";
import { clearCustomerCookie } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ signedOut: true });
  clearCustomerCookie(response);
  return response;
}
