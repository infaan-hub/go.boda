import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { getSql } from "@goboda/db";
import type { PartnerSessionUser } from "./partner-auth";

export type ComplianceBucket =
  | "EXPIRED"
  | "7D"
  | "14D"
  | "30D"
  | "VALID"
  | "MISSING";

export interface PartnerRealtimeEvent {
  operatorId?: string;
  transportType?: "BODABODA" | "BAJAJI" | "ALL";
  reason: string;
  timestamp: string;
}

const globalForBus = globalThis as unknown as {
  __gobodaPartnerRealtimeBus?: EventEmitter;
};

function getRealtimeBus(): EventEmitter {
  if (!globalForBus.__gobodaPartnerRealtimeBus) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(200);
    globalForBus.__gobodaPartnerRealtimeBus = emitter;
  }
  return globalForBus.__gobodaPartnerRealtimeBus;
}

export function emitPartnerRealtimeEvent(
  event: Omit<PartnerRealtimeEvent, "timestamp">
): void {
  const payload: PartnerRealtimeEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  getRealtimeBus().emit("partner:event", payload);
}

export function subscribePartnerRealtimeEvents(
  listener: (event: PartnerRealtimeEvent) => void
): () => void {
  const bus = getRealtimeBus();
  bus.on("partner:event", listener);
  return () => {
    bus.off("partner:event", listener);
  };
}

export function daysUntilDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr).getTime();
  if (!Number.isFinite(target)) return null;
  return Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24));
}

export function classifyComplianceBucket(days: number | null): ComplianceBucket {
  if (days === null) return "MISSING";
  if (days < 0) return "EXPIRED";
  if (days <= 7) return "7D";
  if (days <= 14) return "14D";
  if (days <= 30) return "30D";
  return "VALID";
}

export interface PartnerRealtimeOffer {
  offerId: string;
  tripId: string;
  tripCode: string;
  transportType: "BODABODA" | "BAJAJI";
  pickupLabel: string;
  dropoffLabel: string;
  pickupLat: number;
  pickupLng: number;
  pickupSnapped: boolean;
  pickupSnapGateName: string | null;
  dropoffLat: number;
  dropoffLng: number;
  distanceMeters: number;
  etaMinutes: number;
  estimatedFareTzs: number;
  paymentMethod: "CASH" | "MOBILE_MONEY" | "CARD";
  startPin: string;
  expiresAt: string;
}

export interface PartnerRealtimeActiveTrip {
  id: string;
  tripCode: string;
  transportType: "BODABODA" | "BAJAJI";
  status: string;
  pickupLabel: string;
  pickupSnapped: boolean;
  pickupSnapGateName: string | null;
  pickupEffectiveLat: number;
  pickupEffectiveLng: number;
  dropoffLabel: string;
  dropoffLat: number;
  dropoffLng: number;
  distanceMeters: number;
  durationSeconds: number;
  pickupDistanceMeters: number | null;
  pickupEtaMinutes: number | null;
  stops: Array<{ id: string; order: number; label: string; lat: number; lng: number; isPickup: boolean; isDropoff: boolean }>;
  paymentMethod: "CASH" | "MOBILE_MONEY" | "CARD";
  estimatedFareTzs: number;
  finalFareTzs: number | null;
  commissionTzs: number;
  operatorNetTzs: number;
  startPin: string;
  updatedAt: string;
}

export interface PartnerRealtimeNotification {
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

export interface PartnerRealtimeEarningsRow {
  id: string;
  label: string;
  channel: "CASH" | "MOBILE_MONEY" | "CARD";
  deltaTzs: number;
  time: string;
}

export interface PartnerRealtimeSnapshot {
  version: string;
  timestamp: string;
  operatorId: string;
  transportType: "BODABODA" | "BAJAJI";
  profile: {
    fullName: string;
    phone: string;
    homeKituo: string;
    plateNumber: string;
    licenseNo: string;
    licenseExpiry: string | null;
    insuranceExpiry: string | null;
    vehicleModel: string;
    vehicleColor: string;
    kycStatus: string;
    helmetVerified: boolean;
    isOnline: boolean;
    lat: number | null;
    lng: number | null;
    lastSeenAt: string | null;
    rejectionReason: string | null;
  } | null;
  compliance: {
    licenseExpiry: string | null;
    licenseDaysLeft: number | null;
    licenseBucket: ComplianceBucket;
    insuranceExpiry: string | null;
    insuranceDaysLeft: number | null;
    insuranceBucket: ComplianceBucket;
    urgentCount: number;
  };
  pendingOffers: PartnerRealtimeOffer[];
  activeTrip: PartnerRealtimeActiveTrip | null;
  todayStats: {
    tripsToday: number;
    todayNetTzs: number;
    cashNetTzs: number;
    digitalNetTzs: number;
    recentEarnings: PartnerRealtimeEarningsRow[];
  };
  notifications: PartnerRealtimeNotification[];
  unreadCount: number;
  pushSubscriptionsCount: number;
}

interface ProfileRow {
  transportType: "BODABODA" | "BAJAJI";
  fullName: string;
  phone: string;
  homeKituo: string;
  plateNumber: string;
  licenseNo: string;
  licenseExpiry: string | null;
  insuranceExpiry: string | null;
  vehicleModel: string;
  vehicleColor: string;
  kycStatus: string;
  helmetVerified: boolean;
  isOnline: boolean;
  lat: number | null;
  lng: number | null;
  lastSeenAt: string | null;
  rejectionReason: string | null;
}

interface OfferJoinRow {
  offerId: string;
  tripId: string;
  tripCode: string | null;
  transportType: "BODABODA" | "BAJAJI";
  pickupLabel: string;
  dropoffLabel: string;
  pickupLat: number | null;
  pickupLng: number | null;
  pickupSnapped: boolean | null;
  pickupSnapGateName: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  distanceMeters: number;
  etaMinutes: number;
  estimatedFareTzs: number;
  paymentMethod: "CASH" | "MOBILE_MONEY" | "CARD";
  startPin: string | null;
  expiresAt: string;
}

interface ActiveTripRow {
  id: string;
  tripCode: string;
  transportType: "BODABODA" | "BAJAJI";
  status: string;
  pickupLabel: string;
  pickupSnapped: boolean;
  pickupSnapGateName: string | null;
  pickupEffectiveLat: number;
  pickupEffectiveLng: number;
  dropoffLabel: string;
  dropoffLat: number;
  dropoffLng: number;
  distanceMeters: number;
  durationSeconds: number;
  pickupDistanceMeters: number | null;
  pickupEtaMinutes: number | null;
  paymentMethod: "CASH" | "MOBILE_MONEY" | "CARD";
  estimatedFareTzs: number;
  finalFareTzs: number | null;
  commissionTzs: number;
  operatorNetTzs: number;
  startPin: string;
  updatedAt: string;
}

interface RecentTripRow {
  id: string;
  tripCode: string;
  pickupLabel: string;
  dropoffLabel: string;
  paymentMethod: "CASH" | "MOBILE_MONEY" | "CARD";
  operatorNetTzs: number;
  completedAt: string | null;
  createdAt: string;
  isToday: boolean;
}

interface NotifRow {
  id: string;
  channel: string;
  eventSubject: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

function classifyNotifSeverity(
  eventSubject: string
): "INFO" | "URGENT" | "SUCCESS" {
  const s = eventSubject.toLowerCase();
  if (
    s.includes("sos") ||
    s.includes("expir") ||
    s.includes("pause") ||
    s.includes("urgent")
  ) {
    return "URGENT";
  }
  if (
    s.includes("completed") ||
    s.includes("approved") ||
    s.includes("renewed") ||
    s.includes("offer")
  ) {
    return "SUCCESS";
  }
  return "INFO";
}

function resolveNotifUrl(eventSubject: string, payload: Record<string, unknown> | null): string {
  if (payload && typeof payload.url === "string" && payload.url.startsWith("/")) {
    return payload.url;
  }
  const s = eventSubject.toLowerCase();
  if (s.includes("compliance") || s.includes("expir") || s.includes("kyc")) {
    return "/partner/kyc";
  }
  if (s.includes("offer") || s.includes("dispatch") || s.includes("shift")) {
    return "/partner/shift";
  }
  if (s.includes("completed")) {
    return "/partner/tripshistory/";
  }
  if (s.includes("trip")) {
    return "/partner/trips";
  }
  if (s.includes("sos") || s.includes("safety")) {
    return "/partner/safety";
  }
  return "/partner/notifications";
}

export async function buildPartnerRealtimeSnapshot(
  partner: PartnerSessionUser
): Promise<PartnerRealtimeSnapshot> {
  const sql = getSql(process.env.DATABASE_URL ?? process.env.PARTNER_DATABASE_URL);
  const operatorId = partner.id;

  const profileRows = (await sql`
    SELECT transport_type AS "transportType",
           full_name AS "fullName",
           phone,
           home_kituo AS "homeKituo",
           plate_number AS "plateNumber",
           license_no AS "licenseNo",
           to_char(license_expiry, 'YYYY-MM-DD') AS "licenseExpiry",
           to_char(insurance_expiry, 'YYYY-MM-DD') AS "insuranceExpiry",
           vehicle_model AS "vehicleModel",
           vehicle_color AS "vehicleColor",
           kyc_status AS "kycStatus",
           helmet_verified AS "helmetVerified",
           is_online AS "isOnline",
           rejection_reason AS "rejectionReason",
           pos.lat,
           pos.lng,
           pos.last_seen_at AS "lastSeenAt"
    FROM operator.profiles op
    LEFT JOIN location.operator_positions pos ON pos.operator_id = op.user_id
    WHERE op.user_id = ${operatorId}::uuid
    LIMIT 1
  `) as ProfileRow[];

  const profileRow = profileRows[0] ?? null;
  const profile = profileRow
    ? {
        ...profileRow,
        lat: profileRow.lat === null ? null : Number(profileRow.lat),
        lng: profileRow.lng === null ? null : Number(profileRow.lng),
      }
    : null;
  const assignedTransportType: "BODABODA" | "BAJAJI" =
    profile?.transportType === "BAJAJI"
      ? "BAJAJI"
      : profile?.transportType === "BODABODA"
        ? "BODABODA"
        : partner.transportType === "BAJAJI"
          ? "BAJAJI"
          : "BODABODA";

  const broadcastSegments =
    assignedTransportType === "BODABODA"
      ? [
          "ops.broadcast.all_operators",
          "ops.broadcast.bodaboda_riders",
          "ops.broadcast.stone_town_riders",
        ]
      : ["ops.broadcast.all_operators", "ops.broadcast.bajaji_drivers"];

  const operatorPhone = profile?.phone ?? partner.phone;

  const [offerRows, activeTripRows, recentTripsRows, notifRows, pushSubCountRows] =
    await Promise.all([
      sql`
        SELECT o.id AS "offerId",
               o.trip_id AS "tripId",
               t.trip_code AS "tripCode",
               o.transport_type AS "transportType",
               o.pickup_label AS "pickupLabel",
               o.dropoff_label AS "dropoffLabel",
               t.pickup_effective_lat AS "pickupLat",
               t.pickup_effective_lng AS "pickupLng",
               t.pickup_snapped AS "pickupSnapped",
               t.pickup_snap_gate_name AS "pickupSnapGateName",
               t.dropoff_lat AS "dropoffLat",
               t.dropoff_lng AS "dropoffLng",
               o.distance_meters::int AS "distanceMeters",
               o.eta_minutes::int AS "etaMinutes",
               o.estimated_fare_tzs::int AS "estimatedFareTzs",
               o.payment_method AS "paymentMethod",
               t.start_pin AS "startPin",
               o.expires_at AS "expiresAt"
        FROM dispatch.offers o
        LEFT JOIN trip.trips t ON t.id = o.trip_id
        WHERE o.operator_id = ${operatorId}::uuid
          AND o.transport_type = ${assignedTransportType}
          AND o.status = 'PENDING'
          AND o.expires_at > NOW()
        ORDER BY o.created_at DESC
        LIMIT 5
      `,
      sql`
        SELECT t.id,
               t.trip_code AS "tripCode",
               t.transport_type AS "transportType",
               t.status,
               t.pickup_label AS "pickupLabel",
               t.pickup_snapped AS "pickupSnapped",
               t.pickup_snap_gate_name AS "pickupSnapGateName",
               t.pickup_effective_lat AS "pickupEffectiveLat",
               t.pickup_effective_lng AS "pickupEffectiveLng",
               t.dropoff_label AS "dropoffLabel",
               t.dropoff_lat AS "dropoffLat",
               t.dropoff_lng AS "dropoffLng",
               t.distance_meters::int AS "distanceMeters",
               t.duration_seconds::int AS "durationSeconds",
               offer.distance_meters::int AS "pickupDistanceMeters",
               offer.eta_minutes::int AS "pickupEtaMinutes",
               t.payment_method AS "paymentMethod",
               t.estimated_fare_tzs::int AS "estimatedFareTzs",
               t.final_fare_tzs::int AS "finalFareTzs",
               t.commission_tzs::int AS "commissionTzs",
               t.operator_net_tzs::int AS "operatorNetTzs",
               t.start_pin AS "startPin",
               t.updated_at AS "updatedAt"
        FROM trip.trips t
        LEFT JOIN dispatch.trip_locks trip_lock ON trip_lock.trip_id = t.id
        LEFT JOIN dispatch.offers offer ON offer.id = trip_lock.offer_id
        WHERE t.operator_id = ${operatorId}::uuid
          AND t.transport_type = ${assignedTransportType}
          AND t.status IN ('ASSIGNED', 'ARRIVED_AT_PICKUP', 'IN_PROGRESS', 'SOS_ACTIVE', 'COMPLETED_UNPAID')
        ORDER BY t.updated_at DESC
        LIMIT 1
      `,
      sql`
        SELECT id,
               trip_code AS "tripCode",
               pickup_label AS "pickupLabel",
               dropoff_label AS "dropoffLabel",
               payment_method AS "paymentMethod",
               operator_net_tzs::int AS "operatorNetTzs",
               completed_at AS "completedAt",
               created_at AS "createdAt",
               (COALESCE(completed_at, created_at) >= CURRENT_DATE) AS "isToday"
        FROM trip.trips
        WHERE operator_id = ${operatorId}::uuid
          AND transport_type = ${assignedTransportType}
          AND status = 'PAID_COMPLETED'
        ORDER BY COALESCE(completed_at, created_at) DESC
        LIMIT 25
      `,
      sql`
        SELECT id,
               channel,
               event_subject AS "eventSubject",
               title,
               body,
               payload,
               created_at AS "createdAt"
        FROM notif.messages
        WHERE user_id = ${operatorId}::uuid
           OR phone = ${operatorPhone}
           OR event_subject = ANY(${broadcastSegments}::text[])
        ORDER BY created_at DESC
        LIMIT 25
      `,
      sql`
        SELECT COUNT(*)::int AS count
        FROM notif.push_subscriptions
        WHERE user_id = ${operatorId}::uuid AND active = TRUE
      `,
    ]);

  const licenseDaysLeft = daysUntilDate(profile?.licenseExpiry);
  const insuranceDaysLeft = daysUntilDate(profile?.insuranceExpiry);
  const licenseBucket = classifyComplianceBucket(licenseDaysLeft);
  const insuranceBucket = classifyComplianceBucket(insuranceDaysLeft);
  const urgentBuckets = new Set<ComplianceBucket>(["EXPIRED", "7D", "14D", "30D"]);
  const urgentCount =
    (urgentBuckets.has(licenseBucket) ? 1 : 0) +
    (urgentBuckets.has(insuranceBucket) ? 1 : 0);

  const recentTrips = recentTripsRows as RecentTripRow[];
  const todayTrips = recentTrips.filter((t) => t.isToday);
  const todayNetTzs = todayTrips.reduce((sum, t) => sum + Number(t.operatorNetTzs || 0), 0);
  const cashNetTzs = todayTrips
    .filter((t) => t.paymentMethod === "CASH")
    .reduce((sum, t) => sum + Number(t.operatorNetTzs || 0), 0);
  const digitalNetTzs = Math.max(0, todayNetTzs - cashNetTzs);

  const recentEarnings: PartnerRealtimeEarningsRow[] = recentTrips
    .slice(0, 10)
    .map((t) => {
      const dt = new Date(t.completedAt ?? t.createdAt);
      const time = Number.isNaN(dt.getTime())
        ? ""
        : dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
      return {
        id: t.id,
        label: `Trip ${t.tripCode} • ${t.pickupLabel} → ${t.dropoffLabel}`,
        channel: t.paymentMethod,
        deltaTzs: Number(t.operatorNetTzs || 0),
        time,
      };
    });

  const pendingOffers: PartnerRealtimeOffer[] = (offerRows as OfferJoinRow[]).map(
    (o) => ({
      offerId: o.offerId,
      tripId: o.tripId,
      tripCode: o.tripCode ?? `GB-${o.tripId.slice(0, 5).toUpperCase()}`,
      transportType: o.transportType,
      pickupLabel: o.pickupLabel,
      dropoffLabel: o.dropoffLabel,
      pickupLat: Number(o.pickupLat ?? -6.1649),
      pickupLng: Number(o.pickupLng ?? 39.1936),
      pickupSnapped: Boolean(o.pickupSnapped),
      pickupSnapGateName: o.pickupSnapGateName ?? null,
      dropoffLat: Number(o.dropoffLat ?? -6.1912),
      dropoffLng: Number(o.dropoffLng ?? 39.2216),
      distanceMeters: Number(o.distanceMeters || 0),
      etaMinutes: Number(o.etaMinutes || 2),
      estimatedFareTzs: Number(o.estimatedFareTzs || 0),
      paymentMethod: o.paymentMethod,
      startPin: o.startPin ?? "0000",
      expiresAt: new Date(o.expiresAt).toISOString(),
    })
  );

  const activeTripRaw = (activeTripRows as ActiveTripRow[])[0] ?? null;
  const activeTripStops = activeTripRaw
    ? (await sql`
        SELECT id, stop_order AS "order", label, lat, lng,
               is_pickup AS "isPickup", is_dropoff AS "isDropoff"
        FROM trip.trip_stops
        WHERE trip_id = ${activeTripRaw.id}::uuid
        ORDER BY stop_order ASC
      `) as Array<{ id: string; order: number; label: string; lat: number; lng: number; isPickup: boolean; isDropoff: boolean }>
    : [];
  const activeTrip: PartnerRealtimeActiveTrip | null = activeTripRaw
    ? {
        ...activeTripRaw,
        stops: activeTripStops.map((stop) => ({ ...stop, lat: Number(stop.lat), lng: Number(stop.lng) })),
        pickupEffectiveLat: Number(activeTripRaw.pickupEffectiveLat),
        pickupEffectiveLng: Number(activeTripRaw.pickupEffectiveLng),
        dropoffLat: Number(activeTripRaw.dropoffLat),
        dropoffLng: Number(activeTripRaw.dropoffLng),
        updatedAt: new Date(activeTripRaw.updatedAt).toISOString(),
      }
    : null;

  const notifications: PartnerRealtimeNotification[] = (notifRows as NotifRow[]).map(
    (n) => {
      const payload =
        n.payload && typeof n.payload === "object"
          ? (n.payload as Record<string, unknown>)
          : null;
      const readBy = Array.isArray(payload?.readByOperatorIds)
        ? (payload?.readByOperatorIds as unknown[])
        : [];
      const read =
        payload?.readByOperator === true || readBy.includes(operatorId);

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
        url: resolveNotifUrl(n.eventSubject, payload),
        read,
        createdAt: new Date(n.createdAt).toISOString(),
        severity: classifyNotifSeverity(n.eventSubject),
      };
    }
  );

  const unreadCount = notifications.filter((n) => !n.read).length;
  const pushSubscriptionsCount = Number(
    (pushSubCountRows[0] as { count?: number } | undefined)?.count ?? 0
  );

  const corePayload = {
    operatorId,
    transportType: assignedTransportType,
    profile,
    compliance: {
      licenseExpiry: profile?.licenseExpiry ?? null,
      licenseDaysLeft,
      licenseBucket,
      insuranceExpiry: profile?.insuranceExpiry ?? null,
      insuranceDaysLeft,
      insuranceBucket,
      urgentCount,
    },
    pendingOffers,
    activeTrip,
    todayStats: {
      tripsToday: todayTrips.length,
      todayNetTzs,
      cashNetTzs,
      digitalNetTzs,
      recentEarnings,
    },
    notifications,
    unreadCount,
    pushSubscriptionsCount,
  };

  const version = createHash("sha1")
    .update(JSON.stringify(corePayload))
    .digest("hex")
    .slice(0, 16);

  return {
    version,
    timestamp: new Date().toISOString(),
    ...corePayload,
  };
}
