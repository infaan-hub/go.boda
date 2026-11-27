import { NextResponse } from "next/server";
import { metric, upgradeWebSocket, type WebSocketData } from "@vercel/functions";
import { verifyPartnerRequest } from "../../../../../lib/partner-auth";
import {
  buildPartnerRealtimeSnapshot,
  subscribePartnerRealtimeEvents,
} from "../../../../../lib/partner-realtime";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = await verifyPartnerRequest(request);
  if (!auth.ok) return auth.response;

  const partner = auth.partner;

  try {
    return await upgradeWebSocket(async (ws) => {
      metric("partner.realtime.ws_connect", 1, { outcome: "success" });

      let closed = false;
      let lastVersion = "";
      let assignedTransport: "BODABODA" | "BAJAJI" =
        partner.transportType === "BAJAJI" ? "BAJAJI" : "BODABODA";

      const pushSnapshot = async (force: boolean, reason: string) => {
        if (closed || ws.readyState !== 1) return;
        try {
          const snap = await buildPartnerRealtimeSnapshot(partner);
          assignedTransport = snap.transportType;
          if (!force && snap.version === lastVersion) return;
          lastVersion = snap.version;
          ws.send(
            JSON.stringify({
              type: force ? "SNAPSHOT" : "UPDATE",
              reason,
              data: snap,
            })
          );
        } catch (err) {
          console.error("Partner WS snapshot push failed:", err);
        }
      };

      // Send initial live snapshot right away
      await pushSnapshot(true, "connected");

      // Instant in-process bus push (<50ms for same-instance API mutations)
      const unsubscribe = subscribePartnerRealtimeEvents((evt) => {
        if (closed) return;
        const matchesOperator = !evt.operatorId || evt.operatorId === partner.id;
        const matchesCategory =
          !evt.transportType ||
          evt.transportType === "ALL" ||
          evt.transportType === assignedTransport;
        if (matchesOperator && matchesCategory) {
          void pushSnapshot(false, evt.reason);
        }
      });

      // Cross-instance Neon change check every 2.5s + heartbeat every 15s
      const syncTimer = setInterval(() => {
        void pushSnapshot(false, "db_sync");
      }, 2500);

      const pingTimer = setInterval(() => {
        if (!closed && ws.readyState === 1) {
          ws.send(
            JSON.stringify({ type: "PING", timestamp: new Date().toISOString() })
          );
        }
      }, 15000);

      ws.on("message", (raw: WebSocketData) => {
        try {
          const text = typeof raw === "string" ? raw : raw.toString();
          const msg = JSON.parse(text) as { type?: string };
          if (msg.type === "PING" && ws.readyState === 1) {
            ws.send(
              JSON.stringify({
                type: "PONG",
                timestamp: new Date().toISOString(),
              })
            );
          } else if (msg.type === "REFRESH") {
            void pushSnapshot(true, "client_refresh");
          }
        } catch {
          // Ignore malformed client frames
        }
      });

      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(syncTimer);
        clearInterval(pingTimer);
      };

      ws.on("close", cleanup);
      ws.on("error", cleanup);
    });
  } catch {
    // Non-Vercel local runtime (next start / dev) or plain HTTP GET without Upgrade header:
    // Return clean 426 instructing the client to seamlessly fall back to /api/partner/realtime/stream.
    metric("partner.realtime.ws_connect", 1, { outcome: "fallback_sse" });
    return NextResponse.json(
      {
        error: "WEBSOCKET_UPGRADE_UNAVAILABLE",
        fallback: "/api/partner/realtime/stream",
      },
      { status: 426 }
    );
  }
}
