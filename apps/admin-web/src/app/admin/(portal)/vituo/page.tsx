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
          <h2 className="flex items-center gap-2 font-display text-2xl uppercase tracking-wide text-[#17645F]">
            <MapPin className="h-5 w-5 text-[#17645F]" />
            Unguja Vituo
          </h2>
          <p className="text-xs text-[#17645F]/70">
            Active vehicles within 2.5 km vs. target supply per stage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Darajani, Mwanakwerekwe, Paje, Nungwi..."
            className="h-9 w-64 rounded-lg border border-[#17645F]/15 bg-[#FAF7F2] px-3 text-xs focus:border-[#17645F] focus:outline-none"
          />
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">Official Unguja Vituo</p>
          <p className="mt-1 text-2xl font-extrabold text-[#122927]">{data?.summary.totalVituo ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">Healthy Supply</p>
          <p className="mt-1 text-2xl font-extrabold text-[#17645F]">{data?.summary.healthyCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">Low Supply Alert</p>
          <p className="mt-1 text-2xl font-extrabold text-[#B86B2B]">{data?.summary.lowSupplyCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-[#17645F]/70">Empty Stages (0 Online)</p>
          <p className="mt-1 text-2xl font-extrabold text-[#A93232]">{data?.summary.emptyCount ?? 0}</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#EDE7DF] uppercase text-[#17645F]/70">
              <tr>
                <th className="px-4 py-3">Kituo (EN / SW)</th>
                <th className="px-4 py-3">Unguja Area</th>
                <th className="px-4 py-3">Live Fleet (2.5 km)</th>
                <th className="px-4 py-3">Supply Status</th>
                <th className="px-4 py-3">Target Supply</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#17645F]/10">
              {filtered.map((v) => (
                <tr key={v.id} className="hover:bg-[#F3EEE8]/70">
                  <td className="px-4 py-3">
                    <p className="font-bold text-[#122927]">{v.nameEn}</p>
                    <p className="text-[11px] text-[#17645F]/70">{v.nameSw}</p>
                  </td>
                  <td className="px-4 py-3 text-[#17645F]/80">{v.area}</td>
                  <td className="px-4 py-3 font-mono">
                    <span className="font-bold text-[#17645F]">{v.onlineRiders} Riders</span> •{" "}
                    <span className="font-bold text-[#B86B2B]">{v.onlineDrivers} Drivers</span>
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
                        className="h-8 w-16 rounded-lg border border-[#17645F]/15 px-2 text-xs font-bold"
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
