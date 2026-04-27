import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI is required");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);

const users = mongoose.connection.collection("users");
const stores = mongoose.connection.collection("stores");
const products = mongoose.connection.collection("products");
const orders = mongoose.connection.collection("orders");

let mainStore = await stores.findOne({ isMainStore: true });

if (!mainStore) {
  const admin = await users.findOne({ role: "admin" }, { projection: { _id: 1 } });
  if (!admin) {
    throw new Error("Cannot create Looksmaxtn main store: no admin user exists");
  }

  const now = new Date();
  const result = await stores.insertOne({
    owner: admin._id,
    name: "Looksmaxtn",
    slug: "looksmaxtn",
    logo: "/logo.png",
    category: "clothing",
    status: "approved",
    isMainStore: true,
    createdAt: now,
    updatedAt: now,
  });
  mainStore = { _id: result.insertedId, name: "Looksmaxtn" };
}

await products.updateMany(
  { $or: [{ store: { $exists: false } }, { store: null }] },
  { $set: { store: mainStore._id, storeNameSnapshot: "Looksmaxtn" } }
);

const legacyOrders = await orders.find({
  $or: [{ storeIds: { $exists: false } }, { storeIds: { $size: 0 } }],
}).toArray();

for (const order of legacyOrders) {
  const nextItems = (order.items || []).map((item) => ({
    ...item,
    store: item.store || mainStore._id,
    storeNameSnapshot: item.storeNameSnapshot || "Looksmaxtn",
  }));

  await orders.updateOne(
    { _id: order._id },
    {
      $set: {
        items: nextItems,
        storeIds: [mainStore._id],
      },
    }
  );
}

console.log(`Backfilled Looksmaxtn main store ${mainStore._id}`);
await mongoose.disconnect();
