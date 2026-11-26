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
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="mb-6 flex w-full max-w-md items-center justify-between">
        <BrandLogo subtitle="Trip Tracker" />
        <Link
          href="/dashboard"
          className="text-xs font-semibold text-teal-700 hover:underline"
        >
          Back to App
        </Link>
      </div>

      <Card className="w-full max-w-md space-y-4 p-6">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-teal-700" />
          <h1 className="text-base font-bold text-slate-900">
            Track a Go.boda Trip
          </h1>
        </div>
        <p className="text-xs text-slate-500">
          Enter the trip share code sent via WhatsApp to view live location on Unguja.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter share code..."
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
          />
          <Button type="submit" variant="primary" size="lg" className="w-full">
            <Search className="h-4 w-4" />
            Track Trip
          </Button>
        </form>
      </Card>
    </div>
  );
}
