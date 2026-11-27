"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, BellRing, CheckCheck, Loader2, Send } from "lucide-react";
import { Badge, Button, Card, cn } from "@goboda/ui";
import { CustomerPortalShell } from "./customer-portal-shell";
import { useCustomerRealtime } from "./customer-realtime-provider";

interface Notif {
  id: string;
  title: string;
  body: string;
  titleSw?: string;
  bodySw?: string;
  titleEn?: string;
  bodyEn?: string;
  url: string;
  read: boolean;
  createdAt: string;
  severity: "INFO" | "URGENT" | "SUCCESS";
  eventSubject: string;
}

export function CustomerNotificationsView({
  locale,
  customerId,
  customerName,
}: {
  locale: "sw" | "en";
  customerId: string;
  customerName?: string;
}) {
  const sw = locale === "sw";
  const realtime = useCustomerRealtime();
  const [items, setItems] = React.useState<Notif[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"ALL" | "UNREAD">("ALL");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/customer/notifications", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setItems(json.notifications ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => { if (realtime.snapshot) setItems(realtime.snapshot.notifications as unknown as Notif[]); }, [realtime.snapshot]);

  const markRead = async (id?: string, all?: boolean) => {
    await fetch("/api/customer/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "MARK_READ", id, all }),
    });
    await load();
  };

  const sendTest = async () => {
    await fetch("/api/customer/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "SEND_TEST_PUSH", locale }),
    });
    await load();
  };

  const shown = filter === "UNREAD" ? items.filter((n) => !n.read) : items;

  return (
    <CustomerPortalShell locale={locale} customerName={customerName} showSignOut={Boolean(customerName)}>
      <main className="mx-auto max-w-3xl space-y-5 px-4 pt-8 sm:px-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl uppercase text-[#17645F]">
            {sw ? "Arifa" : "Notifications"}
          </h1>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => markRead(undefined, true)}>
              <CheckCheck className="h-4 w-4" /> {sw ? "Soma Zote" : "Mark All Read"}
            </Button>
            <Button size="sm" variant="secondary" onClick={sendTest}>
              <Send className="h-4 w-4" /> {sw ? "Jaribu Push" : "Test Push"}
            </Button>
          </div>
        </div>

        <Card className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#17645F]/75">
              {sw ? "Web Push" : "Web Push"}
            </p>
            <Badge tone={realtime.pushSubscribed ? "emerald" : "amber"}>
              {realtime.pushSubscribed ? (sw ? "Imewashwa" : "Enabled") : (sw ? "Imezimwa" : "Disabled")}
            </Badge>
          </div>
          <div className="flex gap-2">
            {!realtime.pushSubscribed ? (
              <Button size="sm" variant="primary" disabled={realtime.pushBusy} onClick={realtime.enableWebPush}>
                {realtime.pushBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                {sw ? "Washa Web Push" : "Enable Web Push"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={realtime.pushBusy} onClick={realtime.disableWebPush}>
                {sw ? "Zima Web Push" : "Disable Web Push"}
              </Button>
            )}
          </div>
          {realtime.pushError && <p className="text-xs text-[#A93232]">{realtime.pushError}</p>}
        </Card>

        <div className="flex gap-2">
          <button onClick={() => setFilter("ALL")} className={cn("rounded-full px-3 py-1 text-xs font-bold", filter === "ALL" ? "bg-[#17645F] text-white" : "bg-[#F3EEE8] text-[#17645F]")}>{sw ? "Zote" : "All"}</button>
          <button onClick={() => setFilter("UNREAD")} className={cn("rounded-full px-3 py-1 text-xs font-bold", filter === "UNREAD" ? "bg-[#17645F] text-white" : "bg-[#F3EEE8] text-[#17645F]")}>{sw ? "Zisizosomwa" : "Unread"}</button>
        </div>

        {loading ? (
          <p className="text-sm text-[#17645F]/70">{sw ? "Inapakia..." : "Loading..."}</p>
        ) : shown.length === 0 ? (
          <Card className="p-6 text-center text-sm text-[#17645F]/70">
            {sw ? "Hakuna arifa bado." : "No notifications yet."}
          </Card>
        ) : (
          <div className="space-y-3">
            {shown.map((n) => (
              <Card key={n.id} className={cn("space-y-2 p-4", !n.read && "border-l-4 border-[#17645F]")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-[#122927]">{sw ? n.titleSw ?? n.title : n.titleEn ?? n.title}</p>
                    <p className="mt-1 text-xs text-[#17645F]/80">{sw ? n.bodySw ?? n.body : n.bodyEn ?? n.body}</p>
                    <p className="mt-1 text-[10px] text-[#17645F]/50">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                  {!n.read && (
                    <Button size="sm" variant="outline" onClick={() => markRead(n.id)}>
                      {sw ? "Soma" : "Read"}
                    </Button>
                  )}
                </div>
                {n.url && (
                  <Link href={n.url} className="text-xs font-bold text-[#17645F] underline">
                    {sw ? "Fungua" : "Open"} →
                  </Link>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </CustomerPortalShell>
  );
}
