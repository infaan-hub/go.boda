"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Smartphone,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge, Button, cn } from "@goboda/ui";
import { PLATFORM_FINANCE, formatTzs } from "@goboda/shared-types";

export interface WalletLedgerRow {
  id: string;
  label: string;
  channel: "CASH" | "MOBILE_MONEY" | "CARD" | "PAYOUT" | "TOPUP";
  deltaTzs: number;
  time: string;
}

interface PartnerWalletPanelProps {
  mode: "earnings" | "wallet";
  locale: "sw" | "en";
  sunlightMode: boolean;
  isBodabodaRider: boolean;
  withdrawableEarningsTzs: number;
  todayNetTzs: number;
  tripsToday: number;
  floatBalanceTzs: number;
  payoutPhone: string;
  ledger: WalletLedgerRow[];
  onFloatTopup: (amountTzs: number, channel: string) => void;
  onWithdrawEarnings: (amountTzs: number, channel: string) => void;
}

const MOBILE_CHANNELS = [
  { id: "MPESA", label: "M-Pesa" },
  { id: "TIGO_PESA", label: "Tigo Pesa" },
  { id: "AIRTEL_MONEY", label: "Airtel Money" },
  { id: "HALOPESA", label: "Halopesa" },
] as const;

export function PartnerWalletPanel({
  mode,
  locale,
  sunlightMode,
  isBodabodaRider,
  withdrawableEarningsTzs,
  todayNetTzs,
  tripsToday,
  floatBalanceTzs,
  payoutPhone,
  ledger,
  onFloatTopup,
  onWithdrawEarnings,
}: PartnerWalletPanelProps) {
  const [selectedChannel, setSelectedChannel] = React.useState<string>("MPESA");
  const [topupAmount, setTopupAmount] = React.useState(5000);
  const [withdrawAmount, setWithdrawAmount] = React.useState(
    Math.min(10000, withdrawableEarningsTzs)
  );
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const threshold = PLATFORM_FINANCE.FLOAT_BLOCK_THRESHOLD_TZS; // -5,000 TZS
  const isBlocked = floatBalanceTzs < threshold;
  const healthPct = Math.max(
    0,
    Math.min(100, Math.round(((floatBalanceTzs - threshold) / 15000) * 100))
  );

  const cashShareTzs = Math.round(todayNetTzs * 0.58);
  const digitalShareTzs = Math.max(0, todayNetTzs - cashShareTzs);
  const grossEstTzs = Math.round(todayNetTzs / 0.88);
  const commEstTzs = Math.max(0, grossEstTzs - todayNetTzs);

  const cardTone = sunlightMode
    ? "border-slate-300 bg-white text-slate-950"
    : "border-slate-800 bg-slate-900 text-white";

  if (mode === "earnings") {
    return (
      <section className="space-y-4">
        <div className={cn("rounded-3xl border p-5", cardTone)}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
                {isBodabodaRider
                  ? locale === "sw"
                    ? "Mapato ya Rider wa Bodaboda"
                    : "Bodaboda Rider Net Earnings"
                  : locale === "sw"
                    ? "Mapato ya Dereva wa Bajaji"
                    : "Bajaji Driver Net Earnings"}
              </p>
              <p className="mt-1 text-3xl font-black text-emerald-500">
                {formatTzs(todayNetTzs)}
              </p>
            </div>
            <Badge tone="emerald">
              <TrendingUp className="h-3.5 w-3.5" />
              {tripsToday} {locale === "sw" ? "safari" : "trips"}
            </Badge>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div
              className={cn(
                "rounded-2xl border p-3",
                sunlightMode
                  ? "border-slate-200 bg-slate-50"
                  : "border-slate-800 bg-slate-950/70"
              )}
            >
              <div className="flex items-center gap-1.5 font-bold text-amber-500">
                <Banknote className="h-4 w-4" />
                {locale === "sw" ? "Pesa Taslimu (Cash)" : "Cash Trips (TZS)"}
              </div>
              <p className="mt-1 text-lg font-extrabold">
                {formatTzs(cashShareTzs)}
              </p>
            </div>
            <div
              className={cn(
                "rounded-2xl border p-3",
                sunlightMode
                  ? "border-slate-200 bg-slate-50"
                  : "border-slate-800 bg-slate-950/70"
              )}
            >
              <div className="flex items-center gap-1.5 font-bold text-teal-400">
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
              <span className="font-bold text-amber-500">
                -{formatTzs(commEstTzs)}
              </span>
            </div>
          </div>
        </div>

        {/* Recent Ledger Breakdown */}
        <div className={cn("space-y-2.5 rounded-3xl border p-4", cardTone)}>
          <h2 className="text-xs font-bold uppercase tracking-wide opacity-75">
            {locale === "sw"
              ? "Muhtasari wa Miamala ya Hivi Karibuni"
              : "Recent Per-Trip Ledger"}
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
                    row.deltaTzs >= 0 ? "text-emerald-500" : "text-amber-500"
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

  return (
    <section className="space-y-4">
      {feedback && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-500/50 bg-emerald-950/60 px-4 py-3 text-xs font-bold text-emerald-200">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            {feedback}
          </span>
          <button type="button" onClick={() => setFeedback(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Commission Float Health Gauge */}
      <div className={cn("space-y-3 rounded-3xl border p-5", cardTone)}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-amber-500">
              {locale === "sw"
                ? "Salio la Kamisheni (Float)"
                : "Commission Float Account"}
            </p>
            <p
              className={cn(
                "mt-1 text-3xl font-black",
                isBlocked ? "text-rose-500" : "text-amber-500"
              )}
            >
              {formatTzs(floatBalanceTzs)}
            </p>
          </div>
          <Badge tone={isBlocked ? "rose" : "emerald"}>
            {isBlocked
              ? locale === "sw"
                ? "IMEZUIWA"
                : "FLOAT BLOCKED"
              : locale === "sw"
                ? "SALAMA"
                : "HEALTHY"}
          </Badge>
        </div>

        <div className="space-y-1">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={cn(
                "h-full transition-all",
                isBlocked
                  ? "bg-rose-500"
                  : floatBalanceTzs < 0
                    ? "bg-amber-400"
                    : "bg-emerald-500"
              )}
              style={{ width: `${healthPct}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] opacity-70">
            <span>Block Limit: {formatTzs(threshold)}</span>
            <span>
              {locale === "sw"
                ? "Salio hasi husawazishwa kiotomatiki kwenye safari za kidijitali"
                : "Negative float auto-offsets on digital trips"}
            </span>
          </div>
        </div>

        {isBlocked && (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <span>
              {locale === "sw"
                ? "Ongeza salio la kamisheni kwa Mobile Money ili kurejea mtandaoni."
                : "Top up your Commission Float via Mobile Money to unlock shift dispatch."}
            </span>
          </div>
        )}

        {/* Mobile Money Channel Picker */}
        <div className="grid grid-cols-4 gap-1.5 pt-1">
          {MOBILE_CHANNELS.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => setSelectedChannel(ch.id)}
              className={cn(
                "rounded-xl border px-2 py-2 text-[11px] font-bold transition",
                selectedChannel === ch.id
                  ? "border-amber-400 bg-amber-400 text-slate-950"
                  : sunlightMode
                    ? "border-slate-300 bg-slate-50 text-slate-700"
                    : "border-slate-700 bg-slate-950 text-slate-300"
              )}
            >
              {ch.label}
            </button>
          ))}
        </div>

        {/* 1-Tap Float Top-Up */}
        <div className="space-y-2 border-t border-current/10 pt-3">
          <div className="flex items-center justify-between text-xs font-bold">
            <span>
              {locale === "sw"
                ? "Ongeza Salio la Float (1-Tap)"
                : "1-Tap Float Top-Up"}
            </span>
            <div className="flex gap-1.5">
              {[2000, 5000, 10000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setTopupAmount(amt)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                    topupAmount === amt
                      ? "bg-teal-600 text-white"
                      : "bg-slate-800 text-slate-300"
                  )}
                >
                  +{amt / 1000}k
                </button>
              ))}
            </div>
          </div>
          <Button
            type="button"
            size="md"
            variant="amber"
            className="w-full font-extrabold"
            onClick={() => {
              onFloatTopup(topupAmount, selectedChannel);
              setFeedback(
                locale === "sw"
                  ? `Umeongeza ${formatTzs(topupAmount)} kwenye Float kupitia ${selectedChannel}!`
                  : `Added ${formatTzs(topupAmount)} to Commission Float via ${selectedChannel}!`
              );
            }}
          >
            <ArrowDownLeft className="h-4 w-4" />
            {locale === "sw" ? "Ongeza Float" : "Top Up Float"}{" "}
            {formatTzs(topupAmount)} ({selectedChannel})
          </Button>
        </div>
      </div>

      {/* Withdrawable Earnings + 1-Tap Instant Payout */}
      <div className={cn("space-y-3 rounded-3xl border p-5", cardTone)}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-500">
              {locale === "sw"
                ? "Mapato Yanayoweza Kutolewa (Earnings)"
                : "Withdrawable Digital Earnings"}
            </p>
            <p className="mt-1 text-3xl font-black text-emerald-500">
              {formatTzs(withdrawableEarningsTzs)}
            </p>
          </div>
          <Wallet className="h-7 w-7 text-emerald-500" />
        </div>

        <p className="text-xs opacity-75">
          {locale === "sw" ? "Namba ya kupokea malipo:" : "Payout destination:"}{" "}
          <strong className="font-mono">{payoutPhone}</strong>
        </p>

        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1000}
            step={500}
            max={Math.max(1000, withdrawableEarningsTzs)}
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(Number(e.target.value) || 0)}
            className={cn(
              "w-36 rounded-xl border px-3 py-2 font-mono text-sm font-bold focus:outline-none",
              sunlightMode
                ? "border-slate-300 bg-slate-50 text-slate-950"
                : "border-slate-700 bg-slate-950 text-white"
            )}
          />
          <Button
            type="button"
            size="md"
            variant="primary"
            disabled={
              withdrawAmount < 1000 || withdrawAmount > withdrawableEarningsTzs
            }
            className="flex-1 font-extrabold"
            onClick={() => {
              onWithdrawEarnings(withdrawAmount, selectedChannel);
              setFeedback(
                locale === "sw"
                  ? `Malipo ya ${formatTzs(withdrawAmount)} yametumwa ${selectedChannel} (${payoutPhone})!`
                  : `Instant payout of ${formatTzs(withdrawAmount)} sent to ${selectedChannel} (${payoutPhone})!`
              );
              setWithdrawAmount(
                Math.min(10000, Math.max(0, withdrawableEarningsTzs - withdrawAmount))
              );
            }}
          >
            <ArrowUpRight className="h-4 w-4" />
            {locale === "sw" ? "Toa Sasa" : "Withdraw Now"}
          </Button>
        </div>
      </div>
    </section>
  );
}
