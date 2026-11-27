import { z } from "zod";

/**
 * Canonical Go.boda Platform Roles
 * - CUSTOMER: Person requesting nearby Bodaboda or Bajaji transport on Unguja Island
 * - BODABODA_RIDER (Rider): Verified motorcycle operator
 * - BAJAJI_DRIVER (Driver): Verified three-wheeler operator
 * - ADMIN: Go.boda internal operations team
 */
export const UserRole = {
  CUSTOMER: "CUSTOMER",
  BODABODA_RIDER: "BODABODA_RIDER",
  BAJAJI_DRIVER: "BAJAJI_DRIVER",
  ADMIN: "ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const userRoleSchema = z.enum([
  "CUSTOMER",
  "BODABODA_RIDER",
  "BAJAJI_DRIVER",
  "ADMIN",
]);

export const TransportType = {
  BODABODA: "BODABODA",
  BAJAJI: "BAJAJI",
} as const;
export type TransportType = (typeof TransportType)[keyof typeof TransportType];
export const transportTypeSchema = z.enum(["BODABODA", "BAJAJI"]);

export const OperatorTitle = {
  RIDER: "RIDER",
  DRIVER: "DRIVER",
} as const;
export type OperatorTitle = (typeof OperatorTitle)[keyof typeof OperatorTitle];

export function getOperatorTitle(transportType: TransportType): OperatorTitle {
  return transportType === TransportType.BODABODA
    ? OperatorTitle.RIDER
    : OperatorTitle.DRIVER;
}

export const KycStatus = {
  NOT_SUBMITTED: "NOT_SUBMITTED",
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export const TripStatus = {
  DRAFT: "DRAFT",
  SEARCHING: "SEARCHING",
  OFFERED_TO_OPERATOR: "OFFERED_TO_OPERATOR",
  NO_OPERATOR_FOUND: "NO_OPERATOR_FOUND",
  ASSIGNED: "ASSIGNED",
  ARRIVED_AT_PICKUP: "ARRIVED_AT_PICKUP",
  IN_PROGRESS: "IN_PROGRESS",
  SOS_ACTIVE: "SOS_ACTIVE",
  COMPLETED_UNPAID: "COMPLETED_UNPAID",
  PAID_COMPLETED: "PAID_COMPLETED",
  CANCELLED_BY_CUSTOMER: "CANCELLED_BY_CUSTOMER",
  CANCELLED_BY_OPERATOR: "CANCELLED_BY_OPERATOR",
  PAYMENT_DISPUTED: "PAYMENT_DISPUTED",
} as const;
export type TripStatus = (typeof TripStatus)[keyof typeof TripStatus];
export const tripStatusSchema = z.enum([
  "DRAFT",
  "SEARCHING",
  "OFFERED_TO_OPERATOR",
  "NO_OPERATOR_FOUND",
  "ASSIGNED",
  "ARRIVED_AT_PICKUP",
  "IN_PROGRESS",
  "SOS_ACTIVE",
  "COMPLETED_UNPAID",
  "PAID_COMPLETED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_OPERATOR",
  "PAYMENT_DISPUTED",
]);

export const PaymentMethod = {
  CASH: "CASH",
  MOBILE_MONEY: "MOBILE_MONEY",
  CARD: "CARD",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
export const paymentMethodSchema = z.enum(["CASH", "MOBILE_MONEY", "CARD"]);

export const PaymentStatus = {
  PENDING: "PENDING",
  INITIATED: "INITIATED",
  CONFIRMED: "CONFIRMED",
  FAILED: "FAILED",
  DISPUTED: "DISPUTED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const WalletAccountType = {
  EARNINGS: "EARNINGS",
  COMMISSION_FLOAT: "COMMISSION_FLOAT",
} as const;
export type WalletAccountType =
  (typeof WalletAccountType)[keyof typeof WalletAccountType];

export const Locale = {
  SW: "sw",
  EN: "en",
} as const;
export type Locale = (typeof Locale)[keyof typeof Locale];
export const localeSchema = z.enum(["sw", "en"]);

export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type Coordinates = z.infer<typeof coordinatesSchema>;

export const fareQuoteRequestSchema = z.object({
  pickup: coordinatesSchema,
  dropoff: coordinatesSchema,
  pickupLabel: z.string().min(1).max(160).optional(),
  dropoffLabel: z.string().min(1).max(160).optional(),
});
export type FareQuoteRequest = z.infer<typeof fareQuoteRequestSchema>;

export const serviceHealthSchema = z.object({
  service: z.string(),
  status: z.enum(["ok", "degraded", "down"]),
  port: z.number().int().positive(),
  timestamp: z.string().datetime(),
  uptimeSeconds: z.number().nonnegative(),
  version: z.string(),
});
export type ServiceHealth = z.infer<typeof serviceHealthSchema>;

/** Unguja Island geographic constants (Zanzibar) */
export const UNGUJA_GEO = {
  CENTER: { lat: -6.1659, lng: 39.2026 } as Coordinates,
  STONE_TOWN: { lat: -6.1622, lng: 39.1875 } as Coordinates,
  BOUNDS: {
    southWest: { lat: -6.52, lng: 39.12 } as Coordinates,
    northEast: { lat: -5.64, lng: 39.62 } as Coordinates,
  },
} as const;

/** Default indicative TZS pricing configuration */
export const DEFAULT_TARIFFS_TZS = {
  BODABODA: {
    baseFareTzs: 1000,
    perKmTzs: 600,
    perMinTzs: 50,
    minFareTzs: 1500,
    waitFeePerMinTzs: 100,
    commissionPct: 12,
    maxMultiplier: 1.25,
    maxPassengers: 1,
  },
  BAJAJI: {
    baseFareTzs: 2000,
    perKmTzs: 1000,
    perMinTzs: 100,
    minFareTzs: 3000,
    waitFeePerMinTzs: 150,
    commissionPct: 12,
    maxMultiplier: 1.25,
    maxPassengers: 3,
  },
} as const;

export const PLATFORM_FINANCE = {
  CURRENCY: "TZS",
  FARE_ROUNDING_STEP_TZS: 500,
  DEFAULT_COMMISSION_PCT: 12,
  FLOAT_BLOCK_THRESHOLD_TZS: -5000,
  DISPATCH_OFFER_TTL_SECONDS: 20,
  FREE_WAIT_MINUTES: 5,
} as const;

/** In-process Go.boda domain modules exposed through the monolith API. */
export interface DomainDescriptor {
  id: string;
  name: string;
  routePrefix: string;
  summary: string;
}

export const DOMAIN_REGISTRY: readonly DomainDescriptor[] = [
  {
    id: "auth",
    name: "Auth & Identity",
    routePrefix: "/api/v1/auth",
    summary: "Phone OTP (WhatsApp/SMS), Google OAuth, JWT & RBAC",
  },
  {
    id: "operator",
    name: "Riders & Drivers",
    routePrefix: "/api/v1/operators",
    summary: "Bodaboda Rider & Bajaji Driver KYC, Z-plates, Kituo & approval",
  },
  {
    id: "geo-zone",
    name: "Unguja Geo & Zones",
    routePrefix: "/api/v1/geo",
    summary: "Unguja polygon geofence, Stone Town perimeter snapping & routing",
  },
  {
    id: "location",
    name: "Live Location & Nearby",
    routePrefix: "/api/v1/nearby",
    summary: "Real-time GPS telemetry & live nearby Bodaboda/Bajaji discovery",
  },
  {
    id: "pricing",
    name: "Pricing & Tariffs",
    routePrefix: "/api/v1/pricing",
    summary: "Upfront TZS fare quotes, Bodaboda/Bajaji tariffs & capped surge",
  },
  {
    id: "dispatch",
    name: "Dispatch & Matching",
    routePrefix: "/api/v1/dispatch",
    summary: "Expanding-radius Rider/Driver matching, 20s TTL & atomic locks",
  },
  {
    id: "trip",
    name: "Trip Lifecycle",
    routePrefix: "/api/v1/trips",
    summary: "Trip State Machine, 4-digit Start PIN, receipts & ratings",
  },
  {
    id: "payment-wallet",
    name: "Payments & Wallets",
    routePrefix: "/api/v1/payments",
    summary: "Cash TZS, Mobile Money STK Push, Cards, Float & Earnings payouts",
  },
  {
    id: "notification",
    name: "Notifications & Chat",
    routePrefix: "/api/v1/notifications",
    summary: "Web Push (VAPID), WhatsApp/SMS alerts & bilingual quick-chat",
  },
  {
    id: "safety",
    name: "Safety & SOS",
    routePrefix: "/api/v1/safety",
    summary: "In-trip SOS console, WhatsApp live share links & helmet flags",
  },
] as const;

export function formatTzs(amount: number): string {
  return `TZS ${Math.round(amount).toLocaleString("en-US")}`;
}

export const MICROSERVICES_REGISTRY = [
  { id: "auth-service", name: "Auth Service" },
  { id: "operator-service", name: "Operator Service" },
  { id: "geo-zone-service", name: "Geo Zone Service" },
  { id: "location-service", name: "Location Service" },
  { id: "pricing-service", name: "Pricing Service" },
  { id: "dispatch-service", name: "Dispatch Service" },
  { id: "trip-service", name: "Trip Service" },
  { id: "payment-wallet-service", name: "Payment Wallet Service" },
  { id: "notification-service", name: "Notification Service" },
  { id: "safety-service", name: "Safety Service" },
] as const;

export type MicroserviceDescriptor = (typeof MICROSERVICES_REGISTRY)[number];

