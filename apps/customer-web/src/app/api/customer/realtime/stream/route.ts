import { metric } from "@vercel/functions";
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
  const encoder = new TextEncoder();

  metric("customer.realtime.sse_connect", 1, { outcome: "success" });

  let closed = false;
  let lastVersion = "";
  let interval: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendFrame = (eventName: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const pushSnapshot = async (force: boolean) => {
        if (closed) return;
        try {
          const snap = await buildCustomerRealtimeSnapshot(customer);
          if (!force && snap.version === lastVersion) return;
          lastVersion = snap.version;
          sendFrame("snapshot", snap);
        } catch (err) {
          sendFrame("error", { message: err instanceof Error ? err.message : "snapshot failed" });
        }
      };

      await pushSnapshot(true);

      unsubscribe = subscribeCustomerRealtimeEvents(customer.id, (event) => {
        sendFrame("event", event);
        void pushSnapshot(true);
      });

      interval = setInterval(() => {
        if (closed) return;
        void pushSnapshot(false);
      }, 2500);
    },
    cancel() {
      closed = true;
      if (interval) clearInterval(interval);
      if (unsubscribe) unsubscribe();
    },
  });

  // Ensure cleanup on client disconnect via request signal
  request.signal.addEventListener("abort", () => {
    closed = true;
    if (interval) clearInterval(interval);
    if (unsubscribe) unsubscribe();
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
