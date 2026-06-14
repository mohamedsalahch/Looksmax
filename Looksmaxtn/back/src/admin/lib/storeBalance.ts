import mongoose from "mongoose";
import type { IAuditActor } from "@/admin/lib/audit";
import StoreBalanceTransaction from "@/admin/models/StoreBalanceTransaction";
import WithdrawalRequest from "@/admin/models/WithdrawalRequest";
import User from "@/admin/models/User";
import Product from "@/admin/models/Product";
import Order from "@/admin/models/Order";
import type { IOrderItem } from "@/admin/models/Order";

export const COMMISSION_RATE = 0.1;

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export function calculateOrderEarningsByOwner(
  items: IOrderItem[],
  productOwnerMap: Map<string, string>
) {
  const earningsByOwner = new Map<string, number>();
  for (const item of items) {
    const ownerId = productOwnerMap.get(item.product.toString());
    if (!ownerId) continue;
    const gross = Number(item.price || 0) * Number(item.quantity || 0);
    const net = gross * (1 - COMMISSION_RATE);
    earningsByOwner.set(ownerId, (earningsByOwner.get(ownerId) || 0) + net);
  }

  return new Map(
    [...earningsByOwner.entries()]
      .map(([ownerId, amount]) => [ownerId, round2(amount)] as const)
      .filter(([, amount]) => amount > 0)
  );
}

export function serializeBalanceTransaction(transaction: {
  _id: unknown;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reason?: string | null;
  order?: unknown;
  withdrawal?: unknown;
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
    order: transaction.order ? String(transaction.order) : null,
    withdrawal: transaction.withdrawal ? String(transaction.withdrawal) : null,
    createdBy: transaction.createdBy || null,
    createdAt:
      transaction.createdAt instanceof Date
        ? transaction.createdAt.toISOString()
        : String(transaction.createdAt || ""),
  };
}

export function serializeWithdrawal(request: {
  _id: unknown;
  storeOwner: unknown;
  amount: number;
  paymentMethod: string;
  paymentDetails: string;
  note?: string | null;
  status: string;
  reviewedBy?: IAuditActor | null;
  reviewedAt?: Date | string | null;
  reviewNote?: string | null;
  createdAt?: Date | string | null;
}) {
  return {
    _id: String(request._id),
    storeOwner: String(request.storeOwner),
    amount: Number(request.amount || 0),
    paymentMethod: String(request.paymentMethod || "bank_transfer"),
    paymentDetails: String(request.paymentDetails || ""),
    note: String(request.note || ""),
    status: String(request.status || "pending"),
    reviewedBy: request.reviewedBy || null,
    reviewedAt:
      request.reviewedAt instanceof Date
        ? request.reviewedAt.toISOString()
        : request.reviewedAt
        ? String(request.reviewedAt)
        : null,
    reviewNote: String(request.reviewNote || ""),
    createdAt:
      request.createdAt instanceof Date
        ? request.createdAt.toISOString()
        : String(request.createdAt || ""),
  };
}

export async function getBalanceSummary(storeOwnerId: string | mongoose.Types.ObjectId) {
  const user = await User.findById(storeOwnerId).select("balance role").lean();
  if (!user) return null;

  const balance = round2(Number(user.balance || 0));
  const pendingAgg = await WithdrawalRequest.aggregate([
    { $match: { storeOwner: new mongoose.Types.ObjectId(String(storeOwnerId)), status: "pending" } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const pendingWithdrawals = round2(Number(pendingAgg[0]?.total || 0));

  return {
    balance,
    pendingWithdrawals,
    available: round2(Math.max(0, balance - pendingWithdrawals)),
  };
}

export async function getBalanceTransactions(
  storeOwnerId: string | mongoose.Types.ObjectId,
  limit = 100
) {
  const transactions = await StoreBalanceTransaction.find({ storeOwner: storeOwnerId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return transactions.map(serializeBalanceTransaction);
}

export async function getBalanceSaleHistory(
  storeOwnerId: string | mongoose.Types.ObjectId,
  limit = 100
) {
  const ownerObjectId = new mongoose.Types.ObjectId(String(storeOwnerId));
  const products = await Product.find({ "createdBy.id": String(storeOwnerId) })
    .select("_id")
    .lean();
  const ownerProductIds = new Set(products.map((product) => product._id.toString()));
  if (ownerProductIds.size === 0) return [];

  const orderIds = await StoreBalanceTransaction.find({
    storeOwner: ownerObjectId,
    type: "earning",
    order: { $ne: null },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("order createdAt amount")
    .lean();
  const transactionByOrder = new Map(
    orderIds.map((transaction) => [String(transaction.order), transaction])
  );

  const orders = await Order.find({ _id: { $in: [...transactionByOrder.keys()] } })
    .select("_id items orderStatus createdAt")
    .lean();

  return orders
    .flatMap((order) => {
      const transaction = transactionByOrder.get(order._id.toString());
      return (order.items || [])
        .filter((item) => ownerProductIds.has(item.product.toString()))
        .map((item) => {
          const gross = round2(Number(item.price || 0) * Number(item.quantity || 0));
          return {
            _id: `${order._id.toString()}:${item.product.toString()}:${item.variant ? item.variant.toString() : "default"}`,
            order: order._id.toString(),
            product: item.product.toString(),
            productName: String(item.name || "Product"),
            quantity: Number(item.quantity || 0),
            unitPrice: round2(Number(item.price || 0)),
            gross,
            net: round2(gross * (1 - COMMISSION_RATE)),
            orderStatus: String(order.orderStatus || ""),
            purchasedAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt || ""),
            creditedAt:
              transaction?.createdAt instanceof Date
                ? transaction.createdAt.toISOString()
                : String(transaction?.createdAt || ""),
          };
        });
    })
    .sort((a, b) => Date.parse(b.creditedAt || b.purchasedAt) - Date.parse(a.creditedAt || a.purchasedAt))
    .slice(0, limit);
}

export async function getWithdrawalsForOwner(
  storeOwnerId: string | mongoose.Types.ObjectId,
  limit = 50
) {
  const requests = await WithdrawalRequest.find({ storeOwner: storeOwnerId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return requests.map(serializeWithdrawal);
}

export async function creditOrderEarnings({
  orderId,
  items,
  actor,
}: {
  orderId: string | mongoose.Types.ObjectId;
  items: IOrderItem[];
  actor?: IAuditActor | null;
}) {
  if (!items?.length) return [];

  const productIds = items.map((item) => item.product);
  const products = await Product.find({ _id: { $in: productIds } })
    .select("_id createdBy")
    .lean();

  const productOwnerMap = new Map<string, string>();
  for (const product of products) {
    const ownerId = product.createdBy?.id;
    if (ownerId) productOwnerMap.set(product._id.toString(), ownerId);
  }

  const earningsByOwner = calculateOrderEarningsByOwner(items, productOwnerMap);

  const results: Array<{ ownerId: string; amount: number }> = [];
  for (const [ownerId, amount] of earningsByOwner.entries()) {
    const user = await User.findById(ownerId).select("balance role").lean();
    if (!user || user.role !== "store_owner") continue;

    const existingTransaction = await StoreBalanceTransaction.findOne({
      storeOwner: user._id,
      type: "earning",
      order: orderId,
    })
      .select("_id")
      .lean();
    if (existingTransaction) continue;

    const before = round2(Number(user.balance || 0));
    const after = round2(before + amount);

    try {
      await StoreBalanceTransaction.create({
        storeOwner: user._id,
        type: "earning",
        amount,
        balanceBefore: before,
        balanceAfter: after,
        reason: `Order #${String(orderId).slice(-8).toUpperCase()} delivered`,
        order: orderId,
        createdBy: actor || null,
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) continue;
      throw error;
    }

    const updateResult = await User.updateOne(
      { _id: user._id, role: "store_owner" },
      { $inc: { balance: amount } }
    );
    if (updateResult.matchedCount !== 1) {
      throw new Error(`Store owner ${ownerId} disappeared before earnings credit`);
    }

    results.push({ ownerId, amount });
  }

  return results;
}

export async function resetStoreBalance({
  storeOwnerId,
  actor,
  reason,
}: {
  storeOwnerId: string | mongoose.Types.ObjectId;
  actor: IAuditActor;
  reason?: string;
}) {
  const user = await User.findById(storeOwnerId).select("balance role");
  if (!user || user.role !== "store_owner") {
    throw new Error("Store owner not found");
  }

  const before = round2(Number(user.balance || 0));
  if (before !== 0) {
    user.balance = 0;
    await user.save();

    await StoreBalanceTransaction.create({
      storeOwner: user._id,
      type: "admin_adjustment",
      amount: round2(-before),
      balanceBefore: before,
      balanceAfter: 0,
      reason: reason?.trim() || "Admin balance reset",
      createdBy: actor,
    });
  }

  return getBalanceSummary(user._id as mongoose.Types.ObjectId);
}

export async function createWithdrawalRequest({
  storeOwnerId,
  amount,
  paymentMethod,
  paymentDetails,
  note,
}: {
  storeOwnerId: string | mongoose.Types.ObjectId;
  amount: number;
  paymentMethod: "bank_transfer" | "d17" | "other";
  paymentDetails: string;
  note?: string;
}) {
  const user = await User.findById(storeOwnerId).select("role balance");
  if (!user || user.role !== "store_owner") {
    throw new Error("Store owner not found");
  }

  const safeAmount = round2(Number(amount));
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    throw new Error("Enter an amount greater than 0");
  }
  if (!paymentDetails?.trim()) {
    throw new Error("Payment details are required");
  }

  const summary = await getBalanceSummary(user._id as mongoose.Types.ObjectId);
  if (!summary) throw new Error("Store owner not found");

  if (safeAmount > summary.available) {
    throw new Error(
      `Requested amount exceeds available balance (${summary.available.toFixed(2)})`
    );
  }

  const request = await WithdrawalRequest.create({
    storeOwner: user._id,
    amount: safeAmount,
    paymentMethod,
    paymentDetails: paymentDetails.trim(),
    note: note?.trim() || "",
    status: "pending",
  });

  const balance = round2(Number(user.balance || 0));
  await StoreBalanceTransaction.create({
    storeOwner: user._id,
    type: "withdrawal_pending",
    amount: 0,
    balanceBefore: balance,
    balanceAfter: balance,
    reason: `Withdrawal request submitted (${safeAmount.toFixed(2)})`,
    withdrawal: request._id,
    createdBy: null,
  });

  return request;
}

export async function approveWithdrawal({
  withdrawalId,
  actor,
  reviewNote,
}: {
  withdrawalId: string | mongoose.Types.ObjectId;
  actor: IAuditActor;
  reviewNote?: string;
}) {
  const request = await WithdrawalRequest.findById(withdrawalId);
  if (!request) throw new Error("Withdrawal not found");
  if (request.status !== "pending") {
    throw new Error("This withdrawal has already been reviewed");
  }

  const user = await User.findById(request.storeOwner).select("balance role");
  if (!user || user.role !== "store_owner") {
    throw new Error("Store owner not found");
  }

  const before = round2(Number(user.balance || 0));
  if (request.amount > before) {
    throw new Error("Owner balance is no longer enough to cover this withdrawal");
  }
  const after = round2(before - request.amount);

  user.balance = after;
  await user.save();

  request.status = "approved";
  request.reviewedBy = actor;
  request.reviewedAt = new Date();
  if (reviewNote !== undefined) request.reviewNote = reviewNote.trim();
  await request.save();

  await StoreBalanceTransaction.create({
    storeOwner: user._id,
    type: "withdrawal_approved",
    amount: -request.amount,
    balanceBefore: before,
    balanceAfter: after,
    reason: `Withdrawal approved (${request.amount.toFixed(2)})`,
    withdrawal: request._id,
    createdBy: actor,
  });

  return request;
}

export async function rejectWithdrawal({
  withdrawalId,
  actor,
  reviewNote,
}: {
  withdrawalId: string | mongoose.Types.ObjectId;
  actor: IAuditActor;
  reviewNote?: string;
}) {
  const request = await WithdrawalRequest.findById(withdrawalId);
  if (!request) throw new Error("Withdrawal not found");
  if (request.status !== "pending") {
    throw new Error("This withdrawal has already been reviewed");
  }

  request.status = "rejected";
  request.reviewedBy = actor;
  request.reviewedAt = new Date();
  if (reviewNote !== undefined) request.reviewNote = reviewNote.trim();
  await request.save();

  const user = await User.findById(request.storeOwner).select("balance");
  const balance = round2(Number(user?.balance || 0));
  await StoreBalanceTransaction.create({
    storeOwner: request.storeOwner,
    type: "withdrawal_rejected",
    amount: 0,
    balanceBefore: balance,
    balanceAfter: balance,
    reason: `Withdrawal rejected (${request.amount.toFixed(2)})${
      reviewNote ? ` — ${reviewNote.trim()}` : ""
    }`,
    withdrawal: request._id,
    createdBy: actor,
  });

  return request;
}
