export default function Loading() {
  return (
    <div className="pt-[80px]">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {/* Breadcrumb skeleton */}
        <div className="flex items-center gap-2 mb-6">
          <div className="h-2.5 w-8 animate-pulse bg-border-color/50" />
          <div className="h-2.5 w-2 animate-pulse bg-border-color/40" />
          <div className="h-2.5 w-16 animate-pulse bg-border-color/40 hidden md:block" />
          <div className="h-2.5 w-2 animate-pulse bg-border-color/40 hidden md:block" />
          <div className="h-2.5 w-28 animate-pulse bg-border-color/50" />
        </div>

        {/* 2-column product layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
          {/* Left — image gallery */}
          <div className="flex gap-3">
            {/* Thumbnails column */}
            <div className="hidden md:flex flex-col gap-2 w-16 shrink-0">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[4/5] w-full animate-pulse bg-hover/60 border border-border-color" />
              ))}
            </div>
            {/* Main image */}
            <div className="flex-1 aspect-[4/5] animate-pulse bg-hover/60 border border-border-color" />
          </div>

          {/* Right — product info */}
          <div className="space-y-5">
            <div className="space-y-2">
              <div className="h-3 w-20 animate-pulse bg-border-color/40" />
              <div className="h-7 w-3/4 animate-pulse bg-border-color/50" />
              <div className="h-5 w-24 animate-pulse bg-border-color/50" />
            </div>

            {/* Condition bar */}
            <div className="space-y-1.5">
              <div className="h-1 w-full animate-pulse bg-border-color/40" />
              <div className="h-2.5 w-20 animate-pulse bg-border-color/40" />
            </div>

            {/* Size selector */}
            <div className="space-y-2">
              <div className="h-2.5 w-12 animate-pulse bg-border-color/40" />
              <div className="flex gap-2 flex-wrap">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-8 w-12 animate-pulse bg-hover/60 border border-border-color" />
                ))}
              </div>
            </div>

            {/* Add to cart button */}
            <div className="h-11 w-full animate-pulse bg-border-color/50" />

            {/* Description */}
            <div className="pt-4 space-y-2 border-t border-border-color">
              <div className="h-2.5 w-full animate-pulse bg-border-color/40" />
              <div className="h-2.5 w-5/6 animate-pulse bg-border-color/40" />
              <div className="h-2.5 w-4/6 animate-pulse bg-border-color/40" />
            </div>
          </div>
        </div>
      </div>

      {/* Related products skeleton */}
      <div className="border-t border-border-color mt-16 pt-10 pb-6">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <div className="h-3.5 w-40 animate-pulse bg-border-color/50 mb-6" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[4/5] w-full animate-pulse bg-hover/60 border border-border-color" />
                <div className="h-2.5 w-3/4 animate-pulse bg-border-color/50" />
                <div className="h-2.5 w-1/2 animate-pulse bg-border-color/40" />
                <div className="mt-1 h-1 w-full animate-pulse bg-border-color/30" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
