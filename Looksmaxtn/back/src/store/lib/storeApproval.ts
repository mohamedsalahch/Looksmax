export type StoreApprovalStatus = "pending" | "approved" | "rejected";

export function isStoreOwnerApproved(
  user?: { role?: string | null; storeApprovalStatus?: StoreApprovalStatus | null } | null
) {
  if (!user) return true;
  if (user.role !== "store_owner") return true;
  return !user.storeApprovalStatus || user.storeApprovalStatus === "approved";
}
