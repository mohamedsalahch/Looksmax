import dbConnect from "@/lib/mongodb";
import Category from "@/models/Category";

const categories = [
  { name: "New", slug: "new", order: 0 },
  { name: "T-Shirts", slug: "t-shirts", order: 1 },
  { name: "Polos", slug: "polos", order: 2 },
  { name: "Jeans", slug: "jeans", order: 3 },
  { name: "Trousers", slug: "trousers", order: 4 },
  { name: "Shorts", slug: "shorts", order: 5 },
  { name: "Shirts", slug: "shirts", order: 6 },
  { name: "Sweat", slug: "sweat", order: 7 },
  { name: "Jackets", slug: "jackets", order: 8 },
  { name: "Knits", slug: "knits", order: 9 },
  { name: "Shoes", slug: "shoes", order: 10 },
  { name: "Accessories", slug: "accessories", order: 11 },
  { name: "Sportswear", slug: "sportswear", order: 12 },
];

async function seedCategories() {
  await dbConnect();

  const existing = await Category.countDocuments();
  if (existing > 0) {
    console.log(`⚠️  ${existing} categories already exist. Skipping seed.`);
    process.exit(0);
  }

  await Category.insertMany(categories.map((c) => ({ ...c, isActive: true })));

  console.log(`✅ ${categories.length} categories seeded successfully!`);
  process.exit(0);
}

seedCategories().catch((err) => {
  console.error("Seed categories error:", err);
  process.exit(1);
});
