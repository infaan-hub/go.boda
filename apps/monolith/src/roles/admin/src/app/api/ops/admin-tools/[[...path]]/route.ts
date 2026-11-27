import { NextResponse } from "next/server";
import * as users from "@admin/lib/admin-tools/users";
import * as user from "@admin/lib/admin-tools/user";
import * as riders from "@admin/lib/admin-tools/riders";
import * as rider from "@admin/lib/admin-tools/rider";
import * as push from "@admin/lib/admin-tools/push";
import * as pushTest from "@admin/lib/admin-tools/push-test";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path?: string[] }> };

async function dispatch(method: string, request: Request, context: Context) {
  const path = (await context.params).path ?? [];
  if (path[0] === "users" && path.length === 1 && method === "GET") return users.GET(request);
  if (path[0] === "users" && path.length === 2 && (method === "PATCH" || method === "DELETE")) {
    const itemContext = { params: Promise.resolve({ id: path[1]! }) };
    return method === "PATCH" ? user.PATCH(request, itemContext) : user.DELETE(request, itemContext);
  }
  if (path[0] === "riders" && path.length === 1 && method === "GET") return riders.GET(request);
  if (path[0] === "riders" && path.length === 2 && (method === "PATCH" || method === "DELETE")) {
    const itemContext = { params: Promise.resolve({ id: path[1]! }) };
    return method === "PATCH" ? rider.PATCH(request, itemContext) : rider.DELETE(request, itemContext);
  }
  if (path[0] === "push" && path.length === 1) {
    if (method === "GET") return push.GET(request);
    if (method === "POST") return push.POST(request);
    if (method === "DELETE") return push.DELETE(request);
  }
  if (path[0] === "push" && path[1] === "test" && path.length === 2 && method === "POST") return pushTest.POST(request);
  return NextResponse.json({ error: "ADMIN_TOOL_ROUTE_NOT_FOUND" }, { status: 404 });
}

export const GET = (request: Request, context: Context) => dispatch("GET", request, context);
export const POST = (request: Request, context: Context) => dispatch("POST", request, context);
export const PATCH = (request: Request, context: Context) => dispatch("PATCH", request, context);
export const DELETE = (request: Request, context: Context) => dispatch("DELETE", request, context);
