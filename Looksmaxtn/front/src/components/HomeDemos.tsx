import Link from "next/link";

const DEMOS = [
  {
    desktopSrc: "/demos/outfit-studio.html",
    mobileSrc: "/demos/outfit-studio-mobile.html",
    title: "Outfit Studio",
    description: "Add pieces to your cart and see the full outfit generated on your own photo.",
    ctaLabel: "Open Studio",
    ctaHref: "/studio",
  },
  {
    desktopSrc: "/demos/open-store.html",
    mobileSrc: "/demos/open-store-mobile.html",
    title: "Open Your Store",
    description: "One form, admin approval by email, then sell your products to all of Tunisia.",
    ctaLabel: "Become a Seller",
    ctaHref: "/create-store",
  },
];

export default function HomeDemos() {
  return (
    <section className="px-4 md:px-8 py-20">
      <div className="max-w-7xl mx-auto">
        <p className="text-xs uppercase tracking-[0.3em] text-text-secondary mb-4 text-center">
          How It Works
        </p>
        <h2 className="text-2xl md:text-3xl font-semibold tracking-wide uppercase mb-10 text-center">
          See It In Action
        </h2>
        <div className="grid md:grid-cols-2 gap-10 md:gap-8">
          {DEMOS.map((demo) => (
            <figure key={demo.desktopSrc} className="m-0">
              <div className="relative aspect-video border border-border-color bg-[#181410] hidden md:block">
                <iframe
                  src={demo.desktopSrc}
                  title={`${demo.title} demo`}
                  loading="lazy"
                  scrolling="no"
                  className="absolute inset-0 h-full w-full border-0"
                />
              </div>
              <div className="relative aspect-[9/16] border border-border-color bg-[#181410] max-w-[300px] mx-auto md:hidden">
                <iframe
                  src={demo.mobileSrc}
                  title={`${demo.title} demo`}
                  loading="lazy"
                  scrolling="no"
                  className="absolute inset-0 h-full w-full border-0"
                />
              </div>
              <figcaption className="mt-5 text-center">
                <p className="text-xs uppercase tracking-[0.2em] font-semibold">{demo.title}</p>
                <p className="text-xs text-text-secondary mt-2 max-w-xs mx-auto">{demo.description}</p>
                <Link
                  href={demo.ctaHref}
                  className="inline-block mt-3 text-[10px] uppercase tracking-[0.2em] border-b border-foreground pb-0.5 hover:text-text-secondary hover:border-text-secondary transition-colors"
                >
                  {demo.ctaLabel}
                </Link>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
