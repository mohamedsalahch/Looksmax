import mongoose from "mongoose";
import Order from "@/store/models/Order";

type SoldQuantityByProductId = Map<string, number>;
type SoldQuantityByProductAndSize = Map<string, Map<string, number>>;
type ActiveOrderHoldInfo = {
  reservedElsewhere: boolean;
  ownedReservation: boolean;
  activeOrderCount: number;
};

const ACTIVE_ORDER_STATUSES = ["processing", "confirmed", "shipping"] as const;

export async function getSoldQuantityByProductIds(productIds: string[]) {
  const validProductIds = productIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validProductIds.length === 0) {
    return new Map<string, number>();
  }

  const objectIds = validProductIds.map((id) => new mongoose.Types.ObjectId(id));

  const soldRows = await Order.aggregate<{
    _id: mongoose.Types.ObjectId;
    soldQuantity: number;
  }>([
    {
      $match: {
        orderStatus: { $nin: ["canceled", "returned"] },
        "items.product": { $in: objectIds },
      },
    },
    { $unwind: "$items" },
    {
      $match: {
        "items.product": { $in: objectIds },
      },
    },
    {
      $group: {
        _id: "$items.product",
        soldQuantity: { $sum: "$items.quantity" },
      },
    },
  ]);

  return soldRows.reduce<SoldQuantityByProductId>((map, row) => {
    map.set(row._id.toString(), row.soldQuantity || 0);
    return map;
  }, new Map<string, number>());
}

export async function getSoldQuantityByProductAndSize(productIds: string[]) {
  const validProductIds = productIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validProductIds.length === 0) {
    return new Map<string, Map<string, number>>();
  }

  const objectIds = validProductIds.map((id) => new mongoose.Types.ObjectId(id));

  const soldRows = await Order.aggregate<{
    _id: { product: mongoose.Types.ObjectId; size: string };
    soldQuantity: number;
  }>([
    {
      $match: {
        orderStatus: { $nin: ["canceled", "returned"] },
        "items.product": { $in: objectIds },
      },
    },
    { $unwind: "$items" },
    {
      $match: {
        "items.product": { $in: objectIds },
      },
    },
    {
      $group: {
        _id: { product: "$items.product", size: "$items.size" },
        soldQuantity: { $sum: "$items.quantity" },
      },
    },
  ]);

  return soldRows.reduce<SoldQuantityByProductAndSize>((map, row) => {
    const productId = row._id.product.toString();
    const size = row._id.size || "";
    if (!map.has(productId)) map.set(productId, new Map());
    const sizeMap = map.get(productId)!;
    sizeMap.set(size, (sizeMap.get(size) || 0) + (row.soldQuantity || 0));
    return map;
  }, new Map<string, Map<string, number>>());
}

export async function getActiveOrderHoldMapByProductIds(
  productIds: string[],
  currentUserId?: string | null
) {
  const validProductIds = productIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  if (validProductIds.length === 0) {
    return new Map<string, ActiveOrderHoldInfo>();
  }

  const objectIds = validProductIds.map((id) => new mongoose.Types.ObjectId(id));
  const activeOrders = await Order.find({
    orderStatus: { $in: ACTIVE_ORDER_STATUSES },
    "items.product": { $in: objectIds },
  })
    .select("user items.product")
    .lean();

  return activeOrders.reduce<Map<string, ActiveOrderHoldInfo>>((map, order) => {
    const orderUserId = String(order.user || "");
    const isOwnedByCurrentUser = Boolean(currentUserId) && orderUserId === currentUserId;

    for (const item of order.items || []) {
      const productId = item.product?.toString?.() || String(item.product || "");
      if (!productId) continue;

      const current =
        map.get(productId) || {
          reservedElsewhere: false,
          ownedReservation: false,
          activeOrderCount: 0,
        };

      current.activeOrderCount += 1;
      if (isOwnedByCurrentUser) {
        current.ownedReservation = true;
      } else {
        current.reservedElsewhere = true;
      }
      map.set(productId, current);
    }

    return map;
  }, new Map<string, ActiveOrderHoldInfo>());
}
