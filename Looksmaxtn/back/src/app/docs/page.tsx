"use client";

import Script from "next/script";
import { useCallback, useState } from "react";

declare global {
  interface Window {
    SwaggerUIBundle?: (config: Record<string, unknown>) => unknown;
  }
}

export default function DocsPage() {
  const [loadError, setLoadError] = useState<string | null>(null);

  const mountSwagger = useCallback(() => {
    if (!window.SwaggerUIBundle) {
      setLoadError("Swagger UI failed to load.");
      return;
    }

    setLoadError(null);
    window.SwaggerUIBundle({
      url: "/api/openapi",
      dom_id: "#swagger-ui",
      deepLinking: true,
      displayRequestDuration: true,
      persistAuthorization: true,
    });
  }, []);

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
      />
      <Script
        src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"
        strategy="afterInteractive"
        onLoad={mountSwagger}
        onError={() => setLoadError("Unable to load the Swagger UI script.")}
      />
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-black">Looksmaxtn Backend Docs</h1>
            <p className="mt-2 text-sm text-neutral-600">
              Swagger UI for the shared admin and storefront backend routes.
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              OpenAPI JSON: <code>/api/openapi</code>
            </p>
          </div>
          {loadError ? (
            <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {loadError}
            </div>
          ) : null}
          <div id="swagger-ui" />
        </div>
      </div>
    </>
  );
}
