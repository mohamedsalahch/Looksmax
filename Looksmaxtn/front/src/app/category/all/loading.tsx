export default function Loading() {
  return (
    <div className="pt-[57px]">
      {/* Category nav skeleton */}
      <div className="border-b border-border-color">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="flex gap-6 py-3 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-3 shrink-0 animate-pulse bg-border-color/50"
                style={{ width: `${40 + i * 8}px` }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Category header */}
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-2">
        <div className="h-3.5 w-24 animate-pulse bg-border-color/50" />
      </div>

      {/* Product grid skeleton */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-[3/4] w-full animate-pulse bg-hover/60 border border-border-color" />
              <div className="h-2.5 w-3/4 animate-pulse bg-border-color/50" />
              <div className="h-2.5 w-1/2 animate-pulse bg-border-color/40" />
              <div className="mt-1 h-1 w-full animate-pulse bg-border-color/30" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
