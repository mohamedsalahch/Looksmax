export interface HomePageStat {
  label: string;
  value: string;
}

export interface HomePageContentShape {
  key: string;
  hero: {
    image: string;
    eyebrow: string;
    title: string;
    subtitle: string;
  };
  brandStory: {
    eyebrow: string;
    title: string;
    paragraphOne: string;
    paragraphTwo: string;
    stats: HomePageStat[];
  };
  lookbook: {
    caption: string;
    images: string[];
    categorySlugs: string[];
  };
  editorial: {
    image: string;
    eyebrow: string;
    label: string;
  };
  featured: {
    title: string;
  };
}

export const DEFAULT_HOME_PAGE: HomePageContentShape = {
  key: "home",
  hero: {
    image: "",
    eyebrow: "New Collection",
    title: "LOOKSMAX",
    subtitle: "Curated style for the next chapter.",
  },
  brandStory: {
    eyebrow: "Our Philosophy",
    title: "Redefining Modern Menswear",
    paragraphOne:
      "LOOKSMAX is for people who refuse to blend in. We curate premium, trend-driven pieces that fuse streetwear attitude with refined tailoring.",
    paragraphTwo:
      "From essential basics to statement pieces, every item in our collection is selected for quality, fit, and design.",
    stats: [
      { label: "Happy Clients", value: "500+" },
      { label: "Curated Styles", value: "24+" },
      { label: "Premium Quality", value: "100%" },
    ],
  },
  lookbook: {
    caption: "Community Edit",
    images: [],
    categorySlugs: [],
  },
  editorial: {
    image: "",
    eyebrow: "Outfit Studio (Experimental)",
    label: "Editorial",
  },
  featured: {
    title: "Featured Selection",
  },
};
