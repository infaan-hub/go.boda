"use client";

import * as React from "react";
import { Trash2, Bike } from "lucide-react";
import { Button, Card } from "@goboda/ui";

interface RiderRow { id: string; userId: string; transportType: string; fullName: string; phone: string; plateNumber: string; kycStatus: string; isOnline: boolean; userStatus: string; }

export default function AdminRidersPage() {
  const [riders, setRiders] = React.useState<RiderRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [transport, setTransport] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (transport) params.set("transport", transport);
      const res = await fetch(`/api/ops/riders?${params.toString()}`, { cache: "no-store" });
      if (res.ok) {
        const j = await res.json();
        setRiders(j.riders ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [q, transport]);

  React.useEffect(() => { void load(); }, [load]);

  const update = async (id: string, patch: Record<string, unknown>) => {
    await fetch(`/api/ops/riders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this rider/driver?")) return;
    await fetch(`/api/ops/riders/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl uppercase text-[#17645F]">Riders & Drivers</h1>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." className="rounded-full border border-[#17645F]/20 bg-[#F3EEE8] px-3 py-1.5 text-xs" />
          <select value={transport} onChange={(e) => setTransport(e.target.value)} className="rounded-full border border-[#17645F]/20 bg-[#F3EEE8] px-3 py-1.5 text-xs">
            <option value="">All</option>
            <option value="BODABODA">Bodaboda</option>
            <option value="BAJAJI">Bajaji</option>
          </select>
        </div>
      </div>
      {loading ? <p className="text-sm text-[#17645F]/70">Loading...</p> : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-xs">
            <thead className="bg-[#F3EEE8] text-[#17645F]">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Phone</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Plate</th>
                <th className="px-3 py-2 text-left">KYC</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {riders.map((r) => (
                <tr key={r.id} className="border-t border-[#17645F]/10">
                  <td className="px-3 py-2">{r.fullName}</td>
                  <td className="px-3 py-2">{r.phone}</td>
                  <td className="px-3 py-2">{r.transportType}</td>
                  <td className="px-3 py-2">{r.plateNumber}</td>
                  <td className="px-3 py-2">
                    <select defaultValue={r.kycStatus} onChange={(e) => update(r.id, { kycStatus: e.target.value })} className="rounded border border-[#17645F]/20 bg-[#F3EEE8] px-2 py-1">
                      <option value="NOT_SUBMITTED">NOT_SUBMITTED</option>
                      <option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option>
                      <option value="APPROVED">APPROVED</option>
                      <option value="REJECTED">REJECTED</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">{r.userStatus}</td>
                  <td className="px-3 py-2 flex gap-2">
                    <button onClick={() => update(r.id, { suspend: r.userStatus !== "SUSPENDED" })} className="rounded-full border border-[#B86B2B]/30 px-2 py-0.5 text-[10px] font-bold text-[#8E4F1B]">
                      {r.userStatus === "SUSPENDED" ? "Unsuspend" : "Suspend"}
                    </button>
                    <button onClick={() => remove(r.id)} className="text-[#A93232] hover:text-[#8A2626]"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
