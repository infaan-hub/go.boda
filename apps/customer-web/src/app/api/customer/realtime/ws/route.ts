import { metric, upgradeWebSocket, type WebSocketData } from "@vercel/functions";
import { verifyCustomerRequest } from "@/lib/customer-auth";
import {
  buildCustomerRealtimeSnapshot,
  subscribeCustomerRealtimeEvents,
} from "@/lib/customer-realtime";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = await verifyCustomerRequest(request);
  if (!auth.ok) return auth.response;

  const customer = auth.customer;

  try {
    return await upgradeWebSocket(async (ws) => {
      metric("customer.realtime.ws_connect", 1, { outcome: "success" });

      let closed = false;
      let lastVersion = "";
      let unsubscribe: (() => void) | null = null;
      let interval: ReturnType<typeof setInterval> | null = null;

      const pushSnapshot = async (force: boolean) => {
        if (closed || ws.readyState !== 1) return;
        try {
          const snap = await buildCustomerRealtimeSnapshot(customer);
          if (!force && snap.version === lastVersion) return;
          lastVersion = snap.version;
          ws.send(JSON.stringify({ type: "snapshot", payload: snap }));
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "snapshot failed" }));
        }
      };

      await pushSnapshot(true);

      unsubscribe = subscribeCustomerRealtimeEvents(customer.id, (event) => {
        if (closed || ws.readyState !== 1) return;
        ws.send(JSON.stringify({ type: "event", payload: event }));
        void pushSnapshot(true);
      });

      interval = setInterval(() => {
        if (closed || ws.readyState !== 1) return;
        void pushSnapshot(false);
      }, 2500);

      ws.addEventListener("close", () => {
        closed = true;
        if (interval) clearInterval(interval);
        if (unsubscribe) unsubscribe();
      });
    });
  } catch (err) {
    return new Response("WebSocket upgrade failed", { status: 500 });
  }
}
