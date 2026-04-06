import HeroSection from "@/components/HeroSection";
import LookbookGrid from "@/components/LookbookGrid";
import EditorialFeature from "@/components/EditorialFeature";
import ProductCardRow from "@/components/ProductCardRow";
import BrandStory from "@/components/BrandStory";
import dbConnect from "@/lib/mongodb";
import HomePageContent from "@/models/HomePageContent";
import Category from "@/models/Category";
import { DEFAULT_HOME_PAGE } from "@/lib/homePageDefaults";

export const dynamic = "force-dynamic";

export default async function Home() {
  let content = DEFAULT_HOME_PAGE;
  let categoriesBySlug = new Map<string, { _id: string; name: string; slug: string }>();

  try {
    await dbConnect();
    const [stored, categoryDocs] = await Promise.all([
      HomePageContent.findOne({ key: "home" }).lean(),
      Category.find({ isActive: true })
        .sort({ order: 1, name: 1 })
        .select("_id name slug")
        .lean(),
    ]);

    categoriesBySlug = new Map(
      categoryDocs.map((category) => [
        category.slug,
        {
          _id: category._id.toString(),
          name: category.name,
          slug: category.slug,
        },
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
      <ProductCardRow title={content.featured.title} />
    </>
  );
}
