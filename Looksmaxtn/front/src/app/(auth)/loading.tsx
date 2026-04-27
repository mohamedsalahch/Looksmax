export default function Loading() {
  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-10">
        <h1 className="text-lg font-semibold tracking-[0.3em] uppercase text-foreground">
          LOOKSMAX
        </h1>
        <p className="text-xs text-text-secondary mt-2 tracking-wider uppercase">
          Sign in to your account
        </p>
      </div>

      <div className="space-y-4" aria-hidden="true">
        <div>
          <div className="block text-xs uppercase tracking-wider mb-2 h-3 w-10" />
          <div className="w-full border border-border-color bg-transparent h-[46px]" />
        </div>
        <div>
          <div className="block text-xs uppercase tracking-wider mb-2 h-3 w-16" />
          <div className="w-full border border-border-color bg-transparent h-[46px]" />
        </div>
        <div className="w-full bg-foreground/30 h-[50px]" />
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border-color" />
          <span className="text-[10px] uppercase tracking-[0.24em] text-text-secondary">
            or continue with
          </span>
          <div className="h-px flex-1 bg-border-color" />
        </div>
        <div className="mt-4 min-h-[48px] w-full" />
      </div>

      <p className="text-center text-xs text-text-secondary mt-6 h-4" />
      <p className="text-center text-xs text-text-secondary mt-3 h-4" />
    </div>
  );
}
