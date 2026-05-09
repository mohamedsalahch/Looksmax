import mongoose from "mongoose";
import type { IAuditActor } from "@/admin/lib/audit";
import StoreCreditTransaction from "@/admin/models/StoreCreditTransaction";
import User from "@/admin/models/User";

const DEFAULT_ALLOWED = 50;

function getStats(user: { storeOwnerStats?: { triesAllowed?: number; triesUsed?: number } | null }) {
  const allowed = Number(user.storeOwnerStats?.triesAllowed ?? DEFAULT_ALLOWED);
  const used = Number(user.storeOwnerStats?.triesUsed ?? 0);
  return {
    allowed,
    used,
    remaining: Math.max(0, allowed - used),
  };
}

export function serializeStoreCreditTransaction(transaction: {
  _id: unknown;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason?: string | null;
  createdBy?: IAuditActor | null;
  createdAt?: Date | string | null;
}) {
  return {
    _id: String(transaction._id),
    type: transaction.type,
    amount: Number(transaction.amount || 0),
    balanceBefore: Number(transaction.balanceBefore || 0),
    balanceAfter: Number(transaction.balanceAfter || 0),
    reason: String(transaction.reason || ""),
    createdBy: transaction.createdBy || null,
    createdAt:
      transaction.createdAt instanceof Date
        ? transaction.createdAt.toISOString()
        : String(transaction.createdAt || ""),
  };
}

export async function getStoreCreditSummary(storeOwnerId: string | mongoose.Types.ObjectId) {
  const user = await User.findById(storeOwnerId).select("storeOwnerStats").lean();
  if (!user) return null;
  return getStats(user);
}

export async function getStoreCreditTransactions(storeOwnerId: string | mongoose.Types.ObjectId, limit = 50) {
  const transactions = await StoreCreditTransaction.find({ storeOwner: storeOwnerId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return transactions.map(serializeStoreCreditTransaction);
}

export async function adjustStoreCredits({
  storeOwnerId,
  amount,
  reason,
  actor,
}: {
  storeOwnerId: string | mongoose.Types.ObjectId;
  amount: number;
  reason: string;
  actor: IAuditActor;
}) {
  const user = await User.findById(storeOwnerId).select("role storeOwnerStats");
  if (!user || user.role !== "store_owner") {
    throw new Error("Store owner not found");
  }

  user.storeOwnerStats = user.storeOwnerStats || { triesAllowed: DEFAULT_ALLOWED, triesUsed: 0 };
  const before = getStats(user);
  const nextAllowed = before.allowed + amount;

  if (!Number.isInteger(amount) || amount === 0) {
    throw new Error("Enter a non-zero whole number of credits");
  }
  if (nextAllowed < before.used) {
    throw new Error(`Cannot reduce balance below used credits (${before.used}).`);
  }

  user.storeOwnerStats.triesAllowed = nextAllowed;
  await user.save();

  const after = getStats(user);
  await StoreCreditTransaction.create({
    storeOwner: user._id,
    type: "admin_adjustment",
    amount,
    balanceBefore: before.remaining,
    balanceAfter: after.remaining,
    triesAllowedBefore: before.allowed,
    triesAllowedAfter: after.allowed,
    triesUsedBefore: before.used,
    triesUsedAfter: after.used,
    reason,
    createdBy: actor,
  });

  return after;
}

export async function consumeStoreCredit({
  storeOwnerId,
  reason,
}: {
  storeOwnerId: string | mongoose.Types.ObjectId;
  reason: string;
}) {
  const user = await User.findById(storeOwnerId).select("role storeOwnerStats");
  if (!user || user.role !== "store_owner") {
    throw new Error("Store owner not found");
  }

  user.storeOwnerStats = user.storeOwnerStats || { triesAllowed: DEFAULT_ALLOWED, triesUsed: 0 };
  const before = getStats(user);

  if (before.used >= before.allowed) {
    throw new Error("Generation try limit reached. Contact admin for more tries.");
  }

  user.storeOwnerStats.triesUsed = before.used + 1;
  await user.save();

  const after = getStats(user);
  await StoreCreditTransaction.create({
    storeOwner: user._id,
    type: "usage",
    amount: -1,
    balanceBefore: before.remaining,
    balanceAfter: after.remaining,
    triesAllowedBefore: before.allowed,
    triesAllowedAfter: after.allowed,
    triesUsedBefore: before.used,
    triesUsedAfter: after.used,
    reason,
    createdBy: null,
  });

  return after;
}
