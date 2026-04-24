import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Order from "@/store/models/Order";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import User from "@/store/models/User";
import Coupon from "@/store/models/Coupon";
import { getSession } from "@/store/lib/auth";
import { getAuditActorFromSession } from "@/store/lib/auditRoute";
import { sendOrderStatusEmail } from "@/store/lib/mailer";
import {
  buildCouponValidationResult,
  getCouponValidationError,
  normalizeCouponCode,
} from "@/lib/coupons";
import mongoose from "mongoose";

function getSizeStockEntries(
  sizeStock: unknown
): Array<[string, { fullStock?: number; stock?: number }]> {
  if (sizeStock instanceof Map) {
    return Array.from(sizeStock.entries());
  }

  if (!sizeStock || typeof sizeStock !== "object") return [];

  return Object.entries(sizeStock as Record<string, { fullStock?: number; stock?: number }>);
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();

    let orders;
    if (session.role === "admin") {
      orders = await Order.find()
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .lean();
    } else {
      orders = await Order.find({
        user: session.userId,
        isArchived: { $ne: true },
      })
        .sort({ createdAt: -1 })
        .lean();
    }

    return NextResponse.json({ orders });
  } catch (error: unknown) {
    console.error("Get orders error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const stockAdjustments: Array<{ productId: string; quantity: number; size: string }> = [];
  let couponClaimed: { couponId: string; usageIncremented: boolean } | null = null;

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Please login to place an order" }, { status: 401 });
    }

    await dbConnect();
    const auditActor = await getAuditActorFromSession(session);
    const { items, shippingAddress, couponCode } = await req.json();

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "No items in order" }, { status: 400 });
    }

    if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.street || !shippingAddress.city || !shippingAddress.phone) {
      return NextResponse.json({ error: "Complete shipping address is required" }, { status: 400 });
    }

    let subtotalPrice = 0;
    const orderItems = [];
    const seenVariantKeys = new Set<string>();
    for (const item of items) {
      if (!mongoose.Types.ObjectId.isValid(item.productId)) {
        return NextResponse.json(
          { error: `Invalid product ID format for ${item.name}. Please clear your cart. ` },
          { status: 400 }
        );
      }

      const product = await Product.findById(item.productId);
      if (!product) {
        return NextResponse.json(
          { error: `Product not found: ${item.name}` },
          { status: 400 }
        );
      }

      const productId = product._id.toString();
      const itemSize = item.size || "";
      const variantKey = `${productId}:${itemSize}`;
      if (seenVariantKeys.has(variantKey)) {
        return NextResponse.json(
          { error: `${product.name}${itemSize ? ` (size ${itemSize})` : ""} can only appear once in an order.` },
          { status: 400 }
        );
      }

      const quantityToDeduct = item.quantity;
      if (quantityToDeduct < 1) {
        return NextResponse.json(
          { error: `${product.name} does not have enough stock available.` },
          { status: 400 }
        );
      }

      const sizeStockEntries = getSizeStockEntries(product.sizeStock);
      const hasSizeStock = sizeStockEntries.length > 0;

      if (hasSizeStock && itemSize) {
        const sizeEntry = sizeStockEntries.find(([size]) => size === itemSize)?.[1];
        if (!sizeEntry || Math.max(sizeEntry.stock ?? 0, 0) < quantityToDeduct) {
          return NextResponse.json(
            { error: `${product.name} (size ${itemSize}) is already sold. Please remove it from your cart.` },
            { status: 409 }
          );
        }

        const sizeStockKey = `sizeStock.${itemSize}.stock`;
        const updatedProduct = await Product.findOneAndUpdate(
          { _id: product._id, [sizeStockKey]: { $gte: quantityToDeduct } },
          { $inc: { [sizeStockKey]: -quantityToDeduct, stock: -quantityToDeduct } },
          { returnDocument: "after" }
        ).lean();

        if (!updatedProduct) {
          return NextResponse.json(
            { error: `${product.name} (size ${itemSize}) is already sold. Please remove it from your cart.` },
            { status: 409 }
          );
        }
      } else {
        if ((product.stock ?? 0) < quantityToDeduct) {
          return NextResponse.json(
            { error: `${product.name} is already sold. Please remove it from your cart.` },
            { status: 409 }
          );
        }

        const updatedProduct = await Product.findOneAndUpdate(
          { _id: product._id, stock: { $gte: quantityToDeduct } },
          { $inc: { stock: -quantityToDeduct } },
          { returnDocument: "after" }
        ).lean();

        if (!updatedProduct) {
          return NextResponse.json(
            { error: `${product.name} is already sold. Please remove it from your cart.` },
            { status: 409 }
          );
        }
      }

      stockAdjustments.push({ productId: productId, quantity: quantityToDeduct, size: itemSize });
      seenVariantKeys.add(variantKey);

      const itemTotal = product.price * item.quantity;
      subtotalPrice += itemTotal;

      orderItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        size: item.size || "",
        color: item.color || "",
        quantity: item.quantity,
      });
    }

    const normalizedCouponCode = normalizeCouponCode(couponCode || "");
    let couponDoc = null;
    let couponDiscountAmount = 0;
    if (normalizedCouponCode) {
      couponDoc = await Coupon.findOne({ code: normalizedCouponCode });
      if (!couponDoc) {
        return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
      }

      const validationError = getCouponValidationError(couponDoc, subtotalPrice);
      if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 });
      }

      const usageFilter: Record<string, unknown> = {
        _id: couponDoc._id,
        isActive: true,
      };

      const now = new Date();
      if (couponDoc.startsAt) {
        usageFilter.startsAt = { $lte: now };
      }
      if (couponDoc.endsAt) {
        usageFilter.endsAt = { $gte: now };
      }
      if (typeof couponDoc.maxUses === "number") {
        usageFilter.usageCount = { $lt: couponDoc.maxUses };
      }

      const claimResult = await Coupon.updateOne(usageFilter, { $inc: { usageCount: 1 } });
      if (claimResult.modifiedCount === 0) {
        return NextResponse.json({ error: "This coupon is no longer available" }, { status: 409 });
      }

      couponClaimed = { couponId: couponDoc._id.toString(), usageIncremented: true };
      couponDiscountAmount = buildCouponValidationResult(couponDoc, subtotalPrice).discountAmount;
    }

    const shippingFee = 0;
    const totalPrice = Math.max(0, subtotalPrice - couponDiscountAmount + shippingFee);

    const order = await Order.create({
      user: session.userId,
      items: orderItems,
      isArchived: false,
      shippingAddress,
      paymentMethod: "cod",
      orderStatus: "processing",
      subtotalPrice,
      shippingFee,
      couponCode: couponDoc?.code || "",
      couponDiscountType: couponDoc?.discountType || "",
      couponDiscountValue: couponDoc?.discountValue || 0,
      couponDiscountAmount,
      totalPrice,
      createdBy: auditActor,
      updatedBy: auditActor,
    });

    try {
      const customer = await User.findById(session.userId).select("name email").lean();
      if (customer?.email) {
        const frontendBaseUrl = (process.env.FRONTEND_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
        await sendOrderStatusEmail({
          to: customer.email,
          name: customer.name || shippingAddress.fullName || "Customer",
          orderNumber: order._id.toString().slice(-8).toUpperCase(),
          orderStatus: "processing",
          orderUrl: `${frontendBaseUrl}/account/orders/${order._id.toString()}`,
        });
      }
    } catch (emailError) {
      console.error("Order confirmation email error:", emailError);
    }

    try {
      const reservationKey = `user:${session.userId}`;
      await ProductReservation.deleteMany({
        product: { $in: stockAdjustments.map((adjustment) => adjustment.productId) },
        reservationKey,
      });
    } catch (reservationCleanupError) {
      console.error("Cleanup order reservations error:", reservationCleanupError);
    }

    return NextResponse.json({ order }, { status: 201 });
  } catch (error: unknown) {
    if (couponClaimed?.usageIncremented) {
      try {
        await Coupon.updateOne({ _id: couponClaimed.couponId }, { $inc: { usageCount: -1 } });
      } catch {
        // Ignore rollback failures and surface the original error.
      }
    }

    try {
      for (const adjustment of stockAdjustments) {
        const sizeStockKey = adjustment.size ? `sizeStock.${adjustment.size}.stock` : null;
        const update: Record<string, unknown> = { $inc: { stock: adjustment.quantity } };
        if (sizeStockKey) {
          (update.$inc as Record<string, number>)[sizeStockKey] = adjustment.quantity;
        }
        await Product.updateOne(
          { _id: adjustment.productId },
          update
        );
      }
    } catch {
      // Ignore rollback failures and surface the original error.
    }
    console.error("Create order error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
