import HeroSection from "@/components/HeroSection";
import LookbookGrid from "@/components/LookbookGrid";
import EditorialFeature from "@/components/EditorialFeature";
import ProductCardRow, { type ProductCardRowItem } from "@/components/ProductCardRow";
import BrandStory from "@/components/BrandStory";
import { DEFAULT_HOME_PAGE } from "@/lib/homePageDefaults";
import { buildPageMetadata } from "@/lib/seo";

const BACKEND_URL = (
  process.env.BACKEND_PROXY_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://back:3002"
).replace(/\/$/, "");

export const revalidate = 60;

export async function generateMetadata() {
  return buildPageMetadata({
    title: "LOOKSMAX Tunisia | Men's Fashion, Shoes & Perfumes",
    description:
      "Discover curated men's fashion, premium wardrobe essentials, shoes, perfumes, and outfit inspiration in Tunisia.",
    path: "/",
  });
}

export default async function Home() {
  let content = DEFAULT_HOME_PAGE;
  let categoriesBySlug = new Map<string, { _id: string; name: string; slug: string }>();
  let featuredProducts: ProductCardRowItem[] = [];

  try {
    const [{ content: stored }, { categories: categoryDocs }, productsData] = await Promise.all([
      fetch(`${BACKEND_URL}/api/store/homepage`).then((r) => r.json()),
      fetch(`${BACKEND_URL}/api/store/categories`).then((r) => r.json()),
      fetch(`${BACKEND_URL}/api/store/products?limit=4`).then((r) => r.json()),
    ]);

    featuredProducts = productsData?.products || [];

    categoriesBySlug = new Map(
      (categoryDocs || []).map((category: { _id: string; name: string; slug: string }) => [
        category.slug,
        { _id: String(category._id), name: category.name, slug: category.slug },
      ])
    );

    if (stored) {
      content = {
        ...DEFAULT_HOME_PAGE,
        ...stored,
        hero: { ...DEFAULT_HOME_PAGE.hero, ...stored.hero },
        brandStory: {
          ...DEFAULT_HOME_PAGE.brandStory,
          ...stored.brandStory,
          stats:
            stored.brandStory?.stats?.length > 0
              ? stored.brandStory.stats
              : DEFAULT_HOME_PAGE.brandStory.stats,
        },
        lookbook: { ...DEFAULT_HOME_PAGE.lookbook, ...stored.lookbook },
        editorial: { ...DEFAULT_HOME_PAGE.editorial, ...stored.editorial },
        featured: { ...DEFAULT_HOME_PAGE.featured, ...stored.featured },
      };
    }
  } catch {}

  return (
    <>
      <HeroSection
        image={content.hero.image}
        eyebrow={content.hero.eyebrow}
        title={content.hero.title}
        subtitle={content.hero.subtitle}
        href={content.hero.link}
      />
      <BrandStory
        eyebrow={content.brandStory.eyebrow}
        title={content.brandStory.title}
        paragraphOne={content.brandStory.paragraphOne}
        paragraphTwo={content.brandStory.paragraphTwo}
        stats={content.brandStory.stats}
      />
      <LookbookGrid
        images={content.lookbook.images.filter((image) => Boolean(String(image).trim()))}
        caption={content.lookbook.caption}
        categories={content.lookbook.images
          .filter((image) => Boolean(String(image).trim()))
          .map((_, index) => {
            const configuredSlug = content.lookbook.categorySlugs[index];
            return (
              (configuredSlug ? categoriesBySlug.get(configuredSlug) : null) || {
                _id: `fallback-${index}`,
                name: "Collection",
                slug: "all",
              }
            );
          })}
      />
      <EditorialFeature
        image={content.editorial.image}
        label={content.editorial.label}
        eyebrow={content.editorial.eyebrow}
      />
      <ProductCardRow title={content.featured.title} products={featuredProducts} />
    </>
  );
}
