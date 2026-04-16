import mongoose, { Schema, Document, Model } from "mongoose";

interface HomeStat {
  label: string;
  value: string;
}

export interface IHomePageContent extends Document {
  key: string;
  hero: { image: string; eyebrow: string; title: string; subtitle: string; link: string };
  brandStory: {
    eyebrow: string;
    title: string;
    paragraphOne: string;
    paragraphTwo: string;
    stats: HomeStat[];
  };
  lookbook: { caption: string; images: string[]; categorySlugs: string[] };
  editorial: { image: string; eyebrow: string; label: string };
  featured: { title: string };
  createdAt: Date;
  updatedAt: Date;
}

const homeStatSchema = new Schema<HomeStat>(
  {
    label: { type: String, default: "" },
    value: { type: String, default: "" },
  },
  { _id: false }
);

const homePageContentSchema = new Schema<IHomePageContent>(
  {
    key: { type: String, required: true, unique: true, default: "home" },
    hero: {
      image: { type: String, default: "" },
      eyebrow: { type: String, default: "" },
      title: { type: String, default: "" },
      subtitle: { type: String, default: "" },
      link: { type: String, default: "" },
    },
    brandStory: {
      eyebrow: { type: String, default: "" },
      title: { type: String, default: "" },
      paragraphOne: { type: String, default: "" },
      paragraphTwo: { type: String, default: "" },
      stats: { type: [homeStatSchema], default: [] },
    },
    lookbook: {
      caption: { type: String, default: "" },
      images: { type: [String], default: [] },
      categorySlugs: { type: [String], default: [] },
    },
    editorial: {
      image: { type: String, default: "" },
      eyebrow: { type: String, default: "" },
      label: { type: String, default: "" },
    },
    featured: {
      title: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.HomePageContent) {
  delete mongoose.models.HomePageContent;
}

const HomePageContent: Model<IHomePageContent> =
  mongoose.models.HomePageContent ||
  mongoose.model<IHomePageContent>("HomePageContent", homePageContentSchema);

export default HomePageContent;
