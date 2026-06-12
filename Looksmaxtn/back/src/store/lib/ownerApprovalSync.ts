import Product from "@/store/models/Product";

/**
 * Keep the denormalized `ownerApproved` flag on products in sync with the
 * owner's store approval state. The storefront listing filters on this flag
 * instead of joining every product's owner on each request.
 */
export async function syncProductsOwnerApproved(ownerId: string, approved: boolean) {
  if (!ownerId) return;
  try {
    await Product.updateMany(
      { "createdBy.id": ownerId },
      { $set: { ownerApproved: approved } }
    );
  } catch (error) {
    console.error("[ownerApprovalSync] Failed to sync products for owner", ownerId, error);
  }
}
