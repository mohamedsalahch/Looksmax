import Link from "next/link";

const products = [
  { id: 1, code: "[05.1]", price: "29.99", name: "Striped Rugby Polo" },
  { id: 2, code: "[05.2]", price: "35.99", name: "Oversized Knit Vest" },
  { id: 3, code: "[05.3]", price: "19.99", name: "Essential Crew Tee" },
];

export default function ProductCardRow() {
  return (
    <section className="px-4 md:px-8 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-3 gap-3 md:gap-5">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/category/collection`}
              className="group cursor-pointer"
            >
              <div className="relative aspect-[3/4] placeholder-img overflow-hidden product-image-wrapper">
                <div className="absolute inset-0 product-image" />
                <span className="relative z-10 text-[10px] tracking-widest opacity-60">
                  PRODUCT {product.id}
                </span>
              </div>
              <div className="mt-2 flex items-start justify-between">
                <span className="text-xs font-mono text-text-secondary">{product.code}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
