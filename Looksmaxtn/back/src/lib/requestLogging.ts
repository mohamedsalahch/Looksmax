import type { NextRequest } from "next/server";

export async function logRequestStart(label: string, req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  const details: Record<string, unknown> = {
    method: req.method,
    url: req.nextUrl.pathname,
    contentType,
  };

  if (contentType.includes("multipart/form-data")) {
    details.formData = "multipart";
  }

  console.log(`[request] ${label}`, details);
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
