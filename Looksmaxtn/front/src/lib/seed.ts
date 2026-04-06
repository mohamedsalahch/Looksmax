import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import User from "@/models/User";
import { hashPassword } from "@/lib/auth";

const products = [
  { name: "Relaxed Fit Jeans", price: 35.99, category: "jeans", description: "Pre-owned relaxed fit jeans in a beautiful vintage wash.", details: ["100% Cotton denim", "Relaxed fit through thigh", "Button fly closure"], sizes: ["S", "M", "L", "XL"], colors: ["Light Blue", "Dark Blue"], stock: 10, tag: "", brand: "Levi's" },
  { name: "Oversized T-Shirt", price: 15.99, category: "t-shirts", description: "Vintage oversized graphic tee with bold front print.", details: ["100% Heavyweight cotton", "Oversized fit", "Crew neckline"], sizes: ["S", "M", "L", "XL"], colors: ["Black", "White"], stock: 20, tag: "NEW", brand: "Stüssy" },
  { name: "Wide Leg Chinos", price: 29.99, category: "trousers", description: "Relaxed wide leg chinos in a neutral tone.", details: ["98% Cotton, 2% Elastane", "Wide leg fit", "Belt loops"], sizes: ["S", "M", "L", "XL"], colors: ["Beige", "Olive"], stock: 15, tag: "", brand: "LOOKSMAX" },
  { name: "Printed Camp Shirt", price: 25.99, category: "shirts", description: "Short-sleeve camp collar shirt with allover print.", details: ["100% Viscose", "Camp collar", "Relaxed fit"], sizes: ["S", "M", "L", "XL"], colors: ["Multi"], stock: 8, tag: "", brand: "LOOKSMAX" },
  { name: "Basic Crew Neck Tee", price: 9.99, category: "t-shirts", description: "Essential crew neck tee in heavyweight cotton.", details: ["100% Cotton", "Regular fit", "Crew neck"], sizes: ["S", "M", "L", "XL"], colors: ["White", "Black", "Grey"], stock: 30, tag: "", brand: "LOOKSMAX" },
  { name: "Cargo Trousers", price: 35.99, category: "trousers", description: "Utility-inspired cargo trousers with multiple pockets.", details: ["100% Cotton twill", "Regular fit", "Cargo pockets"], sizes: ["S", "M", "L", "XL"], colors: ["Khaki", "Black"], stock: 12, tag: "", brand: "LOOKSMAX" },
  { name: "Denim Jacket", price: 49.99, category: "jackets", description: "Classic denim jacket with vintage wash.", details: ["100% Cotton denim", "Button closure", "Chest pockets"], sizes: ["S", "M", "L", "XL"], colors: ["Medium Blue"], stock: 6, tag: "POPULAR", brand: "Levi's" },
  { name: "Knit Polo Shirt", price: 22.99, category: "polos", description: "Fine knit polo shirt with ribbed collar.", details: ["100% Cotton knit", "Polo collar", "Regular fit"], sizes: ["S", "M", "L", "XL"], colors: ["Navy", "Cream"], stock: 14, tag: "", brand: "LOOKSMAX" },
  { name: "Straight Leg Jeans", price: 35.99, category: "jeans", description: "Classic straight leg jeans in dark wash.", details: ["99% Cotton, 1% Elastane", "Straight fit", "5-pocket styling"], sizes: ["S", "M", "L", "XL"], colors: ["Dark Blue"], stock: 10, tag: "", brand: "LOOKSMAX" },
  { name: "Linen Blend Shirt", price: 29.99, category: "shirts", description: "Breathable linen blend shirt for summer.", details: ["55% Linen, 45% Cotton", "Regular fit", "Button-up"], sizes: ["S", "M", "L", "XL"], colors: ["White", "Sky Blue"], stock: 10, tag: "", brand: "LOOKSMAX" },
  { name: "Hoodie Sweatshirt", price: 32.99, category: "sweat", description: "Classic pullover hoodie in heavyweight fleece.", details: ["80% Cotton, 20% Polyester", "Kangaroo pocket", "Drawstring hood"], sizes: ["S", "M", "L", "XL"], colors: ["Charcoal", "Navy"], stock: 18, tag: "", brand: "LOOKSMAX" },
  { name: "Slim Fit Chinos", price: 27.99, category: "trousers", description: "Slim fit chinos with stretch for comfort.", details: ["97% Cotton, 3% Elastane", "Slim fit", "Side pockets"], sizes: ["S", "M", "L", "XL"], colors: ["Tan", "Navy"], stock: 12, tag: "", brand: "LOOKSMAX" },
  { name: "Graphic Print Tee", price: 17.99, category: "t-shirts", description: "Statement graphic tee with vintage print.", details: ["100% Cotton", "Regular fit", "Screen printed"], sizes: ["S", "M", "L", "XL"], colors: ["White", "Black"], stock: 16, tag: "NEW", brand: "LOOKSMAX" },
  { name: "Parachute Pants", price: 39.99, category: "trousers", description: "Trendy parachute pants with toggle hem.", details: ["100% Nylon", "Elastic waist", "Toggle drawcord hem"], sizes: ["S", "M", "L", "XL"], colors: ["Black", "Grey"], stock: 8, tag: "", brand: "LOOKSMAX" },
  { name: "Cotton Shorts", price: 19.99, category: "shorts", description: "Casual cotton shorts for summer.", details: ["100% Cotton", "Drawstring waist", "Above knee length"], sizes: ["S", "M", "L", "XL"], colors: ["Beige", "Navy"], stock: 20, tag: "", brand: "LOOKSMAX" },
  { name: "Rugby Stripe Polo", price: 29.99, category: "polos", description: "Bold striped rugby polo with contrast collar.", details: ["100% Cotton jersey", "Rugby collar", "Oversized fit"], sizes: ["S", "M", "L", "XL"], colors: ["Navy/White", "Green/White"], stock: 10, tag: "", brand: "LOOKSMAX" },
  { name: "Baggy Fit Jeans", price: 39.99, category: "jeans", description: "90s-inspired baggy fit jeans.", details: ["100% Cotton denim", "Baggy fit", "High waist"], sizes: ["S", "M", "L", "XL"], colors: ["Light Wash"], stock: 7, tag: "", brand: "LOOKSMAX" },
  { name: "Zip Bomber Jacket", price: 55.99, category: "jackets", description: "Lightweight bomber jacket with zip closure.", details: ["100% Polyester", "Bomber silhouette", "Ribbed cuffs"], sizes: ["S", "M", "L", "XL"], colors: ["Black", "Olive"], stock: 5, tag: "", brand: "LOOKSMAX" },
  { name: "Ribbed Tank Top", price: 12.99, category: "t-shirts", description: "Ribbed cotton tank top, perfect for layering.", details: ["100% Ribbed cotton", "Slim fit", "Scoop neck"], sizes: ["S", "M", "L", "XL"], colors: ["White", "Black"], stock: 25, tag: "", brand: "LOOKSMAX" },
  { name: "Pleated Trousers", price: 34.99, category: "trousers", description: "Smart pleated trousers with tapered leg.", details: ["65% Polyester, 35% Viscose", "Pleated front", "Tapered leg"], sizes: ["S", "M", "L", "XL"], colors: ["Black", "Grey"], stock: 9, tag: "", brand: "LOOKSMAX" },
  { name: "Oversized Hoodie", price: 39.99, category: "sweat", description: "Heavy weight oversized hoodie.", details: ["100% Cotton fleece", "Oversized fit", "Drop shoulders"], sizes: ["S", "M", "L", "XL"], colors: ["Black", "Cream"], stock: 14, tag: "", brand: "LOOKSMAX" },
  { name: "Striped Knit Vest", price: 27.99, category: "knits", description: "Retro-inspired striped knit vest.", details: ["100% Acrylic", "V-neck", "Relaxed fit"], sizes: ["S", "M", "L", "XL"], colors: ["Multi"], stock: 6, tag: "", brand: "LOOKSMAX" },
  { name: "Corduroy Shirt", price: 32.99, category: "shirts", description: "Soft corduroy overshirt with button closure.", details: ["100% Cotton corduroy", "Overshirt fit", "Chest pockets"], sizes: ["S", "M", "L", "XL"], colors: ["Brown", "Forest Green"], stock: 8, tag: "", brand: "LOOKSMAX" },
  { name: "Track Pants", price: 29.99, category: "sportswear", description: "Classic track pants with side stripe.", details: ["100% Polyester", "Elastic waist", "Side pockets"], sizes: ["S", "M", "L", "XL"], colors: ["Black", "Navy"], stock: 15, tag: "", brand: "LOOKSMAX" },
];

async function seed() {
  await dbConnect();

  // Clear existing data
  await Product.deleteMany({});
  await User.deleteMany({});

  // Create admin user
  const adminPassword = await hashPassword("admin123");
  await User.create({
    name: "Admin",
    email: "admin@looksmax.com",
    password: adminPassword,
    role: "admin",
  });

  // Create test user
  const userPassword = await hashPassword("user123");
  await User.create({
    name: "Test User",
    email: "user@looksmax.com",
    password: userPassword,
    role: "user",
    address: {
      street: "123 Main St",
      city: "Tunis",
      state: "Tunis",
      zip: "1000",
      phone: "+216 12 345 678",
    },
  });

  // Create products
  await Product.insertMany(products);

  console.log("✅ Database seeded successfully!");
  console.log("   Admin: admin@looksmax.com / admin123");
  console.log("   User:  user@looksmax.com / user123");
  console.log(`   Products: ${products.length} items created`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
