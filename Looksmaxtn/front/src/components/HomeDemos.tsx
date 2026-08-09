import Link from "next/link";

const DEMOS = [
  {
    desktopSrc: "/demos/outfit-studio-desktop.mp4",
    mobileSrc: "/demos/outfit-studio-mobile.mp4",
    title: "Outfit Studio",
    description: "Add pieces to your cart and see the full outfit generated on your own photo.",
    ctaLabel: "Open Studio",
    ctaHref: "/studio",
  },
  {
    desktopSrc: "/demos/open-store-desktop.mp4",
    mobileSrc: "/demos/open-store-mobile.mp4",
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
              <div className="relative aspect-video border border-border-color bg-surface hidden md:block">
                <video
                  src={demo.desktopSrc}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
              <div className="relative aspect-[9/16] border border-border-color bg-surface max-w-[300px] mx-auto md:hidden">
                <video
                  src={demo.mobileSrc}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 h-full w-full object-cover"
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
