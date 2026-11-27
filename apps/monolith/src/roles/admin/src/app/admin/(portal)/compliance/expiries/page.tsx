"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarClock, MessageCircle, PauseCircle, RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";
import { useAdminPortal } from "@admin/components/admin-portal-shell";

interface ExpiryItem {
  id: string;
  transportType: "BODABODA" | "BAJAJI";
  fullName: string;
  phone: string;
  homeKituo: string;
  plateNumber: string;
  licenseNo: string;
  licenseExpiry: string | null;
  insuranceExpiry: string | null;
  licenseDaysLeft: number | null;
  insuranceDaysLeft: number | null;
  kycStatus: string;
  bucket: "EXPIRED" | "7D" | "14D" | "30D" | "VALID" | "MISSING";
  whatsappUrl: string;
}

interface ExpiriesResponse {
  summary: {
    expired: number;
    within7d: number;
    within14d: number;
    within30d: number;
    valid: number;
    missing: number;
  };
  items: ExpiryItem[];
}

export default function AdminComplianceExpiriesPage() {
  const { notify, refreshOverview } = useAdminPortal();
  const [data, setData] = React.useState<ExpiriesResponse | null>(null);
  const [bucket, setBucket] = React.useState<string>("ALL");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/ops/compliance/expiries", { cache: "no-store" });
    if (res.ok) setData((await res.json()) as ExpiriesResponse);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function autoPauseExpired() {
    setBusy(true);
    try {
      const res = await fetch("/api/ops/compliance/expiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "AUTO_PAUSE_EXPIRED" }),
      });
      const json = (await res.json()) as { pausedCount?: number };
      notify(
        "emerald",
        `Auto-pause complete: ${json.pausedCount ?? 0} expired operator(s) set offline.`
      );
      await Promise.all([load(), refreshOverview()]);
    } finally {
      setBusy(false);
    }
  }

  async function sendReminder(item: ExpiryItem) {
    await fetch("/api/ops/compliance/expiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "LOG_REMINDER",
        operatorId: item.id,
        phone: item.phone,
        fullName: item.fullName,
        plateNumber: item.plateNumber,
      }),
    });
    notify("emerald", `WhatsApp renewal reminder logged for ${item.fullName}.`);
    window.open(item.whatsappUrl, "_blank", "noopener,noreferrer");
  }

  const filtered = React.useMemo(() => {
    if (!data) return [];
    if (bucket === "ALL") return data.items;
    return data.items.filter((i) => i.bucket === bucket);
  }, [data, bucket]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl uppercase tracking-wide text-[#17645F]">
            <CalendarClock className="h-5 w-5 text-[#B86B2B]" />
            License &amp; Insurance Expiries
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
            Reload
          </Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={autoPauseExpired}>
            <PauseCircle className="h-3.5 w-3.5" />
            Auto-Pause Expired ({data?.summary.expired ?? 0})
          </Button>
        </div>
      </div>

      {/* Bucket KPI Pills */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            ["EXPIRED", "Expired", data?.summary.expired ?? 0, "text-[#A93232]"],
            ["7D", "Expiring ≤ 7d", data?.summary.within7d ?? 0, "text-[#A93232]"],
            ["14D", "Expiring ≤ 14d", data?.summary.within14d ?? 0, "text-[#B86B2B]"],
            ["30D", "Expiring ≤ 30d", data?.summary.within30d ?? 0, "text-[#B86B2B]"],
            ["ALL", "All Operators", data?.items.length ?? 0, "text-[#17645F]"],
          ] as const
        ).map(([key, label, count, color]) => (
          <button
            key={key}
            type="button"
            onClick={() => setBucket(key)}
            className={`rounded-2xl border p-4 text-left transition ${
              bucket === key ? "border-[#17645F] bg-[#17645F]/10 shadow-sm" : "border-[#17645F]/15 bg-[#FAF7F2] hover:bg-[#F3EEE8]"
            }`}
          >
            <p className="text-xs font-semibold text-[#17645F]/70">{label}</p>
            <p className={`mt-1 text-2xl font-extrabold ${color}`}>{count}</p>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#17645F]/70">
            No operators in this expiry bucket.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#EDE7DF] uppercase text-[#17645F]/70">
                <tr>
                  <th className="px-4 py-3">Operator &amp; Plate</th>
                  <th className="px-4 py-3">Driving License Expiry</th>
                  <th className="px-4 py-3">Insurance Expiry</th>
                  <th className="px-4 py-3">Urgency</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#17645F]/10">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F3EEE8]/70">
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/operators/${item.id}`}
                        className="font-bold text-[#17645F] hover:underline"
                      >
                        {item.fullName}
                      </Link>
                      <div className="text-[11px] text-[#17645F]/70">
                        {item.transportType === "BODABODA" ? "Bodaboda Rider" : "Bajaji Driver"} •{" "}
                        <span className="font-mono">{item.plateNumber}</span> • {item.homeKituo}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {item.licenseExpiry?.slice(0, 10) ?? "Missing"}
                      {item.licenseDaysLeft !== null ? (
                        <span className="ml-1.5 text-[11px] text-[#17645F]/70">
                          ({item.licenseDaysLeft}d)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {item.insuranceExpiry?.slice(0, 10) ?? "Missing"}
                      {item.insuranceDaysLeft !== null ? (
                        <span className="ml-1.5 text-[11px] text-[#17645F]/70">
                          ({item.insuranceDaysLeft}d)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          item.bucket === "EXPIRED" || item.bucket === "7D"
                            ? "rose"
                            : item.bucket === "14D" || item.bucket === "30D"
                              ? "amber"
                              : "emerald"
                        }
                      >
                        {item.bucket}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" onClick={() => sendReminder(item)}>
                        <MessageCircle className="h-3.5 w-3.5 text-[#17645F]" />
                        WhatsApp Remind
                      </Button>
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
