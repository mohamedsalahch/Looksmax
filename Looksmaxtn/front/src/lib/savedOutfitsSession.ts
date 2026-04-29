export interface SavedOutfitSessionItem {
  id: string;
  name: string;
  images: {
    front?: string;
    back?: string;
  };
  outfitSnapshot?: Record<
    string,
    {
      status?: boolean;
      productId?: string;
      fashionSubtype?: string;
      size?: string;
    } | null
  >;
  isPublic: boolean;
  shareToken?: string;
  createdAt?: string;
  updatedAt: string;
}

function getSavedOutfitsSessionKey(userId: string) {
  return `looksmax-saved-outfits:${userId}`;
}

export function readSavedOutfitsSession(userId: string) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(getSavedOutfitsSessionKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SavedOutfitSessionItem[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSavedOutfitsSession(userId: string, outfits: SavedOutfitSessionItem[]) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(getSavedOutfitsSessionKey(userId), JSON.stringify(outfits));
  } catch {
    // Ignore storage failures and fall back to network fetches.
  }
}

export function upsertSavedOutfitSession(userId: string, outfit: SavedOutfitSessionItem) {
  const existing = readSavedOutfitsSession(userId) || [];
  const nextOutfits = [outfit, ...existing.filter((entry) => entry.id !== outfit.id)];
  writeSavedOutfitsSession(userId, nextOutfits);
  return nextOutfits;
}

export function removeSavedOutfitSession(userId: string, outfitId: string) {
  const existing = readSavedOutfitsSession(userId) || [];
  const nextOutfits = existing.filter((entry) => entry.id !== outfitId);
  writeSavedOutfitsSession(userId, nextOutfits);
  return nextOutfits;
}
