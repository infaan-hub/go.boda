"use client";

import * as React from "react";
import { Bell, Inbox, Loader2 } from "lucide-react";
import { useAdminPortal } from "@admin/components/admin-portal-shell";
import { AdminWebPushControls } from "@admin/components/admin-web-push-controls";

interface AdminNotification {
  id: string;
  channel: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
}

export default function AdminNotificationsPage() {
  const { locale } = useAdminPortal();
  const sw = locale === "sw";
  const [notifications, setNotifications] = React.useState<AdminNotification[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    fetch("/api/ops/notifications", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Notifications unavailable");
        return (await response.json()) as { notifications?: AdminNotification[] };
      })
      .then((result) => {
        if (active) setNotifications(result.notifications ?? []);
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <header className="border-b border-[#17645F]/15 pb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#17645F]/75">
          {sw ? "AKAUNTI YA UENDESHAJI" : "OPERATIONS ACCOUNT"}
        </p>
        <h1 className="mt-1 flex items-center gap-2 font-display text-3xl uppercase text-[#17645F]">
          <Bell className="h-6 w-6" />
          {sw ? "TAARIFA" : "NOTIFICATIONS"}
        </h1>
      </header>

      <AdminWebPushControls />

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-[#17645F]/15 bg-white p-6 text-sm text-[#17645F]">
          <Loader2 className="h-4 w-4 animate-spin" />
          {sw ? "Inapakia taarifa…" : "Loading notifications…"}
        </div>
      ) : failed ? (
        <div className="rounded-2xl border border-rose-200 bg-white p-6 text-sm text-rose-800">
          {sw ? "Taarifa hazipatikani kwa sasa." : "Notifications are unavailable right now."}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-[#17645F]/25 bg-white p-10 text-center">
          <Inbox className="h-8 w-8 text-[#17645F]/60" />
          <h2 className="mt-3 font-display text-xl uppercase text-[#17645F]">
            {sw ? "HAKUNA TAARIFA" : "NO NOTIFICATIONS"}
          </h2>
          <p className="mt-1 text-sm text-[#122927]/60">
            {sw ? "Taarifa za uendeshaji zitaonekana hapa." : "Your operations updates will appear here."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notifications.map((notification) => (
            <li key={notification.id} className="rounded-2xl border border-[#17645F]/15 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-[#17645F]">{notification.title}</h2>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[#122927]/75">{notification.body}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#17645F]/10 px-2.5 py-1 text-[10px] font-bold uppercase text-[#17645F]">
                  {notification.channel}
                </span>
              </div>
              <time className="mt-3 block text-[11px] text-[#122927]/50" dateTime={notification.createdAt}>
                {new Date(notification.createdAt).toLocaleString(sw ? "sw-TZ" : "en-TZ", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
