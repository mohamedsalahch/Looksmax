import mongoose from "mongoose";
import ProductReservation from "@/store/models/ProductReservation";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/looksmax";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
  var looksmaxReservationIndexCleanupDone: boolean | undefined;
}

const cached: MongooseCache = global.mongooseCache || { conn: null, promise: null };

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

export async function cleanupProductReservationIndexes(conn: typeof mongoose = mongoose) {
  const collection = conn.connection.db?.collection("productreservations");
  if (!collection) {
    return;
  }

  const indexes = await collection.indexes();
  const obsoleteIndex = indexes.find(
    (index) =>
      index.name === "product_1" &&
      Array.isArray(index.key) === false &&
      typeof index.key === "object" &&
      "product" in index.key &&
      (index.key as Record<string, number>).product === 1
  );

  if (obsoleteIndex) {
    await collection.dropIndex(obsoleteIndex.name);
  }

  await ProductReservation.syncIndexes();
}

export default async function dbConnect() {
  if (cached.conn) {
    if (!global.looksmaxReservationIndexCleanupDone) {
      try {
        await cleanupProductReservationIndexes(mongoose);
      } catch {
        // Ignore index cleanup errors and keep the app running.
      }

      global.looksmaxReservationIndexCleanupDone = true;
    }
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI).then((m) => m);
  }

  cached.conn = await cached.promise;
  try {
    await cleanupProductReservationIndexes(cached.conn);
  } catch {
    // Ignore index cleanup errors and keep the app running.
  }
  global.looksmaxReservationIndexCleanupDone = true;
  return cached.conn;
}
