import type { MicroserviceDescriptor } from "@goboda/shared-types";

export interface AdminDbHealth {
  connected: boolean;
  provider?: string;
  database?: string | null;
  postgisVersion?: string | null;
  schemasReady?: string[];
  latencyMs?: number;
}

export interface AdminUngujaBootstrap {
  zonesCount: number;
  snapPointsCount: number;
  landmarksCount: number;
}

export interface AdminServiceStatus extends MicroserviceDescriptor {
  productionUrl: string;
  status: "online" | "offline";
  latencyMs?: number;
}

export interface AdminKpis {
  onlineRiders: number;
  onlineDrivers: number;
  busyOnTrips: number;
  activeTrips: number;
  totalTrips: number;
  completedTrips: number;
  pendingKycCount: number;
  approvedOperatorsCount: number;
  openSosCount: number;
  gmvTzs: number;
  platformCommissionTzs: number;
  ledgerBalanced: boolean;
  totalLedgerDriftTzs: number;
}

export interface AdminFleetRow {
  operatorId: string;
  transportType: "BODABODA" | "BAJAJI";
  operatorTitle: "RIDER" | "DRIVER";
  plateNumber: string;
  homeKituo: string;
  isOnline: boolean;
  isBusy: boolean;
  isDemo: boolean;
  lat: number;
  lng: number;
  ratingAvg: number;
  lastSeenAt: string;
}

export interface AdminOperatorRow {
  id: string;
  userId: string;
  transportType: "BODABODA" | "BAJAJI";
  operatorTitle: "RIDER" | "DRIVER";
  fullName: string;
  phone: string;
  homeKituo: string;
  plateNumber: string;
  licenseNo: string;
  licenseExpiry: string | null;
  insuranceExpiry: string | null;
  kycStatus: "PENDING_VERIFICATION" | "APPROVED" | "REJECTED" | "SUSPENDED";
  helmetVerified: boolean;
  isOnline: boolean;
  rejectionReason: string | null;
  createdAt: string;
}

export interface AdminTripRow {
  id: string;
  tripCode: string;
  transportType: "BODABODA" | "BAJAJI";
  operatorTitle: "RIDER" | "DRIVER" | null;
  status: string;
  pickupLabel: string;
  pickupSnapped: boolean;
  dropoffLabel: string;
  paymentMethod: string;
  estimatedFareTzs: number;
  finalFareTzs: number | null;
  operatorPlate: string | null;
  createdAt: string;
}

export interface AdminTariffRow {
  transportType: "BODABODA" | "BAJAJI";
  operatorRole: "RIDER" | "DRIVER";
  baseFareTzs: number;
  perKmTzs: number;
  perMinTzs: number;
  minFareTzs: number;
  waitFeePerMinTzs: number;
  cancelFeeTzs: number;
  commissionPct: number;
  activeMultiplier: number;
  maxMultiplier: number;
  multiplierReason: string;
  maxPassengers: number;
  updatedAt: string;
}

export interface AdminPromoRow {
  code: string;
  discountType: "PERCENT" | "FLAT_TZS";
  discountValue: number;
  maxDiscountTzs: number;
  minFareTzs: number;
  active: boolean;
  expiresAt: string | null;
}

export interface AdminLandmarkRow {
  id: string;
  nameSw: string;
  nameEn: string;
  category: string;
  area: string;
  isKituo: boolean;
  lat: number;
  lng: number;
}

export interface AdminSosRow {
  id: string;
  alertCode: string;
  tripId: string;
  tripCode: string | null;
  triggeredByRole: string;
  transportType: "BODABODA" | "BAJAJI" | null;
  operatorPlate: string | null;
  lat: number;
  lng: number;
  reason: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "FALSE_ALARM";
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminHelmetFlagRow {
  operatorId: string;
  totalChecks: number;
  missingCount30d: number;
  lastReportedAt: string;
  flaggedForReview: boolean;
}

export interface AdminFinanceSummary {
  ledgerBalanced: boolean;
  totalLedgerDriftTzs: number;
  totalConfirmedPayments: number;
  gmvTzs: number;
  platformCommissionTzs: number;
  operatorNetTzs: number;
  floatRecoveredTzs: number;
  floatBlockedOperators: Array<{
    operatorId: string;
    floatBalanceTzs: number;
    updatedAt: string;
  }>;
  recentPayouts: Array<{
    id: string;
    operatorId: string;
    amountTzs: number;
    payoutChannel: string;
    destinationPhone: string;
    status: string;
    providerRef: string | null;
    createdAt: string;
  }>;
}

export interface AdminOverviewPayload {
  dbHealth: AdminDbHealth;
  ungujaBootstrap: AdminUngujaBootstrap | null;
  services: AdminServiceStatus[];
  kpis: AdminKpis;
  fleet: AdminFleetRow[];
  operators: AdminOperatorRow[];
  trips: AdminTripRow[];
  tariffs: AdminTariffRow[];
  promos: AdminPromoRow[];
  landmarks: AdminLandmarkRow[];
  sosAlerts: AdminSosRow[];
  helmetFlags: AdminHelmetFlagRow[];
  finance: AdminFinanceSummary;
  timestamp: string;
}
