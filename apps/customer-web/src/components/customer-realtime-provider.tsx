"use client";

import * as React from "react";
import type { CustomerRealtimeNotification, CustomerRealtimeSnapshot } from "@/lib/customer-realtime";

export interface CustomerLiveToast { id: string; title: string; body: string; url: string; severity: "INFO" | "URGENT" | "SUCCESS"; }

interface CustomerRealtimeContextValue {
  snapshot: CustomerRealtimeSnapshot | null;
  transport: "websocket" | "sse" | "connecting" | "offline";
  lastUpdatedAt: string | null;
  toast: CustomerLiveToast | null;
  dismissToast: () => void;
  refreshNow: () => Promise<void>;
  pushPermission: NotificationPermission | "unsupported";
  pushSubscribed: boolean;
  pushBusy: boolean;
  pushError: string | null;
  vapidConfigured: boolean;
  enableWebPush: () => Promise<boolean>;
  disableWebPush: () => Promise<void>;
  unreadCount: number;
}

const CustomerRealtimeContext = React.createContext<CustomerRealtimeContextValue | null>(null);

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function CustomerRealtimeProvider({
  locale,
  enabled = true,
  children,
}: {
  locale: "sw" | "en";
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const sw = locale === "sw";
  const [snapshot, setSnapshot] = React.useState<CustomerRealtimeSnapshot | null>(null);
  const [transport, setTransport] = React.useState<"websocket" | "sse" | "connecting" | "offline">("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<CustomerLiveToast | null>(null);
  const [pushPermission, setPushPermission] = React.useState<NotificationPermission | "unsupported">("default");
  const [pushSubscribed, setPushSubscribed] = React.useState(false);
  const [pushBusy, setPushBusy] = React.useState(false);
  const [pushError, setPushError] = React.useState<string | null>(null);
  const [vapidConfigured, setVapidConfigured] = React.useState(false);

  const applySnapshot = React.useCallback((snap: CustomerRealtimeSnapshot) => {
    setSnapshot((prev) => {
      if (prev && snap.notifications.length > 0) {
        const prevIds = new Set(prev.notifications.map((n) => n.id));
        const newest = snap.notifications.find((n) => !prevIds.has(n.id));
        if (newest) {
          setToast({ id: newest.id, title: (sw ? newest.titleSw ?? newest.title : newest.titleEn ?? newest.title), body: (sw ? newest.bodySw ?? newest.body : newest.bodyEn ?? newest.body), url: newest.url, severity: newest.severity });
        }
      }
      return snap;
    });
    setLastUpdatedAt(snap.timestamp);
    setPushSubscribed(snap.pushSubscriptionsCount > 0);
  }, [sw]);

  const refreshNow = React.useCallback(async () => {
    try {
      const res = await fetch("/api/customer/notifications", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        // build a minimal snapshot-like object
        const snap: CustomerRealtimeSnapshot = {
          version: String(Date.now()),
          timestamp: json.timestamp ?? new Date().toISOString(),
          customerId: "",
          notifications: json.notifications ?? [],
          unreadCount: json.unreadCount ?? 0,
          pushSubscriptionsCount: json.pushSubscriptionsCount ?? 0,
          activeTrip: json.activeTrip ?? null,
        };
        applySnapshot(snap);
        setVapidConfigured(Boolean(json.webPushConfigured ?? json.vapidPublicKey));
      }
    } catch {
      // ignore
    }
  }, [applySnapshot]);

  React.useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushPermission(Notification.permission);
    } else {
      setPushPermission("unsupported");
    }
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    let ws: WebSocket | null = null;
    let disposed = false;

    const connectSSE = () => {
      if (disposed) return;
      setTransport("connecting");
      es = new EventSource("/api/customer/realtime/stream");
      es.addEventListener("snapshot", (e) => {
        try {
          const snap = JSON.parse((e as MessageEvent).data) as CustomerRealtimeSnapshot;
          applySnapshot(snap);
          setTransport("sse");
        } catch { /* ignore */ }
      });
      es.addEventListener("event", (e) => {
        try {
          const evt = JSON.parse((e as MessageEvent).data);
          if (evt?.payload?.reason) void refreshNow();
        } catch { /* ignore */ }
      });
      es.onerror = () => {
        if (disposed) return;
        setTransport("offline");
        es?.close();
        es = null;
        setTimeout(connectSSE, 4000);
      };
    };

    connectSSE();

    return () => {
      disposed = true;
      es?.close();
    };
  }, [enabled, applySnapshot, refreshNow]);

  const enableWebPush = React.useCallback(async (): Promise<boolean> => {
    setPushBusy(true);
    setPushError(null);
    try {
      if (typeof window === "undefined" || !("Notification" in window)) {
        setPushError(sw ? "Kivinjari hiki hakiauni Web Push." : "This browser does not support Web Push.");
        return false;
      }
      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      if (perm !== "granted") {
        setPushError(sw ? "Ruhusa ya arifa imekataliwa." : "Notification permission blocked.");
        return false;
      }
      const keyRes = await fetch("/api/customer/push/subscribe", { cache: "no-store" });
      const keyJson = (await keyRes.json()) as { configured?: boolean; vapidPublicKey?: string | null };
      setVapidConfigured(Boolean(keyJson.configured));
      if (keyJson.vapidPublicKey && "serviceWorker" in navigator && "PushManager" in window) {
        const reg = (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyJson.vapidPublicKey) });
        }
        const jsonSub = sub.toJSON();
        if (jsonSub.endpoint && jsonSub.keys?.p256dh && jsonSub.keys?.auth) {
          const saveRes = await fetch("/api/customer/push/subscribe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ endpoint: jsonSub.endpoint, keys: { p256dh: jsonSub.keys.p256dh, auth: jsonSub.keys.auth }, userAgent: navigator.userAgent.slice(0, 280) }),
          });
          if (!saveRes.ok) throw new Error("Could not register Web Push subscription.");
        }
      }
      setPushSubscribed(true);
      await refreshNow();
      return true;
    } catch (err) {
      setPushError(err instanceof Error ? err.message : (sw ? "Imeshindwa kuwasha Web Push." : "Failed to enable Web Push."));
      return false;
    } finally {
      setPushBusy(false);
    }
  }, [sw, refreshNow]);

  const disableWebPush = React.useCallback(async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      let endpoint: string | undefined;
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) { endpoint = sub.endpoint; await sub.unsubscribe(); }
      }
      await fetch("/api/customer/push/subscribe?endpoint=" + encodeURIComponent(endpoint ?? ""), { method: "DELETE" });
      setPushSubscribed(false);
      await refreshNow();
    } finally {
      setPushBusy(false);
    }
  }, [refreshNow]);

  const value: CustomerRealtimeContextValue = {
    snapshot,
    transport,
    lastUpdatedAt,
    toast,
    dismissToast: () => setToast(null),
    refreshNow,
    pushPermission,
    pushSubscribed,
    pushBusy,
    pushError,
    vapidConfigured,
    enableWebPush,
    disableWebPush,
    unreadCount: snapshot?.unreadCount ?? 0,
  };

  return (
    <CustomerRealtimeContext.Provider value={value}>
      {children}
    </CustomerRealtimeContext.Provider>
  );
}

export function useCustomerRealtime(): CustomerRealtimeContextValue {
  const ctx = React.useContext(CustomerRealtimeContext);
  if (!ctx) {
    return {
      snapshot: null, transport: "offline", lastUpdatedAt: null, toast: null,
      dismissToast: () => {}, refreshNow: async () => {},
      pushPermission: "unsupported", pushSubscribed: false, pushBusy: false, pushError: null,
      vapidConfigured: false, enableWebPush: async () => false, disableWebPush: async () => {},
      unreadCount: 0,
    };
  }
  return ctx;
}
