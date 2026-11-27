import { metric } from "@vercel/functions";
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
  const encoder = new TextEncoder();

  metric("partner.realtime.sse_connect", 1, { outcome: "success" });

  let closed = false;
  let lastVersion = "";
  let assignedTransport: "BODABODA" | "BAJAJI" =
    partner.transportType === "BAJAJI" ? "BAJAJI" : "BODABODA";

  let cleanupFn: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendFrame = (eventName: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          cleanup();
        }
      };

      const pushSnapshot = async (force: boolean, reason: string) => {
        if (closed) return;
        try {
          const snap = await buildPartnerRealtimeSnapshot(partner);
          assignedTransport = snap.transportType;
          if (!force && snap.version === lastVersion) return;
          lastVersion = snap.version;
          sendFrame(force ? "snapshot" : "update", { reason, data: snap });
        } catch (err) {
          console.error("Partner SSE snapshot failed:", err);
        }
      };

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

      const syncTimer = setInterval(() => {
        void pushSnapshot(false, "db_sync");
      }, 2500);

      const heartbeatTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`: heartbeat ${new Date().toISOString()}\n\n`)
          );
        } catch {
          cleanup();
        }
      }, 15000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(syncTimer);
        clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      cleanupFn = cleanup;
      request.signal.addEventListener("abort", cleanup, { once: true });

      await pushSnapshot(true, "connected");
    },
    cancel() {
      cleanupFn?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
