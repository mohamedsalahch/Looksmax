import HeroSection from "@/components/HeroSection";
import LookbookGrid from "@/components/LookbookGrid";
import EditorialFeature from "@/components/EditorialFeature";
import ProductCardRow from "@/components/ProductCardRow";
import CommunityStories from "@/components/CommunityStories";

export default function Home() {
  return (
    <>
      <HeroSection />
      <LookbookGrid />
      <EditorialFeature />
      <ProductCardRow />
      <CommunityStories />
    </>
  );
}
