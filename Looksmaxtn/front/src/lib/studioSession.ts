import type { StudioZoneId } from "@/lib/studioAssignment";

export interface StudioSessionZoneItem {
  id: string;
  name: string;
  image?: string;
  price?: string;
  fashionSubtype?: "clothes" | "shoes" | null;
  originPictures?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
}

export interface StudioSessionState {
  selectedZoneId: StudioZoneId | "";
  showAllSelectedItems: boolean;
  zoneOverrides: Partial<Record<StudioZoneId, StudioSessionZoneItem | null>>;
}

const STORAGE_PREFIX = "looksmax-studio-state:";

function getStorageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function readStudioSessionState(userId: string): StudioSessionState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(getStorageKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StudioSessionState;
    if (!parsed || typeof parsed !== "object") return null;

    return {
      selectedZoneId: parsed.selectedZoneId || "",
      showAllSelectedItems: Boolean(parsed.showAllSelectedItems),
      zoneOverrides: parsed.zoneOverrides || {},
    };
  } catch {
    return null;
  }
}

export function writeStudioSessionState(userId: string, state: StudioSessionState | null) {
  if (typeof window === "undefined") return;

  try {
    if (!state) {
      window.sessionStorage.removeItem(getStorageKey(userId));
      return;
    }

    window.sessionStorage.setItem(getStorageKey(userId), JSON.stringify(state));
  } catch {
    // Ignore session storage failures.
  }
}
