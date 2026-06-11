import mongoose from "mongoose";
import Order from "@/store/models/Order";
import { INITIAL_OUTFIT_STUDIO_TRIES } from "@/store/lib/outfitStudioConfig";

const TRIES_PER_100_TND = 5;
const BONUS_THRESHOLD = 100;

export function normalizeInitialOutfitStudioTries(value: number | undefined | null) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return INITIAL_OUTFIT_STUDIO_TRIES;
  }

  return Math.min(numericValue, INITIAL_OUTFIT_STUDIO_TRIES);
}

export async function calculateUserOutfitStudioTries(
  userId: string | mongoose.Types.ObjectId,
  userInitialTries: number = INITIAL_OUTFIT_STUDIO_TRIES
): Promise<{ total: number; bonusFromSpending: number }> {
  const deliveredOrders = await Order.find({
    user: new mongoose.Types.ObjectId(userId),
    orderStatus: "delivered",
  }).select("totalPrice").lean();

  const totalSpent = deliveredOrders.reduce((sum, order) => sum + order.totalPrice, 0);
  const bonusFromSpending = Math.floor(totalSpent / BONUS_THRESHOLD) * TRIES_PER_100_TND;

  return {
    total: userInitialTries + bonusFromSpending,
    bonusFromSpending,
  };
}
