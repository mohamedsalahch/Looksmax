import ProductCard from "./ProductCard";

const sampleProducts = [
  { id: 1, name: "Relaxed Fit Jeans", price: "35.99" },
  { id: 2, name: "Oversized T-Shirt", price: "15.99", tag: "NEW" },
  { id: 3, name: "Wide Leg Chinos", price: "29.99" },
  { id: 4, name: "Printed Camp Shirt", price: "25.99" },
  { id: 5, name: "Basic Crew Neck Tee", price: "9.99" },
  { id: 6, name: "Cargo Trousers", price: "35.99" },
  { id: 7, name: "Denim Jacket", price: "49.99", tag: "POPULAR" },
  { id: 8, name: "Knit Polo Shirt", price: "22.99" },
  { id: 9, name: "Straight Leg Jeans", price: "35.99" },
  { id: 10, name: "Linen Blend Shirt", price: "29.99" },
  { id: 11, name: "Hoodie Sweatshirt", price: "32.99" },
  { id: 12, name: "Slim Fit Chinos", price: "27.99" },
  { id: 13, name: "Graphic Print Tee", price: "17.99", tag: "NEW" },
  { id: 14, name: "Parachute Pants", price: "39.99" },
  { id: 15, name: "Cotton Shorts", price: "19.99" },
  { id: 16, name: "Rugby Stripe Polo", price: "29.99" },
  { id: 17, name: "Baggy Fit Jeans", price: "39.99" },
  { id: 18, name: "Zip Bomber Jacket", price: "55.99" },
  { id: 19, name: "Ribbed Tank Top", price: "12.99" },
  { id: 20, name: "Pleated Trousers", price: "34.99" },
  { id: 21, name: "Oversized Hoodie", price: "39.99" },
  { id: 22, name: "Striped Knit Vest", price: "27.99" },
  { id: 23, name: "Corduroy Shirt", price: "32.99" },
  { id: 24, name: "Track Pants", price: "29.99" },
];

export default function ProductGrid() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-8">
        {sampleProducts.map((product) => (
          <ProductCard
            key={product.id}
            id={product.id}
            name={product.name}
            price={product.price}
            tag={product.tag}
          />
        ))}
      </div>
    </div>
  );
}
