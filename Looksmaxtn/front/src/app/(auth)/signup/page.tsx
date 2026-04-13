"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/providers/AuthContext";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const { signup, resendVerification } = useAuth();

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setResendCooldown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const result = await signup(name, email, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(result.message || "Check your email to verify your account.");
      setPassword("");
      setConfirmPassword("");
      setResendCooldown(60);
      setResendMessage("");
    }
  };

  const handleResendVerification = async () => {
    if (!email || resendCooldown > 0 || resendLoading) return;

    setResendLoading(true);
    setResendMessage("");

    const result = await resendVerification(email);
    setResendLoading(false);

    if (result.error) {
      setError(result.error);
      if (typeof result.retryAfterSeconds === "number") {
        setResendCooldown(result.retryAfterSeconds);
      }
      return;
    }

    setResendMessage(result.message || "A new verification email has been sent.");
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
          Create your account
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="border border-[#BD3100] bg-[#faf3f2] px-4 py-3 text-xs text-[#BD3100]">
            {error}
          </div>
        )}
      {success && (
        <div className="space-y-3">
          <div className="bg-[#f1ede8] border border-[#d8c9b8] text-[#6b6055] text-xs px-4 py-3">
            {success}
          </div>
          {email && (
            <div className="border border-border-color bg-surface/60 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">
                Resend link
              </p>
              <p className="mt-1 text-[11px] text-text-secondary">
                {resendCooldown > 0
                  ? `You can request a new link in ${resendCooldown}s.`
                  : "Request a fresh verification link now."}
              </p>
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resendCooldown > 0 || resendLoading}
                className="mt-3 w-full border border-border-color px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-foreground transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resendLoading
                  ? "Sending..."
                  : resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : "Resend verification email"}
              </button>
              {resendMessage && (
                <p className="mt-2 text-[11px] text-[#6b6055]">
                  {resendMessage}
                </p>
              )}
            </div>
          )}
        </div>
      )}

        <div>
          <label className="block text-xs text-text-secondary uppercase tracking-wider mb-2">
            Full Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full border border-border-color bg-transparent px-4 py-3 text-sm text-foreground focus:border-foreground transition-colors placeholder:text-text-secondary/50"
            placeholder="John Doe"
          />
        </div>

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
            className="w-full border border-border-color bg-transparent px-4 py-3 text-sm text-foreground focus:border-foreground transition-colors placeholder:text-text-secondary/50"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-foreground text-background py-3.5 text-sm font-medium tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
        >
          {loading ? "Creating Account..." : "Create Account"}
        </button>
      </form>

      <p className="text-center text-xs text-text-secondary mt-6">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-foreground font-medium underline underline-offset-2 hover:text-accent transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
