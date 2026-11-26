import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import httpProxy from "@fastify/http-proxy";
import { jwtVerify } from "jose";
import { createLogger, REQUEST_ID_HEADER } from "@goboda/logger";
import {
  checkDatabaseHealth,
  getUngujaBootstrapSummary,
} from "@goboda/db";
import {
  MICROSERVICES_REGISTRY,
  UNGUJA_GEO,
  UserRole,
} from "@goboda/shared-types";
import { loadGatewayConfig } from "./config.js";

function getJwtSecretBytes(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET is required in production");
    }
    return new TextEncoder().encode("dev-only-insecure-goboda-jwt-secret");
  }
  return new TextEncoder().encode(secret);
}

export const SERVICE_NAME = "api-gateway";
export const SERVICE_VERSION = "0.1.0";

async function probeServiceHealth(
  url: string
): Promise<{ status: "online" | "offline"; latencyMs: number }> {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    const res = (await fetch(`${url}/healthz`, {
      signal: controller.signal,
    })) as unknown as { ok?: boolean; status?: number };
    const latencyMs = Math.round(performance.now() - started);
    const isOk = Boolean(
      res.ok ??
        (typeof res.status === "number" && res.status >= 200 && res.status < 300)
    );
    return { status: isOk ? "online" : "offline", latencyMs };
  } catch {
    return {
      status: "offline",
      latencyMs: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
  }
}

export const config = loadGatewayConfig();
export const logger = createLogger(SERVICE_NAME);

export const app = Fastify({
  logger: false,
  genReqId: (req) => {
    const existing = req.headers[REQUEST_ID_HEADER];
    if (typeof existing === "string" && existing.trim().length > 0) {
      return existing;
    }
    return randomUUID();
  },
});

app.register(cors, {
  origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
  credentials: true,
});

app.register(helmet, {
  contentSecurityPolicy: false,
});

app.register(rateLimit, {
  max: config.rateLimitMax,
  timeWindow: "1 minute",
});

app.addHook("onRequest", async (request, reply) => {
  reply.header(REQUEST_ID_HEADER, request.id);
  // Strip untrusted client identity headers before downstream auth propagation
  delete request.headers["x-user-id"];
  delete request.headers["x-user-role"];
  delete request.headers["x-user-phone"];
  delete request.headers["x-transport-type"];

  const authHeader = request.headers.authorization;
  let verifiedRole: UserRole | null = null;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    try {
      const { payload } = await jwtVerify(
        authHeader.slice(7).trim(),
        getJwtSecretBytes(),
        {
          issuer: "goboda-auth-service",
          audience: "goboda-platform",
        }
      );
      if (payload.sub && typeof payload.role === "string") {
        verifiedRole = payload.role as UserRole;
        request.headers["x-user-id"] = payload.sub;
        request.headers["x-user-role"] = payload.role;
        if (typeof payload.phone === "string") {
          request.headers["x-user-phone"] = payload.phone;
        }
      }
    } catch {
      // Invalid tokens are treated as unauthenticated below
    }
  }

  const path = request.url.split("?")[0] ?? "/";

  // Block public external calls to internal service-to-service routes
  if (/^\/api\/v1\/[^/]+\/internal(\/|$)/.test(path)) {
    return reply.code(403).send({
      error: "INTERNAL_ROUTE_FORBIDDEN",
      message: "Internal service endpoints are not accessible via public gateway.",
    });
  }

  // Edge RBAC enforcement
  if (/^\/api\/v1\/[^/]+\/admin(\/|$)/.test(path)) {
    if (!verifiedRole) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }
    if (verifiedRole !== UserRole.ADMIN) {
      return reply.code(403).send({
        error: "ADMIN_REQUIRED",
        message: "Operations Admin role is required for this endpoint.",
      });
    }
  } else if (path.startsWith("/api/v1/operators")) {
    if (!verifiedRole) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }
    if (
      verifiedRole !== UserRole.BODABODA_RIDER &&
      verifiedRole !== UserRole.BAJAJI_DRIVER &&
      verifiedRole !== UserRole.ADMIN
    ) {
      return reply.code(403).send({
        error: "OPERATOR_ROLE_REQUIRED",
        message:
          "Only Bodaboda Riders, Bajaji Drivers, or Admins can access operator routes.",
      });
    }
  } else if (
    path === "/api/v1/location/ping" ||
    path.startsWith("/api/v1/dispatch/offers")
  ) {
    if (!verifiedRole) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }
    if (
      verifiedRole !== UserRole.BODABODA_RIDER &&
      verifiedRole !== UserRole.BAJAJI_DRIVER &&
      verifiedRole !== UserRole.ADMIN
    ) {
      return reply.code(403).send({
        error: "OPERATOR_ROLE_REQUIRED",
        message:
          "Only Bodaboda Riders and Bajaji Drivers can access operator telemetry and dispatch offers.",
      });
    }
  } else if (
    path.startsWith("/api/v1/trips") ||
    path.startsWith("/api/v1/dispatch/") ||
    path === "/api/v1/auth/me" ||
    path === "/api/v1/notifications/me" ||
    path === "/api/v1/notifications/subscriptions" ||
    (path.startsWith("/api/v1/notifications/chat/") &&
      path !== "/api/v1/notifications/chat/presets")
  ) {
    if (!verifiedRole) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }
  }
});

app.addHook("onResponse", async (request, reply) => {
  logger.info(
    {
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime),
    },
    "gateway request completed"
  );
});

app.get("/", async () => ({
  name: "Go.boda API Gateway",
  service: SERVICE_NAME,
  version: SERVICE_VERSION,
  serviceArea: "Unguja Island, Zanzibar",
  endpoints: {
    health: "/healthz",
    ready: "/readyz",
    database: "/api/v1/db/status",
    services: "/api/v1/services",
  },
  registeredServices: MICROSERVICES_REGISTRY.length,
  timestamp: new Date().toISOString(),
}));

app.get("/healthz", async () => {
  const database = await checkDatabaseHealth();
  return {
    service: SERVICE_NAME,
    status: database.connected ? "ok" : "degraded",
    port: config.port,
    serviceArea: "Unguja Island, Zanzibar",
    ungujaCenter: UNGUJA_GEO.CENTER,
    database: {
      connected: database.connected,
      provider: database.provider,
      database: database.database,
      postgisVersion: database.postgisVersion,
      schemasReadyCount: database.schemasReady.length,
      latencyMs: database.latencyMs,
      ...(database.error ? { error: database.error } : {}),
    },
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    version: SERVICE_VERSION,
  };
});

app.get("/readyz", async (_req, reply) => {
  const database = await checkDatabaseHealth();
  const ready = database.connected && database.schemasMissing.length === 0;
  reply.code(ready ? 200 : 503);
  return {
    service: SERVICE_NAME,
    ready,
    databaseConnected: database.connected,
    schemasReady: database.schemasReady.length,
    registeredServices: MICROSERVICES_REGISTRY.length,
    timestamp: new Date().toISOString(),
  };
});

app.get("/api/v1/db/status", async () => {
  const [health, ungujaData] = await Promise.all([
    checkDatabaseHealth(),
    getUngujaBootstrapSummary(),
  ]);
  return {
    ...health,
    ungujaBootstrap: ungujaData,
    timestamp: new Date().toISOString(),
  };
});

app.get("/api/v1/services", async () => {
  const checks = await Promise.all(
    MICROSERVICES_REGISTRY.map(async (descriptor) => {
      const upstream = config.upstreams[descriptor.id] ?? "";
      const probe = upstream
        ? await probeServiceHealth(upstream)
        : { status: "offline" as const, latencyMs: 0 };

      return {
        ...descriptor,
        upstream,
        status: probe.status,
        latencyMs: probe.latencyMs,
      };
    })
  );

  return {
    gateway: {
      service: SERVICE_NAME,
      status: "online",
      port: config.port,
      version: SERVICE_VERSION,
    },
    services: checks,
    timestamp: new Date().toISOString(),
  };
});

// Register reverse proxy routes for all 10 domain microservices
const proxyRoutes: Array<{ prefix: string; serviceId: string }> = [
  { prefix: "/api/v1/auth", serviceId: "auth-service" },
  { prefix: "/api/v1/operators", serviceId: "operator-service" },
  { prefix: "/api/v1/geo", serviceId: "geo-zone-service" },
  { prefix: "/api/v1/nearby", serviceId: "location-service" },
  { prefix: "/api/v1/location", serviceId: "location-service" },
  { prefix: "/api/v1/pricing", serviceId: "pricing-service" },
  { prefix: "/api/v1/dispatch", serviceId: "dispatch-service" },
  { prefix: "/api/v1/trips", serviceId: "trip-service" },
  { prefix: "/api/v1/payments", serviceId: "payment-wallet-service" },
  { prefix: "/api/v1/wallets", serviceId: "payment-wallet-service" },
  { prefix: "/api/v1/notifications", serviceId: "notification-service" },
  { prefix: "/api/v1/safety", serviceId: "safety-service" },
  { prefix: "/api/v1/track", serviceId: "safety-service" },
];

for (const route of proxyRoutes) {
  const upstream = config.upstreams[route.serviceId];
  if (!upstream) continue;

  app.register(httpProxy, {
    upstream,
    prefix: route.prefix,
    rewritePrefix: route.prefix,
    http2: false,
    replyOptions: {
      rewriteRequestHeaders: (originalReq, headers) => ({
        ...headers,
        [REQUEST_ID_HEADER]: String(originalReq.id),
      }),
    },
  });
}

export default app;
