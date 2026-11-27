"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Bike,
  CarFront,
  Clock,
  MapPin,
  Navigation,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Badge, BrandLogo, Card } from "@goboda/ui";
import type { MapVehicle } from "./unguja-map";

const UngujaMap = dynamic(
  () => import("./unguja-map").then((m) => m.UngujaMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] w-full items-center justify-center rounded-3xl bg-[#17645F] text-xs font-bold uppercase tracking-[0.16em] text-[#F3EEE8]">
        Loading Live Unguja Tracker Map...
      </div>
    ),
  }
);

interface TrackPayload {
  shareToken: string;
  isDemo?: boolean;
  expiresAt: string;
  viewsCount: number;
  trip: {
    tripCode: string;
    status: string;
    transportType: "BODABODA" | "BAJAJI";
    operatorTitle: "RIDER" | "DRIVER";
    operatorName: string | null;
    operatorPlate: string | null;
    pickup: { lat: number; lng: number; label: string };
    dropoff: { lat: number; lng: number; label: string };
    distanceKm: number;
    durationMinutes: number;
  };
  livePosition: {
    lat: number;
    lng: number;
    heading: number;
    speedKmh: number;
    lastSeenAt: string;
  } | null;
  activeSos: {
    alertCode: string;
    status: string;
    createdAt: string;
  } | null;
}

export function PublicTrackView({ shareToken }: { shareToken: string }) {
  const [locale, setLocale] = React.useState<"sw" | "en">("en");
  const [data, setData] = React.useState<TrackPayload | null>(null);
  const [errorCode, setErrorCode] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchSnapshot = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/track/${encodeURIComponent(shareToken)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setErrorCode(errJson.error ?? "NOT_FOUND");
        setData(null);
      } else {
        setErrorCode(null);
        setData((await res.json()) as TrackPayload);
      }
    } catch {
      setErrorCode("NETWORK_ERROR");
    } finally {
      setLoading(false);
    }
  }, [shareToken]);

  React.useEffect(() => {
    void fetchSnapshot();
    const timer = setInterval(() => {
      void fetchSnapshot();
    }, 10000);
    return () => clearInterval(timer);
  }, [fetchSnapshot]);

  const vehicles: MapVehicle[] =
    data && data.livePosition
      ? [
          {
            operatorId: "live-tracked-operator",
            transportType: data.trip.transportType,
            operatorTitle: data.trip.operatorTitle,
            homeKituo: data.trip.operatorPlate ?? "Unguja",
            lat: data.livePosition.lat,
            lng: data.livePosition.lng,
            heading: data.livePosition.heading,
            ratingAvg: 4.9,
            distanceMeters: 0,
            etaMinutes: Math.max(1, Math.round(data.trip.durationMinutes / 2)),
          },
        ]
      : [];

  return (
    <div className="min-h-screen bg-[#F3EEE8] pb-12 text-[#122927]">
      <header className="sticky top-0 z-30 border-b border-[#17645F]/15 bg-[#F3EEE8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3.5 sm:px-6">
          <BrandLogo
            subtitle={
              locale === "sw"
                ? "Ufuatiliaji wa Safari • Unguja"
                : "Live Public Trip Tracker • Unguja"
            }
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLocale((l) => (l === "en" ? "sw" : "en"))}
              className="rounded-full border border-[#17645F]/30 bg-[#FAF7F2] px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
            >
              {locale === "en" ? "Kiswahili" : "English"}
            </button>
            <button
              type="button"
              onClick={() => void fetchSnapshot()}
              aria-label="Refresh live location"
              className="rounded-full border border-[#17645F]/30 bg-[#FAF7F2] p-2 text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 pt-6 sm:px-6">
        {errorCode ? (
          <Card className="p-7 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-[#B86B2B]" />
            <h1 className="mt-3 font-display text-3xl uppercase text-[#17645F]">
              {errorCode === "SHARE_LINK_EXPIRED"
                ? locale === "sw"
                  ? "Kiungo Kimeisha Muda"
                  : "Live Share Link Expired"
                : locale === "sw"
                  ? "Safari Haikupatikana"
                  : "Tracking Link Not Found"}
            </h1>
            <p className="mt-1.5 text-xs text-[#17645F]/75">
              {locale === "sw"
                ? "Viungo vya ufuatiliaji wa Go.boda huisha muda kiotomatiki kwa usalama wa Mteja."
                : "Go.boda share links automatically expire to protect Customer privacy."}
            </p>
          </Card>
        ) : !data ? (
          <Card className="p-8 text-center text-sm font-semibold text-[#17645F]/75">
            {locale === "sw"
              ? "Inapakia eneo la moja kwa moja Unguja..."
              : "Loading live Unguja trip location..."}
          </Card>
        ) : (
          <>
            {data.activeSos && (
              <div className="flex items-start gap-3 rounded-3xl border-2 border-[#A93232] bg-[#A93232]/10 p-4 text-[#6B1D1D] shadow-sm">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#A93232]" />
                <div className="space-y-1 text-xs">
                  <p className="text-sm font-black uppercase">
                    {locale === "sw"
                      ? `TAHADHARI YA DHARURA (SOS) — ${data.activeSos.alertCode}`
                      : `ACTIVE EMERGENCY SOS — ${data.activeSos.alertCode}`}
                  </p>
                  <p>
                    {locale === "sw"
                      ? "Timu ya Operesheni ya Go.boda imepokea eneo la moja kwa moja la safari hii."
                      : "Go.boda Zanzibar Operations has received this trip's live GPS alert."}
                  </p>
                  <a
                    href="tel:112"
                    className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#A93232] px-3.5 py-1.5 font-bold text-white"
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                    Call Zanzibar Emergency 112
                  </a>
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-3xl border border-[#17645F]/20 shadow-sm">
              <UngujaMap
                locale={locale}
                vehicles={vehicles}
                pickup={data.trip.pickup}
                dropoff={data.trip.dropoff}
                routeGeometry={{
                  type: "LineString",
                  coordinates: [
                    [data.trip.pickup.lng, data.trip.pickup.lat],
                    ...(data.livePosition
                      ? [
                          [data.livePosition.lng, data.livePosition.lat] as [
                            number,
                            number,
                          ],
                        ]
                      : []),
                    [data.trip.dropoff.lng, data.trip.dropoff.lat],
                  ],
                }}
                pinMode="dropoff"
              />
            </div>

            <Card className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full ${
                      data.trip.transportType === "BODABODA"
                        ? "bg-[#17645F] text-[#F3EEE8]"
                        : "bg-[#B86B2B] text-[#FAF7F2]"
                    }`}
                  >
                    {data.trip.transportType === "BODABODA" ? (
                      <Bike className="h-6 w-6" />
                    ) : (
                      <CarFront className="h-6 w-6" />
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
                      {data.trip.tripCode} •{" "}
                      {data.trip.transportType === "BODABODA"
                        ? "Bodaboda Rider"
                        : "Bajaji Driver"}
                    </p>
                    <p className="text-base font-extrabold text-[#122927]">
                      {data.trip.operatorName ?? "Verified Operator"}
                    </p>
                    <p className="font-mono text-xs font-bold text-[#17645F]">
                      Plate: {data.trip.operatorPlate ?? "Z-UNGUJA"}
                    </p>
                  </div>
                </div>
                <Badge tone={data.activeSos ? "rose" : "emerald"}>
                  {data.trip.status}
                </Badge>
              </div>

              <div className="space-y-2 rounded-2xl bg-[#F3EEE8] p-3.5 text-sm">
                <div className="flex items-start gap-2">
                  <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-[#17645F]" />
                  <span className="font-semibold text-[#122927]">
                    {data.trip.pickup.label}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#B86B2B]" />
                  <span className="font-semibold text-[#122927]">
                    {data.trip.dropoff.label}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#17645F]/75">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {data.trip.distanceKm} km • ~{data.trip.durationMinutes} min
                </span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#17645F]">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {locale === "sw"
                    ? "Kiungo salama"
                    : "Private tracking link"}
                </span>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
