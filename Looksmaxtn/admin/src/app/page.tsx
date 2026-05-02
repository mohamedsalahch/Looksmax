"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { storeAuthToken } from "@/lib/authClient";

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

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const router = useRouter();

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
      action: "admin_login",
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

  const resetTurnstile = () => {
    setTurnstileToken("");
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  };

  const turnstileRequired = Boolean(siteKey);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (turnstileRequired && !turnstileToken) {
      setError("Please complete the human verification.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, turnstileToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        resetTurnstile();
        setLoading(false);
        return;
      }
      if (data.token) storeAuthToken(data.token);
      router.push("/dashboard");
    } catch {
      setError("Network error");
      resetTurnstile();
    }
    setLoading(false);
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
          <h1 className="text-lg font-semibold tracking-[0.3em] uppercase text-text-primary">
            LOOKSMAX
          </h1>
          <p className="text-xs text-accent mt-1 tracking-wider uppercase font-medium">
            Store Dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
            <div className="border border-[#BD3100] bg-[#faf3f2] px-4 py-3 text-xs text-[#BD3100]">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary focus:border-accent transition-colors"
              placeholder="admin@looksmax.com"
            />
          </div>

          <div>
            <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-border bg-bg-secondary px-4 py-3 text-sm text-text-primary focus:border-accent transition-colors"
              placeholder="••••••••"
            />
          </div>

          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-[10px] uppercase tracking-[0.22em] text-text-secondary underline underline-offset-2 hover:text-accent transition-colors"
            >
              Forgot password?
            </Link>
          </div>

          {turnstileRequired && (
            <div ref={widgetRef} className="w-full" />
          )}

          <button
            type="submit"
            disabled={loading || (turnstileRequired && !turnstileToken)}
            className="w-full bg-accent text-bg-primary py-3.5 text-sm font-semibold tracking-wide uppercase hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
