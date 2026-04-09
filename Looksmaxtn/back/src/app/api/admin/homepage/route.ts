import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/admin/lib/mongodb";
import { getSession } from "@/admin/lib/auth";
import HomePageContent from "@/admin/models/HomePageContent";
import { DEFAULT_HOME_PAGE } from "@/admin/lib/homePageDefaults";
import { deleteHomePageFile, saveHomePageFiles } from "@/admin/lib/homePageUploads";
import { getAuditActorFromSession } from "@/admin/lib/auditRoute";
import { getSystemAuditActor } from "@/admin/lib/audit";
import { logRequestError, logRequestStart } from "@/lib/requestLogging";

async function getOrCreateHomePage() {
  const existing = await HomePageContent.findOne({ key: "home" }).lean();
  if (existing) return existing;
  const systemActor = getSystemAuditActor();
  const created = await HomePageContent.create({
    ...DEFAULT_HOME_PAGE,
    createdBy: systemActor,
    updatedBy: systemActor,
  });
  return created.toObject();
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const content = await getOrCreateHomePage();
    return NextResponse.json({ content });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await logRequestStart("admin.homepage.put", req);
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await dbConnect();
    const auditActor = await getAuditActorFromSession(session);
    const existing = await getOrCreateHomePage();
    const formData = await req.formData();

    const heroFile = formData.get("heroImage");
    const editorialFile = formData.get("editorialImage");
    const lookbookFiles = formData
      .getAll("lookbookImages")
      .filter((value): value is File => value instanceof File && value.size > 0);

    const [heroUploads, editorialUploads, lookbookUploads] = await Promise.all([
      heroFile instanceof File && heroFile.size > 0 ? saveHomePageFiles([heroFile]) : Promise.resolve<string[]>([]),
      editorialFile instanceof File && editorialFile.size > 0 ? saveHomePageFiles([editorialFile]) : Promise.resolve<string[]>([]),
      lookbookFiles.length > 0 ? saveHomePageFiles(lookbookFiles) : Promise.resolve<string[]>([]),
    ]);

    const nextHeroImage = heroUploads[0] || String(formData.get("existingHeroImage") || "");
    const nextEditorialImage = editorialUploads[0] || String(formData.get("existingEditorialImage") || "");
    const existingLookbookImages = JSON.parse(
      String(formData.get("existingLookbookImages") || "[]")
    ).filter((image: string) => Boolean(String(image).trim())) as string[];
    const nextLookbookCategorySlugs = JSON.parse(
      String(formData.get("lookbookCategorySlugs") || "[]")
    ) as string[];
    const nextLookbookImages = lookbookUploads.length > 0 ? lookbookUploads : existingLookbookImages;
    const normalizedLookbook = nextLookbookImages
      .map((image, index) => ({
        image,
        categorySlug: nextLookbookCategorySlugs[index] || "",
      }))
      .filter((entry) => Boolean(String(entry.image).trim()));

    if (normalizedLookbook.some((entry) => !String(entry.categorySlug).trim())) {
      return NextResponse.json(
        { error: "Please select a category for every lookbook image." },
        { status: 400 }
      );
    }

    const nextContent = {
      key: "home",
      hero: {
        image: nextHeroImage,
        eyebrow: String(formData.get("heroEyebrow") || ""),
        title: String(formData.get("heroTitle") || ""),
        subtitle: String(formData.get("heroSubtitle") || ""),
      },
      brandStory: {
        eyebrow: String(formData.get("brandEyebrow") || ""),
        title: String(formData.get("brandTitle") || ""),
        paragraphOne: String(formData.get("brandParagraphOne") || ""),
        paragraphTwo: String(formData.get("brandParagraphTwo") || ""),
        stats: JSON.parse(String(formData.get("brandStats") || "[]")),
      },
      lookbook: {
        caption: String(formData.get("lookbookCaption") || ""),
        images: normalizedLookbook.map((entry) => entry.image),
        categorySlugs: normalizedLookbook.map((entry) => entry.categorySlug),
      },
      editorial: {
        image: nextEditorialImage,
        eyebrow: String(formData.get("editorialEyebrow") || ""),
        label: String(formData.get("editorialLabel") || ""),
      },
      featured: {
        title: String(formData.get("featuredTitle") || ""),
      },
      updatedBy: auditActor,
    };

    const content = await HomePageContent.findOneAndUpdate(
      { key: "home" },
      {
        $set: nextContent,
        $setOnInsert: { createdBy: auditActor },
      },
      { new: true, upsert: true }
    ).lean();

    const removedHero =
      existing.hero?.image && existing.hero.image !== nextHeroImage ? existing.hero.image : null;
    const removedEditorial =
      existing.editorial?.image && existing.editorial.image !== nextEditorialImage
        ? existing.editorial.image
        : null;
    const removedLookbook = (existing.lookbook?.images || []).filter(
      (image: string) => !normalizedLookbook.some((entry) => entry.image === image)
    );

    await Promise.all(
      [removedHero, removedEditorial, ...removedLookbook]
        .filter(Boolean)
        .map((image) => deleteHomePageFile(String(image)))
    );

    return NextResponse.json({ content });
  } catch (error) {
    logRequestError("admin.homepage.put", req, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
