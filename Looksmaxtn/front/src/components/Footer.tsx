import Link from "next/link";
import FooterNewsletter from "@/components/FooterNewsletter";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-background border-t border-border-color mt-16">
      {/* Newsletter */}
      <FooterNewsletter />

      {/* Links */}
      <div className="border-t border-border-color">
        <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Help */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-4">Help</h3>
            <div className="space-y-2">
              <Link href="/contact" className="block text-xs text-text-secondary hover:text-foreground transition-colors">
                Contact Us
              </Link>
              <Link href="/about" className="block text-xs text-text-secondary hover:text-foreground transition-colors">
                About Us
              </Link>

            </div>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-4">Company</h3>
            <div className="space-y-2">
              <Link href="/create-store" className="block text-xs text-text-secondary hover:text-foreground transition-colors">
                Become a Seller
              </Link>
              <Link href="/terms-and-conditions" className="block text-xs text-text-secondary hover:text-foreground transition-colors">
                Terms & Conditions
              </Link>
            </div>
          </div>

          {/* Social */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-4">Social Media</h3>
            <div className="space-y-2">
              {[
                { name: "Instagram", href: "https://www.instagram.com/looksmaxtn/" },
                { name: "Facebook", href: "https://www.facebook.com/looksmaxtn/" },
              ].map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-text-secondary hover:text-foreground transition-colors"
                >
                  {social.name}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border-color px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-2">
        <p className="text-[10px] text-text-secondary">
          © {currentYear} LOOKSMAX. All rights reserved.
        </p>
        <div className="flex items-center gap-4">
          <Link href="/contact" className="text-[10px] text-text-secondary hover:text-foreground transition-colors">
            Contact
          </Link>
          <Link href="/about" className="text-[10px] text-text-secondary hover:text-foreground transition-colors">
            About
          </Link>
          <Link href="/create-store" className="text-[10px] text-text-secondary hover:text-foreground transition-colors">
            Become a Seller
          </Link>
          <Link href="/terms-and-conditions" className="text-[10px] text-text-secondary hover:text-foreground transition-colors">
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}
