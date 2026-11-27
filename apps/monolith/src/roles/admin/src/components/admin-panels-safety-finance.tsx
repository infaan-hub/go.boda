"use client";

import * as React from "react";
import {
  CheckCircle2,
  HardHat,
  Scale,
  ShieldAlert,
  Siren,
  Volume2,
  Wallet,
} from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";
import type {
  AdminFinanceSummary,
  AdminHelmetFlagRow,
  AdminSosRow,
} from "./admin-types";

function formatTzs(amount: number | null | undefined): string {
  return `TZS ${Number(amount ?? 0).toLocaleString("en-TZ")}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/* ============================================================================
 * TAB 6 — FINANCE ZERO-DRIFT LEDGER & BODABODA HELMET COMPLIANCE
 * ========================================================================== */
export function FinanceCompliancePanel({
  finance,
  helmetFlags,
}: {
  finance: AdminFinanceSummary;
  helmetFlags: AdminHelmetFlagRow[];
}) {
  return (
    <div className="space-y-6">
      {/* Ledger Status */}
      <Card
        className={`p-4 ${
          finance.ledgerBalanced
            ? "border-[#17645F]/25 bg-emerald-50/50"
            : "border-[#A93232]/35 bg-[#A93232]/10"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Scale
              className={`h-5 w-5 ${
                finance.ledgerBalanced ? "text-[#17645F]" : "text-[#A93232]"
              }`}
            />
            <div>
              <h2 className="text-sm font-bold text-[#122927]">
                Ledger Status: {finance.ledgerBalanced ? "Balanced" : "Mismatch"}
              </h2>
              <p className="text-xs text-[#17645F]/80">
                {finance.totalConfirmedPayments} settled payments • Variance:{" "}
                <strong className="font-mono">
                  {formatTzs(finance.totalLedgerDriftTzs)}
                </strong>
              </p>
            </div>
          </div>
          <Badge tone={finance.ledgerBalanced ? "emerald" : "rose"}>
            {finance.ledgerBalanced ? "Balanced" : "Check Required"}
          </Badge>
        </div>
      </Card>

      {/* Financial KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">Confirmed GMV</p>
          <p className="mt-2 text-2xl font-extrabold text-[#122927]">
            {formatTzs(finance.gmvTzs)}
          </p>
          <p className="mt-1 text-[11px] text-[#17645F]/55">
            {finance.totalConfirmedPayments} settled Unguja trips
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">
            Platform Commission (12%)
          </p>
          <p className="mt-2 text-2xl font-extrabold text-[#17645F]">
            {formatTzs(finance.platformCommissionTzs)}
          </p>
          <p className="mt-1 text-[11px] text-[#17645F]/55">
            Gross fare basis (promos never penalize operators)
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">
            Operator Net Earnings (88%)
          </p>
          <p className="mt-2 text-2xl font-extrabold text-[#17645F]">
            {formatTzs(finance.operatorNetTzs)}
          </p>
          <p className="mt-1 text-[11px] text-[#17645F]/55">
            Bodaboda Riders &amp; Bajaji Drivers
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">
            Float Auto-Recovered
          </p>
          <p className="mt-2 text-2xl font-extrabold text-[#B86B2B]">
            {formatTzs(finance.floatRecoveredTzs)}
          </p>
          <p className="mt-1 text-[11px] text-[#17645F]/55">
            Offset automatically from digital fares
          </p>
        </Card>
      </div>

      {/* Float-Blocked Operators & Recent Payouts */}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#17645F]/15 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-[#A93232]" />
              <h3 className="text-sm font-extrabold text-[#122927]">
                Commission Float-Blocked Operators (&lt; -5,000 TZS)
              </h3>
            </div>
            <Badge
              tone={
                finance.floatBlockedOperators.length > 0 ? "rose" : "emerald"
              }
            >
              {finance.floatBlockedOperators.length} blocked
            </Badge>
          </div>
          {finance.floatBlockedOperators.length === 0 ? (
            <p className="p-6 text-center text-xs text-[#17645F]/70">
              All Bodaboda Riders &amp; Bajaji Drivers are within healthy
              commission float limits.
            </p>
          ) : (
            <div className="divide-y divide-[#17645F]/10">
              {finance.floatBlockedOperators.map((op) => (
                <div
                  key={op.operatorId}
                  className="flex items-center justify-between px-5 py-3 text-xs"
                >
                  <div>
                    <p className="font-mono font-semibold text-[#122927]">
                      {op.operatorId.slice(0, 8)}...
                    </p>
                    <p className="text-[11px] text-[#17645F]/55">
                      Updated {formatDate(op.updatedAt)}
                    </p>
                  </div>
                  <Badge tone="rose">{formatTzs(op.floatBalanceTzs)}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#17645F]/15 px-5 py-3.5">
            <h3 className="text-sm font-extrabold text-[#122927]">
              Recent Mobile Money Payouts
            </h3>
            <Badge tone="teal">{finance.recentPayouts.length} recent</Badge>
          </div>
          {finance.recentPayouts.length === 0 ? (
            <p className="p-6 text-center text-xs text-[#17645F]/70">
              No Mobile Money withdrawals recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-[#17645F]/10">
              {finance.recentPayouts.map((po) => (
                <div
                  key={po.id}
                  className="flex items-center justify-between gap-2 px-5 py-3 text-xs"
                >
                  <div>
                    <p className="font-bold text-[#122927]">
                      {formatTzs(po.amountTzs)} • {po.payoutChannel}
                    </p>
                    <p className="font-mono text-[11px] text-[#17645F]/70">
                      {po.destinationPhone} • {po.providerRef || "Instant"}
                    </p>
                  </div>
                  <Badge tone={po.status === "PAID" ? "emerald" : "amber"}>
                    {po.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Bodaboda Helmet Non-Compliance Queue */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#17645F]/15 px-5 py-4">
          <div className="flex items-center gap-2">
            <HardHat className="h-5 w-5 text-[#B86B2B]" />
            <div>
              <h3 className="text-sm font-extrabold text-[#122927]">
                Bodaboda Rider Helmet Compliance Queue (30-Day Window)
              </h3>
              <p className="text-xs text-[#17645F]/70">
                Riders reported without a clean passenger helmet 3+ times in 30
                days are automatically flagged for Operations review.
              </p>
            </div>
          </div>
          <Badge
            tone={
              helmetFlags.some((h) => h.flaggedForReview) ? "rose" : "emerald"
            }
          >
            {helmetFlags.filter((h) => h.flaggedForReview).length} flagged
          </Badge>
        </div>

        {helmetFlags.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#17645F]/70">
            100% helmet compliance across recent Bodaboda Rider trips.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#EDE7DF] uppercase text-[#17645F]/70">
                <tr>
                  <th className="px-5 py-2.5">Bodaboda Rider ID</th>
                  <th className="px-5 py-2.5">Missing Helmet Reports (30d)</th>
                  <th className="px-5 py-2.5">Total Checks</th>
                  <th className="px-5 py-2.5">Last Reported</th>
                  <th className="px-5 py-2.5">Compliance Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#17645F]/10">
                {helmetFlags.map((h) => (
                  <tr key={h.operatorId}>
                    <td className="px-5 py-3 font-mono font-semibold text-[#122927]">
                      {h.operatorId}
                    </td>
                    <td className="px-5 py-3 font-bold text-[#A93232]">
                      {h.missingCount30d}
                    </td>
                    <td className="px-5 py-3 text-[#17645F]/80">{h.totalChecks}</td>
                    <td className="px-5 py-3 text-[#17645F]/70">
                      {formatDate(h.lastReportedAt)}
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={h.flaggedForReview ? "rose" : "amber"}>
                        {h.flaggedForReview
                          ? "FLAGGED FOR REVIEW (3+)"
                          : "Watchlist"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================================================================
 * TAB 7 — SOS INCIDENT ROOM
 * ========================================================================== */
export function SosIncidentRoomPanel({
  sosAlerts,
  onMutated,
  onNotify,
  onPlayChime,
}: {
  sosAlerts: AdminSosRow[];
  onMutated: () => Promise<void>;
  onNotify: (tone: "emerald" | "rose", msg: string) => void;
  onPlayChime: () => void;
}) {
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function updateAlert(
    alert: AdminSosRow,
    status: "ACKNOWLEDGED" | "RESOLVED" | "FALSE_ALARM"
  ) {
    setBusyId(alert.id);
    try {
      const res = await fetch(`/api/ops/sos/${alert.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          resolutionNote:
            (notes[alert.id] ?? "").trim() ||
            (status === "ACKNOWLEDGED"
              ? "Ops Desk contacted Customer & Operator."
              : "Incident resolved safely by Unguja Ops Desk."),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        onNotify("rose", json.error || "Failed to update SOS alert");
        return;
      }
      onNotify("emerald", `SOS Alert ${alert.alertCode} updated to ${status}.`);
      await onMutated();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="border-[#A93232]/25 bg-rose-50/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Siren className="h-5 w-5 text-[#A93232]" />
            <div>
              <h2 className="text-base font-bold text-[#122927]">
                SOS Alerts
              </h2>
              <p className="text-xs text-[#17645F]/80">
                Emergency: <strong>112</strong> • Support:{" "}
                <strong>+255 770 000 112</strong>
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={onPlayChime}>
            <Volume2 className="h-3.5 w-3.5" />
            Alert Sound
          </Button>
        </div>
      </Card>

      {sosAlerts.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-[#17645F]" />
          <p className="mt-2 text-sm font-semibold text-[#122927]">
            No active SOS alerts
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {sosAlerts.map((al) => {
            const isActive =
              al.status === "OPEN" || al.status === "ACKNOWLEDGED";
            return (
              <Card
                key={al.id}
                className={`p-4 ${
                  al.status === "OPEN"
                    ? "border-2 border-rose-500 bg-rose-50/40"
                    : al.status === "ACKNOWLEDGED"
                      ? "border-[#B86B2B]/35 bg-amber-50/30"
                      : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert
                      className={`h-5 w-5 ${
                        isActive ? "text-[#A93232]" : "text-[#17645F]/55"
                      }`}
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-extrabold text-[#122927]">
                          {al.alertCode}
                        </span>
                        <Badge
                          tone={
                            al.status === "OPEN"
                              ? "rose"
                              : al.status === "ACKNOWLEDGED"
                                ? "amber"
                                : "emerald"
                          }
                        >
                          {al.status}
                        </Badge>
                        {al.tripCode ? (
                          <Badge tone="slate">Trip {al.tripCode}</Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-[#17645F]/80">
                        Triggered by <strong>{al.triggeredByRole}</strong> •{" "}
                        {al.transportType === "BAJAJI"
                          ? "Bajaji Driver"
                          : "Bodaboda Rider"}{" "}
                        ({al.operatorPlate || "N/A"}) • GPS:{" "}
                        <span className="font-mono">
                          {Number(al.lat).toFixed(4)},{" "}
                          {Number(al.lng).toFixed(4)}
                        </span>
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] text-[#17645F]/55">
                    {formatDate(al.createdAt)}
                  </span>
                </div>

                <p className="mt-2.5 rounded-lg bg-[#FAF7F2] px-3 py-2 text-xs font-medium text-[#122927] shadow-xs">
                  {al.reason}
                </p>

                {al.resolutionNote ? (
                  <p className="mt-2 text-xs text-[#17645F]">
                    Resolution Note: <strong>{al.resolutionNote}</strong>
                  </p>
                ) : null}

                {isActive ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="text"
                      value={notes[al.id] ?? ""}
                      onChange={(e) =>
                        setNotes((prev) => ({
                          ...prev,
                          [al.id]: e.target.value,
                        }))
                      }
                      placeholder="Ops dispatch note (e.g. Called Customer & Rider — safe)..."
                      className="h-9 flex-1 rounded-lg border border-[#17645F]/15 bg-[#FAF7F2] px-3 text-xs focus:border-[#17645F] focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {al.status === "OPEN" ? (
                        <Button
                          size="sm"
                          variant="amber"
                          disabled={busyId === al.id}
                          onClick={() => updateAlert(al, "ACKNOWLEDGED")}
                        >
                          Acknowledge
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busyId === al.id}
                        onClick={() => updateAlert(al, "RESOLVED")}
                      >
                        Resolve Incident
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === al.id}
                        onClick={() => updateAlert(al, "FALSE_ALARM")}
                      >
                        False Alarm
                      </Button>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
