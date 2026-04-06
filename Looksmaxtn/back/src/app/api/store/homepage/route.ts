import { NextResponse } from "next/server";
import dbConnect from "@/store/lib/mongodb";
import HomePageContent from "@/store/models/HomePageContent";
import { DEFAULT_HOME_PAGE } from "@/store/lib/homePageDefaults";

export async function GET() {
  try {
    await dbConnect();
    const content = await HomePageContent.findOne({ key: "home" }).lean();
    return NextResponse.json({ content: content || DEFAULT_HOME_PAGE });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ content: DEFAULT_HOME_PAGE });
  }
}
