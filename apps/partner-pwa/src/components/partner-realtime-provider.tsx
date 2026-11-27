"use client";

import * as React from "react";
import type {
  PartnerRealtimeNotification,
  PartnerRealtimeSnapshot,
} from "../lib/partner-realtime";

export type RealtimeTransportMode =
  | "websocket"
  | "sse"
  | "connecting"
  | "offline";

export interface PartnerLiveToast {
  id: string;
  title: string;
  body: string;
  url: string;
  severity: "INFO" | "URGENT" | "SUCCESS";
}

interface PartnerRealtimeContextValue {
  snapshot: PartnerRealtimeSnapshot | null;
  transport: RealtimeTransportMode;
  lastUpdatedAt: string | null;
  toast: PartnerLiveToast | null;
  dismissToast: () => void;
  refreshNow: () => Promise<void>;
  pushPermission: NotificationPermission | "unsupported";
  pushSubscribed: boolean;
  pushBusy: boolean;
  pushError: string | null;
  vapidConfigured: boolean;
  enableWebPush: () => Promise<boolean>;
  disableWebPush: () => Promise<void>;
}

const PartnerRealtimeContext =
  React.createContext<PartnerRealtimeContextValue | null>(null);

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function playSubtleAlertTone() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 987.77;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
  } catch {
    // Ignore autoplay restriction
  }
}

export function PartnerRealtimeProvider({
  enabled,
  locale,
  children,
}: {
  enabled: boolean;
  locale: "sw" | "en";
  children: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = React.useState<PartnerRealtimeSnapshot | null>(
    null
  );
  const [transport, setTransport] =
    React.useState<RealtimeTransportMode>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<PartnerLiveToast | null>(null);

  const [pushPermission, setPushPermission] = React.useState<
    NotificationPermission | "unsupported"
  >("default");
  const [pushSubscribed, setPushSubscribed] = React.useState(false);
  const [pushBusy, setPushBusy] = React.useState(false);
  const [pushError, setPushError] = React.useState<string | null>(null);
  const [vapidConfigured, setVapidConfigured] = React.useState(false);

  const seenNotifIdsRef = React.useRef<Set<string>>(new Set());
  const seenOfferIdsRef = React.useRef<Set<string>>(new Set());
  const initializedRef = React.useRef(false);
  const wsRef = React.useRef<WebSocket | null>(null);
  const sseRef = React.useRef<EventSource | null>(null);

  const showLiveNotification = React.useCallback(
    async (item: PartnerLiveToast) => {
      setToast(item);
      playSubtleAlertTone();
      try {
        if (
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          if ("serviceWorker" in navigator) {
            const reg = await navigator.serviceWorker.getRegistration("/partner/");
            if (reg) {
              await reg.showNotification(item.title, {
                body: item.body,
                icon: "/partner/icons/icon.svg",
                badge: "/partner/icons/icon.svg",
                tag: item.id,
                data: { url: item.url },
              });
              return;
            }
          }
          new Notification(item.title, {
            body: item.body,
            icon: "/partner/icons/icon.svg",
          });
        }
      } catch {
        // Ignore OS notification errors when blocked
      }
    },
    []
  );

  const applyIncomingSnapshot = React.useCallback(
    (next: PartnerRealtimeSnapshot) => {
      setSnapshot(next);
      setLastUpdatedAt(next.timestamp);

      if (!initializedRef.current) {
        initializedRef.current = true;
        for (const n of next.notifications) {
          seenNotifIdsRef.current.add(n.id);
        }
        for (const o of next.pendingOffers) {
          seenOfferIdsRef.current.add(o.offerId);
        }
        return;
      }

      // Check for brand-new trip offers
      for (const offer of next.pendingOffers) {
        if (!seenOfferIdsRef.current.has(offer.offerId)) {
          seenOfferIdsRef.current.add(offer.offerId);
          void showLiveNotification({
            id: `offer-${offer.offerId}`,
            title:
              locale === "sw"
                ? `Ombi Jipya: ${offer.pickupLabel}`
                : `New Trip Request: ${offer.pickupLabel}`,
            body: `${offer.pickupLabel} → ${offer.dropoffLabel} • TZS ${offer.estimatedFareTzs.toLocaleString()}`,
            url: "/partner/shift",
            severity: "SUCCESS",
          });
        }
      }

      // Check for brand-new notifications
      const brandNewNotifs: PartnerRealtimeNotification[] = [];
      for (const n of next.notifications) {
        if (!seenNotifIdsRef.current.has(n.id)) {
          seenNotifIdsRef.current.add(n.id);
          if (!n.read) {
            brandNewNotifs.push(n);
          }
        }
      }

      const newest = brandNewNotifs[0];
      if (newest) {
        const title =
          locale === "sw"
            ? newest.titleSw || newest.title
            : newest.titleEn || newest.title;
        const body =
          locale === "sw"
            ? newest.bodySw || newest.body
            : newest.bodyEn || newest.body;
        void showLiveNotification({
          id: newest.id,
          title,
          body,
          url: newest.url,
          severity: newest.severity,
        });
      }
    },
    [locale, showLiveNotification]
  );

  const refreshNow = React.useCallback(async () => {
    if (!enabled) return;
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "REFRESH" }));
        return;
      }
      const res = await fetch("/api/partner/notifications", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        notifications?: PartnerRealtimeNotification[];
        unreadCount?: number;
        pushSubscriptionsCount?: number;
        compliance?: PartnerRealtimeSnapshot["compliance"];
        timestamp?: string;
      };
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              notifications: json.notifications ?? prev.notifications,
              unreadCount: json.unreadCount ?? prev.unreadCount,
              pushSubscriptionsCount:
                json.pushSubscriptionsCount ?? prev.pushSubscriptionsCount,
              compliance: json.compliance ?? prev.compliance,
              timestamp: json.timestamp ?? new Date().toISOString(),
            }
          : prev
      );
    } catch {
      // Ignore transient network errors
    }
  }, [enabled]);

  // Detect browser Web Push capability & existing subscription status
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setPushPermission("unsupported");
      return;
    }
    setPushPermission(Notification.permission);

    if (!enabled) return;

    void (async () => {
      try {
        const statusRes = await fetch("/api/partner/push/subscribe", {
          cache: "no-store",
        });
        if (statusRes.ok) {
          const data = (await statusRes.json()) as {
            configured?: boolean;
            activeCount?: number;
          };
          setVapidConfigured(Boolean(data.configured));
          if ((data.activeCount ?? 0) > 0) {
            setPushSubscribed(true);
          }
        }
        if ("serviceWorker" in navigator && "PushManager" in window) {
          const reg = await navigator.serviceWorker.getRegistration("/partner/");
          const existing = await reg?.pushManager.getSubscription();
          if (existing) {
            setPushSubscribed(true);
          } else if (Notification.permission === "granted" && !vapidConfigured) {
            // Instant live browser notification fallback active
            setPushSubscribed(true);
          }
        }
      } catch {
        // ignore
      }
    })();
  }, [enabled, vapidConfigured]);

  // Primary WebSocket connection with automatic seamless SSE fallback
  React.useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setTransport("offline");
      return;
    }

    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;
    let useSseFallback = false;

    const clearTimers = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
    };

    const closeSockets = () => {
      clearTimers();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
      if (sseRef.current) {
        try {
          sseRef.current.close();
        } catch {
          // ignore
        }
        sseRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed) return;
      clearTimers();
      const delayMs = Math.min(15000, 1000 * Math.pow(2, attempt));
      attempt = Math.min(attempt + 1, 5);
      setTransport("connecting");
      reconnectTimer = setTimeout(() => {
        if (!disposed) connect();
      }, delayMs);
    };

    const connectSse = () => {
      closeSockets();
      if (disposed) return;
      setTransport("connecting");
      const es = new EventSource("/api/partner/realtime/stream");
      sseRef.current = es;

      es.addEventListener("open", () => {
        if (disposed) return;
        attempt = 0;
        setTransport("sse");
      });

      const handleEvent = (ev: MessageEvent) => {
        if (disposed) return;
        try {
          const parsed = JSON.parse(ev.data as string) as {
            data?: PartnerRealtimeSnapshot;
          };
          if (parsed.data) {
            setTransport("sse");
            applyIncomingSnapshot(parsed.data);
          }
        } catch {
          // ignore malformed event
        }
      };

      es.addEventListener("snapshot", handleEvent);
      es.addEventListener("update", handleEvent);

      es.onerror = () => {
        if (disposed) return;
        es.close();
        sseRef.current = null;
        scheduleReconnect();
      };
    };

    const connectWebSocket = () => {
      closeSockets();
      if (disposed) return;
      setTransport("connecting");

      let opened = false;
      const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${wsProto}//${window.location.host}/api/partner/realtime/ws`
      );
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        if (disposed) return;
        opened = true;
        attempt = 0;
        setTransport("websocket");
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "PING" }));
          }
        }, 25000);
      });

      ws.addEventListener("message", (event) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(String(event.data)) as {
            type?: string;
            data?: PartnerRealtimeSnapshot;
          };
          if ((msg.type === "SNAPSHOT" || msg.type === "UPDATE") && msg.data) {
            applyIncomingSnapshot(msg.data);
          }
        } catch {
          // ignore
        }
      });

      ws.addEventListener("close", () => {
        if (disposed) return;
        wsRef.current = null;
        clearTimers();
        if (!opened) {
          // Runtime does not upgrade WebSockets (e.g. local next start); switch cleanly to SSE stream
          useSseFallback = true;
          connectSse();
          return;
        }
        scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        if (disposed) return;
        if (!opened) {
          useSseFallback = true;
        }
      });
    };

    const connect = () => {
      if (useSseFallback || typeof WebSocket === "undefined") {
        connectSse();
      } else {
        connectWebSocket();
      }
    };

    const handleOnline = () => {
      attempt = 0;
      connect();
    };

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string } | null;
      if (data?.type === "GOBODA_PUSH_RECEIVED") {
        void refreshNow();
      }
    };

    window.addEventListener("online", handleOnline);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleSwMessage);
    }

    connect();

    return () => {
      disposed = true;
      window.removeEventListener("online", handleOnline);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleSwMessage);
      }
      closeSockets();
    };
  }, [enabled, applyIncomingSnapshot, refreshNow]);

  // Auto-dismiss live toast after 7 seconds
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  const enableWebPush = React.useCallback(async (): Promise<boolean> => {
    setPushBusy(true);
    setPushError(null);
    try {
      if (typeof window === "undefined" || !("Notification" in window)) {
        setPushError(
          locale === "sw"
            ? "Kivinjari hiki hakiauni Web Push."
            : "This browser does not support Web Push notifications."
        );
        return false;
      }

      const perm = await Notification.requestPermission();
      setPushPermission(perm);
      if (perm !== "granted") {
        setPushError(
          locale === "sw"
            ? "Ruhusa ya arifa imekataliwa kwenye kivinjari."
            : "Notification permission was blocked in browser settings."
        );
        return false;
      }

      const keyRes = await fetch("/api/partner/push/subscribe", {
        cache: "no-store",
      });
      const keyJson = (await keyRes.json()) as {
        configured?: boolean;
        vapidPublicKey?: string | null;
      };
      setVapidConfigured(Boolean(keyJson.configured));

      if (
        keyJson.vapidPublicKey &&
        "serviceWorker" in navigator &&
        "PushManager" in window
      ) {
        const reg =
          (await navigator.serviceWorker.getRegistration("/partner/")) ||
          (await navigator.serviceWorker.register("/partner/sw.js", {
            scope: "/partner/",
          }));
        await navigator.serviceWorker.ready;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(keyJson.vapidPublicKey),
          });
        }
        const jsonSub = sub.toJSON();
        if (jsonSub.endpoint && jsonSub.keys?.p256dh && jsonSub.keys?.auth) {
          const saveRes = await fetch("/api/partner/push/subscribe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              endpoint: jsonSub.endpoint,
              keys: {
                p256dh: jsonSub.keys.p256dh,
                auth: jsonSub.keys.auth,
              },
              userAgent: navigator.userAgent.slice(0, 280),
            }),
          });
          if (!saveRes.ok) {
            throw new Error("Could not register Web Push subscription.");
          }
        }
      }

      setPushSubscribed(true);
      await refreshNow();
      return true;
    } catch (err) {
      setPushError(
        err instanceof Error
          ? err.message
          : locale === "sw"
            ? "Imeshindwa kuwasha Web Push."
            : "Failed to enable Web Push."
      );
      return false;
    } finally {
      setPushBusy(false);
    }
  }, [locale, refreshNow]);

  const disableWebPush = React.useCallback(async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      let endpoint: string | undefined;
      if ("serviceWorker" in navigator && "PushManager" in window) {
        const reg = await navigator.serviceWorker.getRegistration("/partner/");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          endpoint = sub.endpoint;
          await sub.unsubscribe();
        }
      }
      await fetch("/api/partner/push/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
      setPushSubscribed(false);
      await refreshNow();
    } finally {
      setPushBusy(false);
    }
  }, [refreshNow]);

  const value: PartnerRealtimeContextValue = {
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
  };

  return (
    <PartnerRealtimeContext.Provider value={value}>
      {children}
    </PartnerRealtimeContext.Provider>
  );
}

export function usePartnerRealtime(): PartnerRealtimeContextValue {
  const ctx = React.useContext(PartnerRealtimeContext);
  if (!ctx) {
    return {
      snapshot: null,
      transport: "offline",
      lastUpdatedAt: null,
      toast: null,
      dismissToast: () => {},
      refreshNow: async () => {},
      pushPermission: "unsupported",
      pushSubscribed: false,
      pushBusy: false,
      pushError: null,
      vapidConfigured: false,
      enableWebPush: async () => false,
      disableWebPush: async () => {},
    };
  }
  return ctx;
}
