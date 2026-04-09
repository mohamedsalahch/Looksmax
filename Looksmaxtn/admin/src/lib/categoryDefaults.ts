export const DEFAULT_CATEGORY_TREE = [
  { name: "Men", slug: "men", order: 1, isActive: true, parentSlug: null },
  { name: "Women", slug: "women", order: 2, isActive: true, parentSlug: null },
  { name: "Children", slug: "children", order: 3, isActive: true, parentSlug: null },
  { name: "Garments", slug: "garments", order: 1, isActive: true, parentSlug: "men" },
  { name: "Fragrances", slug: "fragrances", order: 2, isActive: true, parentSlug: "men" },
  { name: "Shoes", slug: "shoes", order: 3, isActive: true, parentSlug: "men" },
  { name: "Garments", slug: "women-garments", order: 1, isActive: true, parentSlug: "women" },
  { name: "Fragrances", slug: "women-fragrances", order: 2, isActive: true, parentSlug: "women" },
  { name: "Shoes", slug: "women-shoes", order: 3, isActive: true, parentSlug: "women" },
];
