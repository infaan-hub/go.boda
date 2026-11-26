"use client";

import * as React from "react";
import { AlertTriangle, Radio, RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";

interface TelemetryResponse {
  summary: {
    totalTracked: number;
    freshOnline: number;
    staleCount: number;
    anomalyCount: number;
    breadcrumbCount: number;
  };
  devices: Array<{
    operatorId: string;
    transportType: string;
    plateNumber: string;
    homeKituo: string;
    isOnline: boolean;
    isBusy: boolean;
    isDemo: boolean;
    lat: number;
    lng: number;
    speedKmh: number;
    pingAgeSeconds: number;
    inUnguja: boolean;
    healthStatus: "FRESH" | "STALE" | "ANOMALY" | "OFFLINE";
    lastSeenAt: string;
  }>;
  breadcrumbs: Array<{
    id: string;
    tripCode: string | null;
    lat: number;
    lng: number;
    speedKmh: number;
    recordedAt: string;
  }>;
}

export default function AdminFleetTelemetryPage() {
  const [data, setData] = React.useState<TelemetryResponse | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/ops/location/telemetry", { cache: "no-store" });
    if (res.ok) setData((await res.json()) as TelemetryResponse);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <Radio className="h-5 w-5 text-teal-700" />
            GPS Health &amp; Heartbeat Monitor
          </h2>
          <p className="text-xs text-slate-500">
            Live operator telemetry freshness (&lt; 45s SLA), PostGIS Unguja geofence spoofing detection, and recent trip breadcrumb trails.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Poll Telemetry
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Fresh Online (&lt; 45s)</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700">{data?.summary.freshOnline ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Stale Heartbeats (&gt; 45s)</p>
          <p className="mt-1 text-2xl font-extrabold text-amber-700">{data?.summary.staleCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">GPS / Geofence Anomalies</p>
          <p className="mt-1 text-2xl font-extrabold text-rose-700">{data?.summary.anomalyCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Recent Trip Breadcrumbs</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{data?.summary.breadcrumbCount ?? 0}</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3.5 text-sm font-extrabold text-slate-900">
          Live Operator GPS Heartbeats
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Vehicle &amp; Plate</th>
                <th className="px-4 py-2.5">GPS Coords</th>
                <th className="px-4 py-2.5">Speed</th>
                <th className="px-4 py-2.5">Unguja Polygon</th>
                <th className="px-4 py-2.5">Ping Age</th>
                <th className="px-4 py-2.5">Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.devices ?? []).map((d) => (
                <tr key={d.operatorId}>
                  <td className="px-4 py-2.5">
                    <span className="font-bold text-slate-900">
                      {d.transportType === "BODABODA" ? "Bodaboda Rider" : "Bajaji Driver"}
                    </span>{" "}
                    <span className="font-mono text-slate-600">({d.plateNumber})</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">
                    {Number(d.lat).toFixed(4)}, {Number(d.lng).toFixed(4)}
                  </td>
                  <td className="px-4 py-2.5 font-mono">{Number(d.speedKmh).toFixed(0)} km/h</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={d.inUnguja ? "emerald" : "rose"}>
                      {d.inUnguja ? "Inside Unguja" : "OUTSIDE!"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-600">
                    {d.isDemo ? "Demo pin" : `${d.pingAgeSeconds}s ago`}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      tone={
                        d.healthStatus === "FRESH"
                          ? "emerald"
                          : d.healthStatus === "ANOMALY"
                            ? "rose"
                            : d.healthStatus === "STALE"
                              ? "amber"
                              : "slate"
                      }
                    >
                      {d.healthStatus === "ANOMALY" ? <AlertTriangle className="h-3 w-3" /> : null}
                      {d.healthStatus}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
