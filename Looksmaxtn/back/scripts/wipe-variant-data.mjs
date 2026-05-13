// One-shot wipe before the variants-schema migration cutover.
// Drops Product, ProductReservation, and Order collections. Dev-stage only.
//
// Usage:
//   node scripts/wipe-variant-data.mjs --confirm

import "dotenv/config";
import mongoose from "mongoose";

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("Missing MONGODB_URI env var");
  process.exit(1);
}

if (!process.argv.includes("--confirm")) {
  console.error("Refusing to run without --confirm. This drops Product, ProductReservation, and Order collections.");
  process.exit(1);
}

await mongoose.connect(MONGO_URI);
const db = mongoose.connection.db;
if (!db) {
  console.error("No active connection");
  process.exit(1);
}

const targets = ["products", "productreservations", "orders"];
for (const name of targets) {
  const exists = await db.listCollections({ name }).hasNext();
  if (!exists) {
    console.log(`${name}: not present, skipping`);
    continue;
  }
  await db.collection(name).drop();
  console.log(`${name}: dropped`);
}

await mongoose.disconnect();
