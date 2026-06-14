import Category from "@/admin/models/Category";
import {
  type CategoryLean,
  buildSlugMap,
  getSharedLeaves,
  rootOf,
} from "@/admin/lib/categoryTaxonomy";
import { getGeneratorAuthHeaders } from "@/lib/generatorAuth";

const ALLOWED_GENDERS = new Set(["men", "women", "children", "unisex"]);
const DESCRIBE_TIMEOUT_MS = 45_000;

export type InferredProduct = {
  name: string;
  /** One slug for single-gender products, two (men + women) for unisex. */
  categories: string[];
};

type Candidate = { slug: string; name: string };

/**
 * Infer a retail product name and category slug(s) from the first product
 * picture, scoped to the given gender. For unisex, candidates are restricted to
 * the leaves shared by Men and Women and the result is expanded to both gendered
 * slugs. Returns null on any failure (missing config, no candidates, generator
 * error/timeout, or an out-of-list category) so callers can proceed without the
 * fields filled.
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

  // Build the candidate set and the slug -> categories[] mapping for the result.
  // For unisex we offer only the shared (men-side) leaves and expand the chosen
  // slug back to both gendered slugs.
  let candidates: Candidate[];
  let expand: (slug: string) => string[] | null;

  if (gender === "unisex") {
    const shared = getSharedLeaves(allCategories);
    candidates = shared.map((s) => ({ slug: s.men, name: s.name }));
    const byMenSlug = new Map(shared.map((s) => [s.men, [s.men, s.women]] as const));
    expand = (slug) => byMenSlug.get(slug)?.slice() ?? null;
  } else {
    const bySlug = buildSlugMap(allCategories);
    const scoped = allCategories.filter(
      (cat) => cat.slug !== gender && rootOf(cat.slug, bySlug) === gender
    );
    candidates = scoped.map((c) => ({ slug: c.slug, name: c.name }));
    const allowed = new Set(scoped.map((c) => c.slug));
    expand = (slug) => (allowed.has(slug) ? [slug] : null);
  }

  if (candidates.length === 0) return null;

  // describe-product requires a concrete gender; "men" drives the unisex set
  // since candidates carry the men-side slugs.
  const describeGender = gender === "unisex" ? "men" : gender;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DESCRIBE_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/api/describe-product`, {
      method: "POST",
      headers: getGeneratorAuthHeaders(),
      body: JSON.stringify({
        images: [params.imageB64],
        gender: describeGender,
        categories: candidates,
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
    const categories = expand(category);
    if (!name || !categories) return null;

    return { name, categories };
  } catch (error) {
    console.error("[product-inference] describe-product error:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
