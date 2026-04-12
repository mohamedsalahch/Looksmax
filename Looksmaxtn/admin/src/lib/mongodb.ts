import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/looksmax";

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
  var looksmaxCanceledReservationCleanupDone: boolean | undefined;
}

const cached: MongooseCache = global.mongooseCache || { conn: null, promise: null };
if (!global.mongooseCache) global.mongooseCache = cached;

async function cleanupCanceledOrderReservations(conn: typeof mongoose = mongoose) {
  const ordersCollection = conn.connection.db?.collection("orders");
  const reservationsCollection = conn.connection.db?.collection("productreservations");
  if (!ordersCollection || !reservationsCollection) {
    return;
  }

  const canceledOrders = await ordersCollection
    .find(
      { orderStatus: { $in: ["canceled", "returned"] } },
      { projection: { user: 1, items: 1 } }
    )
    .toArray();

  for (const order of canceledOrders) {
    const userId = String(order.user || "");
    const productIds = Array.isArray(order.items)
      ? order.items.map((item: { product?: unknown }) => item.product).filter(Boolean)
      : [];

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
    if (!global.looksmaxCanceledReservationCleanupDone) {
      try {
        await cleanupCanceledOrderReservations(cached.conn);
      } catch {
        // Ignore cleanup errors and keep the app running.
      }
      global.looksmaxCanceledReservationCleanupDone = true;
    }
    return cached.conn;
  }

  if (!cached.promise) cached.promise = mongoose.connect(MONGODB_URI).then((m) => m);
  cached.conn = await cached.promise;
  try {
    await cleanupCanceledOrderReservations(cached.conn);
  } catch {
    // Ignore cleanup errors and keep the app running.
  }
  global.looksmaxCanceledReservationCleanupDone = true;
  return cached.conn;
}
