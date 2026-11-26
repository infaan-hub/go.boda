export interface GatewayConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  rateLimitMax: number;
  upstreams: Record<string, string>;
}

export function loadGatewayConfig(): GatewayConfig {
  const port = Number(process.env.API_GATEWAY_PORT ?? 4000);
  const host = process.env.API_GATEWAY_HOST ?? "0.0.0.0";
  const corsOrigins = (
    process.env.CORS_ALLOWED_ORIGINS ??
    "http://localhost:3000,http://localhost:3001,http://localhost:3002"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port,
    host,
    corsOrigins,
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 120),
    upstreams: {
      "auth-service":
        process.env.AUTH_SERVICE_URL ?? "http://localhost:4001",
      "operator-service":
        process.env.OPERATOR_SERVICE_URL ?? "http://localhost:4002",
      "geo-zone-service":
        process.env.GEO_ZONE_SERVICE_URL ?? "http://localhost:4003",
      "location-service":
        process.env.LOCATION_SERVICE_URL ?? "http://localhost:4004",
      "pricing-service":
        process.env.PRICING_SERVICE_URL ?? "http://localhost:4005",
      "dispatch-service":
        process.env.DISPATCH_SERVICE_URL ?? "http://localhost:4006",
      "trip-service":
        process.env.TRIP_SERVICE_URL ?? "http://localhost:4007",
      "payment-wallet-service":
        process.env.PAYMENT_WALLET_SERVICE_URL ?? "http://localhost:4008",
      "notification-service":
        process.env.NOTIFICATION_SERVICE_URL ?? "http://localhost:4009",
      "safety-service":
        process.env.SAFETY_SERVICE_URL ?? "http://localhost:4010",
    },
  };
}
