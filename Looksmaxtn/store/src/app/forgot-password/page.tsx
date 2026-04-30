"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import TurnstileWidget from "@/components/TurnstileWidget";

export default function StoreForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileRequired, setTurnstileRequired] = useState(false);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldown]);

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
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken }),
      });
      const data = await response.json().catch(() => ({}));
      setTurnstileResetKey((current) => current + 1);

      if (!response.ok) {
        setError(data.error || "We could not send a reset email.");
        if (typeof data.retryAfterSeconds === "number") {
          setResendCooldown(data.retryAfterSeconds);
        }
        return;
      }

      setMessage(data.message || "If the store account exists, a reset link has been sent.");
      setResendCooldown(60);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await submitRequest();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <Link href="/">
            <h1 className="text-lg font-semibold uppercase tracking-[0.3em] text-foreground">
              LOOKSMAX
            </h1>
          </Link>
          <p className="mt-2 text-xs uppercase tracking-wider text-text-secondary">
            Reset your store password
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="border border-[#430C05] bg-[#faf3f2] px-4 py-3 text-xs text-[#430C05]">
              {error}
            </div>
          )}
          {message && (
            <div className="border border-[#d8c9b8] bg-[#f1ede8] px-4 py-3 text-xs text-[#6b6055]">
              {message}
            </div>
          )}

          <div>
            <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm text-foreground transition-colors placeholder:text-text-secondary/50 focus:border-foreground focus:outline-none"
              placeholder="owner@email.com"
            />
          </div>

          <TurnstileWidget
            action="store_owner_forgot_password"
            resetKey={turnstileResetKey}
            onVerify={setTurnstileToken}
            onConfiguredChange={setTurnstileRequired}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-foreground py-3.5 text-sm font-medium uppercase tracking-wide text-background transition-colors hover:bg-accent disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        {message && (
          <div className="mt-4 border border-border-color bg-surface/60 px-4 py-3">
            <p className="text-[11px] text-text-secondary">
              Didn&apos;t receive the email? You can request another one after the cooldown.
            </p>
            <button
              type="button"
              onClick={submitRequest}
              disabled={loading || resendCooldown > 0}
              className="mt-3 w-full border border-border-color px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-foreground transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Sending..." : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend reset email"}
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-text-secondary">
          <Link
            href="/"
            className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-accent"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
