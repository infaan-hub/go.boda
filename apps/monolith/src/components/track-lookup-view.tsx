"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search } from "lucide-react";
import { Button, Card } from "@goboda/ui";
import { CustomerPortalShell } from "./customer-portal-shell";

export function TrackLookupView({
  locale,
  customerName,
  isAuthenticated = false,
}: {
  locale: "sw" | "en";
  customerName?: string;
  isAuthenticated?: boolean;
}) {
  const router = useRouter();
  const sw = locale === "sw";
  const [token, setToken] = React.useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = token.trim();
    if (!cleaned) return;
    router.push(`/track/${encodeURIComponent(cleaned)}`);
  }

  return (
    <CustomerPortalShell
      locale={locale}
      customerName={customerName}
      showSignOut={isAuthenticated}
    >
      <main className="mx-auto flex max-w-md flex-col items-center justify-center px-4 py-12">
        <div className="mb-6 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-[#17645F]/75">
            {sw
              ? "UFUATILIAJI WA MOJA KWA MOJA • UNGUJA"
              : "LIVE UNGUJA TELEMETRY"}
          </p>
          <h1 className="mt-1 font-display text-5xl uppercase leading-none text-[#17645F]">
            {sw ? "FUATILIA SAFARI" : "TRACK TRIP"}
          </h1>
        </div>

        <Card className="w-full space-y-4 border-[#17645F]/15 bg-[#FAF7F2] p-6">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-[#17645F]" />
            <h2 className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#17645F]">
              {sw ? "Msimbo wa Kushiriki" : "Live Share Code"}
            </h2>
          </div>
          <p className="text-xs text-[#17645F]/75">
            {sw
              ? "Weka msimbo wa safari uliotumwa kwa WhatsApp kuona mahali halisi Unguja."
              : "Enter the trip share code sent via WhatsApp to view live location on Unguja."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                sw ? "Weka msimbo wa safari..." : "Enter share code..."
              }
              className="w-full rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2.5 text-sm text-[#122927] placeholder:text-[#17645F]/40 focus:border-[#17645F] focus:bg-[#FAF7F2] focus:outline-none"
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full uppercase tracking-[0.14em]"
            >
              <Search className="h-4 w-4" />
              {sw ? "Fuatilia Safari" : "Track Trip"}
            </Button>
          </form>
        </Card>
      </main>
    </CustomerPortalShell>
  );
}
