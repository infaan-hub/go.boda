import pino, { type Logger, type LoggerOptions } from "pino";

export const REQUEST_ID_HEADER = "x-request-id";

export function createLogger(
  serviceName: string,
  overrides?: LoggerOptions
): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: {
      service: serviceName,
      env: process.env.NODE_ENV ?? "development",
    },
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "*.otp",
        "*.pin",
        "*.startPin",
        "*.password",
        "*.token",
      ],
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...overrides,
  });
}

export type { Logger };
