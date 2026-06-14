"use client";

import { useCallback, useState } from "react";
import TurnstileWidget from "@/components/TurnstileWidget";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileConfigured, setTurnstileConfigured] = useState(false);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const fieldClass = "w-full border-0 border-b border-border-color bg-transparent px-1 py-2 text-sm transition-colors placeholder:text-text-secondary/70 focus:border-foreground focus:outline-none";
  const handleTurnstileConfigured = useCallback((configured: boolean) => {
    setTurnstileConfigured(configured);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (turnstileConfigured && !turnstileToken) {
      setStatus({ type: "error", text: "Please complete the security check." });
      return;
    }
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, turnstileToken }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: "success", text: data.message });
        setForm({ name: "", email: "", subject: "", message: "" });
        setTurnstileToken("");
        setTurnstileResetKey((value) => value + 1);
      } else {
        setStatus({ type: "error", text: data.error });
        setTurnstileToken("");
        setTurnstileResetKey((value) => value + 1);
      }
    } catch {
      setStatus({ type: "error", text: "Network error. Please try again." });
    }
    setLoading(false);
  };

  return (
    <div className="pt-[80px] min-h-screen">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-[0.3em] text-text-secondary mb-3">Get in Touch</p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-wide uppercase mb-4">Contact Us</h1>
          <div className="w-16 h-px bg-foreground mx-auto mb-6" />
          <p className="text-sm text-text-secondary max-w-lg mx-auto leading-relaxed">
            Have a question, feedback, or need assistance? We&apos;d love to hear from you.
            Fill out the form below and our team will get back to you as soon as possible.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Contact Info */}
          <div className="space-y-8">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2">Response Time</h3>
              <p className="text-sm text-text-secondary">Within 24 hours</p>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2">Business Hours</h3>
              <p className="text-sm text-text-secondary">Mon - Fri: 9AM - 6PM</p>
              <p className="text-sm text-text-secondary">Sat: 10AM - 4PM</p>
            </div>
          </div>

          {/* Form */}
          <div className="md:col-span-2">
            {status && (
                <div
                className={`mb-6 border px-4 py-3 text-xs ${
                  status.type === "success"
                    ? "border-[#d8c9b8] bg-[#f1ede8] text-[#6b6055]"
                    : "border-[#430C05] bg-[#faf3f2] text-[#430C05]"
                }`}
              >
                {status.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Your Name
                  </label>
                  <input
                    type="text" required value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={fieldClass}
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                    Email
                  </label>
                  <input
                    type="email" required value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={fieldClass}
                    placeholder="your@email.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                  Subject
                </label>
                <input
                  type="text" required value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className={fieldClass}
                  placeholder="How can we help?"
                />
              </div>

              <div>
                <label className="block text-xs text-text-secondary uppercase tracking-wider mb-1.5">
                  Message
                </label>
                <textarea
                  required value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  rows={6}
                  className={`${fieldClass} resize-none`}
                  placeholder="Tell us more..."
                />
              </div>

              <TurnstileWidget
                action="contact"
                resetKey={turnstileResetKey}
                onVerify={setTurnstileToken}
                onConfiguredChange={handleTurnstileConfigured}
              />

              <button
                type="submit"
                disabled={loading || (turnstileConfigured && !turnstileToken)}
                className="w-full bg-foreground text-background py-3.5 text-sm font-medium tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
              >
                {loading ? "Sending..." : "Send Message"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
