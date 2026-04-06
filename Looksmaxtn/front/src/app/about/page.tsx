import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="pt-[72px] min-h-screen">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-16">
        {/* Hero */}
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-text-secondary mb-3">Our Story</p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-wide uppercase mb-6">About LOOKSMAX</h1>
          <div className="w-16 h-px bg-foreground mx-auto" />
        </div>

        {/* Mission */}
        <section className="mb-16">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4">Our Mission</h2>
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            LOOKSMAX was born from a simple idea: modern men deserve a destination that understands their
            evolving style without the noise. We cut through the clutter of fast fashion to offer a curated
            selection of premium pieces that balance contemporary trends with timeless quality.
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            Every item in our collection is handpicked for its design, fabric quality, and fit. We believe that
            looking your best shouldn&apos;t require a designer budget — just a sharp eye and the right destination.
          </p>
        </section>

        {/* Values */}
        <section className="mb-16">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-8">What We Stand For</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="border border-border-color p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3">Quality First</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                We source from trusted manufacturers and inspect every piece before it reaches you.
                Premium fabrics, clean stitching, no shortcuts.
              </p>
            </div>
            <div className="border border-border-color p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3">Curated Selection</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Less is more. Instead of thousands of throwaway items, we offer a focused edit of
                pieces that actually matter and work together.
              </p>
            </div>
            <div className="border border-border-color p-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3">Accessible Luxury</h3>
              <p className="text-xs text-text-secondary leading-relaxed">
                Premium design shouldn&apos;t break the bank. We keep our prices honest so you can build
                a wardrobe that looks and feels expensive.
              </p>
            </div>
          </div>
        </section>

        {/* Promise */}
        <section className="mb-16 text-center border-t border-border-color pt-12">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4">Our Promise</h2>
          <p className="text-sm text-text-secondary leading-relaxed max-w-2xl mx-auto mb-6">
            When you shop with LOOKSMAX, you&apos;re not just buying clothes — you&apos;re investing in
            confidence. We stand behind every product we sell with hassle-free returns and dedicated
            customer support.
          </p>
          <Link
            href="/contact"
            className="inline-block bg-foreground text-background px-8 py-3 text-xs font-medium tracking-wide uppercase hover:bg-accent transition-colors"
          >
            Get in Touch
          </Link>
        </section>
      </div>
    </div>
  );
}
