"use client";

import * as React from "react";
import {
  Banknote,
  Bike,
  CarFront,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Smartphone,
  Star,
  XCircle,
} from "lucide-react";
import { Badge, Button, cn } from "@goboda/ui";
import { TransportType, formatTzs } from "@goboda/shared-types";
import { PartnerPortalShell } from "./partner-portal-shell";
import { usePartnerRealtime } from "./partner-realtime-provider";
import { buildGoogleMapsDirectionsUrl } from "../lib/partner-navigation";

interface TripHistoryRow {
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
  paymentMethod: "CASH" | "MOBILE_MONEY" | "CARD";
  grossFareTzs: number;
  estimatedFareTzs: number;
  finalFareTzs: number | null;
  commissionTzs: number;
  operatorNetTzs: number;
  helmetProvided: boolean | null;
  cancelReason: string | null;
  customerRating: number | null;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

interface TripHistoryPayload {
  summary: {
    totalTrips: number;
    completedTrips: number;
    cancelledTrips: number;
    totalNetTzs: number;
    totalGrossTzs: number;
    totalCommissionTzs: number;
    totalDistanceKm: number;
    avgRating: number | null;
  };
  trips: TripHistoryRow[];
}

function PartnerTripsContent({
  locale,
  nightMode,
  partnerName,
  partnerPlateNumber,
  isBodabodaRider,
}: {
  locale: "sw" | "en";
  nightMode: boolean;
  partnerName?: string;
  partnerPlateNumber?: string;
  isBodabodaRider: boolean;
}) {
  const sw = locale === "sw";
  const { snapshot } = usePartnerRealtime();
  const [range, setRange] = React.useState<"today" | "week" | "all">("all");
  const [statusFilter, setStatusFilter] = React.useState<
    "ALL" | "COMPLETED" | "CANCELLED"
  >("ALL");
  const [data, setData] = React.useState<TripHistoryPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const loadTrips = React.useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetch(
          `/api/partner/trips?range=${range}&status=${statusFilter}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const json = (await res.json()) as TripHistoryPayload;
          setData(json);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range, statusFilter]
  );

  React.useEffect(() => {
    void loadTrips(false);
  }, [loadTrips]);

  // Live refresh whenever realtime state changes (e.g. a trip just completed)
  React.useEffect(() => {
    if (!snapshot?.version) return;
    void loadTrips(true);
  }, [snapshot?.version, loadTrips]);

  const cardTone = nightMode
    ? "border-[#F3EEE8]/15 bg-[#123D3A] text-[#F3EEE8]"
    : "border-[#17645F]/15 bg-[#FAF7F2] text-[#122927]";

  const subCardTone = nightMode
    ? "border-[#F3EEE8]/15 bg-[#0D302E]"
    : "border-[#17645F]/15 bg-[#F3EEE8]/80";

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 pt-6 sm:px-6">
      <div
        className={cn(
          "flex flex-wrap items-end justify-between gap-3 border-b pb-4",
          nightMode ? "border-[#F3EEE8]/15" : "border-[#17645F]/15"
        )}
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] opacity-75">
            {isBodabodaRider
              ? sw
                ? "HISTORIA YA SAFARI ZA BODABODA • UNGUJA"
                : "BODABODA TRIP RECEIPTS • UNGUJA"
              : sw
                ? "HISTORIA YA SAFARI ZA BAJAJI • UNGUJA"
                : "BAJAJI TRIP RECEIPTS • UNGUJA"}
          </p>
          <h1
            className={cn(
              "mt-1 font-display text-4xl uppercase leading-none",
              nightMode ? "text-[#F3EEE8]" : "text-[#17645F]"
            )}
          >
            {sw ? "HISTORIA YA SAFARI" : "TRIP HISTORY"}
          </h1>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={refreshing}
          onClick={() => void loadTrips(true)}
          className={cn(
            nightMode
              ? "border-[#F3EEE8]/30 text-[#F3EEE8] hover:bg-[#F3EEE8] hover:text-[#17645F]"
              : ""
          )}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          {sw ? "Sasisha" : "Refresh"}
        </Button>
      </div>

      {/* Category Pill */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2 rounded-full border px-4 py-2",
          cardTone
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.12em]",
              isBodabodaRider
                ? "bg-[#17645F] text-[#F3EEE8]"
                : "bg-[#B86B2B] text-[#FAF7F2]"
            )}
          >
            {isBodabodaRider ? (
              <Bike className="h-3.5 w-3.5" />
            ) : (
              <CarFront className="h-3.5 w-3.5" />
            )}
            {isBodabodaRider
              ? sw
                ? "Rider wa Bodaboda"
                : "Bodaboda Rider"
              : sw
                ? "Dereva wa Bajaji"
                : "Bajaji Driver"}
          </span>
          {partnerName ? (
            <span className="text-xs font-bold">{partnerName}</span>
          ) : null}
        </div>
        {partnerPlateNumber ? (
          <span className="font-mono text-xs font-bold opacity-80">
            {partnerPlateNumber}
          </span>
        ) : null}
      </div>

      {/* Range & Status Filters */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { key: "today", label: sw ? "Leo" : "Today" },
              { key: "week", label: sw ? "Wiki Hii" : "7 Days" },
              { key: "all", label: sw ? "Zote" : "All Time" },
            ] as const
          ).map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-bold transition",
                range === r.key
                  ? "border-[#17645F] bg-[#17645F] text-[#F3EEE8]"
                  : nightMode
                    ? "border-[#F3EEE8]/20 bg-[#123D3A] text-[#F3EEE8]/80"
                    : "border-[#17645F]/20 bg-[#FAF7F2] text-[#17645F]"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { key: "ALL", label: sw ? "Hali Zote" : "All" },
              { key: "COMPLETED", label: sw ? "Zilizokamilika" : "Completed" },
              { key: "CANCELLED", label: sw ? "Zilizofutwa" : "Cancelled" },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatusFilter(s.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-bold transition",
                statusFilter === s.key
                  ? "border-[#B86B2B] bg-[#B86B2B] text-[#FAF7F2]"
                  : nightMode
                    ? "border-[#F3EEE8]/20 bg-[#123D3A] text-[#F3EEE8]/75"
                    : "border-[#17645F]/20 bg-[#FAF7F2] text-[#17645F]/80"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Period Summary KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={cn("rounded-3xl border p-4 shadow-sm", cardTone)}>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">
            {sw ? "Safari" : "Completed"}
          </p>
          <p
            className={cn(
              "mt-1 font-display text-3xl leading-none",
              nightMode ? "text-[#F3EEE8]" : "text-[#17645F]"
            )}
          >
            {data?.summary.completedTrips ?? 0}
          </p>
          <p className="mt-1 text-[11px] opacity-70">
            {data?.summary.cancelledTrips ?? 0} {sw ? "zimefutwa" : "cancelled"}
          </p>
        </div>

        <div className={cn("rounded-3xl border p-4 shadow-sm", cardTone)}>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">
            {sw ? "Mapato Halisi" : "Net (88%)"}
          </p>
          <p
            className={cn(
              "mt-1 font-display text-2xl leading-none",
              nightMode ? "text-[#A7DBD7]" : "text-[#17645F]"
            )}
          >
            {formatTzs(data?.summary.totalNetTzs ?? 0)}
          </p>
          <p className="mt-1 text-[11px] opacity-70">
            {sw ? "Kamisheni 12%" : "After 12% fee"}
          </p>
        </div>

        <div className={cn("rounded-3xl border p-4 shadow-sm", cardTone)}>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">
            {sw ? "Umbali" : "Distance"}
          </p>
          <p className="mt-1 font-display text-3xl leading-none text-[#B86B2B]">
            {data?.summary.totalDistanceKm ?? 0}
            <span className="ml-0.5 text-sm">km</span>
          </p>
          <p className="mt-1 text-[11px] opacity-70">Unguja</p>
        </div>

        <div className={cn("rounded-3xl border p-4 shadow-sm", cardTone)}>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">
            {sw ? "Kiwango" : "Avg Rating"}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 font-display text-3xl leading-none text-[#B86B2B]">
            {data?.summary.avgRating ? data.summary.avgRating.toFixed(1) : "5.0"}
            <Star className="h-5 w-5 fill-[#B86B2B] text-[#B86B2B]" />
          </p>
          <p className="mt-1 text-[11px] opacity-70">
            {sw ? "Wateja" : "Customer stars"}
          </p>
        </div>
      </div>

      {/* Trip Receipts List */}
      {loading ? (
        <div className={cn("flex items-center gap-2 rounded-3xl border p-6 text-xs", cardTone)}>
          <Loader2 className="h-4 w-4 animate-spin text-[#17645F]" />
          {sw ? "Inapakia safari zako..." : "Loading your trip history..."}
        </div>
      ) : (data?.trips ?? []).length === 0 ? (
        <div className={cn("rounded-3xl border p-8 text-center space-y-2", cardTone)}>
          <p className="font-display text-2xl uppercase">
            {sw ? "HAKUNA SAFARI BADO" : "NO TRIPS IN THIS PERIOD"}
          </p>
          <p className="text-xs opacity-75">
            {sw
              ? "Ingia mtandaoni kwenye ukurasa wa Zamu ili kuanza kupokea safari."
              : "Go online on the Shift page to accept nearby Unguja trips—completed receipts appear here live."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {(data?.trips ?? []).map((trip) => {
            const isCompleted =
              trip.status === "PAID_COMPLETED" ||
              trip.status === "COMPLETED_UNPAID";
            const isCancelled = trip.status.startsWith("CANCELLED");
            const gross = trip.finalFareTzs ?? trip.estimatedFareTzs;
            const km = (trip.distanceMeters / 1000).toFixed(1);
            const mins = Math.max(1, Math.round(trip.durationSeconds / 60));
            const dt = new Date(
              trip.completedAt ?? trip.cancelledAt ?? trip.createdAt
            );

            return (
              <article
                key={trip.id}
                className={cn("space-y-3 rounded-3xl border p-5 shadow-sm", cardTone)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-extrabold">
                      {trip.tripCode}
                    </span>
                    <Badge
                      tone={
                        isCompleted
                          ? "emerald"
                          : isCancelled
                            ? "rose"
                            : "amber"
                      }
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : isCancelled ? (
                        <XCircle className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      {trip.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <span className="text-[11px] opacity-70">
                    {dt.toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}{" "}
                    •{" "}
                    {dt.toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                {/* Route */}
                <div className="space-y-1.5 text-xs">
                  <p className="flex items-start gap-2 font-semibold">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#17645F]" />
                    <span>
                      {trip.pickupLabel}
                      {trip.pickupSnapped ? (
                        <span className="ml-1.5 rounded-full bg-[#B86B2B]/15 px-2 py-0.5 text-[10px] font-bold text-[#B86B2B]">
                          Smart-Snap
                          {trip.pickupSnapGateName
                            ? ` (${trip.pickupSnapGateName})`
                            : ""}
                        </span>
                      ) : null}
                    </span>
                  </p>
                  <p className="flex items-start gap-2 font-semibold">
                    <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B86B2B]" />
                    <span>{trip.dropoffLabel}</span>
                  </p>
                </div>

                {/* Fare Breakdown */}
                <div
                  className={cn(
                    "grid grid-cols-3 gap-2 rounded-2xl border p-3 text-xs",
                    subCardTone
                  )}
                >
                  <div>
                    <p className="text-[10px] font-bold uppercase opacity-65">
                      {sw ? "Nauli" : "Gross Fare"}
                    </p>
                    <p className="font-bold">{formatTzs(gross)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase opacity-65">
                      {sw ? "Kamisheni (12%)" : "Fee (12%)"}
                    </p>
                    <p className="font-bold text-[#B86B2B]">
                      -{formatTzs(trip.commissionTzs)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase opacity-65">
                      {sw ? "Halisi (88%)" : "Your Net"}
                    </p>
                    <p
                      className={cn(
                        "font-extrabold",
                        nightMode ? "text-[#A7DBD7]" : "text-[#17645F]"
                      )}
                    >
                      {formatTzs(trip.operatorNetTzs)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] opacity-80">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      {trip.paymentMethod === "CASH" ? (
                        <Banknote className="h-3.5 w-3.5 text-[#B86B2B]" />
                      ) : (
                        <Smartphone className="h-3.5 w-3.5 text-[#17645F]" />
                      )}
                      {trip.paymentMethod}
                    </span>
                    <span>
                      {km} km • {mins} min
                    </span>
                    {trip.customerRating ? (
                      <span className="inline-flex items-center gap-0.5 font-bold text-[#B86B2B]">
                        <Star className="h-3.5 w-3.5 fill-[#B86B2B]" />
                        {trip.customerRating}/5
                      </span>
                    ) : null}
                  </div>
                  <a
                    href={buildGoogleMapsDirectionsUrl(
                      trip.dropoffLat,
                      trip.dropoffLng
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-bold underline underline-offset-2 hover:opacity-100"
                  >
                    {sw ? "Ramani" : "View Route"}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

export function PartnerTripsView({
  locale,
  partnerName,
  partnerTransportType,
  partnerPlateNumber,
}: {
  locale: "sw" | "en";
  partnerName?: string;
  partnerTransportType: TransportType;
  partnerPlateNumber?: string;
}) {
  const [nightMode, setNightMode] = React.useState(false);
  const isBodabodaRider = partnerTransportType === TransportType.BODABODA;
  const categoryLabel = isBodabodaRider
    ? locale === "sw"
      ? "Rider wa Bodaboda"
      : "Bodaboda Rider"
    : locale === "sw"
      ? "Dereva wa Bajaji"
      : "Bajaji Driver";

  return (
    <PartnerPortalShell
      locale={locale}
      categoryLabel={categoryLabel}
      nightMode={nightMode}
      onToggleNightMode={() => setNightMode((v) => !v)}
      showSignOut
    >
      <PartnerTripsContent
        locale={locale}
        nightMode={nightMode}
        partnerName={partnerName}
        partnerPlateNumber={partnerPlateNumber}
        isBodabodaRider={isBodabodaRider}
      />
    </PartnerPortalShell>
  );
}
