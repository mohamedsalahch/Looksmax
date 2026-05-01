// Usage:
//   node scripts/inspect-categories.mjs
//
// Reads all categories from Mongo and prints:
//   - the full tree (by parentSlug)
//   - duplicate slugs (should be none — slug is unique)
//   - orphans (parentSlug set but no matching parent doc)
//   - inactive nodes
//   - leaves (no children) — these are the "last level" categories

import "dotenv/config";
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("Missing MONGODB_URI env var");
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
const coll = mongoose.connection.collection("categories");

const all = await coll.find({}).sort({ parentSlug: 1, order: 1, name: 1 }).toArray();
console.log(`\nTotal categories: ${all.length}\n`);

const bySlug = new Map();
const childrenOf = new Map(); // parentSlug -> [docs]
for (const c of all) {
  bySlug.set(c.slug, c);
  const k = c.parentSlug ?? null;
  if (!childrenOf.has(k)) childrenOf.set(k, []);
  childrenOf.get(k).push(c);
}

// duplicates
const slugCounts = new Map();
for (const c of all) slugCounts.set(c.slug, (slugCounts.get(c.slug) || 0) + 1);
const dupes = [...slugCounts.entries()].filter(([, n]) => n > 1);
if (dupes.length) {
  console.log("DUPLICATE SLUGS:");
  for (const [s, n] of dupes) console.log(`  ${s} x${n}`);
} else {
  console.log("OK: no duplicate slugs");
}

// orphans
const orphans = all.filter((c) => c.parentSlug && !bySlug.has(c.parentSlug));
if (orphans.length) {
  console.log("\nORPHANS (parentSlug points to nothing):");
  for (const c of orphans) console.log(`  ${c.slug}  (parentSlug=${c.parentSlug})`);
} else {
  console.log("OK: no orphans");
}

// inactive
const inactive = all.filter((c) => c.isActive === false);
if (inactive.length) {
  console.log(`\nINACTIVE (${inactive.length}):`);
  for (const c of inactive) console.log(`  ${c.slug}`);
}

// tree print
console.log("\n=== TREE ===");
function walk(parent, depth) {
  const kids = childrenOf.get(parent) || [];
  for (const c of kids) {
    const pad = "  ".repeat(depth);
    const flag = c.isActive === false ? " [inactive]" : "";
    console.log(`${pad}- ${c.name}  (slug=${c.slug}, order=${c.order})${flag}`);
    walk(c.slug, depth + 1);
  }
}
walk(null, 0);

// leaves
const leaves = all.filter((c) => !childrenOf.has(c.slug));
console.log(`\n=== LEAVES (${leaves.length}) ===`);
for (const c of leaves) {
  // build path
  const path = [];
  let cur = c;
  while (cur) {
    path.unshift(cur.slug);
    cur = cur.parentSlug ? bySlug.get(cur.parentSlug) : null;
  }
  console.log(`  ${path.join(" / ")}   (name="${c.name}")`);
}

await mongoose.disconnect();
