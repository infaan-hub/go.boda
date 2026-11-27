export interface GatewayConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  rateLimitMax: number;
}

export function loadGatewayConfig(): GatewayConfig {
  const port = Number(process.env.PORT ?? process.env.API_GATEWAY_PORT ?? 4000);
  const host = process.env.API_GATEWAY_HOST ?? "0.0.0.0";
  const corsOrigins = (
    process.env.CORS_ALLOWED_ORIGINS ??
    "http://localhost:3000"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port,
    host,
    corsOrigins,
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 120),
  };
}
