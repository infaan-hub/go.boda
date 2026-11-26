"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Activity,
  Bike,
  CarFront,
  LayoutDashboard,
  Map,
  RefreshCw,
  Route,
  Server,
  ShieldAlert,
  SlidersHorizontal,
  Users,
  Wallet,
} from "lucide-react";
import {
  Badge,
  BrandLogo,
  Button,
  Card,
  LanguageSwitchLink,
} from "@goboda/ui";
import {
  MICROSERVICES_REGISTRY,
  type MicroserviceDescriptor,
} from "@goboda/shared-types";

interface LiveServiceStatus extends MicroserviceDescriptor {
  status: "online" | "offline" | "pending";
  latencyMs?: number;
}

export function AdminDashboardView({ locale }: { locale: "sw" | "en" }) {
  const t = useTranslations();
  const [gatewayOnline, setGatewayOnline] = React.useState<boolean | null>(null);
  const [services, setServices] = React.useState<LiveServiceStatus[]>(() =>
    MICROSERVICES_REGISTRY.map((s) => ({ ...s, status: "pending" }))
  );
  const [loading, setLoading] = React.useState(false);

  const gatewayUrl =
    process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "http://localhost:4000";

  const refreshHealth = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${gatewayUrl}/api/v1/services`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Gateway unreachable");
      const data = (await res.json()) as {
        services: LiveServiceStatus[];
      };
      setGatewayOnline(true);
      setServices(data.services);
    } catch {
      setGatewayOnline(false);
      setServices(
        MICROSERVICES_REGISTRY.map((s) => ({ ...s, status: "offline" }))
      );
    } finally {
      setLoading(false);
    }
  }, [gatewayUrl]);

  React.useEffect(() => {
    refreshHealth();
  }, [refreshHealth]);

  const navItems = [
    { icon: LayoutDashboard, label: t("admin.navOverview"), active: true },
    { icon: Map, label: t("admin.navLiveMap"), active: false },
    { icon: Users, label: t("admin.navOperators"), active: false },
    { icon: Route, label: t("admin.navTrips"), active: false },
    { icon: SlidersHorizontal, label: t("admin.navZones"), active: false },
    { icon: Wallet, label: t("admin.navFinance"), active: false },
    { icon: ShieldAlert, label: t("admin.navSos"), active: false },
  ];

  return (
    <div className="flex min-h-screen bg-slate-100">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 p-5 text-white lg:flex lg:flex-col">
        <BrandLogo dark subtitle={t("roles.admin")} />
        <div className="mt-4">
          <Badge tone="amber">{t("common.ungujaOnly")}</Badge>
        </div>

        <nav className="mt-8 space-y-1.5">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={`/${locale}`}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition ${
                item.active
                  ? "bg-teal-700 text-white"
                  : "text-slate-300 hover:bg-slate-900 hover:text-white"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </a>
          ))}
        </nav>

        <div className="mt-auto rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">
          <p className="font-semibold text-slate-200">{t("common.phaseBadge")}</p>
          <p className="mt-1">10-Service Microservice Topology</p>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">
                {t("admin.title")}
              </h1>
              <p className="text-xs text-slate-500">{t("admin.subtitle")}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={gatewayOnline ? "emerald" : "rose"}>
                <Activity className="h-3.5 w-3.5" />
                API Gateway:{" "}
                {gatewayOnline === null
                  ? "Checking..."
                  : gatewayOnline
                    ? "Online (:4000)"
                    : "Offline"}
              </Badge>
              <LanguageSwitchLink
                currentLocale={locale}
                hrefSw="/sw"
                hrefEn="/en"
              />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl space-y-6 p-6">
          {/* KPI Summary Row */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">
                  {t("admin.onlineRiders")}
                </p>
                <Bike className="h-4 w-4 text-teal-700" />
              </div>
              <p className="mt-2 text-2xl font-extrabold">0</p>
              <p className="mt-1 text-xs text-slate-400">Phase 2 live feed</p>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">
                  {t("admin.onlineDrivers")}
                </p>
                <CarFront className="h-4 w-4 text-amber-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold">0</p>
              <p className="mt-1 text-xs text-slate-400">Phase 2 live feed</p>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">
                  {t("admin.activeTrips")}
                </p>
                <Route className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold">0</p>
              <p className="mt-1 text-xs text-slate-400">Phase 3 trip-service</p>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">
                  {t("admin.openSos")}
                </p>
                <ShieldAlert className="h-4 w-4 text-rose-600" />
              </div>
              <p className="mt-2 text-2xl font-extrabold text-emerald-700">0</p>
              <p className="mt-1 text-xs text-slate-400">All clear across Unguja</p>
            </Card>
          </div>

          {/* 10-Microservice Live Topology Registry */}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <Server className="h-5 w-5 text-teal-700" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {t("admin.gatewayStatus")}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Gateway URL: {gatewayUrl}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={refreshHealth}
                disabled={loading}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Service</th>
                    <th className="px-5 py-3">Port</th>
                    <th className="px-5 py-3">Route Prefix</th>
                    <th className="px-5 py-3">Owned Store</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {services.map((svc) => (
                    <tr key={svc.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-900">{svc.id}</p>
                        <p className="text-xs text-slate-500">{svc.summary}</p>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-700">
                        :{svc.port}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-teal-800">
                        {svc.routePrefix}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-600">
                        {svc.database}
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          tone={
                            svc.status === "online"
                              ? "emerald"
                              : svc.status === "pending"
                                ? "amber"
                                : "slate"
                          }
                        >
                          {svc.status === "online"
                            ? `Online (${svc.latencyMs ?? 0}ms)`
                            : svc.status === "pending"
                              ? "Pending"
                              : "Scheduled (Phase 1-5)"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
}
