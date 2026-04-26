import { notFound } from "next/navigation";
import SharedOutfitViewer from "./SharedOutfitViewer";

export const dynamic = "force-dynamic";

const BACKEND_URL = (
  process.env.BACKEND_PROXY_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://back:3002"
).replace(/\/$/, "");

export default async function SharedOutfitPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const res = await fetch(`${BACKEND_URL}/api/store/outfits/shared/${token}`, {
    cache: "no-store",
  });

  if (!res.ok) notFound();

  const { outfit } = await res.json();

  const images = [outfit.images?.front || "", outfit.images?.back || ""].filter(Boolean);

  return (
    <div className="pt-[80px] min-h-screen">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-10 space-y-6">
        <div className="text-center space-y-2">
          <p className="text-[10px] uppercase tracking-[0.28em] text-text-secondary">
            Shared Outfit
          </p>
          <h1 className="text-2xl font-semibold tracking-wide uppercase">{outfit.name}</h1>
        </div>

        <SharedOutfitViewer name={outfit.name} images={images} />
      </div>
    </div>
  );
}
