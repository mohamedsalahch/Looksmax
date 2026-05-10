import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/store/lib/auth";
import {
  addStoreUserEventClient,
  removeStoreUserEventClient,
  sendStoreUserEvent,
} from "@/store/lib/storeUserEvents";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientId = crypto.randomUUID();
  let keepAlive: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      addStoreUserEventClient(clientId, session.userId, controller);
      sendStoreUserEvent(clientId, { type: "connected" });

      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          if (keepAlive) clearInterval(keepAlive);
          removeStoreUserEventClient(clientId);
        }
      }, 25000);

      req.signal.addEventListener("abort", () => {
        if (keepAlive) clearInterval(keepAlive);
        removeStoreUserEventClient(clientId);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      if (keepAlive) clearInterval(keepAlive);
      removeStoreUserEventClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
