"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email");
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    email && token ? "loading" : "error"
  );
  const [message, setMessage] = useState(
    email && token ? "Verifying your email..." : "The verification link is missing required data."
  );
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendMessage, setResendMessage] = useState("");
  const [resendCountdown, setResendCountdown] = useState(60);

  useEffect(() => {
    if (!email || !token) {
      return;
    }

    let cancelled = false;

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, token }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setStatus("error");
          setMessage(data.error || "We could not verify your email.");
          return;
        }

        setStatus("success");
        setMessage(data.message || "Your email has been verified.");
        window.setTimeout(() => {
          router.replace("/");
        }, 1200);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        setMessage("Network error while verifying your email.");
      });

    return () => {
      cancelled = true;
    };
  }, [email, token, router]);

  useEffect(() => {
    if (status !== "error" || !email) return;

    if (resendCountdown <= 0) return;

    const timer = window.setInterval(() => {
      setResendCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [status, email, resendCountdown]);

  const handleResendVerification = async () => {
    if (!email || resendCountdown > 0 || resendStatus === "sending") return;

    setResendStatus("sending");
    setResendMessage("");

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const retryAfterSeconds = Number(data.retryAfterSeconds || 60);
        setResendStatus("error");
        setResendMessage(data.error || "We could not resend the verification email.");
        setResendCountdown(Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 60);
        return;
      }

      setResendStatus("sent");
      setResendMessage(data.message || "A new verification email has been sent.");
      setResendCountdown(Number(data.resendAvailableAfterSeconds || 60));
    } catch {
      setResendStatus("error");
      setResendMessage("Network error while resending the verification email.");
    }
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
          Email verification
        </p>
      </div>

      <div
        className={`border px-4 py-3 text-xs rounded ${
          status === "success"
            ? "bg-green-50 border-green-200 text-green-800"
            : status === "error"
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-surface border-border-color text-text-secondary"
        }`}
      >
        {message}
      </div>

      {status === "error" && (
        <div className="mt-4 space-y-3 text-center text-xs text-text-secondary">
          <p>
            <Link
              href="/signup"
              className="text-foreground font-medium underline underline-offset-2 hover:text-accent transition-colors"
            >
              Create a new account
            </Link>{" "}
            or{" "}
            <Link
              href="/login"
              className="text-foreground font-medium underline underline-offset-2 hover:text-accent transition-colors"
            >
              sign in
            </Link>
            .
          </p>

          {email && (
            <div className="border border-border-color bg-surface/60 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">
                Resend link
              </p>
              <p className="mt-1 text-[11px] text-text-secondary">
                {resendCountdown > 0
                  ? `You can request a new link in ${resendCountdown}s.`
                  : "Request a fresh verification link now."}
              </p>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resendCountdown > 0 || resendStatus === "sending"}
                className="mt-3 w-full rounded-none border border-border-color px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-foreground transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resendStatus === "sending"
                  ? "Sending..."
                  : resendCountdown > 0
                    ? `Resend in ${resendCountdown}s`
                    : "Resend verification email"}
              </button>
              {resendMessage && (
                <p
                  className={`mt-2 text-[11px] ${
                    resendStatus === "error" ? "text-red-600" : "text-green-700"
                  }`}
                >
                  {resendMessage}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
