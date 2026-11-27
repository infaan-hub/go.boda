"use client";

import * as React from "react";
import {
  Bike,
  CarFront,
  Compass,
  ExternalLink,
  Flame,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Users,
} from "lucide-react";
import { Badge, Button, cn } from "@goboda/ui";
import { TransportType } from "@goboda/shared-types";
import { PartnerPortalShell } from "./partner-portal-shell";
import { usePartnerRealtime } from "./partner-realtime-provider";
import {
  buildAppleMapsDirectionsUrl,
  buildGoogleMapsDirectionsUrl,
  formatShortCoords,
} from "../lib/partner-navigation";

interface HotspotItem {
  id: string;
  nameSw: string;
  nameEn: string;
  category: string;
  area: string;
  lat: number;
  lng: number;
  targetSupply: number;
  onlineSameCategory: number;
  idleSameCategory: number;
  activeRequestsNearby: number;
  recentTrips2h: number;
  queueGap: number;
  demandScore: number;
  demandLevel: "HOT" | "BUSY" | "STEADY" | "QUIET";
}

interface HotspotsPayload {
  transportType: "BODABODA" | "BAJAJI";
  homeKituo: string | null;
  summary: {
    totalVituo: number;
    hotCount: number;
    busyCount: number;
    activeRequestsTotal: number;
    onlineOperatorsCategory: number;
  };
  hotspots: HotspotItem[];
  timestamp: string;
}

function PartnerHotspotsContent({
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
  const { snapshot, transport } = usePartnerRealtime();
  const [data, setData] = React.useState<HotspotsPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [selectedArea, setSelectedArea] = React.useState<string>("ALL");

  const loadHotspots = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/partner/hotspots", { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as HotspotsPayload;
        setData(json);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    void loadHotspots(false);
  }, [loadHotspots]);

  // Auto-refresh seamlessly when live WebSocket / SSE snapshot version advances
  React.useEffect(() => {
    if (!snapshot?.version) return;
    void loadHotspots(true);
  }, [snapshot?.version, loadHotspots]);

  const areas = React.useMemo(() => {
    const set = new Set<string>();
    for (const h of data?.hotspots ?? []) {
      if (h.area) set.add(h.area);
    }
    return ["ALL", ...Array.from(set).sort()];
  }, [data]);

  const filtered = React.useMemo(() => {
    const list = data?.hotspots ?? [];
    if (selectedArea === "ALL") return list;
    return list.filter((h) => h.area === selectedArea);
  }, [data, selectedArea]);

  const cardTone = nightMode
    ? "border-[#F3EEE8]/15 bg-[#123D3A] text-[#F3EEE8]"
    : "border-[#17645F]/15 bg-[#FAF7F2] text-[#122927]";

  const subCardTone = nightMode
    ? "border-[#F3EEE8]/15 bg-[#0D302E]"
    : "border-[#17645F]/15 bg-[#F3EEE8]/80";

  const roleWord = isBodabodaRider
    ? sw
      ? "Riders wa Bodaboda"
      : "Bodaboda Riders"
    : sw
      ? "Madereva wa Bajaji"
      : "Bajaji Drivers";

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
                ? "MAOMBI YA BODABODA • UNGUJA"
                : "BODABODA LIVE DEMAND • UNGUJA"
              : sw
                ? "MAOMBI YA BAJAJI • UNGUJA"
                : "BAJAJI LIVE DEMAND • UNGUJA"}
          </p>
          <h1
            className={cn(
              "mt-1 font-display text-4xl uppercase leading-none",
              nightMode ? "text-[#F3EEE8]" : "text-[#17645F]"
            )}
          >
            {sw ? "VITUO MOTO & FOLENI" : "DEMAND HOTSPOTS"}
          </h1>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={refreshing}
          onClick={() => void loadHotspots(true)}
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

      {/* Assigned Category Lock Strip */}
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
            {roleWord}
          </span>
          {partnerName ? (
            <span className="text-xs font-bold">{partnerName}</span>
          ) : null}
        </div>
        <span className="text-[11px] font-semibold opacity-75">
          {partnerPlateNumber ? `${partnerPlateNumber} • ` : ""}
          {transport === "websocket"
            ? "Live WS"
            : transport === "sse"
              ? "Live Stream"
              : sw
                ? "Moja kwa moja"
                : "Live"}
        </span>
      </div>

      {/* Top Summary Strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className={cn("rounded-3xl border p-4 shadow-sm", cardTone)}>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">
            {sw ? "Vituo Moto" : "Hot Zones"}
          </p>
          <p className="mt-1 font-display text-3xl leading-none text-[#B86B2B]">
            {(data?.summary.hotCount ?? 0) + (data?.summary.busyCount ?? 0)}
          </p>
          <p className="mt-1 text-[11px] opacity-70">
            {sw ? `Kati ya ${data?.summary.totalVituo ?? 0}` : `of ${data?.summary.totalVituo ?? 0} vituo`}
          </p>
        </div>

        <div className={cn("rounded-3xl border p-4 shadow-sm", cardTone)}>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">
            {sw ? "Maombi Sasa" : "Live Requests"}
          </p>
          <p
            className={cn(
              "mt-1 font-display text-3xl leading-none",
              nightMode ? "text-[#A7DBD7]" : "text-[#17645F]"
            )}
          >
            {data?.summary.activeRequestsTotal ?? 0}
          </p>
          <p className="mt-1 text-[11px] opacity-70">
            {sw ? "Kategoria yako" : "Your category"}
          </p>
        </div>

        <div className={cn("rounded-3xl border p-4 shadow-sm", cardTone)}>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">
            {sw ? "Walioko Hewani" : "Online Queue"}
          </p>
          <p
            className={cn(
              "mt-1 font-display text-3xl leading-none",
              nightMode ? "text-[#F3EEE8]" : "text-[#17645F]"
            )}
          >
            {data?.summary.onlineOperatorsCategory ?? 0}
          </p>
          <p className="mt-1 text-[11px] opacity-70 truncate">{roleWord}</p>
        </div>
      </div>

      {/* Area Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {areas.map((area) => {
          const active = selectedArea === area;
          return (
            <button
              key={area}
              type="button"
              onClick={() => setSelectedArea(area)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-bold transition",
                active
                  ? "border-[#17645F] bg-[#17645F] text-[#F3EEE8]"
                  : nightMode
                    ? "border-[#F3EEE8]/20 bg-[#123D3A] text-[#F3EEE8]/80 hover:border-[#F3EEE8]/50"
                    : "border-[#17645F]/20 bg-[#FAF7F2] text-[#17645F]/80 hover:border-[#17645F]"
              )}
            >
              {area === "ALL" ? (sw ? "Unguja Yote" : "All Unguja") : area}
            </button>
          );
        })}
      </div>

      {/* Hotspots List */}
      {loading ? (
        <div className={cn("flex items-center gap-2 rounded-3xl border p-6 text-xs", cardTone)}>
          <Loader2 className="h-4 w-4 animate-spin text-[#17645F]" />
          {sw ? "Inapakia vituo vya Unguja..." : "Loading live Unguja hotspots..."}
        </div>
      ) : filtered.length === 0 ? (
        <div className={cn("rounded-3xl border p-6 text-center text-xs opacity-75", cardTone)}>
          {sw
            ? "Hakuna vituo vilivyopatikana kwenye eneo hili."
            : "No vituo found in this area."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((h) => {
            const ratio = Math.min(
              100,
              Math.round(
                (h.onlineSameCategory / Math.max(1, h.targetSupply)) * 100
              )
            );
            const isHome =
              data?.homeKituo &&
              (h.nameEn.toLowerCase().includes(data.homeKituo.toLowerCase()) ||
                data.homeKituo.toLowerCase().includes(h.nameEn.toLowerCase()));

            return (
              <article
                key={h.id}
                className={cn("space-y-3.5 rounded-3xl border p-5 shadow-sm", cardTone)}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.14em]",
                          h.demandLevel === "HOT"
                            ? "bg-[#A93232] text-white"
                            : h.demandLevel === "BUSY"
                              ? "bg-[#B86B2B] text-[#FAF7F2]"
                              : h.demandLevel === "STEADY"
                                ? "bg-[#17645F] text-[#F3EEE8]"
                                : "bg-[#17645F]/15 text-[#17645F]"
                        )}
                      >
                        <Flame className="h-3 w-3" />
                        {h.demandLevel === "HOT"
                          ? sw
                            ? "MOTO SANA"
                            : "HIGH DEMAND"
                          : h.demandLevel === "BUSY"
                            ? sw
                              ? "SHUGHULI NYINGI"
                              : "BUSY"
                            : h.demandLevel === "STEADY"
                              ? sw
                                ? "WASTANI"
                                : "STEADY"
                              : sw
                                ? "TULIVU"
                                : "QUIET"}
                      </span>
                      <span className="text-[11px] font-semibold opacity-70">
                        {h.area}
                      </span>
                      {isHome ? (
                        <Badge tone="teal">
                          {sw ? "Kituo Chako" : "Home Kituo"}
                        </Badge>
                      ) : null}
                    </div>
                    <h2 className="text-base font-extrabold">
                      {sw ? h.nameSw : h.nameEn}
                    </h2>
                    <p className="inline-flex items-center gap-1 text-[11px] opacity-70">
                      <MapPin className="h-3 w-3 text-[#B86B2B]" />
                      {formatShortCoords(h.lat, h.lng)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">
                      {sw ? "Maombi ya Karibu" : "Nearby Requests"}
                    </p>
                    <p className="font-display text-3xl leading-none text-[#B86B2B]">
                      {h.activeRequestsNearby}
                    </p>
                    <p className="text-[11px] opacity-70">
                      {h.recentTrips2h}{" "}
                      {sw ? "safari (saa 2)" : "trips (2h)"}
                    </p>
                  </div>
                </div>

                {/* Queue Supply Bar */}
                <div className={cn("space-y-2 rounded-2xl border p-3.5", subCardTone)}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-bold">
                      <Users className="h-3.5 w-3.5 text-[#17645F]" />
                      {h.onlineSameCategory} {sw ? "mtandaoni" : "online"} ({h.idleSameCategory}{" "}
                      {sw ? "foleni" : "waiting"})
                    </span>
                    <span className="font-bold text-[#B86B2B]">
                      {h.queueGap > 0
                        ? sw
                          ? `Wanahitajika +${h.queueGap}`
                          : `Need +${h.queueGap} more`
                        : sw
                          ? "Kituo Kimejaa"
                          : "Queue Balanced"}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-current/10">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        h.queueGap > 0 ? "bg-[#B86B2B]" : "bg-[#17645F]"
                      )}
                      style={{ width: `${Math.max(8, ratio)}%` }}
                    />
                  </div>
                </div>

                {/* One-Tap Turn-by-Turn Navigation to Kituo */}
                <div className="grid grid-cols-2 gap-2.5">
                  <a
                    href={buildGoogleMapsDirectionsUrl(h.lat, h.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#17645F] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-[#F3EEE8] transition hover:bg-[#114E4A]"
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    Google Maps
                    <ExternalLink className="h-3 w-3 opacity-80" />
                  </a>
                  <a
                    href={buildAppleMapsDirectionsUrl(
                      h.lat,
                      h.lng,
                      sw ? h.nameSw : h.nameEn
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className={cn(
                      "inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-xs font-bold uppercase tracking-[0.1em] transition",
                      nightMode
                        ? "border-[#F3EEE8]/35 text-[#F3EEE8] hover:bg-[#F3EEE8] hover:text-[#17645F]"
                        : "border-[#17645F]/35 bg-[#FAF7F2] text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
                    )}
                  >
                    <Compass className="h-3.5 w-3.5" />
                    Apple Maps
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

export function PartnerHotspotsView({
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
      <PartnerHotspotsContent
        locale={locale}
        nightMode={nightMode}
        partnerName={partnerName}
        partnerPlateNumber={partnerPlateNumber}
        isBodabodaRider={isBodabodaRider}
      />
    </PartnerPortalShell>
  );
}
