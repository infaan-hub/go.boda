"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Activity,
  Bike,
  CarFront,
  CheckCircle2,
  ExternalLink,
  LayoutDashboard,
  Map,
  RefreshCw,
  Route,
  Scale,
  Server,
  ShieldAlert,
  Siren,
  SlidersHorizontal,
  Users,
  Volume2,
  Wallet,
} from "lucide-react";
import {
  Badge,
  BrandLogo,
  Button,
  Card,
  LanguageSwitchLink,
} from "@goboda/ui";
import { AdminUngujaMap } from "./admin-unguja-map";
import {
  OperatorsKycPanel,
  TripsMonitorPanel,
  ZonesTariffsPanel,
} from "./admin-panels-ops";
import {
  FinanceCompliancePanel,
  SosIncidentRoomPanel,
} from "./admin-panels-safety-finance";
import type { AdminOverviewPayload } from "./admin-types";

type AdminTab =
  | "overview"
  | "map"
  | "operators"
  | "trips"
  | "zones"
  | "finance"
  | "sos";

function formatTzs(amount: number | null | undefined): string {
  return `TZS ${Number(amount ?? 0).toLocaleString("en-TZ")}`;
}

export function AdminDashboardView({ locale }: { locale: "sw" | "en" }) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = React.useState<AdminTab>("overview");
  const [data, setData] = React.useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<{
    tone: "emerald" | "rose";
    msg: string;
  } | null>(null);

  const notify = React.useCallback((tone: "emerald" | "rose", msg: string) => {
    setToast({ tone, msg });
  }, []);

  React.useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const playSosChime = React.useCallback(() => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      [880, 660, 880].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.16);
        gain.gain.setValueAtTime(0.12, now + idx * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.16 + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.16);
        osc.stop(now + idx * 0.16 + 0.15);
      });
    } catch {
      // Browser audio gesture policies may mute auto-chimes until clicked
    }
  }, []);

  const refreshOverview = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/ops/overview", { cache: "no-store" });
      const json = (await res.json()) as AdminOverviewPayload & {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(json.message || json.error || "Failed to load ops data");
      }
      setData(json);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Unable to load live operations data"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refreshOverview();
  }, [refreshOverview]);

  const kpis = data?.kpis;
  const openSosCount = kpis?.openSosCount ?? 0;

  const navItems: Array<{
    id: AdminTab;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    badge?: number;
    badgeTone?: "rose" | "amber" | "teal";
  }> = [
    { id: "overview", icon: LayoutDashboard, label: t("admin.navOverview") },
    {
      id: "map",
      icon: Map,
      label: t("admin.navLiveMap"),
      badge: (kpis?.onlineRiders ?? 0) + (kpis?.onlineDrivers ?? 0),
      badgeTone: "teal",
    },
    {
      id: "operators",
      icon: Users,
      label: t("admin.navOperators"),
      badge: kpis?.pendingKycCount || undefined,
      badgeTone: "amber",
    },
    {
      id: "trips",
      icon: Route,
      label: t("admin.navTrips"),
      badge: kpis?.activeTrips || undefined,
      badgeTone: "teal",
    },
    { id: "zones", icon: SlidersHorizontal, label: t("admin.navZones") },
    { id: "finance", icon: Wallet, label: t("admin.navFinance") },
    {
      id: "sos",
      icon: ShieldAlert,
      label: t("admin.navSos"),
      badge: openSosCount || undefined,
      badgeTone: "rose",
    },
  ];

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 p-5 text-white lg:flex lg:flex-col">
        <BrandLogo dark subtitle={t("roles.admin")} />
        <div className="mt-4">
          <Badge tone="amber">{t("common.ungujaOnly")}</Badge>
        </div>

        <nav className="mt-7 space-y-1.5">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition ${
                  active
                    ? "bg-teal-700 text-white shadow-sm"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.badge !== undefined && item.badge > 0 ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                      item.badgeTone === "rose"
                        ? "bg-rose-600 text-white"
                        : item.badgeTone === "amber"
                          ? "bg-amber-400 text-slate-950"
                          : "bg-teal-900 text-teal-100"
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
          <p className="font-semibold text-slate-200">{t("common.phaseBadge")}</p>
          <p>10-Microservice Topology • Neon PostGIS</p>
          {data?.ungujaBootstrap ? (
            <p className="font-mono text-[11px] text-teal-300">
              {data.ungujaBootstrap.landmarksCount} landmarks •{" "}
              {data.ungujaBootstrap.snapPointsCount} Stone Town gates
            </p>
          ) : null}
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Global Pulsing SOS Alert Banner */}
        {openSosCount > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-rose-600 px-6 py-2.5 text-white">
            <div className="flex items-center gap-2.5 text-xs font-extrabold">
              <Siren className="h-4 w-4 animate-pulse" />
              <span>
                ACTIVE UNGUJA SOS ALERT: {openSosCount} incident
                {openSosCount > 1 ? "s" : ""} awaiting Ops Desk response!
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={playSosChime}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-rose-900"
              >
                <Volume2 className="h-3.5 w-3.5" />
                Chime
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("sos")}
                className="rounded-lg bg-white px-3 py-1 text-[11px] font-extrabold text-rose-700 hover:bg-rose-50"
              >
                Open SOS Room →
              </button>
            </div>
          </div>
        ) : null}

        {/* Sticky Top Header */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-5 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 sm:text-xl">
                {t("admin.title")}
              </h1>
              <p className="text-xs text-slate-500">{t("admin.subtitle")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                tone={data?.dbHealth.connected ? "emerald" : "amber"}
              >
                <Activity className="h-3.5 w-3.5" />
                Neon DB:{" "}
                {loading && !data
                  ? "Connecting..."
                  : data?.dbHealth.connected
                    ? `Live (${data.dbHealth.schemasReady?.length ?? 10}/10 schemas • PostGIS)`
                    : "Offline"}
              </Badge>
              {kpis ? (
                <Badge tone={kpis.ledgerBalanced ? "emerald" : "rose"}>
                  <Scale className="h-3.5 w-3.5" />
                  {kpis.ledgerBalanced ? "Zero-Drift Ledger" : "Ledger Drift!"}
                </Badge>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={refreshOverview}
                disabled={loading}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              <LanguageSwitchLink
                currentLocale={locale}
                hrefSw="/sw"
                hrefEn="/en"
              />
            </div>
          </div>

          {/* Mobile Horizontal Tab Navigation */}
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    active
                      ? "border-teal-700 bg-teal-700 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                  {item.badge ? ` (${item.badge})` : ""}
                </button>
              );
            })}
          </div>
        </header>

        {/* Main Content */}
        <main className="mx-auto w-full max-w-7xl space-y-6 p-5 sm:p-6">
          {/* Mutation Toast Banner */}
          {toast ? (
            <div
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs font-semibold shadow-sm ${
                toast.tone === "emerald"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-rose-200 bg-rose-50 text-rose-900"
              }`}
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {toast.msg}
              </span>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="ml-4 text-[11px] underline"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {loadError ? (
            <Card className="border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
              <strong>Operations feed error:</strong> {loadError}
            </Card>
          ) : null}

          {!data && loading ? (
            <Card className="p-10 text-center text-sm text-slate-500">
              Loading live Unguja fleet, KYC queue, tariffs, safety alerts &amp;
              ledger from Neon PostgreSQL...
            </Card>
          ) : null}

          {/* ==============================================================
           * TAB 1 — OVERVIEW
           * ============================================================ */}
          {data && activeTab === "overview" ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-500">
                      {t("admin.onlineRiders")}
                    </p>
                    <Bike className="h-4 w-4 text-teal-700" />
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-slate-900">
                    {data.kpis.onlineRiders}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Live PostGIS fleet • Go.boda
                  </p>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-500">
                      {t("admin.onlineDrivers")}
                    </p>
                    <CarFront className="h-4 w-4 text-amber-600" />
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-slate-900">
                    {data.kpis.onlineDrivers}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Live PostGIS fleet • Go.bajaji
                  </p>
                </Card>

                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-500">
                      {t("admin.activeTrips")}
                    </p>
                    <Route className="h-4 w-4 text-emerald-600" />
                  </div>
                  <p className="mt-2 text-2xl font-extrabold text-slate-900">
                    {data.kpis.activeTrips}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {data.kpis.completedTrips} completed / {data.kpis.totalTrips}{" "}
                    total
                  </p>
                </Card>

                <Card
                  className={`cursor-pointer p-4 transition hover:shadow-md ${
                    data.kpis.openSosCount > 0
                      ? "border-rose-300 bg-rose-50/50"
                      : ""
                  }`}
                  onClick={() => setActiveTab("sos")}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-500">
                      {t("admin.openSos")}
                    </p>
                    <ShieldAlert className="h-4 w-4 text-rose-600" />
                  </div>
                  <p
                    className={`mt-2 text-2xl font-extrabold ${
                      data.kpis.openSosCount > 0
                        ? "text-rose-700"
                        : "text-emerald-700"
                    }`}
                  >
                    {data.kpis.openSosCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {data.kpis.openSosCount > 0
                      ? "Click to open SOS Room"
                      : "All clear across Unguja"}
                  </p>
                </Card>

                <Card className="p-4">
                  <p className="text-xs font-semibold text-slate-500">
                    Confirmed GMV
                  </p>
                  <p className="mt-2 text-xl font-extrabold text-slate-900">
                    {formatTzs(data.kpis.gmvTzs)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Commission: {formatTzs(data.kpis.platformCommissionTzs)}
                  </p>
                </Card>

                <Card
                  className="cursor-pointer p-4 transition hover:shadow-md"
                  onClick={() => setActiveTab("operators")}
                >
                  <p className="text-xs font-semibold text-slate-500">
                    Pending KYC Review
                  </p>
                  <p className="mt-2 text-xl font-extrabold text-amber-700">
                    {data.kpis.pendingKycCount}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {data.kpis.approvedOperatorsCount} approved Riders &amp;
                    Drivers
                  </p>
                </Card>

                <Card
                  className="cursor-pointer p-4 transition hover:shadow-md"
                  onClick={() => setActiveTab("finance")}
                >
                  <p className="text-xs font-semibold text-slate-500">
                    Double-Entry Ledger Audit
                  </p>
                  <p
                    className={`mt-2 text-xl font-extrabold ${
                      data.kpis.ledgerBalanced
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    {data.kpis.ledgerBalanced ? "Zero Drift (0 TZS)" : "CHECK"}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    ACID immutable TZS journal
                  </p>
                </Card>

                <Card
                  className="cursor-pointer p-4 transition hover:shadow-md"
                  onClick={() => setActiveTab("zones")}
                >
                  <p className="text-xs font-semibold text-slate-500">
                    Unguja PostGIS Coverage
                  </p>
                  <p className="mt-2 text-xl font-extrabold text-teal-800">
                    {data.ungujaBootstrap?.landmarksCount ?? 64} Landmarks
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {data.ungujaBootstrap?.snapPointsCount ?? 10} Stone Town
                    Smart Snap gates
                  </p>
                </Card>
              </div>

              {/* 10-Microservice Live Production Topology */}
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                  <div className="flex items-center gap-2.5">
                    <Server className="h-5 w-5 text-teal-700" />
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        {t("admin.gatewayStatus")}
                      </h2>
                      <p className="text-xs text-slate-500">
                        Neon PostgreSQL • PostGIS{" "}
                        {data.dbHealth.postgisVersion ?? "3.6"} •{" "}
                        {data.dbHealth.schemasReady?.length ?? 10}/10 isolated
                        schemas active
                      </p>
                    </div>
                  </div>
                  <Badge tone="emerald">
                    10/10 Services Live ({data.dbHealth.latencyMs ?? 0}ms DB)
                  </Badge>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 uppercase text-slate-500">
                      <tr>
                        <th className="px-5 py-3">Microservice</th>
                        <th className="px-5 py-3">Route Prefix</th>
                        <th className="px-5 py-3">Owned Schema</th>
                        <th className="px-5 py-3">Production URL</th>
                        <th className="px-5 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.services.map((svc) => (
                        <tr key={svc.id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-3">
                            <p className="font-bold text-slate-900">{svc.id}</p>
                            <p className="text-[11px] text-slate-500">
                              {svc.summary}
                            </p>
                          </td>
                          <td className="px-5 py-3 font-mono text-teal-800">
                            {svc.routePrefix}
                          </td>
                          <td className="px-5 py-3 text-slate-600">
                            {svc.database}
                          </td>
                          <td className="px-5 py-3">
                            <a
                              href={svc.productionUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-[11px] text-teal-700 hover:underline"
                            >
                              {svc.productionUrl.replace("https://", "")}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </td>
                          <td className="px-5 py-3">
                            <Badge
                              tone={
                                svc.status === "online" ? "emerald" : "rose"
                              }
                            >
                              {svc.status === "online"
                                ? `Online (${svc.latencyMs ?? 0}ms)`
                                : "Offline"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          ) : null}

          {/* ==============================================================
           * TAB 2 — LIVE UNGUJA FLEET & SOS MAP
           * ============================================================ */}
          {data && activeTab === "map" ? (
            <div className="space-y-5">
              <AdminUngujaMap fleet={data.fleet} sosAlerts={data.sosAlerts} />

              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900">
                      Online Unguja Fleet ({data.fleet.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      {data.kpis.onlineRiders} Bodaboda Riders •{" "}
                      {data.kpis.onlineDrivers} Bajaji Drivers •{" "}
                      {data.kpis.busyOnTrips} currently on active trips
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5">Role &amp; Transport</th>
                        <th className="px-4 py-2.5">Plate</th>
                        <th className="px-4 py-2.5">Home Kituo</th>
                        <th className="px-4 py-2.5">Coordinates</th>
                        <th className="px-4 py-2.5">Rating</th>
                        <th className="px-4 py-2.5">State</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.fleet.map((v) => {
                        const isBoda = v.transportType === "BODABODA";
                        return (
                          <tr key={v.operatorId}>
                            <td className="px-4 py-2.5 font-semibold text-slate-900">
                              {isBoda ? "Bodaboda Rider" : "Bajaji Driver"}
                              {v.isDemo ? (
                                <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                                  (demo)
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-2.5 font-mono font-bold text-slate-800">
                              {v.plateNumber}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">
                              {v.homeKituo || "Unguja"}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                              {Number(v.lat).toFixed(4)},{" "}
                              {Number(v.lng).toFixed(4)}
                            </td>
                            <td className="px-4 py-2.5 font-semibold text-amber-600">
                              ★ {Number(v.ratingAvg).toFixed(1)}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge tone={v.isBusy ? "amber" : "emerald"}>
                                {v.isBusy ? "On Active Trip" : "Available"}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ) : null}

          {/* TAB 3 — RIDERS & DRIVERS KYC */}
          {data && activeTab === "operators" ? (
            <OperatorsKycPanel
              operators={data.operators}
              onMutated={refreshOverview}
              onNotify={notify}
            />
          ) : null}

          {/* TAB 4 — TRIPS MONITOR */}
          {data && activeTab === "trips" ? (
            <TripsMonitorPanel trips={data.trips} />
          ) : null}

          {/* TAB 5 — ZONES, LANDMARKS & LIVE TARIFFS */}
          {data && activeTab === "zones" ? (
            <ZonesTariffsPanel
              tariffs={data.tariffs}
              promos={data.promos}
              landmarks={data.landmarks}
              onMutated={refreshOverview}
              onNotify={notify}
            />
          ) : null}

          {/* TAB 6 — FINANCE & HELMET COMPLIANCE */}
          {data && activeTab === "finance" ? (
            <FinanceCompliancePanel
              finance={data.finance}
              helmetFlags={data.helmetFlags}
            />
          ) : null}

          {/* TAB 7 — SOS INCIDENT ROOM */}
          {data && activeTab === "sos" ? (
            <SosIncidentRoomPanel
              sosAlerts={data.sosAlerts}
              onMutated={refreshOverview}
              onNotify={notify}
              onPlayChime={playSosChime}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
