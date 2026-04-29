import ProductCard from "./ProductCard";

interface ProductImage {
  url: string;
  isMain: boolean;
}

export interface RelatedProduct {
  _id: string;
  name: string;
  categories?: string[];
  price: number;
  stock: number;
  sizeAvailability?: Record<string, { stock: number; available: boolean; reservedElsewhere: boolean }> | null;
  cartCount?: number;
  reservedElsewhere?: boolean;
  ownedReservation?: boolean;
  tag?: string;
  sizes?: string[];
  images?: ProductImage[];
  conditionScore?: number | null;
  conditionStatus?: string | null;
  productType?: "fashion" | "perfume" | "clothing" | "shoes";
  fashionSubtype?: "clothes" | "shoes" | null;
  originPictures?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
  cloneSourceName?: string;
  cloneSourceImage?: string;
}

function getMainImage(images?: ProductImage[]): string | undefined {
  if (!images || images.length === 0) return undefined;
  const main = images.find((i) => i.isMain);
  return main?.url || images[0]?.url;
}

export default function RelatedProducts({ products }: { products: RelatedProduct[] }) {
  if (!products || products.length === 0) return null;

  return (
    <section className="border-t border-border-color mt-16 pt-10 pb-6">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-6">
          You may also like
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-8">
          {products.map((product) => (
            <ProductCard
              key={product._id}
              id={product._id}
              name={product.name}
              categories={product.categories}
              price={product.price.toFixed(2)}
              stock={product.stock}
              sizeAvailability={product.sizeAvailability}
              cartCount={product.cartCount}
              reservedElsewhere={product.reservedElsewhere}
              ownedReservation={product.ownedReservation}
              tag={product.tag}
              sizes={product.sizes}
              image={getMainImage(product.images)}
              conditionScore={product.conditionScore}
              conditionStatus={product.conditionStatus}
              productType={product.productType}
              fashionSubtype={product.fashionSubtype}
              originPictures={product.originPictures}
              cloneSourceName={product.cloneSourceName}
              cloneSourceImage={product.cloneSourceImage}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
