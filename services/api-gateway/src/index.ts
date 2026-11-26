import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import httpProxy from "@fastify/http-proxy";
import { createLogger, REQUEST_ID_HEADER } from "@goboda/logger";
import { MICROSERVICES_REGISTRY, UNGUJA_GEO } from "@goboda/shared-types";
import { loadGatewayConfig } from "./config.js";

const SERVICE_NAME = "api-gateway";
const SERVICE_VERSION = "0.1.0";

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

const config = loadGatewayConfig();
const logger = createLogger(SERVICE_NAME);

const app = Fastify({
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
  delete request.headers["x-transport-type"];
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
    services: "/api/v1/services",
  },
  registeredServices: MICROSERVICES_REGISTRY.length,
  timestamp: new Date().toISOString(),
}));

app.get("/healthz", async () => ({
  service: SERVICE_NAME,
  status: "ok",
  port: config.port,
  serviceArea: "Unguja Island, Zanzibar",
  ungujaCenter: UNGUJA_GEO.CENTER,
  uptimeSeconds: Math.round(process.uptime()),
  timestamp: new Date().toISOString(),
  version: SERVICE_VERSION,
}));

app.get("/readyz", async () => ({
  service: SERVICE_NAME,
  ready: true,
  registeredServices: MICROSERVICES_REGISTRY.length,
  timestamp: new Date().toISOString(),
}));

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

// Listen only outside Vercel Serverless Functions (local dev & Docker containers)
if (!process.env.VERCEL) {
  app
    .listen({ port: config.port, host: config.host })
    .then(() => {
      logger.info(
        { port: config.port, host: config.host },
        "Go.boda API Gateway listening"
      );
    })
    .catch((err) => {
      logger.error({ err }, "Failed to start Go.boda API Gateway");
      process.exit(1);
    });
}

export default app;
