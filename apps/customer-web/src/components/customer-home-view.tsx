"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Bike,
  CarFront,
  Clock,
  Compass,
  History,
  MapPin,
  Navigation,
  ShieldCheck,
  User,
} from "lucide-react";
import {
  Badge,
  BrandLogo,
  Button,
  Card,
  LanguageSwitchLink,
} from "@goboda/ui";
import {
  DEFAULT_TARIFFS_TZS,
  TransportType,
  UNGUJA_GEO,
  formatTzs,
} from "@goboda/shared-types";

export function CustomerHomeView({ locale }: { locale: "sw" | "en" }) {
  const t = useTranslations();
  const [selectedType, setSelectedType] = React.useState<TransportType>(
    TransportType.BODABODA
  );
  const [destination, setDestination] = React.useState("Forodhani Gardens, Stone Town");

  const sampleKm = 3.2;
  const sampleMin = 9;
  const calcPreviewFare = (type: TransportType) => {
    const cfg = DEFAULT_TARIFFS_TZS[type];
    const raw = cfg.baseFareTzs + sampleKm * cfg.perKmTzs + sampleMin * cfg.perMinTzs;
    return Math.max(cfg.minFareTzs, Math.round(raw / 500) * 500);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <BrandLogo subtitle={t("common.ungujaOnly")} />
          <LanguageSwitchLink
            currentLocale={locale}
            hrefSw="/sw"
            hrefEn="/en"
          />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        {/* Unguja Map Preview Canvas (MapLibre GL attaches here in Phase 2) */}
        <Card className="relative overflow-hidden border-teal-200 bg-gradient-to-br from-teal-950 via-teal-900 to-emerald-900 p-5 text-white">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="amber">
              <Compass className="h-3.5 w-3.5" />
              {t("common.ungujaOnly")}
            </Badge>
            <span className="text-xs text-teal-200">
              {UNGUJA_GEO.CENTER.lat.toFixed(4)}, {UNGUJA_GEO.CENTER.lng.toFixed(4)}
            </span>
          </div>

          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">
            {t("customer.heroTitle")}
          </h1>
          <p className="mt-1 text-sm text-teal-100/90">
            {t("customer.heroSubtitle")}
          </p>

          {/* Simulated Live Nearby Transport Chips */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-amber-300">
                <Bike className="h-4 w-4" />
                <span className="text-xs font-semibold">Bodaboda Riders</span>
              </div>
              <p className="mt-1 text-lg font-bold">7 nearby</p>
              <p className="text-[11px] text-teal-100/80">~2 min ETA • Stone Town edge</p>
            </div>
            <div className="rounded-xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-emerald-300">
                <CarFront className="h-4 w-4" />
                <span className="text-xs font-semibold">Bajaji Drivers</span>
              </div>
              <p className="mt-1 text-lg font-bold">4 nearby</p>
              <p className="text-[11px] text-teal-100/80">~3 min ETA • Creek Road</p>
            </div>
          </div>
        </Card>

        {/* Pickup & Dropoff Sheet */}
        <Card className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <Navigation className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-500">
                {t("customer.pickupLabel")}
              </p>
              <p className="truncate text-sm font-semibold text-slate-900">
                {t("customer.pickupSample")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <MapPin className="h-4 w-4 shrink-0 text-amber-600" />
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={t("customer.whereToPlaceholder")}
              className="w-full bg-transparent text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>{t("customer.stoneTownNotice")}</span>
          </div>
        </Card>

        {/* Nearby Transport Type Selection: Bodaboda (Rider) vs Bajaji (Driver) */}
        <section className="space-y-2.5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">
            {t("customer.nearbyHeading")}
          </h2>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setSelectedType(TransportType.BODABODA)}
              className={`flex items-center justify-between rounded-2xl border-2 p-4 text-left transition ${
                selectedType === TransportType.BODABODA
                  ? "border-teal-700 bg-teal-50/60 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-white">
                  <Bike className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">
                    {t("customer.bodabodaName")}
                  </p>
                  <p className="text-xs text-slate-600">
                    {t("customer.bodabodaMeta")}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-base font-extrabold text-teal-800">
                  {formatTzs(calcPreviewFare(TransportType.BODABODA))}
                </p>
                <p className="text-xs text-slate-500">2 min</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedType(TransportType.BAJAJI)}
              className={`flex items-center justify-between rounded-2xl border-2 p-4 text-left transition ${
                selectedType === TransportType.BAJAJI
                  ? "border-teal-700 bg-teal-50/60 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500 text-slate-950">
                  <CarFront className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">
                    {t("customer.bajajiName")}
                  </p>
                  <p className="text-xs text-slate-600">
                    {t("customer.bajajiMeta")}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-base font-extrabold text-slate-900">
                  {formatTzs(calcPreviewFare(TransportType.BAJAJI))}
                </p>
                <p className="text-xs text-slate-500">3 min</p>
              </div>
            </button>
          </div>

          <p className="text-center text-xs text-slate-500">
            {t("customer.paymentMethods")}
          </p>

          <Button size="lg" variant="primary" className="w-full">
            {t("customer.requestCta")} •{" "}
            {selectedType === TransportType.BODABODA ? "Go.boda" : "Go.bajaji"}
          </Button>
        </section>
      </main>

      {/* Bottom Mobile Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-2xl grid-cols-4 py-2 text-center text-[11px] font-semibold">
          <a href={`/${locale}`} className="flex flex-col items-center gap-1 text-teal-700">
            <Compass className="h-5 w-5" />
            {t("customer.navHome")}
          </a>
          <a href={`/${locale}`} className="flex flex-col items-center gap-1 text-slate-500">
            <Clock className="h-5 w-5" />
            {t("customer.navBook")}
          </a>
          <a href={`/${locale}`} className="flex flex-col items-center gap-1 text-slate-500">
            <History className="h-5 w-5" />
            {t("customer.navHistory")}
          </a>
          <a href={`/${locale}`} className="flex flex-col items-center gap-1 text-slate-500">
            <User className="h-5 w-5" />
            {t("customer.navProfile")}
          </a>
        </div>
      </nav>
    </div>
  );
}
