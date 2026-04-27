import { readFile } from "fs/promises";
import path from "path";
import { getUploadCategoryDir as getStoreCategoryDir } from "@/store/lib/uploadStorage";
import { getUploadCategoryDir as getAdminCategoryDir } from "@/admin/lib/uploadStorage";

const LEGACY_CATEGORY_DIRS: Record<string, () => string> = {
  "body-profiles": () => getStoreCategoryDir("body-profiles"),
  products: () => getAdminCategoryDir("products"),
  models: () => getAdminCategoryDir("models"),
  homepage: () => getAdminCategoryDir("homepage"),
  "generated-images": () => getAdminCategoryDir("generated-images"),
};

function legacyCategoryFromPath(p: string): string | null {
  const m = /^\/uploads\/([^/]+)\//.exec(p);
  return m ? m[1] : null;
}

export async function loadImageBuffer(pathOrUrl: string): Promise<Buffer> {
  if (!pathOrUrl) throw new Error("Empty image path");

  if (pathOrUrl.startsWith("/uploads/")) {
    const category = legacyCategoryFromPath(pathOrUrl);
    if (!category || !LEGACY_CATEGORY_DIRS[category]) {
      throw new Error(`Unknown legacy category in path: ${pathOrUrl}`);
    }
    const dir = LEGACY_CATEGORY_DIRS[category]();
    const filepath = path.join(dir, path.basename(pathOrUrl));
    return await readFile(filepath);
  }

  // Remote URL (R2, etc.)
  const res = await fetch(pathOrUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch image ${pathOrUrl}: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function loadImageAsBase64(pathOrUrl: string): Promise<string> {
  if (pathOrUrl.startsWith("data:")) return pathOrUrl.split(",")[1] || "";
  const buffer = await loadImageBuffer(pathOrUrl);
  return buffer.toString("base64");
}
