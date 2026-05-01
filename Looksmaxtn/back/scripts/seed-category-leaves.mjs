// Usage:
//   node scripts/seed-category-leaves.mjs            # dry run
//   node scripts/seed-category-leaves.mjs --apply    # actually write
//
// Adds 4th-level (sub-leaf) categories under existing men/women garment branches.
// Idempotent: upserts by `slug` (which is unique). Re-runnable safely.
// Aborts if any required parent slug is missing in the DB.

import "dotenv/config";
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("Missing MONGODB_URI env var");
  process.exit(1);
}

const apply = process.argv.includes("--apply");

// [parentSlug, [name, slug] ...]
const GROUPS = [
  ["top-men", [
    ["T-Shirts",            "tshirts-men"],
    ["Polos",               "polos-men"],
    ["Shirts",              "shirts-men"],
    ["Hoodies",             "hoodies-men"],
    ["Sweatshirts",         "sweatshirts-men"],
    ["Tank Tops",           "tank-tops-men"],
    ["Sweaters / Knitwear", "sweaters-men"],
  ]],
  ["bottom-men", [
    ["Jeans",               "jeans-men"],
    ["Trousers",            "trousers-men"],
    ["Shorts",              "shorts-men"],
    ["Sweatpants",          "sweatpants-men"],
    ["Chinos",              "chinos-men"],
  ]],
  ["outerwear-men", [
    ["Jackets",             "jackets-men"],
    ["Coats",               "coats-men"],
    ["Blazers",             "blazers-men"],
    ["Windbreakers",        "windbreakers-men"],
    ["Vests",               "vests-men"],
  ]],
  ["footwear-men", [
    ["Sneakers",            "sneakers-men"],
    ["Boots",               "boots-men"],
    ["Sandals",             "sandals-men"],
    ["Loafers",             "loafers-men"],
    ["Formal Shoes",        "formal-shoes-men"],
  ]],
  ["headwear-men", [
    ["Caps",                "caps-men"],
    ["Beanies",             "beanies-men"],
    ["Hats",                "hats-men"],
  ]],

  ["top-women", [
    ["T-Shirts",            "tshirts-women"],
    ["Blouses",             "blouses-women"],
    ["Shirts",              "shirts-women"],
    ["Crop Tops",           "crop-tops-women"],
    ["Hoodies",             "hoodies-women"],
    ["Sweaters",            "sweaters-women"],
    ["Tank Tops",           "tank-tops-women"],
  ]],
  ["bottom-women", [
    ["Jeans",               "jeans-women"],
    ["Trousers",            "trousers-women"],
    ["Skirts",              "skirts-women"],
    ["Shorts",              "shorts-women"],
    ["Leggings",            "leggings-women"],
    ["Sweatpants",          "sweatpants-women"],
  ]],
  ["dress-women", [
    ["Casual Dresses",      "casual-dresses-women"],
    ["Evening Dresses",     "evening-dresses-women"],
    ["Maxi Dresses",        "maxi-dresses-women"],
    ["Mini Dresses",        "mini-dresses-women"],
    ["Bodycon Dresses",     "bodycon-dresses-women"],
  ]],
  ["outerwear-women", [
    ["Jackets",             "jackets-women"],
    ["Coats",               "coats-women"],
    ["Blazers",             "blazers-women"],
    ["Cardigans",           "cardigans-women"],
  ]],
  ["handbag-women", [
    ["Tote Bags",           "tote-bags-women"],
    ["Shoulder Bags",       "shoulder-bags-women"],
    ["Crossbody Bags",      "crossbody-bags-women"],
    ["Clutches",            "clutches-women"],
    ["Backpacks",           "backpacks-women"],
  ]],
  ["footwear-women", [
    ["Heels",               "heels-women"],
    ["Flats",               "flats-women"],
    ["Sneakers",            "sneakers-women"],
    ["Boots",               "boots-women"],
    ["Sandals",             "sandals-women"],
  ]],
];

// Slugs from earlier iterations of this seed. Deleted if found.
// Aborts (instead of deleting) if any product still references them.
const DEPRECATED_SLUGS = ["joggers-men"];

await mongoose.connect(MONGO_URI);
const coll = mongoose.connection.collection("categories");

// 1. Verify all parents exist
const requiredParents = [...new Set(GROUPS.map(([p]) => p))];
const foundParents = await coll
  .find({ slug: { $in: requiredParents } }, { projection: { slug: 1 } })
  .toArray();
const foundSet = new Set(foundParents.map((d) => d.slug));
const missing = requiredParents.filter((s) => !foundSet.has(s));
if (missing.length) {
  console.error("Missing parent slugs in DB — aborting:");
  for (const s of missing) console.error("  " + s);
  await mongoose.disconnect();
  process.exit(1);
}

// 2. Check slug-uniqueness assumption: no planned slug collides with an
//    existing doc that has a different parentSlug.
const plannedSlugs = GROUPS.flatMap(([parent, kids]) =>
  kids.map(([, slug]) => ({ slug, parent }))
);
const existing = await coll
  .find({ slug: { $in: plannedSlugs.map((p) => p.slug) } })
  .toArray();
const conflicts = [];
for (const ex of existing) {
  const planned = plannedSlugs.find((p) => p.slug === ex.slug);
  if (planned && ex.parentSlug !== planned.parent) {
    conflicts.push({ slug: ex.slug, existingParent: ex.parentSlug, plannedParent: planned.parent });
  }
}
if (conflicts.length) {
  console.error("Slug collisions (existing doc has different parentSlug):");
  for (const c of conflicts) console.error(`  ${c.slug}: have parent=${c.existingParent}, want=${c.plannedParent}`);
  await mongoose.disconnect();
  process.exit(1);
}

// 3. Upsert
const now = new Date();
let inserted = 0, updated = 0, unchanged = 0;
for (const [parentSlug, kids] of GROUPS) {
  for (let i = 0; i < kids.length; i++) {
    const [name, slug] = kids[i];
    const order = i;
    const doc = { name, slug, order, isActive: true, parentSlug };

    if (!apply) {
      const ex = existing.find((e) => e.slug === slug);
      if (!ex) { inserted++; console.log(`+ insert ${slug}  (under ${parentSlug}, order=${order}, name="${name}")`); }
      else if (ex.name !== name || ex.order !== order || ex.isActive !== true || ex.parentSlug !== parentSlug) {
        updated++; console.log(`~ update ${slug}  (under ${parentSlug}, order=${order}, name="${name}")`);
      } else { unchanged++; }
      continue;
    }

    const res = await coll.updateOne(
      { slug },
      {
        $set: { name, order, isActive: true, parentSlug, updatedAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
    if (res.upsertedCount) { inserted++; console.log(`+ inserted ${slug}`); }
    else if (res.modifiedCount) { updated++; console.log(`~ updated  ${slug}`); }
    else { unchanged++; }
  }
}

// 4. Cleanup deprecated slugs
let removed = 0;
const productsColl = mongoose.connection.collection("products");
for (const slug of DEPRECATED_SLUGS) {
  const ex = await coll.findOne({ slug });
  if (!ex) continue;
  const taggedProducts = await productsColl.countDocuments({ categories: slug });
  if (taggedProducts > 0) {
    console.error(`! deprecated slug "${slug}" still tagged on ${taggedProducts} product(s) — refusing to delete`);
    continue;
  }
  console.log(`- ${apply ? "removed" : "would remove"} deprecated ${slug}`);
  if (apply) await coll.deleteOne({ slug });
  removed++;
}

console.log(`\n${apply ? "APPLIED" : "DRY RUN"}: inserted=${inserted} updated=${updated} unchanged=${unchanged} removed=${removed}`);
if (!apply) console.log("Re-run with --apply to write.");

await mongoose.disconnect();
