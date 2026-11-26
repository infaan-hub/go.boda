"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Inbox, MessageSquare, RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@goboda/ui";
import { useAdminPortal } from "@/components/admin-portal-shell";

interface SupportInboxResponse {
  summary: {
    openTickets: number;
    totalTickets: number;
    recentChatsCount: number;
    disputedTripsCount: number;
  };
  tickets: Array<{
    id: string;
    tripId: string | null;
    tripCode: string | null;
    reporterRole: string;
    reporterPhone: string;
    category: string;
    subject: string;
    description: string;
    status: "OPEN" | "IN_REVIEW" | "RESOLVED";
    opsReplySw: string;
    opsReplyEn: string;
    createdAt: string;
  }>;
  recentChats: Array<{
    id: string;
    tripId: string;
    tripCode: string | null;
    senderRole: string;
    bodyText: string;
    createdAt: string;
  }>;
  disputedTrips: Array<{
    id: string;
    tripCode: string;
    status: string;
    pickupLabel: string;
    dropoffLabel: string;
    estimatedFareTzs: number;
    operatorPlate: string | null;
  }>;
}

export default function AdminSupportInboxPage() {
  const { notify } = useAdminPortal();
  const [data, setData] = React.useState<SupportInboxResponse | null>(null);
  const [replies, setReplies] = React.useState<Record<string, { sw: string; en: string }>>({});

  const load = React.useCallback(async () => {
    const res = await fetch("/api/ops/support/inbox", { cache: "no-store" });
    if (res.ok) setData((await res.json()) as SupportInboxResponse);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function resolveTicket(ticketId: string) {
    const entry = replies[ticketId] ?? {
      sw: "Asante kwa taarifa. Timu ya Go.boda Unguja imewasiliana na Rider/Dereva wako.",
      en: "Thank you for reporting. Go.boda Unguja Ops has contacted your Rider/Driver.",
    };
    const res = await fetch("/api/ops/support/inbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticketId,
        status: "RESOLVED",
        opsReplySw: entry.sw,
        opsReplyEn: entry.en,
      }),
    });
    if (res.ok) {
      notify("emerald", "Support ticket resolved & bilingual reply dispatched.");
      await load();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <Inbox className="h-5 w-5 text-teal-700" />
            Support &amp; Quick-Chat Triage Desk
          </h2>
          <p className="text-xs text-slate-500">
            Triage Customer lost-item reports, payment fallback disputes, and flagged in-trip quick-chat threads with SW/EN canned replies.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Inbox
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Open Support / Lost-Item Tickets</p>
          <p className="mt-1 text-2xl font-extrabold text-amber-700">{data?.summary.openTickets ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Recent Trip Quick-Chats</p>
          <p className="mt-1 text-2xl font-extrabold text-teal-800">{data?.summary.recentChatsCount ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold text-slate-500">Disputed / Cancelled Trips</p>
          <p className="mt-1 text-2xl font-extrabold text-rose-700">{data?.summary.disputedTripsCount ?? 0}</p>
        </Card>
      </div>

      {/* Support & Lost Item Tickets */}
      <Card className="p-5">
        <h3 className="text-sm font-extrabold text-slate-900">
          Customer &amp; Operator Tickets ({data?.tickets.length ?? 0})
        </h3>
        {(data?.tickets.length ?? 0) === 0 ? (
          <p className="mt-3 text-xs text-slate-500">
            Inbox zero! Lost-item reports submitted from Customer <code>/trips</code> appear here immediately.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {data!.tickets.map((tk) => (
              <div key={tk.id} className="rounded-xl border border-slate-200 p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{tk.subject}</span>
                    <Badge tone={tk.category === "LOST_ITEM" ? "amber" : "teal"}>{tk.category}</Badge>
                    <Badge tone={tk.status === "RESOLVED" ? "emerald" : "rose"}>{tk.status}</Badge>
                    {tk.tripId ? (
                      <Link
                        href={`/admin/trips/${tk.tripId}`}
                        className="font-mono font-bold text-teal-800 hover:underline"
                      >
                        Trip {tk.tripCode ?? tk.tripId.slice(0, 8)} →
                      </Link>
                    ) : null}
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">
                    {tk.reporterPhone || tk.reporterRole}
                  </span>
                </div>
                <p className="mt-1.5 text-slate-700">{tk.description}</p>

                {tk.status !== "RESOLVED" ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      placeholder="Jibu la Kiswahili (SW)..."
                      value={replies[tk.id]?.sw ?? ""}
                      onChange={(e) =>
                        setReplies((p) => ({
                          ...p,
                          [tk.id]: { sw: e.target.value, en: p[tk.id]?.en ?? "" },
                        }))
                      }
                      className="h-9 rounded-lg border border-slate-200 px-3"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="English reply (EN)..."
                        value={replies[tk.id]?.en ?? ""}
                        onChange={(e) =>
                          setReplies((p) => ({
                            ...p,
                            [tk.id]: { sw: p[tk.id]?.sw ?? "", en: e.target.value },
                          }))
                        }
                        className="h-9 flex-1 rounded-lg border border-slate-200 px-3"
                      />
                      <Button size="sm" variant="primary" onClick={() => resolveTicket(tk.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Reply &amp; Resolve
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-emerald-800">
                    Replied: {tk.opsReplyEn || tk.opsReplySw}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Quick-Chat Stream */}
      <Card className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
          <MessageSquare className="h-4 w-4 text-teal-700" />
          Recent In-Trip Bilingual Quick-Chats
        </h3>
        {(data?.recentChats.length ?? 0) === 0 ? (
          <p className="mt-3 text-xs text-slate-500">No recent quick-chat messages logged.</p>
        ) : (
          <div className="mt-3 divide-y divide-slate-100 text-xs">
            {data!.recentChats.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <span className="font-bold text-teal-800">{m.senderRole}:</span>{" "}
                  <span className="text-slate-700">{m.bodyText}</span>
                </div>
                <Link
                  href={`/admin/trips/${m.tripId}`}
                  className="font-mono text-[11px] font-bold text-teal-700 hover:underline"
                >
                  {m.tripCode ?? "View Trip"} →
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
