"use client";

import dynamic from "next/dynamic";
import { Badge, Card } from "@goboda/ui";
import { useAdminPortal } from "@/components/admin-portal-shell";

const AdminUngujaMap = dynamic(
  () => import("@/components/admin-unguja-map").then((m) => m.AdminUngujaMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 text-xs font-medium text-slate-500">
        Loading map...
      </div>
    ),
  }
);

export default function AdminLiveMapPage() {
  const { data } = useAdminPortal();
  if (!data) return null;

  return (
    <div className="space-y-5">
      <AdminUngujaMap fleet={data.fleet} sosAlerts={data.sosAlerts} />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">
              Online Unguja Fleet ({data.fleet.length})
            </h2>
            <p className="text-xs text-slate-500">
              {data.kpis.onlineRiders} Bodaboda Riders •{" "}
              {data.kpis.onlineDrivers} Bajaji Drivers •{" "}
              {data.kpis.busyOnTrips} currently on active trips
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Role &amp; Transport</th>
                <th className="px-4 py-2.5">Plate</th>
                <th className="px-4 py-2.5">Home Kituo</th>
                <th className="px-4 py-2.5">Coordinates</th>
                <th className="px-4 py-2.5">Rating</th>
                <th className="px-4 py-2.5">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.fleet.map((v) => {
                const isBoda = v.transportType === "BODABODA";
                return (
                  <tr key={v.operatorId}>
                    <td className="px-4 py-2.5 font-semibold text-slate-900">
                      {isBoda ? "Bodaboda Rider" : "Bajaji Driver"}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-800">
                      {v.plateNumber}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {v.homeKituo || "Unguja"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                      {Number(v.lat).toFixed(4)}, {Number(v.lng).toFixed(4)}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-amber-600">
                      ★ {Number(v.ratingAvg).toFixed(1)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={v.isBusy ? "amber" : "emerald"}>
                        {v.isBusy ? "On Active Trip" : "Available"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
