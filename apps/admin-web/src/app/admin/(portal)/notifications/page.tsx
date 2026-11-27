"use client";

import * as React from "react";
import { BellRing, Loader2, Send } from "lucide-react";
import { Button, Card, Badge } from "@goboda/ui";

export default function AdminNotificationsPage() {
  const [pushSubscribed, setPushSubscribed] = React.useState(false);
  const [pushBusy, setPushBusy] = React.useState(false);
  const [pushError, setPushError] = React.useState<string | null>(null);
  const [vapidConfigured, setVapidConfigured] = React.useState(false);
  const [vapidKey, setVapidKey] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<unknown>(null);
  const [locale, setLocale] = React.useState<"sw" | "en">("en");

  React.useEffect(() => {
    fetch("/api/ops/push/subscribe", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j) {
          setVapidConfigured(Boolean(j.webPushConfigured));
          setVapidKey(j.vapidPublicKey ?? null);
          setPushSubscribed((j.subscriptions ?? []).length > 0);
        }
      })
      .catch(() => null);
  }, []);

  const enable = async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      if (!("Notification" in window)) throw new Error("Unsupported");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Permission denied");
      if (vapidKey && "serviceWorker" in navigator && "PushManager" in window) {
        const reg = (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey) });
        const json = sub.toJSON();
        if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
          const r = await fetch("/api/ops/push/subscribe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth }, userAgent: navigator.userAgent.slice(0, 280) }),
          });
          if (!r.ok) throw new Error("Subscribe failed");
        }
      }
      setPushSubscribed(true);
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPushBusy(false);
    }
  };

  const disable = async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) { await sub.unsubscribe(); await fetch(`/api/ops/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: "DELETE" }); }
      } else {
        await fetch("/api/ops/push/subscribe", { method: "DELETE" });
      }
      setPushSubscribed(false);
    } finally {
      setPushBusy(false);
    }
  };

  const testAll = async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      const r = await fetch("/api/ops/notifications/test-push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const j = await r.json();
      setResult(j);
      if (!r.ok) throw new Error(j.message || "Failed");
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl uppercase text-[#17645F]">Notifications & Web Push</h1>

      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-[#122927]">Admin Web Push</p>
          <Badge tone={pushSubscribed ? "emerald" : "amber"}>{pushSubscribed ? "Enabled" : "Disabled"}</Badge>
        </div>
        <div className="flex gap-2">
          {!pushSubscribed ? (
            <Button variant="primary" disabled={pushBusy} onClick={enable}>
              {pushBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
              Enable Web Push
            </Button>
          ) : (
            <Button variant="outline" disabled={pushBusy} onClick={disable}>Disable Web Push</Button>
          )}
        </div>
        {pushError && <p className="text-xs text-[#A93232]">{pushError}</p>}
        <p className="text-xs text-[#17645F]/70">VAPID configured: {vapidConfigured ? "Yes" : "No"}</p>
      </Card>

      <Card className="space-y-3 p-5">
        <p className="text-sm font-bold text-[#122927]">Test Instant Web Push to All Devices</p>
        <p className="text-xs text-[#17645F]/70">Admin-only. Sends a test push to every active subscription.</p>
        <div className="flex items-center gap-2">
          <select value={locale} onChange={(e) => setLocale(e.target.value as "sw" | "en")} className="rounded-full border border-[#17645F]/20 bg-[#F3EEE8] px-3 py-1.5 text-xs">
            <option value="en">English</option>
            <option value="sw">Kiswahili</option>
          </select>
          <Button variant="primary" disabled={pushBusy} onClick={testAll}>
            {pushBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send Test Push to All
          </Button>
        </div>
        {result ? <pre className="mt-2 max-h-40 overflow-auto rounded bg-[#F3EEE8] p-2 text-[10px]">{JSON.stringify(result, null, 2)}</pre> : null}
      </Card>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
