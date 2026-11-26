import { randomUUID } from "node:crypto";
import type {
  Coordinates,
  PaymentMethod,
  TransportType,
} from "@goboda/shared-types";

export const EVENT_SUBJECTS = {
  AUTH_OTP_REQUESTED: "auth.otp_requested",
  USER_CREATED: "user.created",
  USER_SUSPENDED: "user.suspended",
  OPERATOR_KYC_SUBMITTED: "operator.kyc_submitted",
  OPERATOR_APPROVED: "operator.approved",
  OPERATOR_REJECTED: "operator.rejected",
  OPERATOR_SUSPENDED: "operator.suspended",
  TRIP_REQUESTED: "trip.requested",
  TRIP_ARRIVED: "trip.arrived",
  TRIP_STARTED: "trip.started",
  TRIP_COMPLETED: "trip.completed",
  TRIP_CANCELLED_BY_CUSTOMER: "trip.cancelled_by_customer",
  TRIP_CANCELLED_BY_OPERATOR: "trip.cancelled_by_operator",
  TRIP_RATED: "trip.rated",
  DISPATCH_OFFER_SENT: "dispatch.offer_sent",
  DISPATCH_OPERATOR_ASSIGNED: "dispatch.operator_assigned",
  DISPATCH_OFFER_EXPIRED: "dispatch.offer_expired",
  DISPATCH_NO_OPERATOR_FOUND: "dispatch.no_operator_found",
  PAYMENT_INITIATED: "payment.initiated",
  PAYMENT_CONFIRMED: "payment.confirmed",
  PAYMENT_FAILED: "payment.failed",
  WALLET_FLOAT_BLOCKED: "wallet.float_blocked",
  WALLET_FLOAT_RESTORED: "wallet.float_restored",
  PAYOUT_COMPLETED: "payout.completed",
  SAFETY_SOS_TRIGGERED: "safety.sos_triggered",
  SAFETY_SOS_RESOLVED: "safety.sos_resolved",
  SAFETY_HELMET_FLAG_RAISED: "safety.helmet_flag_raised",
} as const;

export type EventSubject = (typeof EVENT_SUBJECTS)[keyof typeof EVENT_SUBJECTS];

export interface EventPayloadMap {
  [EVENT_SUBJECTS.AUTH_OTP_REQUESTED]: {
    phone: string;
    channel: "WHATSAPP" | "SMS";
    code: string;
    locale: "sw" | "en";
  };
  [EVENT_SUBJECTS.OPERATOR_APPROVED]: {
    operatorId: string;
    userId: string;
    transportType: TransportType;
    plateNumber: string;
  };
  [EVENT_SUBJECTS.TRIP_REQUESTED]: {
    tripId: string;
    customerId: string;
    transportType: TransportType;
    pickup: Coordinates;
    dropoff: Coordinates;
    estimatedFareTzs: number;
    paymentMethod: PaymentMethod;
  };
  [EVENT_SUBJECTS.DISPATCH_OFFER_SENT]: {
    offerId: string;
    tripId: string;
    operatorId: string;
    transportType: TransportType;
    expiresAt: string;
  };
  [EVENT_SUBJECTS.DISPATCH_OPERATOR_ASSIGNED]: {
    tripId: string;
    operatorId: string;
    transportType: TransportType;
  };
  [EVENT_SUBJECTS.TRIP_COMPLETED]: {
    tripId: string;
    customerId: string;
    operatorId: string;
    transportType: TransportType;
    finalFareTzs: number;
    paymentMethod: PaymentMethod;
  };
  [EVENT_SUBJECTS.PAYMENT_CONFIRMED]: {
    tripId: string;
    operatorId: string;
    amountTzs: number;
    commissionTzs: number;
    operatorNetTzs: number;
    paymentMethod: PaymentMethod;
  };
  [EVENT_SUBJECTS.WALLET_FLOAT_BLOCKED]: {
    operatorId: string;
    floatBalanceTzs: number;
    thresholdTzs: number;
  };
  [EVENT_SUBJECTS.WALLET_FLOAT_RESTORED]: {
    operatorId: string;
    floatBalanceTzs: number;
  };
  [EVENT_SUBJECTS.SAFETY_SOS_TRIGGERED]: {
    alertId: string;
    tripId: string;
    triggeredByUserId: string;
    location: Coordinates;
  };
}

export interface DomainEvent<
  S extends EventSubject = EventSubject,
  P = S extends keyof EventPayloadMap ? EventPayloadMap[S] : Record<string, unknown>,
> {
  eventId: string;
  subject: S;
  occurredAt: string;
  correlationId: string;
  producer: string;
  payload: P;
}

export interface OutboxRecord {
  id: string;
  subject: EventSubject;
  payload: string;
  correlationId: string;
  publishedAt: Date | null;
  createdAt: Date;
}

export function createEventEnvelope<S extends keyof EventPayloadMap>(params: {
  subject: S;
  producer: string;
  payload: EventPayloadMap[S];
  correlationId?: string;
}): DomainEvent<S, EventPayloadMap[S]> {
  return {
    eventId: randomUUID(),
    subject: params.subject,
    occurredAt: new Date().toISOString(),
    correlationId: params.correlationId ?? randomUUID(),
    producer: params.producer,
    payload: params.payload,
  };
}

export interface EventBusClient {
  publish<S extends keyof EventPayloadMap>(
    event: DomainEvent<S, EventPayloadMap[S]>
  ): Promise<void>;
  subscribe<S extends keyof EventPayloadMap>(
    subject: S,
    handler: (event: DomainEvent<S, EventPayloadMap[S]>) => Promise<void>
  ): Promise<void>;
  close(): Promise<void>;
}
