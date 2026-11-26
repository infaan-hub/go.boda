"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  BarChart3,
  Calculator,
  CalendarClock,
  CheckCircle2,
  Flame,
  HardHat,
  Inbox,
  LayoutDashboard,
  LogOut,
  Map,
  MapPin,
  Megaphone,
  Radar,
  Radio,
  RefreshCw,
  Route,
  ShieldAlert,
  Siren,
  SlidersHorizontal,
  Tag,
  Users,
  Volume2,
  Wallet,
} from "lucide-react";
import {
  BrandLogo,
  Button,
  Card,
  LanguageSwitchLink,
} from "@goboda/ui";
import type { AuthenticatedAdmin } from "./admin-login-gate";
import type { AdminOverviewPayload } from "./admin-types";

export interface AdminPortalContextValue {
  data: AdminOverviewPayload | null;
  loading: boolean;
  loadError: string | null;
  adminUser: AuthenticatedAdmin | null;
  locale: "sw" | "en";
  refreshOverview: () => Promise<void>;
  notify: (tone: "emerald" | "rose", msg: string) => void;
  playSosChime: () => void;
}

const AdminPortalContext = React.createContext<AdminPortalContextValue | null>(
  null
);

export function useAdminPortal(): AdminPortalContextValue {
  const ctx = React.useContext(AdminPortalContext);
  if (!ctx) {
    throw new Error("useAdminPortal must be used inside AdminPortalShell");
  }
  return ctx;
}

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
  badgeTone?: "rose" | "amber" | "teal";
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

export function AdminPortalShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const locale: "sw" | "en" = useLocale() === "sw" ? "sw" : "en";
  const pathname = usePathname();
  const router = useRouter();

  const [adminUser, setAdminUser] = React.useState<AuthenticatedAdmin | null>(
    null
  );
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
      // Audio gesture policies may suppress chime until clicked
    }
  }, []);

  const refreshOverview = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [meRes, ovRes] = await Promise.all([
        fetch("/api/ops/auth/me", { cache: "no-store" }),
        fetch("/api/ops/overview", { cache: "no-store" }),
      ]);
      if (
        meRes.status === 401 ||
        meRes.status === 403 ||
        ovRes.status === 401 ||
        ovRes.status === 403
      ) {
        router.replace("/admin/login");
        return;
      }
      if (meRes.ok) {
        const meJson = (await meRes.json()) as { admin?: AuthenticatedAdmin };
        if (meJson.admin) setAdminUser(meJson.admin);
      }
      const json = (await ovRes.json()) as AdminOverviewPayload & {
        error?: string;
        message?: string;
      };
      if (!ovRes.ok) {
        throw new Error(json.message || json.error || "Failed to load data");
      }
      setData(json);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Unable to load operations data"
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  React.useEffect(() => {
    refreshOverview();
  }, [refreshOverview]);

  async function handleSignOut() {
    await fetch("/api/ops/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/admin/login");
    router.refresh();
  }

  const kpis = data?.kpis;
  const openSosCount = kpis?.openSosCount ?? 0;

  const navGroups: NavGroup[] = [
    {
      heading: "Operations",
      items: [
        { href: "/admin/dashboard", icon: LayoutDashboard, label: t("admin.navOverview") },
        {
          href: "/admin/live-map",
          icon: Map,
          label: t("admin.navLiveMap"),
          badge: (kpis?.onlineRiders ?? 0) + (kpis?.onlineDrivers ?? 0),
          badgeTone: "teal",
        },
        {
          href: "/admin/trips",
          icon: Route,
          label: t("admin.navTrips"),
          badge: kpis?.activeTrips || undefined,
          badgeTone: "teal",
        },
      ],
    },
    {
      heading: "Fleet & Locations",
      items: [
        {
          href: "/admin/operators",
          icon: Users,
          label: t("admin.navOperators"),
          badge: kpis?.pendingKycCount || undefined,
          badgeTone: "amber",
        },
        { href: "/admin/compliance/expiries", icon: CalendarClock, label: "Expiries" },
        { href: "/admin/vituo", icon: MapPin, label: "Vituo" },
        { href: "/admin/heatmap", icon: Flame, label: "Heatmap" },
        { href: "/admin/fleet/telemetry", icon: Radio, label: "GPS Health" },
      ],
    },
    {
      heading: "Pricing & Dispatch",
      items: [
        { href: "/admin/zones", icon: SlidersHorizontal, label: t("admin.navZones") },
        { href: "/admin/pricing/simulator", icon: Calculator, label: "Fare Simulator" },
        { href: "/admin/promos/analytics", icon: Tag, label: "Promos" },
        { href: "/admin/dispatch/queue", icon: Radar, label: "Dispatch Queue" },
        { href: "/admin/dispatch/performance", icon: BarChart3, label: "Dispatch Metrics" },
      ],
    },
    {
      heading: "Finance & Safety",
      items: [
        { href: "/admin/finance", icon: Wallet, label: t("admin.navFinance") },
        { href: "/admin/broadcasts", icon: Megaphone, label: "Broadcasts" },
        { href: "/admin/support/inbox", icon: Inbox, label: "Support Inbox" },
        { href: "/admin/safety/helmets", icon: HardHat, label: "Helmets" },
        {
          href: "/admin/sos",
          icon: ShieldAlert,
          label: t("admin.navSos"),
          badge: openSosCount || undefined,
          badgeTone: "rose",
        },
      ],
    },
  ];

  const allNavItems = navGroups.flatMap((g) => g.items);
  const cleanPath = pathname.replace(/\/$/, "") || "/admin/dashboard";

  function isActiveHref(href: string) {
    if (cleanPath === href) return true;
    if (href === "/admin/operators" && cleanPath.startsWith("/admin/operators/")) return true;
    if (href === "/admin/trips" && cleanPath.startsWith("/admin/trips/")) return true;
    return false;
  }

  const ctxValue = React.useMemo<AdminPortalContextValue>(
    () => ({
      data,
      loading,
      loadError,
      adminUser,
      locale,
      refreshOverview,
      notify,
      playSosChime,
    }),
    [data, loading, loadError, adminUser, locale, refreshOverview, notify, playSosChime]
  );

  return (
    <AdminPortalContext.Provider value={ctxValue}>
      <div className="flex min-h-screen bg-slate-100">
        {/* Desktop Sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-slate-950 p-4 text-white lg:flex lg:flex-col">
          <Link href="/admin/dashboard" className="px-1">
            <BrandLogo dark subtitle="Unguja Admin" />
          </Link>

          <nav className="mt-6 flex-1 space-y-5 overflow-y-auto pr-1">
            {navGroups.map((group) => (
              <div key={group.heading}>
                <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {group.heading}
                </p>
                <div className="mt-1 space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActiveHref(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
                          active
                            ? "bg-teal-700 text-white"
                            : "text-slate-300 hover:bg-slate-900 hover:text-white"
                        }`}
                      >
                        <span className="flex items-center gap-2.5 truncate">
                          <item.icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.badge !== undefined && item.badge > 0 ? (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
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
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Active SOS Banner */}
          {openSosCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-rose-600 px-6 py-2.5 text-white">
              <div className="flex items-center gap-2 text-xs font-bold">
                <Siren className="h-4 w-4" />
                <span>
                  {openSosCount} open SOS alert{openSosCount > 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={playSosChime}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-800 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-rose-900"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  Sound
                </button>
                <Link
                  href="/admin/sos"
                  className="rounded-lg bg-white px-3 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50"
                >
                  Open SOS
                </Link>
              </div>
            </div>
          ) : null}

          {/* Sticky Top Header */}
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-base font-bold text-slate-900 sm:text-lg">
                  {t("admin.title")}
                </h1>
                {adminUser ? (
                  <p className="text-xs text-slate-500">
                    {adminUser.name} • {adminUser.phone}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                  hrefSw={`${cleanPath}?lang=sw`}
                  hrefEn={`${cleanPath}?lang=en`}
                />
                <Button size="sm" variant="outline" onClick={handleSignOut}>
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </Button>
              </div>
            </div>

            {/* Mobile Horizontal Link Bar */}
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 lg:hidden">
              {allNavItems.map((item) => {
                const active = isActiveHref(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                      active
                        ? "border-teal-700 bg-teal-700 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                    {item.badge ? ` (${item.badge})` : ""}
                  </Link>
                );
              })}
            </div>
          </header>

          {/* Main Page Content */}
          <main className="mx-auto w-full max-w-7xl space-y-6 p-5 sm:p-6">
            {toast ? (
              <div
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs font-medium ${
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
              <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                {loadError}
              </Card>
            ) : null}

            {!data && loading ? (
              <Card className="p-8 text-center text-sm text-slate-500">
                Loading...
              </Card>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </AdminPortalContext.Provider>
  );
}
