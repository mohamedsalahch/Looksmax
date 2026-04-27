import mongoose from "mongoose";

type StoreModel = mongoose.Model<{
  owner: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  logo: string;
  category: string;
  status: "pending" | "approved" | "disabled";
  isMainStore: boolean;
}>;

type UserModel = mongoose.Model<{
  role: string;
}>;

export async function ensureMainStore(Store: StoreModel, User: UserModel) {
  const existing = await Store.findOne({ isMainStore: true });
  if (existing) return existing;

  const adminUser = await User.findOne({ role: "admin" }).select("_id");
  if (!adminUser?._id) {
    throw new Error("Cannot create main store without an admin user");
  }

  return Store.create({
    owner: adminUser._id,
    name: "Looksmaxtn",
    slug: "looksmaxtn",
    logo: "/logo.png",
    category: "clothing",
    status: "approved",
    isMainStore: true,
  });
}
