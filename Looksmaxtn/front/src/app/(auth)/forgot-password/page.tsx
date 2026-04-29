"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/providers/AuthContext";
import TurnstileWidget from "@/components/TurnstileWidget";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileRequired, setTurnstileRequired] = useState(false);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const { forgotPassword } = useAuth();

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
      const result = await forgotPassword(email, turnstileToken);
      setTurnstileResetKey((current) => current + 1);
      if (result.error) {
        setError(result.error);
        if (typeof result.retryAfterSeconds === "number") {
          setResendCooldown(result.retryAfterSeconds);
        }
        return;
      }

      setMessage(result.message || "If the email exists, a reset link has been sent.");
      setResendCooldown(60);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitRequest();
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-10">
        <Link href="/">
          <h1 className="text-lg font-semibold tracking-[0.3em] uppercase text-foreground">
            LOOKSMAX
          </h1>
        </Link>
        <p className="text-xs text-text-secondary mt-2 tracking-wider uppercase">
          Reset your password
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="border border-[#430C05] bg-[#faf3f2] px-4 py-3 text-xs text-[#430C05]">
            {error}
          </div>
        )}
        {message && (
          <div className="bg-[#f1ede8] border border-[#d8c9b8] text-[#6b6055] text-xs px-4 py-3 rounded">
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
            className="w-full border border-border-color bg-transparent px-4 py-3 text-sm text-foreground focus:border-foreground transition-colors placeholder:text-text-secondary/50"
            placeholder="your@email.com"
          />
        </div>

        <TurnstileWidget
          action="store_forgot_password"
          resetKey={turnstileResetKey}
          onVerify={setTurnstileToken}
          onConfiguredChange={setTurnstileRequired}
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-none bg-foreground text-background py-3.5 text-sm font-medium tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
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
            className="mt-3 w-full rounded-none border border-border-color px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-foreground transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
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
          href="/login"
          className="text-foreground font-medium underline underline-offset-2 hover:text-accent transition-colors"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
