/**
 * Shared taxonomy helpers for the gender-partitioned category tree.
 *
 * Every leaf is gender-suffixed (e.g. `tshirts-men` / `tshirts-women`) and the
 * gender is the root slug reached by walking `parentSlug` upward. A "unisex"
 * product is tagged with BOTH gendered slugs of the same leaf, so we need a way
 * to (a) find the leaves that exist under both Men and Women and (b) map a leaf
 * slug to its counterpart in the other gender.
 */

export type CategoryLean = {
  slug: string;
  name: string;
  parentSlug?: string | null;
};

export type SharedLeaf = {
  /** Display name (taken from the men-side leaf). */
  name: string;
  men: string;
  women: string;
};

/** Walk parentSlug up to the root and return the root slug (the gender). */
export function rootOf(slug: string, bySlug: Map<string, CategoryLean>): string | null {
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

export function buildSlugMap(categories: CategoryLean[]): Map<string, CategoryLean> {
  const bySlug = new Map<string, CategoryLean>();
  for (const cat of categories) bySlug.set(cat.slug, cat);
  return bySlug;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** A leaf is a category that is not the parent of any other category. */
function getLeaves(categories: CategoryLean[]): CategoryLean[] {
  const parentSlugs = new Set<string>();
  for (const cat of categories) {
    if (cat.parentSlug) parentSlugs.add(cat.parentSlug);
  }
  return categories.filter((cat) => !parentSlugs.has(cat.slug));
}

/**
 * Leaves whose (normalized) name exists under BOTH the Men and Women roots.
 * Matching is strict exact-name, so near-misses like "Sweaters / Knitwear"
 * (men) vs "Sweaters" (women) are intentionally excluded.
 */
export function getSharedLeaves(categories: CategoryLean[]): SharedLeaf[] {
  const bySlug = buildSlugMap(categories);
  const leaves = getLeaves(categories);

  const menByName = new Map<string, CategoryLean>();
  const womenByName = new Map<string, CategoryLean>();
  for (const leaf of leaves) {
    const root = rootOf(leaf.slug, bySlug);
    const key = normalizeName(leaf.name);
    if (!key) continue;
    if (root === "men" && !menByName.has(key)) menByName.set(key, leaf);
    else if (root === "women" && !womenByName.has(key)) womenByName.set(key, leaf);
  }

  const shared: SharedLeaf[] = [];
  for (const [key, menLeaf] of menByName) {
    const womenLeaf = womenByName.get(key);
    if (!womenLeaf) continue;
    shared.push({ name: menLeaf.name, men: menLeaf.slug, women: womenLeaf.slug });
  }
  return shared;
}

/**
 * Map any leaf slug to its men/women counterpart pair, or null if the leaf has
 * no counterpart in the other gender (i.e. it is not a shared leaf).
 */
export function mapLeafAcrossGenders(
  slug: string,
  categories: CategoryLean[]
): { men: string; women: string } | null {
  const shared = getSharedLeaves(categories);
  return shared.find((s) => s.men === slug || s.women === slug) ?? null;
}
