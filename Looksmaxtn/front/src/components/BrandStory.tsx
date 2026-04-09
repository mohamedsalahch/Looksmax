export default function BrandStory({
  eyebrow,
  title,
  paragraphOne,
  paragraphTwo,
  stats,
}: {
  eyebrow: string;
  title: string;
  paragraphOne: string;
  paragraphTwo: string;
  stats: { label: string; value: string }[];
}) {
  return (
    <section className="py-20 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-text-secondary mb-4">
          {eyebrow}
        </p>
        <h2 className="text-2xl md:text-3xl font-semibold tracking-wide uppercase mb-6">
          {title}
        </h2>
        <p className="text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl mx-auto mb-6">
          {paragraphOne}
        </p>
        <p className="text-sm md:text-base text-text-secondary leading-relaxed max-w-2xl mx-auto">
          {paragraphTwo}
        </p>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-8 mt-12 pt-10 border-t border-border-color max-w-lg mx-auto">
          {stats.map((stat, index) => (
            <div key={`${stat.label}-${index}`}>
              <p className="text-xl md:text-2xl font-semibold">{stat.value}</p>
              <p className="text-[10px] uppercase tracking-wider text-text-secondary mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
