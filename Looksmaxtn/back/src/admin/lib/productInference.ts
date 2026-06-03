import Category from "@/admin/models/Category";

const ALLOWED_GENDERS = new Set(["men", "women", "children"]);
const DESCRIBE_TIMEOUT_MS = 45_000;

type CategoryLean = {
  slug: string;
  name: string;
  parentSlug?: string | null;
};

export type InferredProduct = {
  name: string;
  category: string;
};

/** Walk parentSlug up to the root and return the root slug (the gender for our taxonomy). */
function rootOf(slug: string, bySlug: Map<string, CategoryLean>): string | null {
  let current: CategoryLean | undefined = bySlug.get(slug);
  const visited = new Set<string>();
  while (current && current.parentSlug) {
    if (visited.has(current.slug)) return null;
    visited.add(current.slug);
    const parent = bySlug.get(current.parentSlug);
    if (!parent) return current.parentSlug;
    current = parent;
  }
  return current ? current.slug : null;
}

/**
 * Infer a retail product name and a single category slug from the first product
 * picture, scoped to the given gender. Returns null on any failure (missing
 * config, no candidates, generator error/timeout, or an out-of-list category)
 * so callers can proceed without the fields filled.
 */
export async function inferNameAndCategory(params: {
  gender: string;
  imageB64: string;
}): Promise<InferredProduct | null> {
  const gender = params.gender.trim().toLowerCase();
  if (!ALLOWED_GENDERS.has(gender) || !params.imageB64) return null;

  const baseUrl = process.env.PRODUCT_GENERATION_URL_BASE?.replace(/\/$/, "");
  if (!baseUrl) {
    console.warn("[product-inference] PRODUCT_GENERATION_URL_BASE is not configured.");
    return null;
  }

  const allCategories = (await Category.find({ isActive: true })
    .select("slug name parentSlug")
    .lean()) as unknown as CategoryLean[];

  const bySlug = new Map<string, CategoryLean>();
  for (const cat of allCategories) bySlug.set(cat.slug, cat);
  const candidates = allCategories.filter(
    (cat) => cat.slug !== gender && rootOf(cat.slug, bySlug) === gender
  );
  if (candidates.length === 0) return null;
  const allowedSlugs = new Set(candidates.map((c) => c.slug));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DESCRIBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/api/describe-product`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [params.imageB64],
        gender,
        categories: candidates.map((c) => ({ slug: c.slug, name: c.name })),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn("[product-inference] describe-product failed:", response.status);
      return null;
    }

    const result = (await response.json()) as { name?: string; category?: string };
    const name = String(result.name || "").trim();
    const category = String(result.category || "").trim();
    if (!name || !allowedSlugs.has(category)) return null;

    return { name, category };
  } catch (error) {
    console.error("[product-inference] describe-product error:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
