"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  FileCheck2,
  LogOut,
  Menu,
  Moon,
  Power,
  ShieldCheck,
  Sun,
  TrendingUp,
  X,
} from "lucide-react";
import { BrandLogo, LanguageSwitchLink, cn } from "@goboda/ui";

export function PartnerPortalShell({
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

  const cleanPath = (pathname || "/partner/shift").replace(/\/$/, "") || "/partner/shift";

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

  const navItems = [
    { href: "/partner/shift", label: t("partner.navHome"), icon: Power },
    { href: "/partner/earnings", label: t("partner.navEarnings"), icon: TrendingUp },
    { href: "/partner/kyc", label: t("partner.navOnboarding"), icon: FileCheck2 },
    {
      href: "/partner/safety",
      label: locale === "sw" ? "Usalama" : "Safety",
      icon: ShieldCheck,
    },
  ] as const;

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

          {/* Dedicated Partner Page Links: Shift, Earnings, KYC, Safety */}
          <nav className="mt-7 flex-1 space-y-1.5 overflow-y-auto">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F3EEE8]/55">
              {categoryLabel}
            </p>
            {navItems.map((item) => {
              const active =
                cleanPath === item.href ||
                (item.href === "/partner/safety" && cleanPath === "/safety");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-left text-xs transition",
                    active
                      ? "bg-[#F3EEE8] font-bold text-[#17645F] shadow-sm"
                      : "font-medium text-[#F3EEE8]/85 hover:bg-[#114E4A] hover:text-[#F3EEE8]"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
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

      {/* Sticky Minimal Top Header with Three-Line Sidebar Open Button Only */}
      <header
        className={cn(
          "sticky top-0 z-20 border-b px-5 py-3 backdrop-blur",
          nightMode
            ? "border-[#F3EEE8]/15 bg-[#0F3F3C]/95"
            : "border-[#17645F]/15 bg-[#FAF7F2]/95"
        )}
      >
        <div className="flex items-center justify-between">
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
        </div>
      </header>

      {children}
    </div>
  );
}
