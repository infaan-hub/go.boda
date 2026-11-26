"use client";

import * as React from "react";
import { Megaphone, Send } from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";
import { useAdminPortal } from "@/components/admin-portal-shell";

interface BroadcastRow {
  id: string;
  channel: string;
  eventSubject: string;
  title: string;
  body: string;
  payload: { segment?: string; recipientCount?: number; sentByAdminName?: string };
  status: string;
  createdAt: string;
}

const TEMPLATES = [
  {
    label: "Stone Town Detour",
    segment: "STONE_TOWN_RIDERS" as const,
    titleSw: "Mabadiliko ya Njia — Creek Road",
    bodySw: "Tafadhali tumia geti la Darajani na Forodhani kwa saa 2 zijazo kutokana na msongamano.",
    titleEn: "Stone Town Detour — Creek Road",
    bodyEn: "Please use Darajani and Forodhani pickup gates for the next 2 hours due to congestion.",
  },
  {
    label: "Rain Safety Advisory",
    segment: "ALL_OPERATORS" as const,
    titleSw: "Tahadhari ya Mvua Unguja",
    bodySw: "Endesha kwa uangalifu barabarani. Kikomo cha nauli ya mvua (1.15x) kimewashwa.",
    titleEn: "Unguja Heavy Rain Safety Advisory",
    bodyEn: "Drive safely on wet roads. Rain fare multiplier (1.15x) is active across Unguja.",
  },
  {
    label: "Float Top-Up Reminder",
    segment: "FLOAT_BLOCKED" as const,
    titleSw: "Ongeza Salio la Kamisheni",
    bodySw: "Salio lako la kamisheni limezidi -5,000 TZS. Ongeza kupitia Pesa kwa Simu ili kurejea mtandaoni.",
    titleEn: "Commission Float Top-Up Reminder",
    bodyEn: "Your commission float is below -5,000 TZS. Top up via Mobile Money to resume accepting trips.",
  },
];

export default function AdminBroadcastsPage() {
  const { notify } = useAdminPortal();
  const [broadcasts, setBroadcasts] = React.useState<BroadcastRow[]>([]);
  const [form, setForm] = React.useState({
    segment: "ALL_OPERATORS",
    channel: "WHATSAPP",
    titleSw: "",
    bodySw: "",
    titleEn: "",
    bodyEn: "",
  });
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/ops/broadcasts", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { broadcasts: BroadcastRow[] };
      setBroadcasts(json.broadcasts);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function sendBroadcast(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/ops/broadcasts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { recipientCount?: number; message?: string };
      if (!res.ok) {
        notify("rose", json.message || "Broadcast failed");
        return;
      }
      notify(
        "emerald",
        `Bilingual broadcast queued for ${json.recipientCount ?? 0} recipient(s) in ${form.segment}.`
      );
      setForm((f) => ({ ...f, titleSw: "", bodySw: "", titleEn: "", bodyEn: "" }));
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Megaphone className="h-5 w-5 text-teal-700" />
          Broadcasts
        </h2>
        <p className="text-xs text-slate-500">
          Send Kiswahili and English updates to Riders, Drivers, or Customers.
        </p>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <span className="text-[11px] font-bold uppercase text-slate-500">Quick Templates:</span>
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.label}
              type="button"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  segment: tpl.segment,
                  titleSw: tpl.titleSw,
                  bodySw: tpl.bodySw,
                  titleEn: tpl.titleEn,
                  bodyEn: tpl.bodyEn,
                }))
              }
              className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100"
            >
              {tpl.label}
            </button>
          ))}
        </div>

        <form onSubmit={sendBroadcast} className="space-y-4 text-xs">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="font-semibold text-slate-600">Target Unguja Segment</span>
              <select
                value={form.segment}
                onChange={(e) => setForm((f) => ({ ...f, segment: e.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-semibold"
              >
                <option value="ALL_OPERATORS">All Riders &amp; Drivers</option>
                <option value="BODABODA_RIDERS">Bodaboda Riders Only</option>
                <option value="BAJAJI_DRIVERS">Bajaji Drivers Only</option>
                <option value="STONE_TOWN_RIDERS">Online Stone Town Riders</option>
                <option value="FLOAT_BLOCKED">Float-Blocked Operators (&lt; -5,000 TZS)</option>
                <option value="ALL_CUSTOMERS">All Unguja Customers</option>
              </select>
            </label>
            <label>
              <span className="font-semibold text-slate-600">Delivery Channel</span>
              <select
                value={form.channel}
                onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-semibold"
              >
                <option value="WHATSAPP">WhatsApp Business (Primary)</option>
                <option value="WEB_PUSH">PWA Web Push</option>
                <option value="SMS">Tanzania SMS Fallback</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="font-bold text-teal-800">Kiswahili (SW)</p>
              <input
                type="text"
                required
                placeholder="Kichwa cha ujumbe (SW)..."
                value={form.titleSw}
                onChange={(e) => setForm((f) => ({ ...f, titleSw: e.target.value }))}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3"
              />
              <textarea
                required
                rows={3}
                placeholder="Ujumbe kamili kwa Kiswahili..."
                value={form.bodySw}
                onChange={(e) => setForm((f) => ({ ...f, bodySw: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white p-3"
              />
            </div>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="font-bold text-slate-800">English (EN)</p>
              <input
                type="text"
                required
                placeholder="Broadcast title (EN)..."
                value={form.titleEn}
                onChange={(e) => setForm((f) => ({ ...f, titleEn: e.target.value }))}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3"
              />
              <textarea
                required
                rows={3}
                placeholder="Full broadcast message in English..."
                value={form.bodyEn}
                onChange={(e) => setForm((f) => ({ ...f, bodyEn: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white p-3"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={busy}>
              <Send className="h-3.5 w-3.5" />
              {busy ? "Dispatching..." : "Send Bilingual Broadcast"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-extrabold text-slate-900">
          Sent Unguja Ops Broadcast Log ({broadcasts.length})
        </h3>
        {broadcasts.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No broadcasts sent yet.</p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100">
            {broadcasts.map((b) => (
              <div key={b.id} className="py-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{b.title}</span>
                    <Badge tone="teal">{b.payload?.segment ?? b.eventSubject}</Badge>
                    <Badge tone="slate">{b.channel}</Badge>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {b.payload?.recipientCount ?? 0} targets •{" "}
                    {new Date(b.createdAt).toLocaleString("en-GB")}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line text-slate-600">{b.body}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
