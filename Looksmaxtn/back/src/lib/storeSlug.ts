import type { Model, Types } from "mongoose";

type StoreSlugDoc = {
  _id: Types.ObjectId;
  storeSlug?: string;
};

export function slugifyStoreName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createUniqueStoreSlug<T extends StoreSlugDoc>(
  UserModel: Model<T>,
  storeName: string,
  ownerId?: Types.ObjectId | null
) {
  const baseSlug = slugifyStoreName(storeName) || "store";
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const query: { storeSlug: string; _id?: { $ne: Types.ObjectId } } = { storeSlug: slug };
    if (ownerId) {
      query._id = { $ne: ownerId };
    }

    const existing = await UserModel.collection.findOne(query, { projection: { _id: 1 } });
    if (!existing) return slug;

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}
