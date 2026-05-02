import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import Order from "@/store/models/Order";
import Product from "@/store/models/Product";
import ProductReservation from "@/store/models/ProductReservation";
import User from "@/store/models/User";
import Coupon from "@/store/models/Coupon";
import ShippingSettings from "@/store/models/ShippingSettings";
import { getSession } from "@/store/lib/auth";
import { getAuditActorFromSession } from "@/store/lib/auditRoute";
import { broadcastAdminEvent } from "@/admin/lib/adminEvents";
import { sendOrderStatusEmail } from "@/store/lib/mailer";
import { isStoreOwnerApproved } from "@/store/lib/storeApproval";
import {
  buildCouponValidationResult,
  getCouponValidationError,
  normalizeCouponCode,
} from "@/lib/coupons";
import mongoose from "mongoose";
import crypto from "crypto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function calculateShippingFee(subtotal: number, settings?: { shippingCost?: number; freeShippingThreshold?: number } | null) {
  const shippingCost = Math.max(0, Number(settings?.shippingCost || 0));
  const freeShippingThreshold = Math.max(0, Number(settings?.freeShippingThreshold || 0));
  if (shippingCost === 0 || freeShippingThreshold === 0 || subtotal >= freeShippingThreshold) return 0;
  return Math.round(shippingCost * 100) / 100;
}

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
      orders = await Order.find({ user: session.userId })
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

    await dbConnect();
    const auditActor = session ? await getAuditActorFromSession(session) : null;
    const { items, shippingAddress, couponCode, guestEmail, cartKey } = await req.json();

    const normalizedGuestEmail = typeof guestEmail === "string" ? guestEmail.trim().toLowerCase() : "";
    if (!session) {
      if (!normalizedGuestEmail || !EMAIL_RE.test(normalizedGuestEmail)) {
        return NextResponse.json({ error: "A valid email is required to place an order" }, { status: 400 });
      }
    }

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
      const productOwner = product.createdBy?.id
        ? await User.findById(product.createdBy.id).select("role storeApprovalStatus").lean()
        : null;
      if (!isStoreOwnerApproved(productOwner)) {
        return NextResponse.json(
          { error: `${product.name} is no longer available.` },
          { status: 409 }
        );
      }
      if (product.isActive === false || (product.approvalStatus && product.approvalStatus !== "approved")) {
        return NextResponse.json(
          { error: `${product.name} is no longer available.` },
          { status: 409 }
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
          {
            _id: product._id,
            isActive: { $ne: false },
            $or: [{ approvalStatus: "approved" }, { approvalStatus: { $exists: false } }],
            [sizeStockKey]: { $gte: quantityToDeduct },
          },
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
          {
            _id: product._id,
            isActive: { $ne: false },
            $or: [{ approvalStatus: "approved" }, { approvalStatus: { $exists: false } }],
            stock: { $gte: quantityToDeduct },
          },
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

    const shippingSettings = await ShippingSettings.findOne({ key: "shipping" }).lean();
    const shippingFee = calculateShippingFee(subtotalPrice, shippingSettings);
    const totalPrice = Math.max(0, subtotalPrice - couponDiscountAmount + shippingFee);

    const guestAccessToken = session ? "" : crypto.randomBytes(24).toString("hex");

    const order = await Order.create({
      user: session?.userId || null,
      guestEmail: session ? "" : normalizedGuestEmail,
      guestAccessToken,
      items: orderItems,
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
      const frontendBaseUrl = (process.env.FRONTEND_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
      const orderNumber = order._id.toString().slice(-8).toUpperCase();

      if (session) {
        const customer = await User.findById(session.userId).select("name email").lean();
        if (customer?.email) {
          await sendOrderStatusEmail({
            to: customer.email,
            name: customer.name || shippingAddress.fullName || "Customer",
            orderNumber,
            orderStatus: "processing",
            orderUrl: `${frontendBaseUrl}/account/orders/${order._id.toString()}`,
          });
        }
      } else {
        await sendOrderStatusEmail({
          to: normalizedGuestEmail,
          name: shippingAddress.fullName || "Customer",
          orderNumber,
          orderStatus: "processing",
          orderUrl: `${frontendBaseUrl}/orders/track/${order._id.toString()}?token=${guestAccessToken}`,
        });
      }
    } catch (emailError) {
      console.error("Order confirmation email error:", emailError);
    }

    try {
      const reservationKey = session
        ? `user:${session.userId}`
        : (typeof cartKey === "string" && cartKey ? cartKey : "");
      if (reservationKey) {
        await ProductReservation.deleteMany({
          product: { $in: stockAdjustments.map((adjustment) => adjustment.productId) },
          reservationKey,
        });
      }
    } catch (reservationCleanupError) {
      console.error("Cleanup order reservations error:", reservationCleanupError);
    }

    broadcastAdminEvent({
      type: "order:upsert",
      order: {
        _id: String(order._id),
        orderStatus: order.orderStatus,
        createdAt: order.createdAt.toISOString(),
        user: null,
        totalPrice: order.totalPrice,
        isArchived: Boolean(order.isArchived),
        items: order.items.map((item) => ({
          product: String(item.product || ""),
          name: item.name,
          quantity: item.quantity,
        })),
      },
    });

    const responseBody: Record<string, unknown> = { order };
    if (!session) {
      responseBody.guestAccessToken = guestAccessToken;
      responseBody.trackingUrl = `/orders/track/${order._id.toString()}?token=${guestAccessToken}`;
    }
    return NextResponse.json(responseBody, { status: 201 });
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
