// Usage:
//   node scripts/seed-categories-full.mjs
//   node scripts/seed-categories-full.mjs --apply

import "dotenv/config";
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("Missing MONGODB_URI env var");
  process.exit(1);
}

const apply = process.argv.includes("--apply");

await mongoose.connect(MONGO_URI);

const categoriesColl = mongoose.connection.collection("categories");
const productsColl = mongoose.connection.collection("products");

const now = new Date();

const ROOT_CATEGORIES = [
  { name: "Men", slug: "men", parentSlug: null, order: 0, isActive: true },
  { name: "Women", slug: "women", parentSlug: null, order: 1, isActive: true },
  { name: "Children", slug: "children", parentSlug: null, order: 2, isActive: true },
];

const PARENT_CATEGORIES = [
  // Men
  { name: "Garments", slug: "garments-men", parentSlug: "men", order: 0, isActive: true },
  { name: "Accessories", slug: "accessories-men", parentSlug: "men", order: 1, isActive: true },
  { name: "Fragrances", slug: "fragrances-men", parentSlug: "men", order: 2, isActive: true },

  // Women
  { name: "Garments", slug: "garments-women", parentSlug: "women", order: 0, isActive: true },
  { name: "Accessories", slug: "accessories-women", parentSlug: "women", order: 1, isActive: true },
  { name: "Fragrances", slug: "fragrances-women", parentSlug: "women", order: 2, isActive: true },

  // Children
  { name: "Garments", slug: "garments-children", parentSlug: "children", order: 0, isActive: true },
  { name: "Accessories", slug: "accessories-children", parentSlug: "children", order: 1, isActive: true },

  // Men garments
  { name: "Headwear", slug: "headwear-men", parentSlug: "garments-men", order: 0, isActive: true },
  { name: "Outerwear", slug: "outerwear-men", parentSlug: "garments-men", order: 1, isActive: true },
  { name: "Tops", slug: "top-men", parentSlug: "garments-men", order: 2, isActive: true },
  { name: "Bottoms", slug: "bottom-men", parentSlug: "garments-men", order: 3, isActive: true },
  { name: "Footwear", slug: "footwear-men", parentSlug: "garments-men", order: 4, isActive: true },

  // Women garments
  { name: "Dresses", slug: "dress-women", parentSlug: "garments-women", order: 0, isActive: true },
  { name: "Outerwear", slug: "outerwear-women", parentSlug: "garments-women", order: 1, isActive: true },
  { name: "Tops", slug: "top-women", parentSlug: "garments-women", order: 2, isActive: true },
  { name: "Handbags", slug: "handbag-women", parentSlug: "garments-women", order: 3, isActive: true },
  { name: "Bottoms", slug: "bottom-women", parentSlug: "garments-women", order: 4, isActive: true },
  { name: "Footwear", slug: "footwear-women", parentSlug: "garments-women", order: 5, isActive: true },

  // Children garments
  { name: "Outerwear", slug: "outerwear-children", parentSlug: "garments-children", order: 0, isActive: true },
  { name: "Tops", slug: "top-children", parentSlug: "garments-children", order: 1, isActive: true },
  { name: "Bottoms", slug: "bottom-children", parentSlug: "garments-children", order: 2, isActive: true },
  { name: "Footwear", slug: "footwear-children", parentSlug: "garments-children", order: 3, isActive: true },
];

const GROUPS = [
  // Men
  ["top-men", [
    ["T-Shirts", "tshirts-men"],
    ["Polos", "polos-men"],
    ["Shirts", "shirts-men"],
    ["Hoodies", "hoodies-men"],
    ["Sweatshirts", "sweatshirts-men"],
    ["Tank Tops", "tank-tops-men"],
    ["Sweaters / Knitwear", "sweaters-men"],
  ]],
  ["bottom-men", [
    ["Jeans", "jeans-men"],
    ["Trousers", "trousers-men"],
    ["Shorts", "shorts-men"],
    ["Sweatpants", "sweatpants-men"],
    ["Chinos", "chinos-men"],
  ]],
  ["outerwear-men", [
    ["Jackets", "jackets-men"],
    ["Coats", "coats-men"],
    ["Blazers", "blazers-men"],
    ["Windbreakers", "windbreakers-men"],
    ["Vests", "vests-men"],
  ]],
  ["footwear-men", [
    ["Sneakers", "sneakers-men"],
    ["Boots", "boots-men"],
    ["Sandals", "sandals-men"],
    ["Loafers", "loafers-men"],
    ["Formal Shoes", "formal-shoes-men"],
  ]],
  ["headwear-men", [
    ["Caps", "caps-men"],
    ["Beanies", "beanies-men"],
    ["Hats", "hats-men"],
  ]],
  ["accessories-men", [
    ["Belts", "belts-men"],
    ["Watches", "watches-men"],
    ["Sunglasses", "sunglasses-men"],
    ["Wallets", "wallets-men"],
    ["Jewelry", "jewelry-men"],
  ]],
  ["fragrances-men", [
    ["Perfumes", "perfumes-men"],
    ["Body Sprays", "body-sprays-men"],
    ["Deodorants", "deodorants-men"],
  ]],

  // Women
  ["top-women", [
    ["T-Shirts", "tshirts-women"],
    ["Blouses", "blouses-women"],
    ["Shirts", "shirts-women"],
    ["Crop Tops", "crop-tops-women"],
    ["Hoodies", "hoodies-women"],
    ["Sweaters", "sweaters-women"],
    ["Tank Tops", "tank-tops-women"],
  ]],
  ["bottom-women", [
    ["Jeans", "jeans-women"],
    ["Trousers", "trousers-women"],
    ["Skirts", "skirts-women"],
    ["Shorts", "shorts-women"],
    ["Leggings", "leggings-women"],
    ["Sweatpants", "sweatpants-women"],
  ]],
  ["dress-women", [
    ["Casual Dresses", "casual-dresses-women"],
    ["Evening Dresses", "evening-dresses-women"],
    ["Maxi Dresses", "maxi-dresses-women"],
    ["Mini Dresses", "mini-dresses-women"],
    ["Bodycon Dresses", "bodycon-dresses-women"],
  ]],
  ["outerwear-women", [
    ["Jackets", "jackets-women"],
    ["Coats", "coats-women"],
    ["Blazers", "blazers-women"],
    ["Cardigans", "cardigans-women"],
  ]],
  ["handbag-women", [
    ["Tote Bags", "tote-bags-women"],
    ["Shoulder Bags", "shoulder-bags-women"],
    ["Crossbody Bags", "crossbody-bags-women"],
    ["Clutches", "clutches-women"],
    ["Backpacks", "backpacks-women"],
  ]],
  ["footwear-women", [
    ["Heels", "heels-women"],
    ["Flats", "flats-women"],
    ["Sneakers", "sneakers-women"],
    ["Boots", "boots-women"],
    ["Sandals", "sandals-women"],
  ]],
  ["accessories-women", [
    ["Belts", "belts-women"],
    ["Watches", "watches-women"],
    ["Sunglasses", "sunglasses-women"],
    ["Jewelry", "jewelry-women"],
    ["Scarves", "scarves-women"],
  ]],
  ["fragrances-women", [
    ["Perfumes", "perfumes-women"],
    ["Body Mists", "body-mists-women"],
    ["Deodorants", "deodorants-women"],
  ]],

  // Children
  ["top-children", [
    ["T-Shirts", "tshirts-children"],
    ["Shirts", "shirts-children"],
    ["Hoodies", "hoodies-children"],
    ["Sweatshirts", "sweatshirts-children"],
    ["Sweaters", "sweaters-children"],
  ]],
  ["bottom-children", [
    ["Jeans", "jeans-children"],
    ["Trousers", "trousers-children"],
    ["Shorts", "shorts-children"],
    ["Leggings", "leggings-children"],
    ["Sweatpants", "sweatpants-children"],
  ]],
  ["outerwear-children", [
    ["Jackets", "jackets-children"],
    ["Coats", "coats-children"],
    ["Vests", "vests-children"],
    ["Raincoats", "raincoats-children"],
  ]],
  ["footwear-children", [
    ["Sneakers", "sneakers-children"],
    ["Boots", "boots-children"],
    ["Sandals", "sandals-children"],
    ["School Shoes", "school-shoes-children"],
  ]],
  ["accessories-children", [
    ["Caps", "caps-children"],
    ["Beanies", "beanies-children"],
    ["Backpacks", "backpacks-children"],
    ["Socks", "socks-children"],
  ]],
];

const DEPRECATED_SLUGS = ["joggers-men"];

const LEAF_CATEGORIES = GROUPS.flatMap(([parentSlug, kids]) =>
  kids.map(([name, slug], index) => ({
    name,
    slug,
    parentSlug,
    order: index,
    isActive: true,
  }))
);

const ALL_CATEGORIES = [
  ...ROOT_CATEGORIES,
  ...PARENT_CATEGORIES,
  ...LEAF_CATEGORIES,
];

async function ensureUniqueSlugIndex() {
  if (!apply) {
    console.log("Dry run: would ensure unique index on categories.slug");
    return;
  }

  await categoriesColl.createIndex({ slug: 1 }, { unique: true });
  console.log("Ensured unique index on categories.slug");
}

async function upsertCategory(category) {
  const existing = await categoriesColl.findOne({ slug: category.slug });

  if (!apply) {
    if (!existing) {
      console.log(`+ insert ${category.slug} under ${category.parentSlug ?? "root"}`);
      return "inserted";
    }

    const changed =
      existing.name !== category.name ||
      existing.parentSlug !== category.parentSlug ||
      existing.order !== category.order ||
      existing.isActive !== category.isActive;

    if (changed) {
      console.log(`~ update ${category.slug} under ${category.parentSlug ?? "root"}`);
      return "updated";
    }

    return "unchanged";
  }

  const res = await categoriesColl.updateOne(
    { slug: category.slug },
    {
      $set: {
        name: category.name,
        slug: category.slug,
        parentSlug: category.parentSlug,
        order: category.order,
        isActive: category.isActive,
        updatedAt: now,
      },
      $setOnInsert: {
        createdAt: now,
      },
    },
    { upsert: true }
  );

  if (res.upsertedCount) {
    console.log(`+ inserted ${category.slug}`);
    return "inserted";
  }

  if (res.modifiedCount) {
    console.log(`~ updated ${category.slug}`);
    return "updated";
  }

  return "unchanged";
}

async function cleanupDeprecatedSlugs() {
  let removed = 0;

  for (const slug of DEPRECATED_SLUGS) {
    const existing = await categoriesColl.findOne({ slug });

    if (!existing) continue;

    const taggedProducts = await productsColl.countDocuments({
      categories: slug,
    });

    if (taggedProducts > 0) {
      console.error(
        `! deprecated slug "${slug}" still tagged on ${taggedProducts} product(s) — refusing to delete`
      );
      continue;
    }

    console.log(`- ${apply ? "removed" : "would remove"} deprecated ${slug}`);

    if (apply) {
      await categoriesColl.deleteOne({ slug });
    }

    removed++;
  }

  return removed;
}

try {
  await ensureUniqueSlugIndex();

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const category of ALL_CATEGORIES) {
    const result = await upsertCategory(category);

    if (result === "inserted") inserted++;
    else if (result === "updated") updated++;
    else unchanged++;
  }

  const removed = await cleanupDeprecatedSlugs();

  console.log(
    `\n${apply ? "APPLIED" : "DRY RUN"}: inserted=${inserted} updated=${updated} unchanged=${unchanged} removed=${removed}`
  );

  if (!apply) {
    console.log("Re-run with --apply to write.");
  }
} catch (error) {
  console.error("Seed failed:", error);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}