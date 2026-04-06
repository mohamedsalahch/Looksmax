const stories = [
  { id: 1, label: "[02.1]", size: "large" },
  { id: 2, label: "[02.2]", size: "small" },
  { id: 3, label: "[02.3]", size: "small" },
  { id: 4, label: "[02.4]", size: "small" },
  { id: 5, label: "[02.5]", size: "small" },
  { id: 6, label: "[02.6]", size: "large" },
];

export default function CommunityStories() {
  return (
    <section className="px-4 md:px-8 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Heading */}
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight uppercase leading-tight">
            Community
            <br />
            Stories
          </h2>
          <p className="text-xs text-text-secondary mt-2 tracking-wider uppercase">
            Copenhagen Edition
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
          {/* Large left */}
          <div className="col-span-1 md:col-span-2 row-span-2 relative aspect-[3/4] placeholder-img cursor-pointer group overflow-hidden">
            <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-colors duration-300 z-10" />
            <span className="relative z-10 text-[10px] tracking-widest opacity-60">{stories[0].label}</span>
          </div>

          {/* Small grid items */}
          {stories.slice(1, 5).map((story) => (
            <div
              key={story.id}
              className="relative aspect-[3/4] placeholder-img cursor-pointer group overflow-hidden"
            >
              <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-colors duration-300 z-10" />
              <span className="relative z-10 text-[10px] tracking-widest opacity-60">{story.label}</span>
            </div>
          ))}

          {/* Large right */}
          <div className="col-span-1 md:col-span-2 relative aspect-[3/4] placeholder-img cursor-pointer group overflow-hidden">
            <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/5 transition-colors duration-300 z-10" />
            <span className="relative z-10 text-[10px] tracking-widest opacity-60">{stories[5].label}</span>
          </div>
        </div>

        {/* Link */}
        <div className="text-right mt-3">
          <span className="text-xs text-text-secondary tracking-wider cursor-pointer hover:text-foreground transition-colors">
            Community Stories →
          </span>
        </div>
      </div>
    </section>
  );
}
