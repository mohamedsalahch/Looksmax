import { NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import User from "@/admin/models/User";
import { getSession } from "@/admin/lib/auth";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      console.log("[auth][admin][me] no session");
      return NextResponse.json({ user: null }, { status: 401 });
    }
    if (session.role !== "admin") {
      console.log("[auth][admin][me] invalid role", { userId: session.userId, role: session.role });
      return NextResponse.json({ user: null }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findById(session.userId).select("-password");
    if (!user || user.role !== "admin") {
      console.log("[auth][admin][me] invalid user", {
        userId: session.userId,
        found: Boolean(user),
        role: user?.role,
      });
      return NextResponse.json({ user: null }, { status: 401 });
    }

    console.log("[auth][admin][me] session ok", {
      userId: session.userId,
      role: session.role,
    });

    return NextResponse.json({ user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
