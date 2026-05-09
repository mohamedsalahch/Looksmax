// Usage:
//   node scripts/backfill-store-slugs.mjs
//   node scripts/backfill-store-slugs.mjs --apply
//   node scripts/backfill-store-slugs.mjs --apply --force
//
// Default mode is a dry run. Use --force to regenerate existing storeSlug values.

import path from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";

try {
  const dotenv = await import("dotenv");
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const backDir = path.resolve(scriptDir, "..");
  const envNames =
    process.env.NODE_ENV === "development"
      ? [".env", ".env.production"]
      : [".env.production", ".env"];

  for (const envName of envNames) {
    const envPath = path.join(backDir, envName);
    if (!existsSync(envPath)) continue;
    dotenv.config({ path: envPath });
    break;
  }
} catch {
  // Docker/runtime environments can provide env vars directly.
}

import mongoose from "mongoose";

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("Missing MONGODB_URI env var");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const force = process.argv.includes("--force");

function slugifyStoreName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createUniqueSlug(baseValue, usedSlugs) {
  const baseSlug = slugifyStoreName(baseValue) || "store";
  let slug = baseSlug;
  let suffix = 2;

  while (usedSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  usedSlugs.add(slug);
  return slug;
}

await mongoose.connect(MONGO_URI);

const users = mongoose.connection.collection("users");
const storeOwners = await users
  .find({
    role: "store_owner",
    $or: [{ storeName: { $exists: true, $ne: "" } }, { name: { $exists: true, $ne: "" } }],
  })
  .sort({ createdAt: 1, _id: 1 })
  .toArray();

const usedSlugs = new Set();
for (const owner of storeOwners) {
  const existingSlug = slugifyStoreName(owner.storeSlug);
  if (existingSlug && !force) usedSlugs.add(existingSlug);
}

const updates = [];
const unchanged = [];

for (const owner of storeOwners) {
  const currentSlug = slugifyStoreName(owner.storeSlug);
  const storeName = String(owner.storeName || owner.name || "").trim();

  if (currentSlug && !force) {
    unchanged.push({ owner, slug: currentSlug, reason: "already has storeSlug" });
    continue;
  }

  const nextSlug = createUniqueSlug(storeName, usedSlugs);
  if (currentSlug === nextSlug) {
    unchanged.push({ owner, slug: currentSlug, reason: "already current" });
    continue;
  }

  updates.push({ owner, storeName, currentSlug, nextSlug });
}

console.log(`Store owners found: ${storeOwners.length}`);
console.log(`Pending updates: ${updates.length}`);
console.log(`Unchanged: ${unchanged.length}`);
console.log(`Mode: ${apply ? "apply" : "dry-run"}${force ? " with --force" : ""}`);

for (const update of updates) {
  const label = update.storeName || update.owner.email || update.owner._id.toString();
  console.log(`- ${label}: ${update.currentSlug || "(empty)"} -> ${update.nextSlug}`);
}

if (apply && updates.length > 0) {
  const now = new Date();
  const operations = updates.map((update) => ({
    updateOne: {
      filter: { _id: update.owner._id },
      update: { $set: { storeSlug: update.nextSlug, updatedAt: now } },
    },
  }));

  const result = await users.bulkWrite(operations, { ordered: false });
  console.log(`Updated documents: ${result.modifiedCount}`);
} else if (!apply) {
  console.log("Dry run only. Re-run with --apply to write changes.");
}

await mongoose.disconnect();
