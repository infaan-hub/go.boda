"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, Search } from "lucide-react";
import { BrandLogo, Button, Card } from "@goboda/ui";

export default function TrackLookupPage() {
  const router = useRouter();
  const [token, setToken] = React.useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = token.trim();
    if (!cleaned) return;
    router.push(`/track/${encodeURIComponent(cleaned)}`);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F3EEE8] px-4 py-10 text-[#122927]">
      <div className="mb-8 flex w-full max-w-md items-center justify-between">
        <BrandLogo subtitle="Trip Tracker" />
        <Link
          href="/dashboard"
          className="rounded-full border border-[#17645F]/40 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#17645F] transition hover:bg-[#17645F] hover:text-[#F3EEE8]"
        >
          Back to App
        </Link>
      </div>

      <div className="mb-6 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-[#17645F]/75">
          LIVE UNGUJA TELEMETRY
        </p>
        <h1 className="mt-1 font-display text-5xl uppercase leading-none text-[#17645F]">
          TRACK TRIP
        </h1>
      </div>

      <Card className="w-full max-w-md space-y-4 border-[#17645F]/15 bg-[#FAF7F2] p-6">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-[#17645F]" />
          <h2 className="text-sm font-extrabold uppercase tracking-[0.12em] text-[#17645F]">
            Live Share Code
          </h2>
        </div>
        <p className="text-xs text-[#17645F]/75">
          Enter the trip share code sent via WhatsApp to view live location on Unguja.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter share code..."
            className="w-full rounded-2xl border border-[#17645F]/20 bg-[#F3EEE8]/70 px-3.5 py-2.5 text-sm text-[#122927] placeholder:text-[#17645F]/40 focus:border-[#17645F] focus:bg-[#FAF7F2] focus:outline-none"
          />
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full uppercase tracking-[0.14em]"
          >
            <Search className="h-4 w-4" />
            Track Trip
          </Button>
        </form>
      </Card>
    </div>
  );
}
