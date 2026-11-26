"use client";

import * as React from "react";
import Link from "next/link";
import { Award, HardHat, RefreshCw, ShieldAlert } from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";
import { useAdminPortal } from "@/components/admin-portal-shell";

interface HelmetsResponse {
  threshold: number;
  summary: {
    totalBodabodaRiders: number;
    verifiedSafeRiders: number;
    watchlistCount: number;
    repeatOffendersCount: number;
  };
  riders: Array<{
    profileId: string;
    operatorId: string;
    fullName: string;
    phone: string;
    plateNumber: string;
    homeKituo: string;
    kycStatus: string;
    helmetVerified: boolean;
    checks30d: number;
    compliant30d: number;
    missing30d: number;
    compliancePct: number;
    repeatOffender: boolean;
    safeRiderEligible: boolean;
  }>;
}

export default function AdminSafetyHelmetsPage() {
  const { notify, refreshOverview } = useAdminPortal();
  const [data, setData] = React.useState<HelmetsResponse | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/ops/safety/helmets", { cache: "no-store" });
    if (res.ok) setData((await res.json()) as HelmetsResponse);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function runAction(
    profileId: string,
    action: "AWARD_SAFE_BADGE" | "SUSPEND_FOR_HELMET" | "CLEAR_COACHING"
  ) {
    setBusyId(profileId);
    try {
      const res = await fetch("/api/ops/safety/helmets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileId, action }),
      });
      if (res.ok) {
        notify("emerald", `Bodaboda Rider helmet compliance updated (${action}).`);
        await Promise.all([load(), refreshOverview()]);
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <HardHat className="h-5 w-5 text-amber-600" />
            Helmet Compliance
          </h2>
          <p className="text-xs text-slate-500">
            30-day passenger helmet ratings for Bodaboda Riders (3+ misses trigger review).
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Bodaboda Riders</p>
          <p className="mt-1 text-2xl font-extrabold text-slate-900">{data?.summary.totalBodabodaRiders ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Verified Safe Riders</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700">{data?.summary.verifiedSafeRiders ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Watchlist (1–2 Missing)</p>
          <p className="mt-1 text-2xl font-extrabold text-amber-700">{data?.summary.watchlistCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Repeat Offenders (&ge; 3)</p>
          <p className="mt-1 text-2xl font-extrabold text-rose-700">{data?.summary.repeatOffendersCount ?? 0}</p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        {(data?.riders.length ?? 0) === 0 ? (
          <p className="p-8 text-center text-xs text-slate-500">
            No Bodaboda Rider profiles registered yet. Onboarded Bodaboda Riders appear here with live 30-day helmet scores.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Bodaboda Rider</th>
                  <th className="px-4 py-3">30d Compliance</th>
                  <th className="px-4 py-3">Missing Reports</th>
                  <th className="px-4 py-3">Safety Badge</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data!.riders.map((r) => (
                  <tr key={r.profileId}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/operators/${r.profileId}`}
                        className="font-bold text-teal-800 hover:underline"
                      >
                        {r.fullName}
                      </Link>
                      <div className="font-mono text-[11px] text-slate-500">
                        {r.plateNumber} • {r.homeKituo}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-extrabold text-slate-900">
                      {r.compliancePct}% ({r.compliant30d}/{r.checks30d})
                    </td>
                    <td className="px-4 py-3 font-bold text-rose-700">{r.missing30d}</td>
                    <td className="px-4 py-3">
                      {r.repeatOffender ? (
                        <Badge tone="rose">
                          <ShieldAlert className="h-3 w-3" />
                          Mandatory Review (3+)
                        </Badge>
                      ) : r.safeRiderEligible ? (
                        <Badge tone="emerald">
                          <Award className="h-3 w-3" />
                          Verified Safe Rider
                        </Badge>
                      ) : (
                        <Badge tone="amber">Inspection Needed</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busyId === r.profileId}
                          onClick={() => runAction(r.profileId, "AWARD_SAFE_BADGE")}
                        >
                          Award Safe Badge
                        </Button>
                        {r.kycStatus !== "SUSPENDED" ? (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={busyId === r.profileId}
                            onClick={() => runAction(r.profileId, "SUSPEND_FOR_HELMET")}
                          >
                            Suspend
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === r.profileId}
                            onClick={() => runAction(r.profileId, "CLEAR_COACHING")}
                          >
                            Clear &amp; Reinstate
                          </Button>
                        )}
                      </div>
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
