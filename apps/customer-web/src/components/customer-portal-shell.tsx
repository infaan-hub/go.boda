"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Compass,
  History,
  LogOut,
  Menu,
  Navigation,
  ShieldCheck,
  X,
} from "lucide-react";
import { BrandLogo, LanguageSwitchLink, cn } from "@goboda/ui";
import { Bell, UserCircle } from "lucide-react";
import { CustomerRealtimeProvider, useCustomerRealtime } from "./customer-realtime-provider";

function CustomerPortalShellInner({
  locale,
  customerName,
  showSignOut = true,
  onBookClick,
  children,
}: {
  locale: "sw" | "en";
  customerName?: string;
  showSignOut?: boolean;
  onBookClick?: () => void;
  children: React.ReactNode;
}) {
  const sw = locale === "sw";
  const pathname = usePathname();
  const router = useRouter();
  const realtime = useCustomerRealtime();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const cleanPath = (pathname || "/dashboard").replace(/\/$/, "") || "/";

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
    setSidebarOpen(false);
    await fetch("/api/customer/auth/logout", { method: "POST" }).catch(() => null);
    router.replace("/login");
    router.refresh();
  };

  const bookHref = showSignOut ? "/dashboard#workspace" : "/#workspace";
  const isBookRoute = cleanPath === "/" || cleanPath === "/dashboard";

  const navItems = [
    {
      href: bookHref,
      matchPath: isBookRoute,
      label: sw ? "Agiza" : "Book",
      icon: Compass,
      isBook: true,
    },
    {
      href: "/trips",
      matchPath: cleanPath === "/trips",
      label: sw ? "Safari" : "Trips",
      icon: History,
      isBook: false,
    },
    {
      href: "/safety",
      matchPath: cleanPath === "/safety",
      label: sw ? "Usalama" : "Safety",
      icon: ShieldCheck,
      isBook: false,
    },
    {
      href: "/track",
      matchPath: cleanPath === "/track" || cleanPath.startsWith("/track/"),
      label: sw ? "Fuatilia" : "Track",
      icon: Navigation,
      isBook: false,
    },
    {
      href: "/notifications",
      matchPath: cleanPath === "/notifications",
      label: sw ? "Arifa" : "Notifications",
      icon: Bell,
      isBook: false,
    },
    {
      href: "/profile",
      matchPath: cleanPath === "/profile",
      label: sw ? "Wasifu" : "Profile",
      icon: UserCircle,
      isBook: false,
    },
  ];

  const langBasePath = cleanPath === "/" ? "/dashboard" : cleanPath;

  return (
    <div className="min-h-screen bg-[#F3EEE8] pb-12 text-[#122927]">
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
            <Link
              href={showSignOut ? "/dashboard" : "/"}
              onClick={() => setSidebarOpen(false)}
            >
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

          {/* Navigation Links: Book, Trips, Safety, Track */}
          <nav className="mt-7 flex-1 space-y-1.5 overflow-y-auto">
            {customerName ? (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F3EEE8]/65">
                {sw ? "Habari" : "Hi"}, {customerName}
              </p>
            ) : (
              <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F3EEE8]/55">
                Go.Boda • Unguja
              </p>
            )}

            {navItems.map((item) => {
              const classes = cn(
                "flex w-full items-center gap-3 rounded-full px-3.5 py-2.5 text-left text-xs transition",
                item.matchPath
                  ? "bg-[#F3EEE8] font-bold text-[#17645F] shadow-sm"
                  : "font-medium text-[#F3EEE8]/85 hover:bg-[#114E4A] hover:text-[#F3EEE8]"
              );

              if (item.isBook && isBookRoute && onBookClick) {
                return (
                  <a
                    key={item.label}
                    href="#workspace"
                    onClick={() => {
                      onBookClick();
                      setSidebarOpen(false);
                    }}
                    className={classes}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {item.href === "/notifications" && realtime.unreadCount > 0 && (
                      <span className="ml-auto rounded-full bg-[#A93232] px-2 py-0.5 text-[10px] font-bold text-white">
                        {realtime.unreadCount}
                      </span>
                    )}
                  </a>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={classes}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Sidebar Footer Actions: SW / EN + Sign Out */}
          <div className="mt-4 space-y-2.5 border-t border-[#F3EEE8]/15 pt-4">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#F3EEE8]/65">
                {sw ? "Lugha" : "Language"}
              </span>
              <LanguageSwitchLink
                dark
                currentLocale={locale}
                hrefSw={`${langBasePath}?lang=sw`}
                hrefEn={`${langBasePath}?lang=en`}
              />
            </div>

            {showSignOut ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-[#F3EEE8]/25 bg-transparent px-3.5 py-2 text-xs font-bold text-[#F3EEE8] transition hover:border-[#A93232] hover:bg-[#A93232] hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{sw ? "Toka" : "Sign Out"}</span>
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/login"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center justify-center rounded-full border border-[#F3EEE8]/30 bg-transparent px-3 py-2 text-xs font-bold text-[#F3EEE8] transition hover:bg-[#F3EEE8] hover:text-[#17645F]"
                >
                  {sw ? "Ingia" : "Sign In"}
                </Link>
                <Link
                  href="/register"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center justify-center rounded-full bg-[#F3EEE8] px-3 py-2 text-xs font-bold text-[#17645F] transition hover:bg-[#E9DFD3]"
                >
                  {sw ? "Sajili" : "Sign Up"}
                </Link>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Sticky Minimal Top Header with Three-Line Sidebar Toggle Button Only */}
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
          <div className="flex items-center gap-2">
            <Link
              href="/notifications"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#17645F]/20 bg-[#F3EEE8] text-[#17645F] transition hover:bg-[#17645F] hover:text-[#F3EEE8]"
              aria-label={sw ? "Arifa" : "Notifications"}
            >
              <Bell className="h-5 w-5" />
              {realtime.unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#A93232] px-1 text-[10px] font-bold text-white">
                  {realtime.unreadCount}
                </span>
              )}
            </Link>
            <Link
              href="/profile"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#17645F]/20 bg-[#F3EEE8] text-[#17645F] transition hover:bg-[#17645F] hover:text-[#F3EEE8]"
              aria-label={sw ? "Wasifu" : "Profile"}
            >
              <UserCircle className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      {realtime.toast && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-[#17645F]/20 bg-[#FAF7F2] p-4 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[#122927]">{realtime.toast.title}</p>
              <p className="mt-1 text-xs text-[#17645F]/80">{realtime.toast.body}</p>
              <a href={realtime.toast.url} className="mt-2 inline-block text-xs font-bold text-[#17645F] underline">
                {sw ? "Fungua" : "Open"}
              </a>
            </div>
            <button type="button" onClick={realtime.dismissToast} className="text-[#17645F]/60 hover:text-[#17645F]">✕</button>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

export function CustomerPortalShell(props: React.ComponentProps<typeof CustomerPortalShellInner>) {
  return (
    <CustomerRealtimeProvider locale={props.locale} enabled={Boolean(props.showSignOut)}>
      <CustomerPortalShellInner {...props} />
    </CustomerRealtimeProvider>
  );
}
