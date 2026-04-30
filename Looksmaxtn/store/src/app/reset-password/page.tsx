"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const email = searchParams.get("email");
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const linkError = !email || !token ? "The reset link is missing required data." : "";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!email || !token) {
      setError("The reset link is missing required data.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "We could not reset your password.");
        return;
      }

      setMessage(data.message || "Password updated successfully.");
      window.setTimeout(() => {
        router.replace("/");
      }, 1200);
    } catch {
      setError("Network error while resetting your password.");
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
            Reset store password
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {(error || linkError) && (
            <div className="border border-[#430C05] bg-[#faf3f2] px-4 py-3 text-xs text-[#430C05]">
              {error || linkError}
            </div>
          )}
          {message && (
            <div className="border border-[#d8c9b8] bg-[#f1ede8] px-4 py-3 text-xs text-[#6b6055]">
              {message}
            </div>
          )}

          <div>
            <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">
              New Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full border border-border-color bg-transparent px-4 py-3 text-sm text-foreground transition-colors placeholder:text-text-secondary/50 focus:border-foreground"
              placeholder="Min. 6 characters"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-wider text-text-secondary">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              className="w-full border border-border-color bg-transparent px-4 py-3 text-sm text-foreground transition-colors placeholder:text-text-secondary/50 focus:border-foreground"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-foreground py-3.5 text-sm font-medium uppercase tracking-wide text-background transition-colors hover:bg-accent disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>

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

export default function StoreResetPasswordPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-sm" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
