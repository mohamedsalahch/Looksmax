"use client";

import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-background border-t border-border-color mt-16">
      {/* Newsletter */}
      <div className="max-w-lg mx-auto text-center py-16 px-6">
        <h2 className="text-lg font-semibold tracking-wide uppercase mb-1">
          The Best of LOOKSMAX
        </h2>
        <p className="text-sm font-medium mb-2">Subscribe to our newsletter</p>
        <p className="text-xs text-text-secondary mb-6 leading-relaxed">
          Subscribe to our newsletter to get early access to new arrivals, launches, and promotions.
        </p>
        <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
          <input
            type="email"
            placeholder="Email address"
            className="w-full border border-foreground/30 bg-transparent px-4 py-3 text-sm focus:border-foreground transition-colors placeholder:text-text-secondary"
          />
          <button
            type="submit"
            className="w-full bg-foreground text-background py-3 text-sm font-medium tracking-wide uppercase hover:bg-accent transition-colors cursor-pointer"
          >
            Submit
          </button>
        </form>
        <button className="mt-3 text-xs text-text-secondary underline underline-offset-2 hover:text-foreground transition-colors cursor-pointer">
          I wish to unsubscribe
        </button>
      </div>

      {/* Links */}
      <div className="border-t border-border-color">
        <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Help */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-4">Help</h3>
            <div className="space-y-2">
              <Link href="#" className="block text-xs text-text-secondary hover:text-foreground transition-colors">
                Frequently Asked Questions
              </Link>
              <Link href="#" className="block text-xs text-text-secondary hover:text-foreground transition-colors">
                Initiate a Return
              </Link>
            </div>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-4">Company</h3>
            <div className="space-y-2">
              <Link href="#" className="block text-xs text-text-secondary hover:text-foreground transition-colors">
                About Us
              </Link>
              <Link href="#" className="block text-xs text-text-secondary hover:text-foreground transition-colors">
                Join Our Team
              </Link>
            </div>
          </div>

          {/* Social */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-4">Social Media</h3>
            <div className="space-y-2">
              {["TikTok", "Instagram", "Facebook", "X", "YouTube", "Pinterest"].map((social) => (
                <Link
                  key={social}
                  href="#"
                  className="block text-xs text-text-secondary hover:text-foreground transition-colors"
                >
                  {social}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border-color px-6 py-4">
        <p className="text-[10px] text-text-secondary">
          © {new Date().getFullYear()} LOOKSMAX. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
