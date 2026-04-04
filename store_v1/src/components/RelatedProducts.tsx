import ProductCard from "./ProductCard";

const relatedProducts = [
  { id: 101, name: "Vintage Denim Jacket", price: "45.99" },
  { id: 102, name: "Retro Graphic Tee", price: "18.99", tag: "NEW" },
  { id: 103, name: "Wide Leg Corduroy", price: "32.99" },
  { id: 104, name: "Faded Crew Sweatshirt", price: "28.99" },
];

export default function RelatedProducts() {
  return (
    <section className="border-t border-border-color mt-16 pt-10 pb-6">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-6">
          You may also like
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-8">
          {relatedProducts.map((product) => (
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
    </section>
  );
}
