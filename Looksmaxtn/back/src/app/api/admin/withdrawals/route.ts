import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import WithdrawalRequest from "@/admin/models/WithdrawalRequest";
import User from "@/admin/models/User";
import { getSession } from "@/admin/lib/auth";
import { serializeWithdrawal } from "@/admin/lib/storeBalance";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const status = req.nextUrl.searchParams.get("status");
    const filter: Record<string, unknown> = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    const requests = await WithdrawalRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const ownerIds = Array.from(new Set(requests.map((request) => String(request.storeOwner))));
    const owners = await User.find({ _id: { $in: ownerIds } })
      .select("_id name email storeName balance")
      .lean();
    const ownerById = new Map(owners.map((owner) => [owner._id.toString(), owner]));

    const withdrawals = requests.map((request) => {
      const serialized = serializeWithdrawal(request as unknown as Parameters<typeof serializeWithdrawal>[0]);
      const owner = ownerById.get(serialized.storeOwner);
      return {
        ...serialized,
        owner: owner
          ? {
              _id: owner._id.toString(),
              name: owner.name || "",
              email: owner.email || "",
              storeName: owner.storeName || "",
              balance: Number(owner.balance || 0),
            }
          : null,
      };
    });

    return NextResponse.json({ withdrawals });
  } catch (error) {
    console.error("[admin-withdrawals] GET error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
