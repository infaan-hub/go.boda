import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { getSql } from "@goboda/db";
import type { CustomerSessionUser } from "./customer-auth";

export interface CustomerRealtimeEvent {
  customerId?: string;
  tripId?: string;
  reason: string;
  timestamp: string;
}

export interface CustomerRealtimeNotification {
  id: string;
  channel: string;
  eventSubject: string;
  title: string;
  body: string;
  titleSw?: string;
  bodySw?: string;
  titleEn?: string;
  bodyEn?: string;
  url: string;
  read: boolean;
  createdAt: string;
  severity: "INFO" | "URGENT" | "SUCCESS";
}

export interface CustomerRealtimeActiveTrip {
  id: string;
  tripCode: string;
  transportType: "BODABODA" | "BAJAJI";
  status: string;
  operatorName: string | null;
  operatorPlate: string | null;
  operatorPhone: string | null;
  operatorLat: number | null;
  operatorLng: number | null;
  operatorHeading: number | null;
  pickupLabel: string;
  dropoffLabel: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  estimatedFareTzs: number | null;
  startPin: string | null;
  updatedAt: string;
}

export interface CustomerRealtimeSnapshot {
  version: string;
  timestamp: string;
  customerId: string;
  notifications: CustomerRealtimeNotification[];
  unreadCount: number;
  pushSubscriptionsCount: number;
  activeTrip: CustomerRealtimeActiveTrip | null;
}

const globalForBus = globalThis as unknown as {
  __gobodaCustomerRealtimeBus?: EventEmitter;
};

function getRealtimeBus(): EventEmitter {
  if (!globalForBus.__gobodaCustomerRealtimeBus) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(200);
    globalForBus.__gobodaCustomerRealtimeBus = emitter;
  }
  return globalForBus.__gobodaCustomerRealtimeBus;
}

export function emitCustomerRealtimeEvent(
  event: Omit<CustomerRealtimeEvent, "timestamp">
): void {
  const payload: CustomerRealtimeEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  getRealtimeBus().emit("customer-realtime", payload);
}

export function subscribeCustomerRealtimeEvents(
  customerId: string | undefined,
  callback: (event: CustomerRealtimeEvent) => void
): () => void {
  const bus = getRealtimeBus();
  const handler = (event: CustomerRealtimeEvent) => {
    if (customerId && event.customerId && event.customerId !== customerId) return;
    callback(event);
  };
  bus.on("customer-realtime", handler);
  return () => bus.off("customer-realtime", handler);
}

function classifySeverity(eventSubject: string): "INFO" | "URGENT" | "SUCCESS" {
  const s = eventSubject.toLowerCase();
  if (s.includes("sos") || s.includes("cancel")) return "URGENT";
  if (s.includes("assigned") || s.includes("arrived") || s.includes("completed") || s.includes("started")) return "SUCCESS";
  return "INFO";
}

function resolveNotifUrl(eventSubject: string, payload: Record<string, unknown> | null): string {
  if (payload && typeof payload.url === "string" && payload.url.startsWith("/")) return payload.url;
  const s = eventSubject.toLowerCase();
  if (s.includes("trip")) return "/trips";
  return "/notifications";
}

export async function buildCustomerRealtimeSnapshot(
  customer: CustomerSessionUser
): Promise<CustomerRealtimeSnapshot> {
  const sql = getSql(process.env.CUSTOMER_DATABASE_URL ?? process.env.DATABASE_URL);
  const customerId = customer.id;

  const [notifRows, pushCountRows, activeTripRows] = await Promise.all([
    sql`
      SELECT id, channel, event_subject AS "eventSubject", title, body, payload, created_at AS "createdAt"
      FROM notif.messages
      WHERE user_id = ${customerId}::uuid OR phone = ${customer.phone}
      ORDER BY created_at DESC
      LIMIT 25
    `,
    sql`
      SELECT COUNT(*)::int AS count
      FROM notif.push_subscriptions
      WHERE user_id = ${customerId}::uuid AND active = TRUE
    `,
    sql`
      SELECT id, trip_code AS "tripCode", transport_type AS "transportType", status,
             operator_name AS "operatorName", operator_plate AS "operatorPlate", operator_phone AS "operatorPhone",
             pickup_label AS "pickupLabel", dropoff_label AS "dropoffLabel",
             pickup_effective_lat AS "pickupLat", pickup_effective_lng AS "pickupLng",
             dropoff_lat AS "dropoffLat", dropoff_lng AS "dropoffLng",
             estimated_fare_tzs AS "estimatedFareTzs", start_pin AS "startPin", updated_at AS "updatedAt"
      FROM trip.trips
      WHERE customer_id = ${customerId}::uuid
        AND status IN ('SEARCHING','OFFERED_TO_OPERATOR','ASSIGNED','ARRIVED_AT_PICKUP','IN_PROGRESS','SOS_ACTIVE','COMPLETED_UNPAID')
      ORDER BY updated_at DESC
      LIMIT 1
    `,
  ]);

  const notifications: CustomerRealtimeNotification[] = (notifRows as Array<{
    id: string; channel: string; eventSubject: string; title: string; body: string; payload: Record<string, unknown> | null; createdAt: string;
  }>).map((n) => {
    const payload = n.payload && typeof n.payload === "object" ? n.payload : null;
    const readBy = Array.isArray(payload?.readByCustomerIds) ? (payload.readByCustomerIds as unknown[]) : [];
    const read = payload?.readByCustomer === true || readBy.includes(customerId);
    return {
      id: n.id,
      channel: n.channel,
      eventSubject: n.eventSubject,
      title: n.title,
      body: n.body,
      titleSw: typeof payload?.titleSw === "string" ? payload.titleSw : undefined,
      bodySw: typeof payload?.bodySw === "string" ? payload.bodySw : undefined,
      titleEn: typeof payload?.titleEn === "string" ? payload.titleEn : undefined,
      bodyEn: typeof payload?.bodyEn === "string" ? payload.bodyEn : undefined,
      url: resolveNotifUrl(n.eventSubject, payload as Record<string, unknown> | null),
      read,
      createdAt: new Date(n.createdAt).toISOString(),
      severity: classifySeverity(n.eventSubject),
    };
  });

  const unreadCount = notifications.filter((n) => !n.read).length;
  const pushSubscriptionsCount = Number((pushCountRows[0] as { count?: number } | undefined)?.count ?? 0);

  let activeTrip: CustomerRealtimeActiveTrip | null = null;
  const at = (activeTripRows as Array<Record<string, unknown>>)[0];
  if (at) {
    // fetch operator position if assigned
    let opLat: number | null = null;
    let opLng: number | null = null;
    let opHeading: number | null = null;
    const opId = null;
    // try to get operator_id from trip
    const tripId = String(at.id);
    const tripRows = await sql`
      SELECT operator_id AS "operatorId" FROM trip.trips WHERE id = ${tripId}::uuid LIMIT 1
    ` as Array<{ operatorId: string | null }>;
    const operatorId = tripRows[0]?.operatorId;
    if (operatorId) {
      const posRows = await sql`
        SELECT lat, lng, heading FROM location.operator_positions WHERE operator_id = ${operatorId}::uuid LIMIT 1
      ` as Array<{ lat: number; lng: number; heading: number }>;
      if (posRows[0]) {
        opLat = Number(posRows[0].lat);
        opLng = Number(posRows[0].lng);
        opHeading = Number(posRows[0].heading);
      }
    }
    activeTrip = {
      id: tripId,
      tripCode: String(at.tripCode),
      transportType: at.transportType as "BODABODA" | "BAJAJI",
      status: String(at.status),
      operatorName: (at.operatorName as string) ?? null,
      operatorPlate: (at.operatorPlate as string) ?? null,
      operatorPhone: (at.operatorPhone as string) ?? null,
      operatorLat: opLat,
      operatorLng: opLng,
      operatorHeading: opHeading,
      pickupLabel: String(at.pickupLabel),
      dropoffLabel: String(at.dropoffLabel),
      pickupLat: at.pickupLat != null ? Number(at.pickupLat) : null,
      pickupLng: at.pickupLng != null ? Number(at.pickupLng) : null,
      dropoffLat: at.dropoffLat != null ? Number(at.dropoffLat) : null,
      dropoffLng: at.dropoffLng != null ? Number(at.dropoffLng) : null,
      estimatedFareTzs: at.estimatedFareTzs != null ? Number(at.estimatedFareTzs) : null,
      startPin: (at.startPin as string) ?? null,
      updatedAt: new Date(String(at.updatedAt)).toISOString(),
    };
  }

  const corePayload = { customerId, notifications, unreadCount, pushSubscriptionsCount, activeTrip };
  const version = createHash("sha1").update(JSON.stringify(corePayload)).digest("hex").slice(0, 16);

  return {
    version,
    timestamp: new Date().toISOString(),
    ...corePayload,
  };
}
