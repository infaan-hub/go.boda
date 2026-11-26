"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Flame, RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";
import type { AdminFleetMarker } from "@/components/admin-unguja-map";

const AdminUngujaMap = dynamic(
  () => import("@/components/admin-unguja-map").then((m) => m.AdminUngujaMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-[#17645F]/15 bg-[#EDE7DF] text-xs font-semibold text-[#17645F]/70">
        Loading Unguja Supply vs. Demand Heatmap...
      </div>
    ),
  }
);

interface HeatmapResponse {
  zones: Array<{
    id: string;
    name: string;
    idleRiders: number;
    idleDrivers: number;
    totalIdle: number;
    recentRequests24h: number;
    unmetRequests: number;
    pressure: "SURGE_HOTSPOT" | "UNDERSERVED" | "BALANCED";
    recommendation: string;
  }>;
  fleet: AdminFleetMarker[];
  demandPoints: Array<{
    id: string;
    status: string;
    pickupLabel: string;
    lat: number;
    lng: number;
  }>;
}

export default function AdminHeatmapPage() {
  const [data, setData] = React.useState<HeatmapResponse | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/ops/location/heatmap", { cache: "no-store" });
    if (res.ok) setData((await res.json()) as HeatmapResponse);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const hotspotPins = React.useMemo(
    () =>
      (data?.demandPoints ?? [])
        .filter((d) => d.status === "SEARCHING" || d.status === "NO_OPERATOR_FOUND")
        .map((d) => ({
          id: d.id,
          alertCode: "DEMAND",
          operatorPlate: d.status,
          status: "OPEN",
          lat: d.lat,
          lng: d.lng,
          reason: `Unmet Customer pickup: ${d.pickupLabel}`,
        })),
    [data]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl uppercase tracking-wide text-[#17645F]">
            <Flame className="h-5 w-5 text-[#B86B2B]" />
            Supply &amp; Demand Heatmap
          </h2>
          <p className="text-xs text-[#17645F]/70">
            Idle vehicles compared with recent requests across Unguja.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Overlay
        </Button>
      </div>

      <AdminUngujaMap fleet={data?.fleet ?? []} sosAlerts={hotspotPins} />

      <div className="grid gap-4 md:grid-cols-2">
        {(data?.zones ?? []).map((z) => (
          <Card key={z.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-[#122927]">{z.name}</h3>
                <p className="mt-0.5 text-xs text-[#17645F]/70">
                  Idle: <strong className="text-[#17645F]">{z.idleRiders} Riders</strong> •{" "}
                  <strong className="text-[#B86B2B]">{z.idleDrivers} Drivers</strong> •{" "}
                  24h Requests: <strong>{z.recentRequests24h}</strong> ({z.unmetRequests} unmet)
                </p>
              </div>
              <Badge
                tone={
                  z.pressure === "SURGE_HOTSPOT"
                    ? "rose"
                    : z.pressure === "UNDERSERVED"
                      ? "amber"
                      : "emerald"
                }
              >
                {z.pressure.replace("_", " ")}
              </Badge>
            </div>
            <p className="mt-2.5 rounded-lg bg-[#F3EEE8] px-3 py-2 text-xs text-[#122927]/85">
              {z.recommendation}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
