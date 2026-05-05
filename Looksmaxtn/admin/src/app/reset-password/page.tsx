"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

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

  useEffect(() => {
    if (!email || !token) {
      setError("The reset link is missing required data.");
    }
  }, [email, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!email || !token) {
      setError("The reset link is missing required data.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
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
    <div className="w-full max-w-sm">
      <div className="text-center mb-10">
        <Link href="/">
          <h1 className="text-lg font-semibold tracking-[0.3em] uppercase text-text-primary">
            LOOKSMAX
          </h1>
        </Link>
        <p className="text-xs text-text-secondary mt-1 tracking-[0.22em] uppercase font-medium">
          Reset password
        </p>
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
            New Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="input-line"
            placeholder="Min. 6 characters"
          />
        </div>

        <div>
          <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">
            Confirm Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="input-line"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-text-primary text-bg-primary py-3.5 text-sm font-medium tracking-[0.2em] uppercase hover:bg-accent transition-colors cursor-pointer disabled:bg-border disabled:text-text-secondary disabled:cursor-not-allowed"
        >
          {loading ? "Updating..." : "Update Password"}
        </button>
      </form>

      <p className="text-center text-xs text-text-secondary mt-6">
        <Link
          href="/"
          className="text-text-primary font-medium underline underline-offset-4 hover:text-text-secondary transition-colors"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-sm" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
