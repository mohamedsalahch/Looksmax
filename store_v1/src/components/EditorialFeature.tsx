export default function EditorialFeature() {
  return (
    <section className="px-4 md:px-8 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="relative aspect-[4/5] md:aspect-[16/10] w-full placeholder-img cursor-pointer group overflow-hidden">
          <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-colors duration-500 z-10" />
          <span className="relative z-10 text-sm tracking-widest">EDITORIAL</span>
        </div>
      </div>
    </section>
  );
}
