"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  BarChart3,
  Bell,
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
  Menu,
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
  UserRound,
  X,
} from "lucide-react";
import {
  BrandLogo,
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
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  React.useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!sidebarOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSidebarOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

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
    {
      heading: "Account",
      items: [
        { href: "/notification/", icon: Bell, label: "Notifications" },
        { href: "/profile/", icon: UserRound, label: "Profile" },
      ],
    },
  ];

  const cleanPath = pathname.replace(/\/$/, "") || "/admin/dashboard";

  function isActiveHref(href: string) {
    if (cleanPath === href) return true;
    if (href === "/notification/" && cleanPath === "/admin/notification") return true;
    if (href === "/profile/" && cleanPath === "/admin/profile") return true;
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

  const renderSidebarBody = () => (
    <>
      <div className="flex items-center justify-between gap-2 px-1.5">
        <Link href="/admin/dashboard" onClick={() => setSidebarOpen(false)}>
          <BrandLogo dark />
        </Link>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#F3EEE8]/25 bg-[#114E4A]/70 text-[#F3EEE8] transition hover:bg-[#F3EEE8] hover:text-[#17645F]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="mt-7 flex-1 space-y-5 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.heading}>
            <p className="px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F3EEE8]/55">
              {group.heading}
            </p>
            <div className="mt-1.5 space-y-1">
              {group.items.map((item) => {
                const active = isActiveHref(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex w-full items-center justify-between gap-2 rounded-full px-3.5 py-2 text-left text-xs transition ${
                      active
                        ? "bg-[#F3EEE8] font-bold text-[#17645F] shadow-sm"
                        : "font-medium text-[#F3EEE8]/85 hover:bg-[#114E4A] hover:text-[#F3EEE8]"
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <item.icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge !== undefined && item.badge > 0 ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          item.badgeTone === "rose"
                            ? "bg-[#A93232] text-white"
                            : item.badgeTone === "amber"
                              ? "bg-[#B86B2B] text-[#FAF7F2]"
                              : active
                                ? "bg-[#17645F] text-[#F3EEE8]"
                                : "bg-[#114E4A] text-[#F3EEE8]"
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

      {/* Sidebar Footer Actions: Refresh, SW/EN, Sign Out */}
      <div className="mt-4 space-y-2.5 border-t border-[#F3EEE8]/15 pt-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={refreshOverview}
            disabled={loading}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-[#F3EEE8]/25 bg-[#114E4A]/70 px-3 py-1.5 text-xs font-bold text-[#F3EEE8] transition hover:bg-[#F3EEE8] hover:text-[#17645F] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
          <LanguageSwitchLink
            dark
            currentLocale={locale}
            hrefSw={`${cleanPath}?lang=sw`}
            hrefEn={`${cleanPath}?lang=en`}
          />
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-[#F3EEE8]/25 bg-transparent px-3.5 py-2 text-xs font-bold text-[#F3EEE8] transition hover:border-[#A93232] hover:bg-[#A93232] hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <AdminPortalContext.Provider value={ctxValue}>
      <div className="flex min-h-screen bg-[#F3EEE8] text-[#122927]">
        {/* Slide-Over Sidebar Drawer (Closed by Default until 3-line toggle is tapped) */}
        <div
          aria-hidden={!sidebarOpen}
          className={`fixed inset-0 z-50 flex transition-opacity duration-300 ${
            sidebarOpen
              ? "visible pointer-events-auto opacity-100"
              : "invisible pointer-events-none opacity-0"
          }`}
        >
          <button
            type="button"
            tabIndex={sidebarOpen ? 0 : -1}
            aria-label="Close sidebar overlay"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-[#122927]/50 backdrop-blur-sm"
          />
          <aside
            className={`relative z-10 flex h-full w-72 max-w-[85vw] flex-col border-r border-[#114E4A] bg-[#17645F] p-4 text-[#F3EEE8] shadow-2xl transition-transform duration-300 ease-out ${
              sidebarOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            {renderSidebarBody()}
          </aside>
        </div>

        {/* Main Column */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Active SOS Banner */}
          {openSosCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#A93232] px-6 py-2.5 text-white">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em]">
                <Siren className="h-4 w-4" />
                <span>
                  {openSosCount} open SOS alert{openSosCount > 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={playSosChime}
                  className="inline-flex items-center gap-1 rounded-full bg-[#7A2222] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#621A1A]"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  Sound
                </button>
                <Link
                  href="/admin/sos"
                  className="rounded-full bg-[#FAF7F2] px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#A93232] hover:bg-white"
                >
                  Open SOS
                </Link>
              </div>
            </div>
          ) : null}

          {/* Sticky Minimal Top Header with Three-Line Sidebar Open Button */}
          <header className="sticky top-0 z-20 border-b border-[#17645F]/15 bg-[#FAF7F2]/95 px-5 py-3 backdrop-blur">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
                aria-expanded={sidebarOpen}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#17645F]/20 bg-[#F3EEE8] text-[#17645F] transition hover:bg-[#17645F] hover:text-[#F3EEE8]"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </header>

          {/* Main Page Content */}
          <main className="mx-auto w-full max-w-7xl space-y-6 p-5 sm:p-6">
            {toast ? (
              <div
                className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-xs font-semibold ${
                  toast.tone === "emerald"
                    ? "border-[#17645F]/30 bg-[#17645F]/10 text-[#17645F]"
                    : "border-[#A93232]/30 bg-[#A93232]/10 text-[#A93232]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {toast.msg}
                </span>
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  className="ml-4 text-[11px] font-bold underline"
                >
                  Dismiss
                </button>
              </div>
            ) : null}

            {loadError ? (
              <Card className="border-[#A93232]/30 bg-[#A93232]/10 p-4 text-sm font-medium text-[#A93232]">
                {loadError}
              </Card>
            ) : null}

            {!data && loading ? (
              <Card className="p-8 text-center text-sm font-semibold text-[#17645F]/75">
                Loading Unguja operations...
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
