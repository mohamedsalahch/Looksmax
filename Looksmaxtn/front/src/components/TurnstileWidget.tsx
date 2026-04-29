"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileWindow = Window & {
  turnstile?: {
    render: (
      element: HTMLElement,
      options: {
        sitekey: string;
        action?: string;
        callback?: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: () => void;
        size?: "normal" | "flexible" | "compact";
      }
    ) => string;
    reset: (widgetId?: string) => void;
    remove: (widgetId: string) => void;
  };
};

export default function TurnstileWidget({
  action,
  resetKey,
  onVerify,
  onConfiguredChange,
}: {
  action: string;
  resetKey: number;
  onVerify: (token: string) => void;
  onConfiguredChange?: (configured: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef("");
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/turnstile-config", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        const nextSiteKey = String(data.siteKey || "");
        setSiteKey(nextSiteKey);
        onConfiguredChange?.(Boolean(nextSiteKey));
      })
      .catch(() => {
        if (cancelled) return;
        setSiteKey("");
        onConfiguredChange?.(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onConfiguredChange]);

  const renderWidget = useCallback(() => {
    const turnstile = (window as TurnstileWindow).turnstile;
    const node = containerRef.current;
    if (!turnstile || !node || !siteKey || widgetIdRef.current) return;

    widgetIdRef.current = turnstile.render(node, {
      sitekey: siteKey,
      action,
      callback: onVerify,
      "expired-callback": () => onVerify(""),
      "error-callback": () => onVerify(""),
      size: "flexible",
    });
  }, [action, onVerify, siteKey]);

  useEffect(() => {
    renderWidget();
  }, [renderWidget, scriptReady]);

  useEffect(() => {
    const turnstile = (window as TurnstileWindow).turnstile;
    if (turnstile && widgetIdRef.current) {
      turnstile.reset(widgetIdRef.current);
      onVerify("");
    }
  }, [onVerify, resetKey]);

  useEffect(() => {
    return () => {
      const turnstile = (window as TurnstileWindow).turnstile;
      if (turnstile && widgetIdRef.current) {
        turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = "";
      }
    };
  }, []);

  if (siteKey === null || siteKey === "") {
    return null;
  }

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onReady={() => setScriptReady(true)}
      />
      <div className="min-h-[65px] w-full">
        <div ref={containerRef} className="cf-turnstile w-full" />
      </div>
    </>
  );
}
