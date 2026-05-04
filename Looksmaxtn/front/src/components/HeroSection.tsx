import MediaRenderer from "@/components/MediaRenderer";

export default function HeroSection({
  image,
  eyebrow,
  title,
  subtitle,
  href,
}: {
  image?: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  href?: string;
  }) {
  const normalizedHref = href?.trim() || "";
  const resolvedHref =
    normalizedHref.startsWith("/")
      ? normalizedHref
      : /^https?:\/\//i.test(normalizedHref) || normalizedHref.startsWith("//")
        ? normalizedHref
        : normalizedHref
          ? `https://${normalizedHref}`
          : "";
  const isExternalHref = Boolean(resolvedHref) && !resolvedHref.startsWith("/");

  const content = (
    <div className="relative aspect-[16/10] md:aspect-[2/1] lg:aspect-[21/9] min-h-[28rem] md:min-h-[38rem] w-full overflow-hidden rounded-sm border border-border-color bg-surface transition-transform duration-300 group-hover:-translate-y-0.5">
      {image ? (
        <MediaRenderer
          src={image}
          alt={title}
          className="w-full h-full scale-[1.01] hero-image"
          imageClassName="w-full h-full object-cover scale-[1.01] hero-image"
          videoClassName="w-full h-full object-cover scale-[1.01] hero-image"
          audioClassName="w-full px-6"
        />
      ) : (
        <div className="w-full h-full placeholder-img">
          <span className="relative z-10 text-sm tracking-widest">HERO IMAGE</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/18 to-black/8" />
      <div className="absolute inset-x-[8%] inset-y-[10%] border border-white/14 pointer-events-none" />
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <div className="max-w-3xl text-center text-white space-y-4 md:space-y-5 hero-copy">
          <p className="hero-copy-line hero-copy-line-1 text-[11px] md:text-xs tracking-[0.32em] uppercase text-white/78">
            {eyebrow}
          </p>
          <h1 className="hero-copy-line hero-copy-line-2 text-3xl md:text-5xl lg:text-6xl xl:text-7xl font-semibold tracking-[0.16em] uppercase leading-[0.95]">
            {title}
          </h1>
          <p className="hero-copy-line hero-copy-line-3 text-sm md:text-base lg:text-lg text-white/84 max-w-2xl mx-auto leading-relaxed">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <section className="pt-8 md:pt-12">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        {resolvedHref ? (
          <a
            href={resolvedHref}
            {...(isExternalHref ? { target: "_blank", rel: "noreferrer" } : {})}
            className="group block cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-foreground"
          >
            {content}
          </a>
        ) : (
          content
        )}
      </div>
    </section>
  );
}
