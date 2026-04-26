import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import { getSession } from "@/admin/lib/auth";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { getSystemAuditActor } from "@/admin/lib/audit";
import ShippingSettings from "@/admin/models/ShippingSettings";

const DEFAULT_SHIPPING_SETTINGS = {
  key: "shipping",
  shippingCost: 0,
  freeShippingThreshold: 0,
};

function normalizeAmount(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100) / 100;
}

async function getOrCreateShippingSettings() {
  const existing = await ShippingSettings.findOne({ key: "shipping" }).lean();
  if (existing) return existing;

  const systemActor = getSystemAuditActor();
  return ShippingSettings.create({
    ...DEFAULT_SHIPPING_SETTINGS,
    createdBy: systemActor,
    updatedBy: systemActor,
  });
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const settings = await getOrCreateShippingSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const body = await req.json();
    const shippingCost = normalizeAmount(body.shippingCost);
    const freeShippingThreshold = normalizeAmount(body.freeShippingThreshold);

    if (shippingCost === null) {
      return NextResponse.json({ error: "Shipping cost must be a positive number or zero." }, { status: 400 });
    }

    if (freeShippingThreshold === null) {
      return NextResponse.json({ error: "Free shipping threshold must be a positive number or zero." }, { status: 400 });
    }

    const auditActor = await getAuditActorFromSession(session);
    const settings = await ShippingSettings.findOneAndUpdate(
      { key: "shipping" },
      {
        $set: {
          key: "shipping",
          shippingCost,
          freeShippingThreshold,
          updatedBy: auditActor,
        },
        $setOnInsert: { createdBy: auditActor },
      },
      { new: true, upsert: true }
    ).lean();

    return NextResponse.json({ settings });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
