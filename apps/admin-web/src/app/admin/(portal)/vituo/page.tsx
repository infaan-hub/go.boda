"use client";

import * as React from "react";
import { MapPin, RefreshCw, Save } from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";
import { useAdminPortal } from "@/components/admin-portal-shell";

interface KituoItem {
  id: string;
  nameSw: string;
  nameEn: string;
  category: string;
  area: string;
  lat: number;
  lng: number;
  targetSupply: number;
  onlineRiders: number;
  onlineDrivers: number;
  idleAvailable: number;
  totalOnline: number;
  deficit: number;
  supplyStatus: "HEALTHY" | "LOW_SUPPLY" | "EMPTY";
}

interface VituoResponse {
  summary: {
    totalVituo: number;
    healthyCount: number;
    lowSupplyCount: number;
    emptyCount: number;
  };
  vituo: KituoItem[];
}

export default function AdminVituoDirectoryPage() {
  const { notify } = useAdminPortal();
  const [data, setData] = React.useState<VituoResponse | null>(null);
  const [targets, setTargets] = React.useState<Record<string, number>>({});
  const [search, setSearch] = React.useState("");
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/ops/vituo", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as VituoResponse;
      setData(json);
      const map: Record<string, number> = {};
      for (const v of json.vituo) map[v.id] = v.targetSupply;
      setTargets(map);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function saveTarget(kituo: KituoItem) {
    setSavingId(kituo.id);
    try {
      const targetSupply = Math.max(1, Number(targets[kituo.id] ?? kituo.targetSupply));
      const res = await fetch("/api/ops/vituo", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: kituo.id, targetSupply }),
      });
      if (res.ok) {
        notify("emerald", `Target supply for ${kituo.nameEn} set to ${targetSupply} vehicles.`);
        await load();
      }
    } finally {
      setSavingId(null);
    }
  }

  const filtered = React.useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.vituo;
    return data.vituo.filter(
      (v) =>
        v.nameEn.toLowerCase().includes(q) ||
        v.nameSw.toLowerCase().includes(q) ||
        v.area.toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <MapPin className="h-5 w-5 text-teal-700" />
            Unguja Vituo (Stages) Directory
          </h2>
          <p className="text-xs text-slate-500">
            PostGIS 2.5 km live Bodaboda Rider &amp; Bajaji Driver supply vs. target capacity across official Unguja stages.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Darajani, Mwanakwerekwe, Paje, Nungwi..."
            className="h-9 w-64 rounded-lg border border-slate-200 bg-white px-3 text-xs focus:border-teal-600 focus:outline-none"
          />
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Official Unguja Vituo</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{data?.summary.totalVituo ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Healthy Supply</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700">{data?.summary.healthyCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Low Supply Alert</p>
          <p className="mt-1 text-2xl font-extrabold text-amber-700">{data?.summary.lowSupplyCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Empty Stages (0 Online)</p>
          <p className="mt-1 text-2xl font-extrabold text-rose-700">{data?.summary.emptyCount ?? 0}</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Kituo (EN / SW)</th>
                <th className="px-4 py-3">Unguja Area</th>
                <th className="px-4 py-3">Live Fleet (2.5 km)</th>
                <th className="px-4 py-3">Supply Status</th>
                <th className="px-4 py-3">Target Supply</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900">{v.nameEn}</p>
                    <p className="text-[11px] text-slate-500">{v.nameSw}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{v.area}</td>
                  <td className="px-4 py-3 font-mono">
                    <span className="font-bold text-teal-800">{v.onlineRiders} Riders</span> •{" "}
                    <span className="font-bold text-amber-700">{v.onlineDrivers} Drivers</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        v.supplyStatus === "HEALTHY"
                          ? "emerald"
                          : v.supplyStatus === "LOW_SUPPLY"
                            ? "amber"
                            : "rose"
                      }
                    >
                      {v.supplyStatus === "HEALTHY"
                        ? "Healthy"
                        : v.supplyStatus === "LOW_SUPPLY"
                          ? `Need +${v.deficit}`
                          : `Empty (Need ${v.targetSupply})`}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={targets[v.id] ?? v.targetSupply}
                        onChange={(e) =>
                          setTargets((p) => ({ ...p, [v.id]: Number(e.target.value) }))
                        }
                        className="h-8 w-16 rounded-lg border border-slate-200 px-2 text-xs font-bold"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingId === v.id}
                        onClick={() => saveTarget(v)}
                      >
                        <Save className="h-3 w-3" />
                      </Button>
                    </div>
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
