import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/admin/lib/auth";
import {
  addAdminEventClient,
  removeAdminEventClient,
  sendAdminEvent,
} from "@/admin/lib/adminEvents";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const clientId = crypto.randomUUID();
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      addAdminEventClient(clientId, controller);
      sendAdminEvent(clientId, { type: "connected" });

      keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          if (keepAlive) clearInterval(keepAlive);
          removeAdminEventClient(clientId);
        }
      }, 25000);

      req.signal.addEventListener("abort", () => {
        if (keepAlive) clearInterval(keepAlive);
        removeAdminEventClient(clientId);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      if (keepAlive) clearInterval(keepAlive);
      removeAdminEventClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
