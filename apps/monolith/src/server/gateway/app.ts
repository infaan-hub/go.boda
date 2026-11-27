import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { jwtVerify } from "jose";
import { createLogger, REQUEST_ID_HEADER } from "@goboda/logger";
import {
  checkDatabaseHealth,
  getUngujaBootstrapSummary,
} from "@goboda/db";
import {
  DOMAIN_REGISTRY,
  UNGUJA_GEO,
  UserRole,
} from "@goboda/shared-types";
import { loadGatewayConfig } from "./config";
import authApp from "../domains/auth/app";
import operatorApp from "../domains/operator/app";
import geoZoneApp from "../domains/geo-zone/app";
import locationApp from "../domains/location/app";
import pricingApp from "../domains/pricing/app";
import dispatchApp from "../domains/dispatch/app";
import tripApp from "../domains/trip/app";
import paymentWalletApp from "../domains/payment-wallet/app";
import notificationApp from "../domains/notification/app";
import safetyApp from "../domains/safety/app";

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

export const SERVICE_NAME = "platform-api";
export const SERVICE_VERSION = "0.1.0";

const domainApps = [
  { id: "auth", prefixes: ["/api/v1/auth"], app: authApp },
  { id: "operator", prefixes: ["/api/v1/operators"], app: operatorApp },
  { id: "geo-zone", prefixes: ["/api/v1/geo"], app: geoZoneApp },
  { id: "location", prefixes: ["/api/v1/nearby", "/api/v1/location"], app: locationApp },
  { id: "pricing", prefixes: ["/api/v1/pricing"], app: pricingApp },
  { id: "dispatch", prefixes: ["/api/v1/dispatch"], app: dispatchApp },
  { id: "trip", prefixes: ["/api/v1/trips"], app: tripApp },
  { id: "payment-wallet", prefixes: ["/api/v1/payments", "/api/v1/wallets"], app: paymentWalletApp },
  { id: "notification", prefixes: ["/api/v1/notifications"], app: notificationApp },
  { id: "safety", prefixes: ["/api/v1/safety", "/api/v1/track"], app: safetyApp },
];

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
    path.startsWith("/api/v1/dispatch/offers") ||
    path.startsWith("/api/v1/wallets/")
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
          "Only Bodaboda Riders and Bajaji Drivers can access operator telemetry, dispatch offers, and wallets.",
      });
    }
  } else if (
    path.startsWith("/api/v1/trips") ||
    path.startsWith("/api/v1/dispatch/") ||
    path.startsWith("/api/v1/safety/") ||
    (path.startsWith("/api/v1/payments/") &&
      !path.startsWith("/api/v1/payments/webhooks/")) ||
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
  name: "Go.boda Platform API",
  service: SERVICE_NAME,
  version: SERVICE_VERSION,
  serviceArea: "Unguja Island, Zanzibar",
  endpoints: {
    health: "/healthz",
    ready: "/readyz",
    database: "/api/v1/db/status",
    domains: "/api/v1/domains",
  },
  domainCount: DOMAIN_REGISTRY.length,
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
    domainCount: DOMAIN_REGISTRY.length,
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

const getDomainStatus = async () => {
  const checks = domainApps.map((domain) => ({
    id: domain.id,
    status: "online",
    mode: "in-process",
  }));

  return {
    gateway: {
      service: SERVICE_NAME,
      status: "online",
      port: config.port,
      version: SERVICE_VERSION,
    },
    domains: checks,
    timestamp: new Date().toISOString(),
  };
};

app.get("/api/v1/domains", getDomainStatus);
app.get("/api/v1/services", getDomainStatus);

app.all("/api/v1/*", async (request, reply) => {
  const path = request.url.split("?")[0] ?? "/";
  const domain = domainApps.find((candidate) =>
    candidate.prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  );
  if (!domain) return reply.code(404).send({ error: "API_ROUTE_NOT_FOUND" });

  const headers = { ...request.headers };
  delete headers.host;
  delete headers["content-length"];
  const result = await domain.app.inject({
    method: request.method,
    url: request.url,
    headers: headers as Record<string, string | string[] | undefined>,
    ...(request.body === undefined ? {} : { payload: request.body as string | object }),
  });
  reply.code(result.statusCode);
  for (const [name, value] of Object.entries(result.headers)) {
    if (value !== undefined && name !== "transfer-encoding" && name !== "content-length") {
      reply.header(name, value);
    }
  }
  return reply.send(result.rawPayload);
});

export default app;
