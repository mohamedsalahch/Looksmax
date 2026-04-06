import dbConnect from "@/lib/mongodb";
import SavedOutfit from "@/models/SavedOutfit";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SharedOutfitPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  await dbConnect();
  const outfit = await SavedOutfit.findOne({ shareToken: token, isPublic: true }).lean();

  if (!outfit) notFound();

  const images = [outfit.images?.front || "", outfit.images?.back || ""].filter(Boolean);

  return (
    <div className="pt-[72px] min-h-screen">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-10 space-y-6">
        <div className="text-center space-y-2">
          <p className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">
            Shared Outfit
          </p>
          <h1 className="text-2xl font-semibold tracking-wide uppercase">{outfit.name}</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {images.map((image, index) => (
            <div key={index} className="border border-border-color bg-hover p-4">
              <img
                src={image}
                alt={`${outfit.name} ${index === 0 ? "front" : "back"}`}
                className="w-full max-h-[70vh] object-contain"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
