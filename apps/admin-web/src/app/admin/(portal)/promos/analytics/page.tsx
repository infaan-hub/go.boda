"use client";

import * as React from "react";
import { RefreshCw, Save, ShieldCheck, Tag } from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";
import { useAdminPortal } from "@/components/admin-portal-shell";

interface PromoAnalyticsResponse {
  summary: {
    activeCampaigns: number;
    totalRedemptions: number;
    totalSubsidyBurnTzs: number;
    totalOperatorNetProtectedTzs: number;
  };
  campaigns: Array<{
    code: string;
    discountType: string;
    discountValue: number;
    maxDiscountTzs: number;
    active: boolean;
    maxRedemptions: number;
    budgetCapTzs: number;
    redemptionsCount: number;
    subsidyBurnTzs: number;
    grossGmvTzs: number;
    operatorNetProtectedTzs: number;
    budgetUtilizationPct: number;
  }>;
}

function fmt(n: number) {
  return `TZS ${Number(n).toLocaleString("en-TZ")}`;
}

export default function AdminPromosAnalyticsPage() {
  const { notify } = useAdminPortal();
  const [data, setData] = React.useState<PromoAnalyticsResponse | null>(null);
  const [caps, setCaps] = React.useState<Record<string, { maxRedemptions: number; budgetCapTzs: number }>>({});

  const load = React.useCallback(async () => {
    const res = await fetch("/api/ops/promos/analytics", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as PromoAnalyticsResponse;
      setData(json);
      const next: Record<string, { maxRedemptions: number; budgetCapTzs: number }> = {};
      for (const c of json.campaigns) {
        next[c.code] = { maxRedemptions: c.maxRedemptions, budgetCapTzs: c.budgetCapTzs };
      }
      setCaps(next);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function saveCap(code: string, active?: boolean) {
    const entry = caps[code];
    const res = await fetch("/api/ops/promos/analytics", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        maxRedemptions: entry?.maxRedemptions,
        budgetCapTzs: entry?.budgetCapTzs,
        ...(active !== undefined ? { active } : {}),
      }),
    });
    if (res.ok) {
      notify("emerald", `Promo campaign ${code} limits saved.`);
      await load();
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Tag className="h-5 w-5 text-teal-700" />
            Promo Usage &amp; Budgets
          </h2>
        </div>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Active Campaigns</p>
          <p className="mt-1 text-2xl font-extrabold text-teal-800">{data?.summary.activeCampaigns ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Total Redemptions</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{data?.summary.totalRedemptions ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Platform Subsidy Burn</p>
          <p className="mt-1 text-2xl font-extrabold text-amber-700">
            {fmt(data?.summary.totalSubsidyBurnTzs ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Operator Net Protected</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700">
            {fmt(data?.summary.totalOperatorNetProtectedTzs ?? 0)}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(data?.campaigns ?? []).map((c) => (
          <Card key={c.code} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-mono text-base font-extrabold text-slate-900">{c.code}</h3>
                <p className="text-xs text-slate-500">
                  {c.discountType === "PERCENT"
                    ? `${c.discountValue}% off (max ${fmt(c.maxDiscountTzs)})`
                    : `${fmt(c.discountValue)} flat discount`}
                </p>
              </div>
              <button type="button" onClick={() => saveCap(c.code, !c.active)}>
                <Badge tone={c.active ? "emerald" : "slate"}>
                  {c.active ? "Active" : "Paused"}
                </Badge>
              </button>
            </div>

            <div className="mt-4">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">
                  Subsidy Burn: <strong>{fmt(c.subsidyBurnTzs)}</strong> / {fmt(c.budgetCapTzs)}
                </span>
                <span className="font-bold text-teal-800">{c.budgetUtilizationPct}%</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-teal-600"
                  style={{ width: `${c.budgetUtilizationPct}%` }}
                />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-800">
                <ShieldCheck className="h-3.5 w-3.5" />
                {c.redemptionsCount} redemptions • Gross GMV {fmt(c.grossGmvTzs)} • Operators paid full net ({fmt(c.operatorNetProtectedTzs)})
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs">
              <label>
                <span className="text-[11px] font-semibold text-slate-500">Max Redemptions</span>
                <input
                  type="number"
                  value={caps[c.code]?.maxRedemptions ?? c.maxRedemptions}
                  onChange={(e) =>
                    setCaps((p) => ({
                      ...p,
                      [c.code]: {
                        ...(p[c.code] ?? { maxRedemptions: c.maxRedemptions, budgetCapTzs: c.budgetCapTzs }),
                        maxRedemptions: Number(e.target.value),
                      },
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 font-bold"
                />
              </label>
              <label>
                <span className="text-[11px] font-semibold text-slate-500">Budget Cap (TZS)</span>
                <input
                  type="number"
                  value={caps[c.code]?.budgetCapTzs ?? c.budgetCapTzs}
                  onChange={(e) =>
                    setCaps((p) => ({
                      ...p,
                      [c.code]: {
                        ...(p[c.code] ?? { maxRedemptions: c.maxRedemptions, budgetCapTzs: c.budgetCapTzs }),
                        budgetCapTzs: Number(e.target.value),
                      },
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 font-bold"
                />
              </label>
            </div>

            <div className="mt-3 flex justify-end">
              <Button size="sm" variant="primary" onClick={() => saveCap(c.code)}>
                <Save className="h-3.5 w-3.5" />
                Save Caps
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
