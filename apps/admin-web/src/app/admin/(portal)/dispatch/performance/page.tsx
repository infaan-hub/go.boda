"use client";

import * as React from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";

interface PerfResponse {
  matchWeights: {
    proximityPct: number;
    ratingPct: number;
    idleFairnessPct: number;
    offerTtlSeconds: number;
    expandingRadiiKm: number[];
  };
  summary: {
    totalOffers: number;
    acceptedCount: number;
    declinedCount: number;
    expiredCount: number;
    acceptanceRatePct: number;
    timeoutRatePct: number;
    avgMatchScore: number;
    avgRadiusKm: number;
    cooldownCandidatesCount: number;
  };
  operators: Array<{
    operatorId: string;
    fullName: string;
    plateNumber: string;
    transportType: string;
    totalOffers: number;
    acceptedCount: number;
    declinedCount: number;
    expiredCount: number;
    avgMatchScore: number;
    acceptRatePct: number;
    cooldownRecommended: boolean;
  }>;
}

export default function AdminDispatchPerformancePage() {
  const [data, setData] = React.useState<PerfResponse | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/ops/dispatch/performance", { cache: "no-store" });
    if (res.ok) setData((await res.json()) as PerfResponse);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl uppercase tracking-wide text-[#17645F]">
            <BarChart3 className="h-5 w-5 text-[#17645F]" />
            Dispatch Metrics
          </h2>
        </div>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Scoring Weights */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div>
            <p className="font-bold text-[#122927]">Dispatch Scoring</p>
            <p className="mt-0.5 text-[#17645F]/70">
              Radii: {data?.matchWeights.expandingRadiiKm.join(" → ") ?? "1.5 → 3.5 → 6.0"} km •
              Offer timeout: {data?.matchWeights.offerTtlSeconds ?? 20}s
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="teal">Proximity {data?.matchWeights.proximityPct ?? 60}%</Badge>
            <Badge tone="amber">Rating {data?.matchWeights.ratingPct ?? 25}%</Badge>
            <Badge tone="emerald">Idle {data?.matchWeights.idleFairnessPct ?? 15}%</Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">Fleet Acceptance Rate</p>
          <p className="mt-1 text-2xl font-extrabold text-[#17645F]">
            {data?.summary.acceptanceRatePct ?? 100}%
          </p>
          <p className="text-[11px] text-[#17645F]/55">
            {data?.summary.acceptedCount ?? 0} / {data?.summary.totalOffers ?? 0} offers
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">20s Timeout Rate</p>
          <p className="mt-1 text-2xl font-extrabold text-[#B86B2B]">
            {data?.summary.timeoutRatePct ?? 0}%
          </p>
          <p className="text-[11px] text-[#17645F]/55">{data?.summary.expiredCount ?? 0} expired offers</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">Avg Match Score</p>
          <p className="mt-1 text-2xl font-extrabold text-[#17645F]">
            {(data?.summary.avgMatchScore ?? 0).toFixed(2)}
          </p>
          <p className="text-[11px] text-[#17645F]/55">Avg radius: {data?.summary.avgRadiusKm ?? 1.5} km</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">Cooldown Candidates</p>
          <p className="mt-1 text-2xl font-extrabold text-[#A93232]">
            {data?.summary.cooldownCandidatesCount ?? 0}
          </p>
          <p className="text-[11px] text-[#17645F]/55">&ge; 3 declines/timeouts &amp; &lt; 50% accept</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-[#17645F]/15 px-5 py-3.5 text-sm font-extrabold text-[#122927]">
          Per-Operator Offer Fairness Breakdown
        </div>
        {(data?.operators.length ?? 0) === 0 ? (
          <p className="p-6 text-center text-xs text-[#17645F]/70">
            Operator dispatch metrics populate as trips are dispatched across Unguja.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#EDE7DF] uppercase text-[#17645F]/70">
                <tr>
                  <th className="px-4 py-2.5">Operator &amp; Plate</th>
                  <th className="px-4 py-2.5">Offers</th>
                  <th className="px-4 py-2.5">Accepted / Declined / Expired</th>
                  <th className="px-4 py-2.5">Accept Rate</th>
                  <th className="px-4 py-2.5">Cooldown Policy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#17645F]/10">
                {data!.operators.map((op) => (
                  <tr key={op.operatorId}>
                    <td className="px-4 py-2.5">
                      <span className="font-bold text-[#122927]">{op.fullName}</span>{" "}
                      <span className="font-mono text-[#17645F]/70">({op.plateNumber})</span>
                    </td>
                    <td className="px-4 py-2.5 font-bold">{op.totalOffers}</td>
                    <td className="px-4 py-2.5 font-mono">
                      <span className="text-[#17645F]">{op.acceptedCount}</span> /{" "}
                      <span className="text-[#A93232]">{op.declinedCount}</span> /{" "}
                      <span className="text-[#B86B2B]">{op.expiredCount}</span>
                    </td>
                    <td className="px-4 py-2.5 font-extrabold text-[#17645F]">{op.acceptRatePct}%</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={op.cooldownRecommended ? "rose" : "emerald"}>
                        {op.cooldownRecommended ? "15m Cooldown Advised" : "Healthy"}
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
