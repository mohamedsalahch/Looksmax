"use client";

import { useCallback, useState } from "react";
import TurnstileWidget from "@/components/TurnstileWidget";

export default function FooterNewsletter() {
  const [email, setEmail] = useState("");
  const [unsubEmail, setUnsubEmail] = useState("");
  const [message, setMessage] = useState("");
  const [showUnsub, setShowUnsub] = useState(false);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileConfigured, setTurnstileConfigured] = useState(false);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const fieldClass = "w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm transition-colors placeholder:text-text-secondary/70 focus:border-foreground focus:outline-none";
  const handleTurnstileConfigured = useCallback((configured: boolean) => {
    setTurnstileConfigured(configured);
  }, []);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    if (turnstileConfigured && !turnstileToken) {
      setMessage("Please complete the security check.");
      return;
    }
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage("✓ " + data.message);
        setEmail("");
        setTurnstileToken("");
        setTurnstileResetKey((value) => value + 1);
      } else {
        setMessage(data.error);
        setTurnstileToken("");
        setTurnstileResetKey((value) => value + 1);
      }
    } catch {
      setMessage("Network error. Please try again.");
    }
    setLoading(false);
  };

  const handleUnsubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unsubEmail) return;
    setMessage("Use the unsubscribe link from a LOOKSMAX email to remove this address.");
  };

  return (
    <div className="max-w-lg mx-auto text-center py-16 px-6">
      <h2 className="text-lg font-semibold tracking-wide uppercase mb-1">
        The Best of LOOKSMAX
      </h2>
      <p className="text-sm font-medium mb-2">Subscribe to our newsletter</p>
      <p className="text-xs text-text-secondary mb-6 leading-relaxed">
        Subscribe to our newsletter to get early access to new arrivals, launches, and promotions.
      </p>

      {!showUnsub ? (
        <form className="space-y-3" onSubmit={handleSubscribe}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            required
            className={fieldClass}
          />
          <TurnstileWidget
            action="newsletter"
            resetKey={turnstileResetKey}
            onVerify={setTurnstileToken}
            onConfiguredChange={handleTurnstileConfigured}
          />
          <button
            type="submit"
            disabled={loading || (turnstileConfigured && !turnstileToken)}
            className="w-full bg-foreground text-background py-3 text-sm font-medium tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? "Submitting..." : "Subscribe"}
          </button>
        </form>
      ) : (
        <form className="space-y-3" onSubmit={handleUnsubscribe}>
          <input
            type="email"
            value={unsubEmail}
            onChange={(e) => setUnsubEmail(e.target.value)}
            placeholder="Enter your email to unsubscribe"
            required
            className={fieldClass}
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-foreground text-background py-3 text-sm font-medium tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? "Processing..." : "Unsubscribe"}
          </button>
        </form>
      )}

      {message && (
        <div
          className={`mt-3 border px-4 py-3 text-xs ${
            message.startsWith("✓")
              ? "border-[#d8c9b8] bg-[#f1ede8] text-[#6b6055]"
              : "border-[#e2c9c4] bg-[#faf3f2] text-[#8a5f57]"
          }`}
        >
          {message}
        </div>
      )}

      <button
        onClick={() => {
          setShowUnsub(!showUnsub);
          setMessage("");
        }}
        className="mt-3 text-xs text-text-secondary underline underline-offset-2 hover:text-foreground transition-colors cursor-pointer"
      >
        {showUnsub ? "I want to subscribe" : "I wish to unsubscribe"}
      </button>
    </div>
  );
}
