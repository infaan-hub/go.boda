import gateway from "@/server/gateway/app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await gateway.inject({ method: "GET", url: "/healthz" });
  return new Response(result.payload, {
    status: result.statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
