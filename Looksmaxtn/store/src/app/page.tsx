"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { storeToken } from "@/lib/authClient";
import TurnstileWidget from "@/components/TurnstileWidget";

export default function StoreLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileRequired, setTurnstileRequired] = useState(false);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (turnstileRequired && !turnstileToken) {
      setError("Please complete the security check.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, turnstileToken }),
      });
      const data = await res.json();
      setTurnstileResetKey((current) => current + 1);
      if (!res.ok) {
        setError(data.error || "Unable to sign in.");
        return;
      }
      storeToken(data.token);
      router.push(data.store?.onboardingCompleted ? "/dashboard" : "/onboarding");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
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
            Sign in to your store
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="border border-[#430C05] bg-[#faf3f2] px-4 py-3 text-xs text-[#430C05]">
              {error}
            </div>
          )}

          <div>
            <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm text-foreground transition-colors placeholder:text-text-secondary/50 focus:border-foreground focus:outline-none"
              placeholder="owner@email.com"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm text-foreground transition-colors placeholder:text-text-secondary/50 focus:border-foreground focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <TurnstileWidget
            action="store_owner_login"
            resetKey={turnstileResetKey}
            onVerify={setTurnstileToken}
            onConfiguredChange={setTurnstileRequired}
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-foreground py-3.5 text-sm font-medium uppercase tracking-wide text-background transition-colors hover:bg-accent disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-text-secondary">
          <Link
            href="/forgot-password"
            className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-accent"
          >
            Forgot your password?
          </Link>
        </p>
      </div>
    </main>
  );
}
