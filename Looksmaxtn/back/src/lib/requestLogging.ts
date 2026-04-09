import type { NextRequest } from "next/server";

function summarizeValue(value: FormDataEntryValue) {
  if (value instanceof File) {
    return {
      kind: "file",
      name: value.name,
      size: value.size,
      type: value.type,
    };
  }

  const text = String(value);

  return {
    kind: "field",
    length: text.length,
    preview: text.slice(0, 120),
  };
}

export async function logRequestStart(label: string, req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  const details: Record<string, unknown> = {
    method: req.method,
    url: req.nextUrl.pathname,
    contentType,
  };

  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await req.clone().formData();
      details.formEntries = Array.from(formData.entries()).map(([key, value]) => ({
        key,
        ...summarizeValue(value),
      }));
    } catch (error) {
      details.formParseError = error instanceof Error ? error.message : String(error);
    }
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
