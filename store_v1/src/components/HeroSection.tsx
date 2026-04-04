export default function HeroSection() {
  return (
    <section className="pt-16">
      <div className="max-w-3xl mx-auto px-4">
        {/* Hero Image */}
        <div className="relative aspect-[3/4] md:aspect-[4/5] w-full placeholder-img">
          <span className="relative z-10 text-sm tracking-widest">HERO IMAGE</span>
        </div>
        {/* Caption */}
        <div className="text-right mt-2 mb-8">
          <p className="text-xs text-text-secondary tracking-wider">New Collection</p>
        </div>
      </div>
    </section>
  );
}
