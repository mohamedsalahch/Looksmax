"use client";

import Script from "next/script";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/providers/AuthContext";

function LoginPageContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [googleReady, setGoogleReady] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const { login, loginWithGoogle, resendVerification } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  const googleConfigured = Boolean(googleClientId);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (!googleConfigured) return;

    let attempts = 0;
    const maxAttempts = 80;

    const syncGoogleReady = () => {
      const google = (window as Window & { google?: any }).google;
      if (google?.accounts?.id) {
        setGoogleReady(true);
        return true;
      }
      return false;
    };

    if (syncGoogleReady()) return;

    const timer = window.setInterval(() => {
      attempts += 1;
      if (syncGoogleReady() || attempts >= maxAttempts) {
        window.clearInterval(timer);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [googleConfigured]);

  useEffect(() => {
    if (!googleReady || !googleConfigured || !googleButtonRef.current) return;

    const google = (window as Window & { google?: any }).google;
    if (!google?.accounts?.id) return;

    google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (response: { credential?: string }) => {
        const credential = String(response?.credential || "");
        if (!credential) {
          setError("Google sign-in failed. Please try again.");
          return;
        }

        setError("");
        setInfo("");
        setLoading(true);

        const result = await loginWithGoogle(credential);
        setLoading(false);

        if (result.error) {
          setError(result.error);
          return;
        }

        router.push(nextPath.startsWith("/") ? nextPath : "/");
      },
    });

    googleButtonRef.current.innerHTML = "";
    google.accounts.id.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "large",
      width: googleButtonRef.current.offsetWidth || 384,
      shape: "rectangular",
      text: "signin_with",
      logo_alignment: "left",
    });
  }, [googleClientId, googleConfigured, googleReady, loginWithGoogle, nextPath, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      if (result.error.toLowerCase().includes("verify your email")) {
        setResendCooldown((current) => (current > 0 ? current : 60));
      }
    } else {
      router.push(nextPath.startsWith("/") ? nextPath : "/");
    }
  };

  const handleResendVerification = async () => {
    if (!email || resendCooldown > 0) return;
    setLoading(true);
    setError("");
    setInfo("");

    const result = await resendVerification(email);
    setLoading(false);

    if (result.error) {
      setError(result.error);
      if (typeof result.retryAfterSeconds === "number") {
        setResendCooldown(result.retryAfterSeconds);
      }
      return;
    }

    setInfo(result.message || "Verification email sent.");
    setResendCooldown(60);
  };

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-10">
        <Link href="/">
          <h1 className="text-lg font-semibold tracking-[0.3em] uppercase text-foreground">
            LOOKSMAX
          </h1>
        </Link>
        <p className="text-xs text-text-secondary mt-2 tracking-wider uppercase">
          Sign in to your account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="border border-[#BD3100] bg-[#faf3f2] px-4 py-3 text-xs text-[#BD3100]">
            {error}
          </div>
        )}
        {info && (
          <div className="bg-[#f1ede8] border border-[#d8c9b8] text-[#6b6055] text-xs px-4 py-3 rounded">
            {info}
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

        <div>
          <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border border-border-color bg-transparent px-4 py-3 text-sm text-foreground focus:border-foreground transition-colors placeholder:text-text-secondary/50"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-foreground text-background py-3.5 text-sm font-medium tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      {googleConfigured && (
        <div className="mt-6">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border-color" />
            <span className="text-[10px] uppercase tracking-[0.24em] text-text-secondary">
              or continue with
            </span>
            <div className="h-px flex-1 bg-border-color" />
          </div>
          <Script
            src="https://accounts.google.com/gsi/client"
            strategy="afterInteractive"
            onLoad={() => setGoogleReady(true)}
            onReady={() => setGoogleReady(true)}
          />
          <div ref={googleButtonRef} className="mt-4 min-h-[48px] w-full overflow-hidden" />
        </div>
      )}
      {!googleConfigured && (
        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.22em] text-text-secondary">
          Google sign-in is not configured yet.
        </p>
      )}

      {error.toLowerCase().includes("verify your email") && (
        <div className="mt-4 border border-border-color bg-surface/60 px-4 py-3">
          <p className="text-[11px] text-text-secondary">
            Didn&apos;t get the verification email? Request a new one here.
          </p>
          <button
            type="button"
            onClick={handleResendVerification}
            disabled={loading || resendCooldown > 0}
            className="mt-3 w-full border border-border-color px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-foreground transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Sending..."
              : resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : "Resend verification email"}
          </button>
        </div>
      )}

      <p className="text-center text-xs text-text-secondary mt-6">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="text-foreground font-medium underline underline-offset-2 hover:text-accent transition-colors"
        >
          Create one
        </Link>
      </p>
      <p className="text-center text-xs text-text-secondary mt-3">
        <Link
          href="/forgot-password"
          className="text-foreground font-medium underline underline-offset-2 hover:text-accent transition-colors"
        >
          Forgot your password?
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-sm" />}>
      <LoginPageContent />
    </Suspense>
  );
}
