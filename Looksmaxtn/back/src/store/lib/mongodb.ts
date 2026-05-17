import mongoose from "mongoose";
import ProductReservation from "@/store/models/ProductReservation";
import Order from "@/store/models/Order";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/looksmax";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongooseCache: MongooseCache | undefined;
  var looksmaxReservationIndexCleanupDone: boolean | undefined;
  var looksmaxCanceledReservationCleanupDone: boolean | undefined;
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
  const obsoleteIndexNames = new Set<string>();
  for (const index of indexes) {
    if (typeof index.name !== "string") continue;
    if (index.name === "product_1") {
      obsoleteIndexNames.add(index.name);
      continue;
    }
    // Old uniqueness was keyed on `size`; variants migration replaces it with `variant`.
    if (
      typeof index.key === "object" &&
      index.key !== null &&
      "size" in (index.key as Record<string, unknown>)
    ) {
      obsoleteIndexNames.add(index.name);
    }
  }

  for (const name of obsoleteIndexNames) {
    try {
      await collection.dropIndex(name);
    } catch {
      // Index may not exist on a fresh DB; ignore.
    }
  }

  await ProductReservation.syncIndexes();
}

export async function cleanupCanceledOrderReservations(conn: typeof mongoose = mongoose) {
  const ordersCollection = conn.connection.db?.collection("orders");
  const reservationsCollection = conn.connection.db?.collection("productreservations");
  if (!ordersCollection || !reservationsCollection) {
    return;
  }

  const canceledOrders = await Order.find({ orderStatus: { $in: ["canceled", "returned"] } })
    .select("user items.product")
    .lean();

  for (const order of canceledOrders) {
    const userId = String(order.user || "");
    const productIds = (order.items || [])
      .map((item) => item.product)
      .filter((productId): productId is mongoose.Types.ObjectId => Boolean(productId));

    if (!userId || productIds.length === 0) {
      continue;
    }

    await reservationsCollection.deleteMany({
      product: { $in: productIds },
      reservationKey: `user:${userId}`,
    });
  }
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
    if (!global.looksmaxCanceledReservationCleanupDone) {
      try {
        await cleanupCanceledOrderReservations(mongoose);
      } catch {
        // Ignore reservation cleanup errors and keep the app running.
      }

      global.looksmaxCanceledReservationCleanupDone = true;
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
  try {
    await cleanupCanceledOrderReservations(cached.conn);
  } catch {
    // Ignore reservation cleanup errors and keep the app running.
  }
  global.looksmaxReservationIndexCleanupDone = true;
  global.looksmaxCanceledReservationCleanupDone = true;
  return cached.conn;
}
