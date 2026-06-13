"use client";

const BROWSE_RETURN_KEY = "looksmax:browse-return-key";

function getNavigationType() {
  if (typeof window === "undefined") return "";
  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return entry?.type || "";
}

export function isReloadNavigation() {
  return getNavigationType() === "reload";
}

export function markBrowseReturnIntent(cacheKey: string) {
  if (typeof window === "undefined" || !cacheKey) return;
  try {
    window.sessionStorage.setItem(BROWSE_RETURN_KEY, cacheKey);
  } catch {
    // Ignore storage failures; navigation should continue normally.
  }
}

export function consumeBrowseReturnIntent(cacheKey: string) {
  if (typeof window === "undefined" || !cacheKey || isReloadNavigation()) return false;
  try {
    const stored = window.sessionStorage.getItem(BROWSE_RETURN_KEY);
    if (stored !== cacheKey) return false;
    window.sessionStorage.removeItem(BROWSE_RETURN_KEY);
    return true;
  } catch {
    return false;
  }
}
