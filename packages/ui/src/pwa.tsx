"use client";

import * as React from "react";
import { Download, Globe, X } from "lucide-react";
import { Button } from "./primitives";
import { cn } from "./utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const PWA_SNOOZE_KEY = "goboda_pwa_install_snooze_until";

function isSnoozedToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(PWA_SNOOZE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    if (!Number.isFinite(until)) return false;
    return Date.now() < until;
  } catch {
    return false;
  }
}

function snoozeUntilNextDay(): void {
  if (typeof window === "undefined") return;
  try {
    const now = new Date();
    const nextDayMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      0,
      0
    ).getTime();
    window.localStorage.setItem(PWA_SNOOZE_KEY, String(nextDayMidnight));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export function PwaRegistrar({ swPath = "/sw.js" }: { swPath?: string }) {
  React.useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register(swPath).catch(() => {
      // Service worker registration failure is non-fatal in unsupported contexts
    });
  }, [swPath]);

  return null;
}

export function PwaInstallBanner({
  title,
  description,
  installLabel,
  dismissLabel,
}: {
  title: string;
  description: string;
  installLabel: string;
  dismissLabel: string;
}) {
  const [deferredPrompt, setDeferredPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = React.useState(true);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    if (isStandalone || isSnoozedToday()) {
      setDismissed(true);
      return;
    }

    setDismissed(false);

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      if (isSnoozedToday()) {
        setDismissed(true);
        return;
      }
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setExpanded(false);
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleLater = () => {
    snoozeUntilNextDay();
    setExpanded(false);
    setDismissed(true);
  };

  const handleInstall = async () => {
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "dismissed") {
        snoozeUntilNextDay();
      }
    } finally {
      setDeferredPrompt(null);
      setExpanded(false);
      setDismissed(true);
    }
  };

  return (
    <div className="fixed right-0 top-1/2 z-40 -translate-y-1/2">
      {expanded ? (
        <div className="mr-3 w-[272px] max-w-[calc(100vw-1.5rem)] rounded-3xl border border-[#F3EEE8]/25 bg-[#17645F] p-4 text-[#F3EEE8] shadow-2xl">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-start gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F3EEE8] text-[#17645F] shadow-sm">
                <Download className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-extrabold tracking-wide">{title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[#F3EEE8]/85">
                  {description}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Collapse install badge"
              className="rounded-full p-1 text-[#F3EEE8]/75 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3.5 flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-xs text-[#F3EEE8]/85 hover:bg-white/10 hover:text-white"
              onClick={handleLater}
            >
              {dismissLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-[#F3EEE8] text-xs font-extrabold text-[#17645F] hover:bg-white"
              onClick={handleInstall}
            >
              <Download className="h-3.5 w-3.5" />
              {installLabel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center overflow-hidden rounded-l-full border border-r-0 border-[#F3EEE8]/25 bg-[#17645F] text-[#F3EEE8] shadow-[0_10px_28px_rgba(18,41,39,0.28)]">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label={title}
            className="flex items-center gap-2 py-2.5 pl-3.5 pr-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] transition hover:bg-[#114E4A]"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F3EEE8] text-[#17645F]">
              <Download className="h-3.5 w-3.5" />
            </span>
            <span>{installLabel}</span>
          </button>
          <button
            type="button"
            onClick={handleLater}
            aria-label={dismissLabel}
            title={dismissLabel}
            className="border-l border-[#F3EEE8]/20 px-2 py-3 text-[#F3EEE8]/75 transition hover:bg-[#114E4A] hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export function LanguageSwitchLink({
  currentLocale,
  hrefSw,
  hrefEn,
  dark = false,
  className,
}: {
  currentLocale: "sw" | "en";
  hrefSw: string;
  hrefEn: string;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border p-1 text-[11px] font-bold tracking-wider",
        dark
          ? "border-[#F3EEE8]/25 bg-[#114E4A]"
          : "border-[#17645F]/25 bg-[#FAF7F2]",
        className
      )}
    >
      <Globe
        className={cn(
          "ml-1.5 h-3.5 w-3.5",
          dark ? "text-[#F3EEE8]/70" : "text-[#17645F]/70"
        )}
      />
      <a
        href={hrefSw}
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors",
          currentLocale === "sw"
            ? dark
              ? "bg-[#F3EEE8] text-[#17645F]"
              : "bg-[#17645F] text-[#F3EEE8]"
            : dark
              ? "text-[#F3EEE8]/75 hover:text-[#F3EEE8]"
              : "text-[#17645F]/75 hover:text-[#17645F]"
        )}
      >
        SW
      </a>
      <a
        href={hrefEn}
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors",
          currentLocale === "en"
            ? dark
              ? "bg-[#F3EEE8] text-[#17645F]"
              : "bg-[#17645F] text-[#F3EEE8]"
            : dark
              ? "text-[#F3EEE8]/75 hover:text-[#F3EEE8]"
              : "text-[#17645F]/75 hover:text-[#17645F]"
        )}
      >
        EN
      </a>
    </div>
  );
}
