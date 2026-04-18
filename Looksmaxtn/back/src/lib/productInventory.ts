import mongoose from "mongoose";
import Order from "@/store/models/Order";

type SoldQuantityByProductId = Map<string, number>;

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
