import { NextRequest, NextResponse } from "next/server";
import { buildOpenApiSpec } from "@/lib/openapi";

export async function GET(req: NextRequest) {
  const spec = buildOpenApiSpec(req.nextUrl.origin);

  return NextResponse.json(spec, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
