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
    <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-teal-200 bg-teal-950 p-4 text-white shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-slate-950">
            <Download className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="mt-0.5 text-xs text-teal-100/80">{description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={dismissLabel}
          className="rounded-lg p-1 text-teal-200 hover:bg-teal-900"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="text-teal-100 hover:bg-teal-900 hover:text-white"
          onClick={() => setDismissed(true)}
        >
          {dismissLabel}
        </Button>
        <Button size="sm" variant="amber" onClick={handleInstall}>
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
        "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-xs font-semibold shadow-sm",
        className
      )}
    >
      <Globe className="ml-1.5 h-3.5 w-3.5 text-slate-500" />
      <a
        href={hrefSw}
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors",
          currentLocale === "sw"
            ? "bg-teal-700 text-white"
            : "text-slate-600 hover:text-slate-900"
        )}
      >
        SW
      </a>
      <a
        href={hrefEn}
        className={cn(
          "rounded-full px-2.5 py-1 transition-colors",
          currentLocale === "en"
            ? "bg-teal-700 text-white"
            : "text-slate-600 hover:text-slate-900"
        )}
      >
        EN
      </a>
    </div>
  );
}
