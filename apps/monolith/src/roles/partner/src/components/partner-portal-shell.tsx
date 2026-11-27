"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Bell,
  FileCheck2,
  Flame,
  History,
  LogOut,
  Menu,
  Moon,
  Power,
  Radio,
  ShieldCheck,
  Sun,
  TrendingUp,
  UserRound,
  X,
} from "lucide-react";
import { BrandLogo, LanguageSwitchLink, cn } from "@goboda/ui";
import {
  PartnerRealtimeProvider,
  usePartnerRealtime,
} from "./partner-realtime-provider";

function PartnerPortalShellInner({
  locale,
  categoryLabel,
  nightMode,
  onToggleNightMode,
  showSignOut = true,
  children,
}: {
  locale: "sw" | "en";
  categoryLabel: string;
  nightMode: boolean;
  onToggleNightMode: () => void;
  showSignOut?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const { snapshot, transport, toast, dismissToast } = usePartnerRealtime();

  const cleanPath =
    (pathname || "/partner/shift").replace(/\/$/, "") || "/partner/shift";

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

  const handleSignOut = async () => {
    await fetch("/api/partner/auth", { method: "DELETE" }).catch(() => null);
    router.replace("/partner/login");
    router.refresh();
  };

  const unreadCount = snapshot?.unreadCount ?? 0;
  const urgentComplianceCount = snapshot?.compliance.urgentCount ?? 0;
  const pendingOffersCount = snapshot?.pendingOffers.length ?? 0;

  const navItems = [
    {
      href: "/partner/shift",
      label: t("partner.navHome"),
      icon: Power,
      badge: pendingOffersCount > 0 ? pendingOffersCount : 0,
      badgeTone: "emerald" as const,
    },
    {
      href: "/partner/hotspots",
      label: locale === "sw" ? "Vituo Moto" : "Hotspots",
      icon: Flame,
      badge: 0,
      badgeTone: "amber" as const,
    },
    {
      href: "/partner/trips",
      label: locale === "sw" ? "Safari" : "Trips",
      icon: History,
      badge: 0,
      badgeTone: "teal" as const,
    },
    {
      href: "/partner/earnings",
      label: t("partner.navEarnings"),
      icon: TrendingUp,
      badge: 0,
      badgeTone: "teal" as const,
    },
    {
      href: "/partner/kyc",
      label: t("partner.navOnboarding"),
      icon: FileCheck2,
      badge: urgentComplianceCount,
      badgeTone: "red" as const,
    },
    {
      href: "/partner/notifications",
      label: locale === "sw" ? "Arifa" : "Notifications",
      icon: Bell,
      badge: unreadCount,
      badgeTone: "amber" as const,
    },
    {
      href: "/partner/safety",
      label: locale === "sw" ? "Usalama" : "Safety",
      icon: ShieldCheck,
      badge: 0,
      badgeTone: "teal" as const,
    },
    {
      href: "/profile/",
      label: locale === "sw" ? "Wasifu" : "Profile",
      icon: UserRound,
      badge: 0,
      badgeTone: "teal" as const,
    },
  ];

  const isLive = transport === "websocket" || transport === "sse";

  return (
    <div
      className={cn(
        "min-h-screen pb-12 transition-colors",
        nightMode ? "bg-[#0F3F3C] text-[#F3EEE8]" : "bg-[#F3EEE8] text-[#122927]"
      )}
    >
      {/* Slide-Over Deep Zanzibar Teal Sidebar Drawer (Closed by Default until 3-line toggle is tapped) */}
      <div
        aria-hidden={!sidebarOpen}
        className={cn(
          "fixed inset-0 z-50 flex transition-opacity duration-300",
          sidebarOpen
            ? "visible pointer-events-auto opacity-100"
            : "invisible pointer-events-none opacity-0"
        )}
      >
        <button
          type="button"
          tabIndex={sidebarOpen ? 0 : -1}
          aria-label="Close sidebar overlay"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-[#122927]/50 backdrop-blur-sm"
        />
        <aside
          className={cn(
            "relative z-10 flex h-full w-72 max-w-[85vw] flex-col border-r border-[#114E4A] bg-[#17645F] p-4 text-[#F3EEE8] shadow-2xl transition-transform duration-300 ease-out",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {/* Sidebar Header with Close Button Inside Sidebar */}
          <div className="flex items-center justify-between gap-2 px-1.5">
            <Link href="/partner/shift" onClick={() => setSidebarOpen(false)}>
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

          {/* Dedicated Partner Page Links */}
          <nav className="mt-7 flex-1 space-y-1.5 overflow-y-auto">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F3EEE8]/55">
              {categoryLabel}
            </p>
            {navItems.map((item) => {
              const active =
                cleanPath === item.href ||
                (item.href === "/profile/" && cleanPath === "/partner/profile") ||
                (item.href === "/partner/safety" && cleanPath === "/safety");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-full px-3.5 py-2.5 text-left text-xs transition",
                    active
                      ? "bg-[#F3EEE8] font-bold text-[#17645F] shadow-sm"
                      : "font-medium text-[#F3EEE8]/85 hover:bg-[#114E4A] hover:text-[#F3EEE8]"
                  )}
                >
                  <span className="flex items-center gap-3 truncate">
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge > 0 ? (
                    <span
                      className={cn(
                        "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-extrabold",
                        item.badgeTone === "red"
                          ? "bg-[#A93232] text-white"
                          : item.badgeTone === "emerald"
                            ? "bg-emerald-500 text-white"
                            : "bg-[#B86B2B] text-[#FAF7F2]"
                      )}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {/* Sidebar Footer Actions: Night/Day, SW/EN, Sign Out */}
          <div className="mt-4 space-y-2.5 border-t border-[#F3EEE8]/15 pt-4">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={onToggleNightMode}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-[#F3EEE8]/25 bg-[#114E4A]/70 px-3 py-1.5 text-xs font-bold text-[#F3EEE8] transition hover:bg-[#F3EEE8] hover:text-[#17645F]"
              >
                {nightMode ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
                <span>
                  {nightMode
                    ? locale === "sw"
                      ? "Mchana"
                      : "Day"
                    : locale === "sw"
                      ? "Usiku"
                      : "Night"}
                </span>
              </button>
              <LanguageSwitchLink
                dark
                currentLocale={locale}
                hrefSw={`${cleanPath}?lang=sw`}
                hrefEn={`${cleanPath}?lang=en`}
              />
            </div>

            {showSignOut ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-[#F3EEE8]/25 bg-transparent px-3.5 py-2 text-xs font-bold text-[#F3EEE8] transition hover:border-[#A93232] hover:bg-[#A93232] hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{locale === "sw" ? "Toka" : "Sign Out"}</span>
              </button>
            ) : (
              <Link
                href="/partner/login"
                onClick={() => setSidebarOpen(false)}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-[#F3EEE8]/25 bg-transparent px-3.5 py-2 text-xs font-bold text-[#F3EEE8] transition hover:bg-[#F3EEE8] hover:text-[#17645F]"
              >
                <span>{locale === "sw" ? "Ingia" : "Sign In"}</span>
              </Link>
            )}
          </div>
        </aside>
      </div>

      {/* Sticky Minimal Top Header: Three-Line Open Button + Live Status & Bell */}
      <header
        className={cn(
          "sticky top-0 z-20 border-b px-5 py-3 backdrop-blur",
          nightMode
            ? "border-[#F3EEE8]/15 bg-[#0F3F3C]/95"
            : "border-[#17645F]/15 bg-[#FAF7F2]/95"
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            aria-expanded={sidebarOpen}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
              nightMode
                ? "border-[#F3EEE8]/25 bg-[#17645F] text-[#F3EEE8] hover:bg-[#F3EEE8] hover:text-[#17645F]"
                : "border-[#17645F]/20 bg-[#F3EEE8] text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
            )}
          >
            <Menu className="h-5 w-5" />
          </button>

          {showSignOut ? (
            <div className="flex items-center gap-2">
              <span
                title={
                  transport === "websocket"
                    ? "Live WebSocket connected"
                    : transport === "sse"
                      ? "Live Realtime Stream connected"
                      : "Connecting realtime state..."
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
                  isLive
                    ? nightMode
                      ? "border-emerald-400/35 bg-emerald-500/15 text-emerald-200"
                      : "border-[#17645F]/20 bg-[#17645F]/10 text-[#17645F]"
                    : nightMode
                      ? "border-[#F3EEE8]/20 bg-[#123D3A] text-[#F3EEE8]/70"
                      : "border-[#17645F]/15 bg-[#F3EEE8] text-[#17645F]/70"
                )}
              >
                <Radio
                  className={cn(
                    "h-3 w-3",
                    isLive ? "animate-pulse text-emerald-500" : "opacity-60"
                  )}
                />
                <span>
                  {transport === "websocket"
                    ? "Live WS"
                    : transport === "sse"
                      ? "Live"
                      : locale === "sw"
                        ? "Inaunganisha"
                        : "Syncing"}
                </span>
              </span>

              <Link
                href="/partner/notifications"
                aria-label={locale === "sw" ? "Arifa" : "Notifications"}
                className={cn(
                  "relative inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
                  cleanPath === "/partner/notifications"
                    ? "border-[#17645F] bg-[#17645F] text-[#F3EEE8]"
                    : nightMode
                      ? "border-[#F3EEE8]/25 bg-[#17645F] text-[#F3EEE8] hover:bg-[#F3EEE8] hover:text-[#17645F]"
                      : "border-[#17645F]/20 bg-[#F3EEE8] text-[#17645F] hover:bg-[#17645F] hover:text-[#F3EEE8]"
                )}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#B86B2B] px-1 text-[10px] font-extrabold text-[#FAF7F2] shadow">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      {/* Live Realtime Instant Toast Notification Banner */}
      {toast ? (
        <div className="fixed right-4 top-16 z-40 w-[calc(100vw-2rem)] max-w-sm">
          <div
            className={cn(
              "flex items-start justify-between gap-3 rounded-3xl border p-4 shadow-xl backdrop-blur",
              toast.severity === "URGENT"
                ? "border-[#A93232]/50 bg-[#A93232] text-white"
                : "border-[#17645F]/35 bg-[#17645F] text-[#F3EEE8]"
            )}
          >
            <Link
              href={toast.url}
              onClick={dismissToast}
              className="flex-1 space-y-1"
            >
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#E6C99E]">
                {locale === "sw" ? "ARIFA YA PAPO HAPO" : "INSTANT LIVE ALERT"}
              </p>
              <p className="text-sm font-extrabold leading-snug">
                {toast.title}
              </p>
              <p className="text-xs opacity-90">{toast.body}</p>
            </Link>
            <button
              type="button"
              onClick={dismissToast}
              aria-label="Dismiss notification"
              className="rounded-full p-1 text-white/80 hover:bg-white/15 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {children}
    </div>
  );
}

export function PartnerPortalShell(props: {
  locale: "sw" | "en";
  categoryLabel: string;
  nightMode: boolean;
  onToggleNightMode: () => void;
  showSignOut?: boolean;
  children: React.ReactNode;
}) {
  return (
    <PartnerRealtimeProvider
      enabled={props.showSignOut !== false}
      locale={props.locale}
    >
      <PartnerPortalShellInner {...props} />
    </PartnerRealtimeProvider>
  );
}
