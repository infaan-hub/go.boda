import { NextResponse } from "next/server";
import gateway from "@/server/gateway/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const url = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());
  const payload = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.text();
  const result = await gateway.inject({
    method: request.method,
    url: `${url.pathname}${url.search}`,
    headers,
    ...(payload ? { payload } : {}),
  });
  const responseHeaders = new Headers();
  for (const [name, value] of Object.entries(result.headers)) {
    if (value !== undefined && name !== "content-length" && name !== "transfer-encoding") {
      responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : String(value));
    }
  }
  return new NextResponse(result.payload, {
    status: result.statusCode,
    headers: responseHeaders,
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
