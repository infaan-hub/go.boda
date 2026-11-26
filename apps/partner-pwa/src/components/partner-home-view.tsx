"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Bike,
  CarFront,
  FileCheck2,
  MapPin,
  Power,
  ShieldAlert,
  Sun,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import {
  Badge,
  BrandLogo,
  Button,
  LanguageSwitchLink,
  cn,
} from "@goboda/ui";
import { TransportType, formatTzs } from "@goboda/shared-types";

export function PartnerHomeView({ locale }: { locale: "sw" | "en" }) {
  const t = useTranslations();
  const [operatorType, setOperatorType] = React.useState<TransportType>(
    TransportType.BODABODA
  );
  const [isOnline, setIsOnline] = React.useState(false);
  const [sunlightMode, setSunlightMode] = React.useState(false);
  const [wakeLockActive, setWakeLockActive] = React.useState(false);

  // Engage Screen Wake Lock while online so outdoor Rider/Driver screens stay awake
  React.useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    async function syncWakeLock() {
      if (!isOnline || typeof navigator === "undefined" || !("wakeLock" in navigator)) {
        setWakeLockActive(false);
        return;
      }
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (!cancelled) setWakeLockActive(true);
      } catch {
        if (!cancelled) setWakeLockActive(false);
      }
    }

    syncWakeLock();
    return () => {
      cancelled = true;
      sentinel?.release().catch(() => {});
    };
  }, [isOnline]);

  const isBodabodaRider = operatorType === TransportType.BODABODA;

  return (
    <div
      className={cn(
        "min-h-screen pb-24 transition-colors",
        sunlightMode ? "bg-white text-slate-950" : "bg-slate-950 text-white"
      )}
    >
      <header
        className={cn(
          "sticky top-0 z-30 border-b backdrop-blur",
          sunlightMode
            ? "border-slate-300 bg-white"
            : "border-slate-800 bg-slate-950/95"
        )}
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <BrandLogo
            dark={!sunlightMode}
            subtitle={
              isBodabodaRider
                ? t("roles.bodabodaRider")
                : t("roles.bajajiDriver")
            }
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSunlightMode((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold",
                sunlightMode
                  ? "border-slate-900 bg-amber-400 text-slate-950"
                  : "border-slate-700 bg-slate-900 text-amber-400"
              )}
            >
              <Sun className="h-3.5 w-3.5" />
              {t("partner.sunlightMode")}
            </button>
            <LanguageSwitchLink
              currentLocale={locale}
              hrefSw="/sw"
              hrefEn="/en"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        {/* Adaptive Role Switcher Preview (Bodaboda Rider vs Bajaji Driver) */}
        <div
          className={cn(
            "grid grid-cols-2 gap-2 rounded-2xl border p-1.5",
            sunlightMode
              ? "border-slate-300 bg-slate-100"
              : "border-slate-800 bg-slate-900"
          )}
        >
          <button
            type="button"
            onClick={() => setOperatorType(TransportType.BODABODA)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition",
              isBodabodaRider
                ? "bg-teal-600 text-white shadow"
                : sunlightMode
                  ? "text-slate-700"
                  : "text-slate-400"
            )}
          >
            <Bike className="h-4 w-4" />
            {t("roles.bodabodaRider")}
          </button>
          <button
            type="button"
            onClick={() => setOperatorType(TransportType.BAJAJI)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition",
              !isBodabodaRider
                ? "bg-amber-500 text-slate-950 shadow"
                : sunlightMode
                  ? "text-slate-700"
                  : "text-slate-400"
            )}
          >
            <CarFront className="h-4 w-4" />
            {t("roles.bajajiDriver")}
          </button>
        </div>

        {/* Big Shift Online/Offline Card */}
        <div
          className={cn(
            "rounded-3xl border-2 p-6 text-center transition",
            isOnline
              ? "border-emerald-500 bg-emerald-950/70 text-white"
              : sunlightMode
                ? "border-slate-900 bg-slate-50 text-slate-950"
                : "border-slate-800 bg-slate-900 text-white"
          )}
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge tone={isOnline ? "emerald" : "slate"}>
              {isOnline ? t("partner.onlineLabel") : t("partner.offlineLabel")}
            </Badge>
            <Badge tone={wakeLockActive ? "amber" : "slate"}>
              {wakeLockActive
                ? t("partner.wakeLockActive")
                : t("partner.wakeLockInactive")}
            </Badge>
          </div>

          <div className="mt-5">
            <Button
              size="lg"
              variant={isOnline ? "danger" : "amber"}
              onClick={() => setIsOnline((v) => !v)}
              className="w-full max-w-xs text-lg font-extrabold"
            >
              <Power className="h-5 w-5" />
              {isOnline ? t("partner.goOffline") : t("partner.goOnline")}
            </Button>
          </div>

          <p
            className={cn(
              "mt-4 inline-flex items-center gap-1.5 text-xs font-medium",
              isOnline
                ? "text-emerald-200"
                : sunlightMode
                  ? "text-slate-700"
                  : "text-slate-400"
            )}
          >
            <MapPin className="h-3.5 w-3.5" />
            {t("partner.kituoLabel")}: {t("partner.kituoSample")}
          </p>
        </div>

        {/* Role-Specific Safety Reminder */}
        <div
          className={cn(
            "flex items-start gap-3 rounded-2xl border p-4 text-sm font-medium",
            sunlightMode
              ? "border-amber-600 bg-amber-100 text-slate-950"
              : "border-amber-500/30 bg-amber-500/10 text-amber-200"
          )}
        >
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <span>
            {isBodabodaRider
              ? t("partner.helmetReminder")
              : t("partner.bajajiReminder")}
          </span>
        </div>

        {/* Daily Earnings & Commission Float Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className={cn(
              "rounded-2xl border p-4",
              sunlightMode
                ? "border-slate-300 bg-white"
                : "border-slate-800 bg-slate-900"
            )}
          >
            <p className="text-xs font-semibold text-slate-400">
              {t("partner.todayEarnings")}
            </p>
            <p className="mt-1.5 text-2xl font-extrabold text-emerald-500">
              {formatTzs(24500)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {t("partner.tripsCompleted")}: 7
            </p>
          </div>

          <div
            className={cn(
              "rounded-2xl border p-4",
              sunlightMode
                ? "border-slate-300 bg-white"
                : "border-slate-800 bg-slate-900"
            )}
          >
            <p className="text-xs font-semibold text-slate-400">
              {t("partner.commissionFloat")}
            </p>
            <p className="mt-1.5 text-2xl font-extrabold text-amber-500">
              {formatTzs(6200)}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              {t("partner.floatHealthy")}
            </p>
          </div>
        </div>
      </main>

      {/* Bottom Partner Navigation */}
      <nav
        className={cn(
          "fixed bottom-0 left-0 right-0 z-30 border-t",
          sunlightMode
            ? "border-slate-300 bg-white"
            : "border-slate-800 bg-slate-950"
        )}
      >
        <div className="mx-auto grid max-w-2xl grid-cols-5 py-2 text-center text-[11px] font-semibold">
          <a href={`/${locale}`} className="flex flex-col items-center gap-1 text-amber-500">
            <Power className="h-5 w-5" />
            {t("partner.navHome")}
          </a>
          <a href={`/${locale}`} className="flex flex-col items-center gap-1 text-slate-400">
            <TrendingUp className="h-5 w-5" />
            {t("partner.navEarnings")}
          </a>
          <a href={`/${locale}`} className="flex flex-col items-center gap-1 text-slate-400">
            <Wallet className="h-5 w-5" />
            {t("partner.navWallet")}
          </a>
          <a href={`/${locale}`} className="flex flex-col items-center gap-1 text-slate-400">
            <FileCheck2 className="h-5 w-5" />
            {t("partner.navOnboarding")}
          </a>
          <a href={`/${locale}`} className="flex flex-col items-center gap-1 text-slate-400">
            <User className="h-5 w-5" />
            {t("partner.navProfile")}
          </a>
        </div>
      </nav>
    </div>
  );
}
