// Usage:
//   Local/dev (reads back/.env via dotenv, walks dev paths):
//     cd back && node scripts/migrate-uploads-to-r2.mjs [--dry-run|--upload-only]
//
//   Production — files live in the shared_uploads Docker volume mounted at /shared-uploads.
//   The script isn't baked into the runner image, so bind-mount it at run time:
//     docker compose -f docker-compose.prod.yml run --rm \
//       -v "$(pwd)/back/scripts:/app/scripts" \
//       back \
//       node /app/scripts/migrate-uploads-to-r2.mjs [--dry-run|--upload-only]
//   This attaches the shared_uploads volume, loads back/.env.production via env_file,
//   and joins the compose network so mongoose can reach mongodb:27017.
//
//   Modes:
//     --dry-run        report only, no uploads, no Mongo writes
//     --upload-only    upload to R2, skip Mongo path rewrites
//     (no flag)        upload + rewrite Mongo
//
// Required env:
//   MONGODB_URI, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL
//
// Optional env:
//   LOOKSMAX_UPLOADS_DIR  if set (e.g. /shared-uploads in prod), the script reads files from
//                         <LOOKSMAX_UPLOADS_DIR>/<category>/ and prefers it over the dev layout.

// dotenv is dev-only; ignore if missing (production sets env via docker env_file).
try {
  await import("dotenv/config");
} catch {}
import path from "path";
import { readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import mongoose from "mongoose";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const UPLOAD_ONLY = args.includes("--upload-only");

const required = [
  "MONGODB_URI",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing env var: ${key}`);
    process.exit(1);
  }
}

const PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL.replace(/\/$/, "");
const BUCKET = process.env.R2_BUCKET;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const PROJECT_ROOT = path.resolve(process.cwd(), "..");
const FRONT_UPLOADS = path.join(PROJECT_ROOT, "front", "public", "uploads");
const ADMIN_UPLOADS = path.join(PROJECT_ROOT, "admin", "public", "uploads");
const SHARED_UPLOADS = process.env.LOOKSMAX_UPLOADS_DIR?.trim() || "";

// Build per-category candidate dirs. Prefer shared-volume layout (production)
// over the dev layout when LOOKSMAX_UPLOADS_DIR is set.
function categoryDirs(category, devDir) {
  const dirs = [];
  if (SHARED_UPLOADS) dirs.push(path.join(SHARED_UPLOADS, category));
  if (devDir) dirs.push(devDir);
  return dirs;
}

// (R2 prefix, list of candidate source dirs ordered by preference)
const CATEGORIES = [
  ["body-profiles", categoryDirs("body-profiles", path.join(FRONT_UPLOADS, "body-profiles"))],
  ["products", categoryDirs("products", path.join(ADMIN_UPLOADS, "products"))],
  ["models", categoryDirs("models", path.join(ADMIN_UPLOADS, "models"))],
  ["homepage", categoryDirs("homepage", path.join(ADMIN_UPLOADS, "homepage"))],
  ["generated-images", categoryDirs("generated-images", path.join(ADMIN_UPLOADS, "generated-images"))],
];

function contentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

async function existsInR2(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err) {
    if (err.$metadata?.httpStatusCode === 404 || err.name === "NotFound") return false;
    throw err;
  }
}

async function uploadFile(srcPath, key) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would upload ${srcPath} -> ${key}`);
    return;
  }
  if (await existsInR2(key)) {
    console.log(`  skip (already in R2): ${key}`);
    return;
  }
  const body = await readFile(srcPath);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType(srcPath),
    })
  );
  console.log(`  uploaded: ${key}`);
}

async function uploadCategory(prefix, candidateDirs) {
  const dir = candidateDirs.find((d) => d && existsSync(d));
  if (!dir) {
    console.log(`[${prefix}] no source dir found, skipping`);
    return 0;
  }
  console.log(`[${prefix}] source: ${dir}`);
  const entries = await readdir(dir, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const srcPath = path.join(dir, entry.name);
    const key = `${prefix}/${entry.name}`;
    await uploadFile(srcPath, key);
    count += 1;
  }
  console.log(`[${prefix}] processed ${count} files`);
  return count;
}

function legacyToR2(value) {
  if (typeof value !== "string" || !value.startsWith("/uploads/")) return value;
  const relative = value.slice("/uploads/".length); // "<category>/<filename>"
  return `${PUBLIC_BASE_URL}/${relative}`;
}

function rewriteIfLegacy(value) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/uploads/")) return null;
  return legacyToR2(value);
}

async function migrateMongoPaths() {
  console.log("\n=== Mongo path rewrite ===");
  const conn = await mongoose.connect(process.env.MONGODB_URI);
  const db = conn.connection.db;

  // Users.bodyProfile.{profileImage,profileImageEnhanced}
  await rewriteCollectionScalar(db, "users", [
    "bodyProfile.profileImage",
    "bodyProfile.profileImageEnhanced",
  ]);

  // Products.images[].url, Products.originPictures.{front,back,left,right}, Products.cloneSourceImage
  await rewriteProducts(db);

  // ModelAssets.{frontImage,backImage,images[]}
  await rewriteCollectionScalar(db, "modelassets", ["frontImage", "backImage"]);
  await rewriteCollectionArray(db, "modelassets", "images");

  // GeneratedImageAssets.{sourceImages[],images[]}
  await rewriteCollectionArray(db, "generatedimageassets", "sourceImages");
  await rewriteCollectionArray(db, "generatedimageassets", "images");

  // HomePageContent.{hero.image, editorial.image, lookbook.images[]}
  await rewriteCollectionScalar(db, "homepagecontents", ["hero.image", "editorial.image"]);
  await rewriteCollectionArray(db, "homepagecontents", "lookbook.images");

  await mongoose.disconnect();
}

async function rewriteCollectionScalar(db, collectionName, fields) {
  const coll = db.collection(collectionName);
  for (const field of fields) {
    const docs = await coll
      .find({ [field]: { $regex: "^/uploads/" } }, { projection: { _id: 1, [field]: 1 } })
      .toArray();
    if (!docs.length) continue;
    console.log(`[${collectionName}.${field}] ${docs.length} docs to rewrite`);
    for (const doc of docs) {
      const current = field.split(".").reduce((acc, k) => (acc ? acc[k] : undefined), doc);
      const next = legacyToR2(current);
      if (DRY_RUN) {
        console.log(`  [dry-run] _id=${doc._id} ${current} -> ${next}`);
        continue;
      }
      await coll.updateOne({ _id: doc._id }, { $set: { [field]: next } });
    }
  }
}

async function rewriteCollectionArray(db, collectionName, arrayField) {
  const coll = db.collection(collectionName);
  const docs = await coll
    .find({ [arrayField]: { $regex: "^/uploads/" } }, { projection: { _id: 1, [arrayField]: 1 } })
    .toArray();
  if (!docs.length) return;
  console.log(`[${collectionName}.${arrayField}] ${docs.length} docs to rewrite`);
  for (const doc of docs) {
    const current = arrayField.split(".").reduce((acc, k) => (acc ? acc[k] : undefined), doc);
    if (!Array.isArray(current)) continue;
    const next = current.map((v) => (typeof v === "string" ? legacyToR2(v) : v));
    if (DRY_RUN) {
      console.log(`  [dry-run] _id=${doc._id} array rewritten`);
      continue;
    }
    await coll.updateOne({ _id: doc._id }, { $set: { [arrayField]: next } });
  }
}

async function rewriteProducts(db) {
  const coll = db.collection("products");
  const cursor = coll.find({
    $or: [
      { "images.url": { $regex: "^/uploads/" } },
      { "originPictures.front": { $regex: "^/uploads/" } },
      { "originPictures.back": { $regex: "^/uploads/" } },
      { "originPictures.left": { $regex: "^/uploads/" } },
      { "originPictures.right": { $regex: "^/uploads/" } },
      { cloneSourceImage: { $regex: "^/uploads/" } },
    ],
  });
  let count = 0;
  for await (const doc of cursor) {
    const update = {};
    if (Array.isArray(doc.images)) {
      const nextImages = doc.images.map((img) => {
        if (img && typeof img === "object" && typeof img.url === "string") {
          const rewritten = rewriteIfLegacy(img.url);
          if (rewritten) return { ...img, url: rewritten };
        }
        return img;
      });
      if (JSON.stringify(nextImages) !== JSON.stringify(doc.images)) {
        update.images = nextImages;
      }
    }
    for (const side of ["front", "back", "left", "right"]) {
      const v = doc.originPictures?.[side];
      const rewritten = rewriteIfLegacy(v);
      if (rewritten) update[`originPictures.${side}`] = rewritten;
    }
    const cloneRewritten = rewriteIfLegacy(doc.cloneSourceImage);
    if (cloneRewritten) update.cloneSourceImage = cloneRewritten;

    if (Object.keys(update).length === 0) continue;
    count += 1;
    if (DRY_RUN) {
      console.log(`  [dry-run] product _id=${doc._id} update fields: ${Object.keys(update).join(", ")}`);
      continue;
    }
    await coll.updateOne({ _id: doc._id }, { $set: update });
  }
  console.log(`[products] rewrote ${count} docs`);
}

async function main() {
  console.log(`R2 bucket: ${BUCKET}`);
  console.log(`Public base: ${PUBLIC_BASE_URL}`);
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : UPLOAD_ONLY ? "UPLOAD ONLY" : "FULL MIGRATION"}\n`);

  console.log("=== Uploading files to R2 ===");
  for (const [prefix, dirs] of CATEGORIES) {
    await uploadCategory(prefix, dirs);
  }

  if (UPLOAD_ONLY) {
    console.log("\nUpload-only mode — skipping Mongo updates.");
    return;
  }

  await migrateMongoPaths();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
