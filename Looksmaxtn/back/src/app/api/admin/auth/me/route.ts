import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import User from "@/admin/models/User";
import { canAccessAdminDashboard, getSession } from "@/admin/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    await dbConnect();
    const user = await User.findById(session.userId).select("-password");
    if (!user || !canAccessAdminDashboard(user.role)) {
      return NextResponse.json({ user: null }, { status: 401 });
    }

    return NextResponse.json({
      user: { id: user._id, name: user.name, storeName: user.storeName || "", email: user.email, role: user.role },
    });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
