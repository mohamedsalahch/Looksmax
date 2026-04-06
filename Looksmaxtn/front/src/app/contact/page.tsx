"use client";

import { useState } from "react";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ type: "success", text: data.message });
        setForm({ name: "", email: "", subject: "", message: "" });
      } else {
        setStatus({ type: "error", text: data.error });
      }
    } catch {
      setStatus({ type: "error", text: "Network error. Please try again." });
    }
    setLoading(false);
  };

  return (
    <div className="pt-[72px] min-h-screen">
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
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2">Email</h3>
              <p className="text-sm text-text-secondary">support@looksmax.com</p>
            </div>
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
              <div className={`mb-6 px-4 py-3 text-xs border ${
                status.type === "success"
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}>
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
                    className="w-full border border-border-color bg-transparent px-4 py-3 text-sm focus:border-foreground transition-colors"
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
                    className="w-full border border-border-color bg-transparent px-4 py-3 text-sm focus:border-foreground transition-colors"
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
                  className="w-full border border-border-color bg-transparent px-4 py-3 text-sm focus:border-foreground transition-colors"
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
                  className="w-full border border-border-color bg-transparent px-4 py-3 text-sm focus:border-foreground transition-colors resize-none"
                  placeholder="Tell us more..."
                />
              </div>

              <button
                type="submit"
                disabled={loading}
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
