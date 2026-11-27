"use client";

import * as React from "react";
import Link from "next/link";
import { Radar, RefreshCw, Send } from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";
import { useAdminPortal } from "@admin/components/admin-portal-shell";

interface DispatchQueueResponse {
  summary: {
    searchingCount: number;
    offeredCount: number;
    noOperatorFoundCount: number;
    availableFleetCount: number;
  };
  pendingTrips: Array<{
    id: string;
    tripCode: string;
    transportType: "BODABODA" | "BAJAJI";
    status: string;
    pickupLabel: string;
    pickupSnapped: boolean;
    dropoffLabel: string;
    estimatedFareTzs: number;
    paymentMethod: string;
    createdAt: string;
  }>;
  activeOffers: Array<{
    id: string;
    tripCode: string | null;
    operatorPlate: string | null;
    transportType: string;
    searchRadiusKm: number;
    roundNumber: number;
    matchScore: number;
    distanceMeters: number;
    etaMinutes: number;
    status: string;
    expiresAt: string;
  }>;
  availableFleet: Array<{
    operatorId: string;
    transportType: "BODABODA" | "BAJAJI";
    plateNumber: string;
    homeKituo: string;
    ratingAvg: number;
  }>;
}

export default function AdminDispatchQueuePage() {
  const { notify, refreshOverview } = useAdminPortal();
  const [data, setData] = React.useState<DispatchQueueResponse | null>(null);
  const [selectedOp, setSelectedOp] = React.useState<Record<string, string>>({});
  const [busyTrip, setBusyTrip] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/ops/dispatch/queue", { cache: "no-store" });
    if (res.ok) setData((await res.json()) as DispatchQueueResponse);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function manualAssign(tripId: string) {
    const operatorId = selectedOp[tripId];
    if (!operatorId) return;
    setBusyTrip(tripId);
    try {
      const res = await fetch("/api/ops/dispatch/queue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tripId, operatorId }),
      });
      const json = (await res.json()) as { operatorPlate?: string; message?: string; error?: string };
      if (!res.ok) {
        notify("rose", json.message || json.error || "Manual override failed");
        return;
      }
      notify("emerald", `Trip manually assigned to ${json.operatorPlate}.`);
      await Promise.all([load(), refreshOverview()]);
    } finally {
      setBusyTrip(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl uppercase tracking-wide text-[#17645F]">
            <Radar className="h-5 w-5 text-[#17645F]" />
            Dispatch Queue
          </h2>
        </div>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">Searching</p>
          <p className="mt-1 text-2xl font-extrabold text-[#B86B2B]">{data?.summary.searchingCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">Active 20s Offers</p>
          <p className="mt-1 text-2xl font-extrabold text-[#17645F]">{data?.summary.offeredCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">No Operator Found</p>
          <p className="mt-1 text-2xl font-extrabold text-[#A93232]">{data?.summary.noOperatorFoundCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">Idle Online Fleet</p>
          <p className="mt-1 text-2xl font-extrabold text-[#17645F]">{data?.summary.availableFleetCount ?? 0}</p>
        </Card>
      </div>

      {/* Pending / Unmatched Trips + Manual Override */}
      <Card className="p-5">
        <h3 className="text-sm font-extrabold text-[#122927]">
          Pending &amp; Unmatched Unguja Requests ({data?.pendingTrips.length ?? 0})
        </h3>
        {(data?.pendingTrips.length ?? 0) === 0 ? (
          <p className="mt-3 text-xs text-[#17645F]/70">
            No pending requests.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {data!.pendingTrips.map((tr) => {
              const eligible = data!.availableFleet.filter(
                (f) => f.transportType === tr.transportType
              );
              return (
                <div
                  key={tr.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#17645F]/15 p-3.5 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/trips/${tr.id}`}
                        className="font-mono font-extrabold text-[#17645F] hover:underline"
                      >
                        {tr.tripCode}
                      </Link>
                      <Badge tone={tr.status === "NO_OPERATOR_FOUND" ? "rose" : "amber"}>
                        {tr.status}
                      </Badge>
                      <Badge tone="slate">{tr.transportType}</Badge>
                    </div>
                    <p className="mt-1 text-[#122927]/85">
                      {tr.pickupLabel} → <strong>{tr.dropoffLabel}</strong> • TZS{" "}
                      {tr.estimatedFareTzs.toLocaleString("en-TZ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedOp[tr.id] ?? ""}
                      onChange={(e) =>
                        setSelectedOp((p) => ({ ...p, [tr.id]: e.target.value }))
                      }
                      className="h-9 rounded-lg border border-[#17645F]/15 bg-[#FAF7F2] px-2.5 text-xs"
                    >
                      <option value="">Select idle {tr.transportType === "BODABODA" ? "Rider" : "Driver"}...</option>
                      {eligible.map((f) => (
                        <option key={f.operatorId} value={f.operatorId}>
                          {f.plateNumber} ({f.homeKituo} • ★{Number(f.ratingAvg).toFixed(1)})
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      disabled={!selectedOp[tr.id] || busyTrip === tr.id}
                      onClick={() => manualAssign(tr.id)}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Assign
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Recent Dispatch Offer Waves */}
      <Card className="overflow-hidden">
        <div className="border-b border-[#17645F]/15 px-5 py-3.5 text-sm font-extrabold text-[#122927]">
          Recent Dispatch Offer Waves (1.5 / 3.5 / 6.0 km)
        </div>
        {(data?.activeOffers.length ?? 0) === 0 ? (
          <p className="p-6 text-center text-xs text-[#17645F]/70">No dispatch offer waves logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#EDE7DF] uppercase text-[#17645F]/70">
                <tr>
                  <th className="px-4 py-2.5">Trip</th>
                  <th className="px-4 py-2.5">Plate</th>
                  <th className="px-4 py-2.5">Wave &amp; Radius</th>
                  <th className="px-4 py-2.5">Match Score</th>
                  <th className="px-4 py-2.5">ETA</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#17645F]/10">
                {data!.activeOffers.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5 font-mono font-bold">{o.tripCode ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono">{o.operatorPlate ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      Round {o.roundNumber} ({o.searchRadiusKm} km)
                    </td>
                    <td className="px-4 py-2.5 font-mono font-bold text-[#17645F]">
                      {Number(o.matchScore).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5">{o.etaMinutes} min</td>
                    <td className="px-4 py-2.5">
                      <Badge
                        tone={
                          o.status === "ACCEPTED"
                            ? "emerald"
                            : o.status === "PENDING"
                              ? "amber"
                              : "slate"
                        }
                      >
                        {o.status}
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
