import type { NextRequest } from "next/server";

export async function logRequestStart(label: string, req: NextRequest) {
}

export function logRequestError(
  label: string,
  req: NextRequest,
  error: unknown,
  extra?: Record<string, unknown>
) {
  console.error(`[request] ${label} failed`, {
    method: req.method,
    url: req.nextUrl.pathname,
    contentType: req.headers.get("content-type") || "",
    ...(extra || {}),
    error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
  });
}
