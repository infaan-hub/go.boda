"use client";

import * as React from "react";
import { Download, Globe, X } from "lucide-react";
import { Button } from "./primitives";
import { cn } from "./utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
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
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!deferredPrompt || dismissed) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-[#F3EEE8]/20 bg-[#17645F] p-4 text-[#F3EEE8] shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3EEE8] text-[#17645F]">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold">{title}</p>
            <p className="mt-0.5 text-xs text-[#F3EEE8]/80">{description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={dismissLabel}
          className="rounded-full p-1 text-[#F3EEE8]/75 hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="text-[#F3EEE8] hover:bg-white/10"
          onClick={() => setDismissed(true)}
        >
          {dismissLabel}
        </Button>
        <Button
          size="sm"
          className="bg-[#F3EEE8] text-[#17645F] hover:bg-white"
          onClick={handleInstall}
        >
          {installLabel}
        </Button>
      </div>
    </div>
  );
}

export function LanguageSwitchLink({
  currentLocale,
  hrefSw,
  hrefEn,
  className,
}: {
  currentLocale: "sw" | "en";
  hrefSw: string;
  hrefEn: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-[#17645F]/25 bg-[#FAF7F2] p-1 text-[11px] font-bold tracking-wider",
        className
      )}
    >
      <Globe className="ml-1.5 h-3.5 w-3.5 text-[#17645F]/70" />
      <a
        href={hrefSw}
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors",
          currentLocale === "sw"
            ? "bg-[#17645F] text-[#F3EEE8]"
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
            ? "bg-[#17645F] text-[#F3EEE8]"
            : "text-[#17645F]/75 hover:text-[#17645F]"
        )}
      >
        EN
      </a>
    </div>
  );
}
