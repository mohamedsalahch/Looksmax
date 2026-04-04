export default function LookbookGrid() {
  const images = Array.from({ length: 9 }, (_, i) => ({
    id: i + 1,
    label: `Look ${String(i + 1).padStart(2, "0")}`,
  }));

  return (
    <section className="px-4 md:px-8 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-3 gap-1">
          {images.map((img) => (
            <div
              key={img.id}
              className="relative aspect-[3/4] placeholder-img cursor-pointer group overflow-hidden"
            >
              <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-colors duration-300 z-10" />
              <span className="relative z-10 text-[10px] tracking-widest opacity-60">{img.label}</span>
            </div>
          ))}
        </div>
        {/* Caption */}
        <div className="text-right mt-2">
          <p className="text-xs text-text-secondary tracking-wider">Community Edit</p>
        </div>
      </div>
    </section>
  );
}
