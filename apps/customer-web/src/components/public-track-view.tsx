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
      <div className="flex h-[320px] w-full items-center justify-center rounded-2xl bg-slate-900 text-xs font-semibold text-teal-200">
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
    <div className="min-h-screen bg-slate-50 pb-12">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <BrandLogo
            subtitle={
              locale === "sw"
                ? "Ufuatiliaji wa Safari Moja kwa Moja • Unguja"
                : "Live Public Trip Tracker • Unguja"
            }
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLocale((l) => (l === "en" ? "sw" : "en"))}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              {locale === "en" ? "Kiswahili" : "English"}
            </button>
            <button
              type="button"
              onClick={() => void fetchSnapshot()}
              aria-label="Refresh live location"
              className="rounded-full border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-teal-50 hover:text-teal-700"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        {errorCode ? (
          <Card className="p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
            <h1 className="mt-3 text-lg font-extrabold text-slate-900">
              {errorCode === "SHARE_LINK_EXPIRED"
                ? locale === "sw"
                  ? "Kiungo cha Safari Kimeisha Muda"
                  : "Live Share Link Expired"
                : locale === "sw"
                  ? "Safari Haikupatikana"
                  : "Tracking Link Not Found"}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {locale === "sw"
                ? "Viungo vya ufuatiliaji wa Go.boda huisha muda kiotomatiki kwa usalama wa Mteja."
                : "Go.boda share links automatically expire to protect Customer privacy."}
            </p>
          </Card>
        ) : !data ? (
          <Card className="p-8 text-center text-sm text-slate-500">
            {locale === "sw"
              ? "Inapakia eneo la moja kwa moja Unguja..."
              : "Loading live Unguja trip location..."}
          </Card>
        ) : (
          <>
            {data.activeSos && (
              <div className="flex items-start gap-3 rounded-2xl border-2 border-rose-500 bg-rose-50 p-4 text-rose-950 shadow-sm">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
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
                    className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1.5 font-bold text-white"
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                    Call Zanzibar Emergency 112
                  </a>
                </div>
              </div>
            )}

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
                    ? [[data.livePosition.lng, data.livePosition.lat] as [number, number]]
                    : []),
                  [data.trip.dropoff.lng, data.trip.dropoff.lat],
                ],
              }}
              pinMode="dropoff"
            />

            <Card className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                      data.trip.transportType === "BODABODA"
                        ? "bg-teal-700 text-white"
                        : "bg-amber-500 text-slate-950"
                    }`}
                  >
                    {data.trip.transportType === "BODABODA" ? (
                      <Bike className="h-6 w-6" />
                    ) : (
                      <CarFront className="h-6 w-6" />
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {data.trip.tripCode} •{" "}
                      {data.trip.transportType === "BODABODA"
                        ? "Bodaboda Rider"
                        : "Bajaji Driver"}
                    </p>
                    <p className="text-base font-extrabold text-slate-900">
                      {data.trip.operatorName ?? "Verified Operator"}
                    </p>
                    <p className="font-mono text-xs font-bold text-teal-800">
                      Plate: {data.trip.operatorPlate ?? "Z-UNGUJA"}
                    </p>
                  </div>
                </div>
                <Badge tone={data.activeSos ? "rose" : "emerald"}>
                  {data.trip.status}
                </Badge>
              </div>

              <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <Navigation className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                  <span className="font-semibold text-slate-900">
                    {data.trip.pickup.label}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span className="font-semibold text-slate-900">
                    {data.trip.dropoff.label}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {data.trip.distanceKm} km • ~{data.trip.durationMinutes} min
                </span>
                <span className="inline-flex items-center gap-1 text-teal-700">
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
