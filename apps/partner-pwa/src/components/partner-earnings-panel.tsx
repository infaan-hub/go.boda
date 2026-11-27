"use client";

import * as React from "react";
import { Banknote, Smartphone, TrendingUp } from "lucide-react";
import { Badge, cn } from "@goboda/ui";
import { formatTzs } from "@goboda/shared-types";

export interface EarningsLedgerRow {
  id: string;
  label: string;
  channel: "CASH" | "MOBILE_MONEY" | "CARD";
  deltaTzs: number;
  time: string;
}

interface PartnerEarningsPanelProps {
  locale: "sw" | "en";
  nightMode: boolean;
  isBodabodaRider: boolean;
  todayNetTzs: number;
  tripsToday: number;
  ledger: EarningsLedgerRow[];
}

export function PartnerEarningsPanel({
  locale,
  nightMode,
  isBodabodaRider,
  todayNetTzs,
  tripsToday,
  ledger,
}: PartnerEarningsPanelProps) {
  const cashShareTzs = Math.round(todayNetTzs * 0.58);
  const digitalShareTzs = Math.max(0, todayNetTzs - cashShareTzs);
  const grossEstTzs = Math.round(todayNetTzs / 0.88);
  const commEstTzs = Math.max(0, grossEstTzs - todayNetTzs);

  const cardTone = nightMode
    ? "border-[#F3EEE8]/15 bg-[#123D3A] text-[#F3EEE8]"
    : "border-[#17645F]/15 bg-[#FAF7F2] text-[#122927]";

  const subCardTone = nightMode
    ? "border-[#F3EEE8]/15 bg-[#0D302E]"
    : "border-[#17645F]/15 bg-[#F3EEE8]";

  return (
    <section className="space-y-5">
      <div
        className={cn(
          "border-b pb-4",
          nightMode ? "border-[#F3EEE8]/15" : "border-[#17645F]/15"
        )}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] opacity-75">
          {isBodabodaRider
            ? locale === "sw"
              ? "MAPATO YA RIDER WA BODABODA • UNGUJA"
              : "BODABODA RIDER EARNINGS • UNGUJA"
            : locale === "sw"
              ? "MAPATO YA DEREVA WA BAJAJI • UNGUJA"
              : "BAJAJI DRIVER EARNINGS • UNGUJA"}
        </p>
        <h1
          className={cn(
            "mt-1 font-display text-4xl uppercase leading-none",
            nightMode ? "text-[#F3EEE8]" : "text-[#17645F]"
          )}
        >
          {locale === "sw" ? "MAPATO YA ZAMU" : "SHIFT EARNINGS"}
        </h1>
      </div>

      <div className={cn("rounded-3xl border p-5 shadow-sm", cardTone)}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p
              className={cn(
                "text-[10px] font-bold uppercase tracking-[0.2em]",
                nightMode ? "text-[#E6C99E]" : "text-[#17645F]/75"
              )}
            >
              {isBodabodaRider
                ? locale === "sw"
                  ? "Mapato ya Rider wa Bodaboda"
                  : "Bodaboda Rider Net Earnings"
                : locale === "sw"
                  ? "Mapato ya Dereva wa Bajaji"
                  : "Bajaji Driver Net Earnings"}
            </p>
            <p
              className={cn(
                "mt-1 font-display text-4xl leading-none",
                nightMode ? "text-[#F3EEE8]" : "text-[#17645F]"
              )}
            >
              {formatTzs(todayNetTzs)}
            </p>
          </div>
          <Badge tone="emerald">
            <TrendingUp className="h-3.5 w-3.5" />
            {tripsToday} {locale === "sw" ? "safari" : "trips"}
          </Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div className={cn("rounded-2xl border p-3.5", subCardTone)}>
            <div className="flex items-center gap-1.5 font-bold text-[#B86B2B]">
              <Banknote className="h-4 w-4" />
              {locale === "sw" ? "Pesa Taslimu (Cash)" : "Cash Trips (TZS)"}
            </div>
            <p className="mt-1 text-lg font-extrabold">
              {formatTzs(cashShareTzs)}
            </p>
          </div>
          <div className={cn("rounded-2xl border p-3.5", subCardTone)}>
            <div
              className={cn(
                "flex items-center gap-1.5 font-bold",
                nightMode ? "text-[#A7DBD7]" : "text-[#17645F]"
              )}
            >
              <Smartphone className="h-4 w-4" />
              {locale === "sw"
                ? "Pesa kwa Simu / Kadi"
                : "Mobile Money / Card"}
            </div>
            <p className="mt-1 text-lg font-extrabold">
              {formatTzs(digitalShareTzs)}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-1 border-t border-current/10 pt-3 text-xs">
          <div className="flex justify-between opacity-80">
            <span>
              {locale === "sw" ? "Jumla ya Nauli (Gross)" : "Gross Trip Fares"}
            </span>
            <span className="font-bold">{formatTzs(grossEstTzs)}</span>
          </div>
          <div className="flex justify-between opacity-80">
            <span>
              {locale === "sw"
                ? "Kamisheni ya Go.boda (12%)"
                : "Go.boda Platform Commission (12%)"}
            </span>
            <span className="font-bold text-[#B86B2B]">
              -{formatTzs(commEstTzs)}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Per-Trip Earnings Breakdown */}
      <div className={cn("space-y-2.5 rounded-3xl border p-5 shadow-sm", cardTone)}>
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-75">
          {locale === "sw"
            ? "Muhtasari wa Safari za Hivi Karibuni"
            : "Recent Per-Trip Earnings"}
        </h2>
        <div className="divide-y divide-current/10">
          {ledger.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between py-2.5 text-xs"
            >
              <div>
                <p className="font-bold">{row.label}</p>
                <p className="text-[11px] opacity-65">
                  {row.channel} • {row.time}
                </p>
              </div>
              <span
                className={cn(
                  "font-mono text-sm font-extrabold",
                  row.deltaTzs >= 0
                    ? nightMode
                      ? "text-[#A7DBD7]"
                      : "text-[#17645F]"
                    : "text-[#B86B2B]"
                )}
              >
                {row.deltaTzs >= 0 ? "+" : ""}
                {formatTzs(row.deltaTzs)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
