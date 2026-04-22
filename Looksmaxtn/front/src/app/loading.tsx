export default function Loading() {
  return (
    <div className="w-full">
      {/* Hero skeleton — matches HeroSection aspect ratios */}
      <section className="pt-8 md:pt-12">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="relative aspect-[16/10] md:aspect-[2/1] lg:aspect-[21/9] min-h-[28rem] md:min-h-[38rem] w-full animate-pulse bg-hover/60 border border-border-color" />
        </div>
      </section>

      {/* Brand story skeleton */}
      <section className="py-16 md:py-24 px-4 md:px-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="h-2.5 w-20 animate-pulse bg-border-color/50" />
          <div className="h-7 w-72 max-w-full animate-pulse bg-border-color/50" />
          <div className="space-y-2 max-w-xl">
            <div className="h-3 w-full animate-pulse bg-border-color/40" />
            <div className="h-3 w-5/6 animate-pulse bg-border-color/40" />
            <div className="h-3 w-4/6 animate-pulse bg-border-color/40" />
          </div>
          <div className="grid grid-cols-3 gap-8 pt-4 max-w-sm">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-6 w-12 animate-pulse bg-border-color/50" />
                <div className="h-2.5 w-16 animate-pulse bg-border-color/40" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Lookbook grid skeleton */}
      <section className="px-4 md:px-8 pb-16">
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse bg-hover/60 border border-border-color" />
          ))}
        </div>
      </section>

      {/* Featured products skeleton */}
      <section className="px-4 md:px-8 py-16">
        <div className="max-w-7xl mx-auto">
          <div className="h-4 w-44 mx-auto animate-pulse bg-border-color/50 mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[3/4] w-full animate-pulse bg-hover/60 border border-border-color" />
                <div className="h-2.5 w-3/4 animate-pulse bg-border-color/50" />
                <div className="h-2.5 w-1/2 animate-pulse bg-border-color/40" />
                <div className="mt-1 h-1 w-full animate-pulse bg-border-color/30" />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
