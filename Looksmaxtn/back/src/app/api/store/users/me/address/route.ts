import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import User from "@/store/models/User";
import { getSession } from "@/store/lib/auth";

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const address = await req.json();

    const user = await User.findByIdAndUpdate(
      session.userId,
      { address },
      { new: true }
    ).select("-password");

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        address: user.address,
        bodyProfile: user.bodyProfile,
      },
    });
  } catch (error: unknown) {
    console.error("Update address error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
