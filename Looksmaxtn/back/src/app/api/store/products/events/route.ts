import { NextResponse } from "next/server";
import { addSSEClient, removeSSEClient } from "@/lib/sseClients";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

export async function GET() {
  const clientId = crypto.randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      addSSEClient(clientId, controller);
      // Initial comment confirms the connection without triggering onmessage
      controller.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel() {
      removeSSEClient(clientId);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      // Tells nginx not to buffer this response
      "X-Accel-Buffering": "no",
    },
  });
}
