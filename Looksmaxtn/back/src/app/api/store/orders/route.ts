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
import { sendOrderStatusEmail, sendStoreOwnerOrderCreatedEmail } from "@/store/lib/mailer";
import { isStoreOwnerApproved } from "@/store/lib/storeApproval";
import {
  buildCouponValidationResult,
  getCouponValidationError,
  normalizeCouponCode,
} from "@/lib/coupons";
import mongoose from "mongoose";
import crypto from "crypto";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class OrderRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function calculateShippingFee(subtotal: number, settings?: { shippingCost?: number; freeShippingThreshold?: number } | null) {
  const shippingCost = Math.max(0, Number(settings?.shippingCost || 0));
  const freeShippingThreshold = Math.max(0, Number(settings?.freeShippingThreshold || 0));
  if (shippingCost === 0 || freeShippingThreshold === 0 || subtotal >= freeShippingThreshold) return 0;
  return Math.round(shippingCost * 100) / 100;
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
  const stockAdjustments: Array<{ productId: string; quantity: number; variantId: mongoose.Types.ObjectId }> = [];
  const pendingStockAdjustments: Array<{
    productId: string;
    quantity: number;
    variantId: mongoose.Types.ObjectId;
    name: string;
    sizeLabel: string;
  }> = [];
  const storeOwnerOrderItems = new Map<
    string,
    {
      owner: { email: string; name: string; storeName: string };
      items: Array<{ name: string; quantity: number; size: string; color: string; price: number }>;
      totalPrice: number;
    }
  >();
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
      const rawVariantId = typeof item.variantId === "string" ? item.variantId : "";
      if (!rawVariantId || !mongoose.Types.ObjectId.isValid(rawVariantId)) {
        return NextResponse.json(
          { error: `${item.name || "An item in your cart"} is missing a variant selection. Please re-add it from the product page.` },
          { status: 400 }
        );
      }
      const variantId = new mongoose.Types.ObjectId(rawVariantId);

      const product = await Product.findById(item.productId);
      if (!product) {
        return NextResponse.json(
          { error: `Product not found: ${item.name}` },
          { status: 400 }
        );
      }
      const productOwner = product.createdBy?.id
        ? await User.findById(product.createdBy.id).select("name email storeName role storeApprovalStatus").lean()
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
      const variantKey = `${productId}:${rawVariantId}`;
      if (seenVariantKeys.has(variantKey)) {
        return NextResponse.json(
          { error: `${product.name} variant can only appear once in an order.` },
          { status: 400 }
        );
      }

      const quantityToDeduct = Math.max(1, Number(item.quantity) || 0);
      if (quantityToDeduct < 1) {
        return NextResponse.json(
          { error: `${product.name} does not have enough stock available.` },
          { status: 400 }
        );
      }

      const variant = product.variants?.id(variantId);
      if (!variant) {
        return NextResponse.json(
          { error: `${product.name} variant is no longer available. Please remove it from your cart.` },
          { status: 409 }
        );
      }

      const variantSize = variant.size || "";
      const variantColor = variant.color?.hex || "";
      const sizeLabelForError = variantSize ? ` (size ${variantSize})` : "";
      if (Math.max(variant.stock ?? 0, 0) < quantityToDeduct) {
        return NextResponse.json(
          { error: `${product.name}${sizeLabelForError} is already sold. Please remove it from your cart.` },
          { status: 409 }
        );
      }

      pendingStockAdjustments.push({
        productId,
        quantity: quantityToDeduct,
        variantId,
        name: product.name,
        sizeLabel: sizeLabelForError,
      });
      seenVariantKeys.add(variantKey);

      const itemTotal = product.price * quantityToDeduct;
      subtotalPrice += itemTotal;

      if (productOwner?.email && product.createdBy?.id) {
        const ownerId = String(product.createdBy.id);
        const existingOwnerEntry = storeOwnerOrderItems.get(ownerId) || {
          owner: {
            email: String(productOwner.email || ""),
            name: String(productOwner.storeName || productOwner.name || "Store owner"),
            storeName: String(productOwner.storeName || ""),
          },
          items: [],
          totalPrice: 0,
        };
        existingOwnerEntry.items.push({
          name: product.name,
          price: product.price,
          size: variantSize,
          color: variantColor,
          quantity: quantityToDeduct,
        });
        existingOwnerEntry.totalPrice += itemTotal;
        storeOwnerOrderItems.set(ownerId, existingOwnerEntry);
      }

      orderItems.push({
        product: product._id,
        variant: variantId,
        name: product.name,
        price: product.price,
        size: variantSize,
        color: variantColor,
        quantity: quantityToDeduct,
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

    for (const adjustment of pendingStockAdjustments) {
      const updatedProduct = await Product.findOneAndUpdate(
        {
          _id: adjustment.productId,
          isActive: { $ne: false },
          $or: [{ approvalStatus: "approved" }, { approvalStatus: { $exists: false } }],
          variants: {
            $elemMatch: {
              _id: adjustment.variantId,
              stock: { $gte: adjustment.quantity },
            },
          },
        },
        {
          $inc: {
            "variants.$.stock": -adjustment.quantity,
            stock: -adjustment.quantity,
          },
        },
        { returnDocument: "after" }
      ).lean();

      if (!updatedProduct) {
        throw new OrderRequestError(
          `${adjustment.name}${adjustment.sizeLabel} is already sold. Please remove it from your cart.`,
          409
        );
      }

      stockAdjustments.push({
        productId: adjustment.productId,
        quantity: adjustment.quantity,
        variantId: adjustment.variantId,
      });
    }

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
      if (storeOwnerOrderItems.size > 0) {
        const adminBaseUrl = (process.env.ADMIN_BASE_URL || "http://localhost:3001").replace(/\/$/, "");
        const orderNumber = order._id.toString().slice(-8).toUpperCase();
        await Promise.all(
          Array.from(storeOwnerOrderItems.values())
            .filter((entry) => entry.owner.email && entry.items.length > 0)
            .map((entry) =>
              sendStoreOwnerOrderCreatedEmail({
                to: entry.owner.email,
                name: entry.owner.name,
                orderNumber,
                orderUrl: `${adminBaseUrl}/dashboard/orders/${order._id.toString()}`,
                customerName: shippingAddress.fullName || "Customer",
                customerPhone: shippingAddress.phone || "",
                shippingCity: shippingAddress.city || "",
                items: entry.items,
                totalPrice: entry.totalPrice,
              })
            )
        );
      }
    } catch (storeOwnerEmailError) {
      console.error("Store owner order email error:", storeOwnerEmailError);
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
        await Product.updateOne(
          { _id: adjustment.productId, "variants._id": adjustment.variantId },
          { $inc: { "variants.$.stock": adjustment.quantity, stock: adjustment.quantity } },
        );
      }
    } catch {
      // Ignore rollback failures and surface the original error.
    }
    console.error("Create order error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = error instanceof OrderRequestError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
