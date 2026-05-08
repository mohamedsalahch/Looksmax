"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "flexible" | "compact";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [siteKey, setSiteKey] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/turnstile-config", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setSiteKey(String(data.siteKey || ""));
      })
      .catch(() => {
        if (!cancelled) setSiteKey("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!siteKey) return;
    if (!scriptReady) return;
    if (!widgetRef.current) return;
    if (widgetIdRef.current) return;
    if (!window.turnstile) return;

    widgetIdRef.current = window.turnstile.render(widgetRef.current, {
      sitekey: siteKey,
      action: "admin_forgot_password",
      callback: (token: string) => setTurnstileToken(token),
      "error-callback": () => setTurnstileToken(""),
      "expired-callback": () => setTurnstileToken(""),
      theme: "auto",
      size: "flexible",
    });

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, scriptReady]);

  const turnstileRequired = Boolean(siteKey);

  const resetTurnstile = () => {
    setTurnstileToken("");
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  };

  const submitRequest = async () => {
    setLoading(true);
    setError("");
    setMessage("");

    if (turnstileRequired && !turnstileToken) {
      setError("Please complete the security check.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "We could not send the reset email.");
        if (typeof data.retryAfterSeconds === "number") {
          setResendCooldown(data.retryAfterSeconds);
        }
        resetTurnstile();
        return;
      }

      setMessage(data.message || "If the email exists, a reset link has been sent.");
      setResendCooldown(Number(data.resendAvailableAfterSeconds || 60));
      resetTurnstile();
    } catch {
      setError("Network error while requesting the reset email.");
      resetTurnstile();
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitRequest();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
      {turnstileRequired && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setScriptReady(true)}
          onReady={() => setScriptReady(true)}
        />
      )}

      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <Link href="/">
            <h1 className="text-lg font-semibold tracking-[0.3em] uppercase text-text-primary">
              LOOKSMAX
            </h1>
          </Link>

        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="border border-[#BD3100] bg-[#faf3f2] px-4 py-3 text-xs text-[#BD3100]">
              {error}
            </div>
          )}
          {message && (
            <div className="border border-border bg-bg-secondary px-4 py-3 text-xs text-text-secondary">
              {message}
            </div>
          )}

          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-line"
              placeholder="admin@looksmax.com"
            />
          </div>

          {turnstileRequired && <div ref={widgetRef} className="w-full" />}

          <button
            type="submit"
            disabled={loading || (turnstileRequired && !turnstileToken)}
            className="w-full bg-text-primary text-bg-primary py-3.5 text-sm font-medium tracking-[0.2em] uppercase hover:bg-accent transition-colors cursor-pointer disabled:bg-border disabled:text-text-secondary disabled:cursor-not-allowed"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        {message && (
          <div className="mt-4 border border-border bg-bg-secondary px-4 py-3">
            <p className="text-[11px] text-text-secondary">
              Didn&apos;t receive the email? You can request another one after the cooldown.
            </p>
            <button
              type="button"
              onClick={submitRequest}
              disabled={loading || resendCooldown > 0}
              className="mt-3 w-full border border-border bg-bg-secondary/40 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-text-primary transition-colors hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? "Sending..."
                : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend reset email"}
            </button>
          </div>
        )}

        <p className="text-center text-xs text-text-secondary mt-6">
          <Link
            href="/"
            className="text-text-primary font-medium underline underline-offset-4 hover:text-text-secondary transition-colors"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
