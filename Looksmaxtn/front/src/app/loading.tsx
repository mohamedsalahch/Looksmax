export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-6xl space-y-8">
        <div className="space-y-3">
          <div className="h-2 w-28 animate-pulse bg-border-color/50" />
          <div className="h-8 w-72 max-w-full animate-pulse bg-border-color/40" />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="h-64 animate-pulse border border-border-color bg-hover/40" />
          <div className="space-y-4">
            <div className="h-10 animate-pulse border border-border-color bg-hover/40" />
            <div className="h-10 animate-pulse border border-border-color bg-hover/40" />
            <div className="h-40 animate-pulse border border-border-color bg-hover/40" />
          </div>
        </div>
      </div>
    </div>
  );
}
