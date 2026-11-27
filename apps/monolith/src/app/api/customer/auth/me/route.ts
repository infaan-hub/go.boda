import { NextResponse } from "next/server";
import { verifyCustomerRequest } from "@/lib/customer-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) {
    return NextResponse.json(
      { authenticated: false, error: "CUSTOMER_AUTH_REQUIRED" },
      { status: 401 }
    );
  }
  return NextResponse.json({
    authenticated: true,
    customer: auth.customer,
  });
}
