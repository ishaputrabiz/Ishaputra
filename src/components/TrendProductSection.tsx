import { useState, useEffect } from "react";
import { ChevronRight, ChevronLeft, ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";

import { UIProduct, adaptFirebaseArrayToUI } from "@/lib/productAdapter";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/hooks/useWishlist";
import { useToast } from "@/hooks/use-toast";
import useAutoScroll from "@/hooks/useAutoScroll";
import { SmartImage } from "@/components/ui/smart-image";
import { Skeleton } from "@/components/ui/skeleton";
import { IconButton } from "@/components/ui/icon-button";
import { ProductRowSkeleton } from "@/components/skeletons";
import ProductCard from "@/components/ProductCard";
import { WishlistToggle } from "@/components/WishlistToggle";
import Reveal from "@/components/Reveal";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { subscribeToActiveProductsByFlag } from '@/services/productCache';

const HEADING_FONT = { fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" };
const INERT = { inert: "" } as Record<string, string>;
const TRENDING_LINK = "/products?tag=trending";
/** Bento: 0 = big (2x2), 1 = top-right wide (2x1), 2 and 3 = bottom-right (1x1 each). */
const TILE_LAYOUT = ["col-span-2 row-span-2", "col-span-2 row-span-1", "col-span-1 row-span-1", "col-span-1 row-span-1"];

const Heading = () => (
  <h2 className="text-xl font-semibold text-foreground [text-wrap:balance] md:text-3xl lg:text-4xl" style={HEADING_FONT}>
    Trending this week
  </h2>
);

const TrendProductSection = () => {
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { toast } = useToast();
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const {
    scrollerRef: mobileScrollRef,
    scrollByPage: mobileScrollByPage,
    canScroll: canMobileTrendingScroll,
  } = useAutoScroll({ speed: 0.55, resumeDelay: 2400, loop: true, direction: -1, loopItemCount: products.length });

  const mobileTrendingProducts =
    canMobileTrendingScroll && products.length > 1 ? [...products, ...products] : products;

  useEffect(() => {
    const unsubscribe = subscribeToActiveProductsByFlag('isTrendProduct', (fbProducts) => {
      const uiProducts = adaptFirebaseArrayToUI(fbProducts);
      setProducts(uiProducts);
      setLoading(false);
    }, 10);

    return () => unsubscribe();
  }, []);

  const handleAddToCart = (product: UIProduct) => {
    try {
      const added = addToCart({
        id: product.id,
        name: product.title,
        price: product.price,
        image: product.image,
        category: product.category,
        stock: product.stock,
      });
      if (!added) return;
      toast({
        title: "Added to cart",
        description: product.title,
      });
    } catch (error) {
      console.error('Error adding to cart:', error);
      toast({
        title: "Could not add to cart",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <section className="py-12 md:py-20" aria-busy="true">
        <span className="sr-only" role="status">Loading trending products</span>
        <div className="container-custom">
          <div className="mb-4 px-1 md:mb-8 md:px-0">
            <Heading />
          </div>
          <ProductRowSkeleton count={3} label="" itemClassName="h-[259px] w-[160px] overflow-hidden" className="pb-2 md:hidden" />
          <div className="hidden grid-cols-4 grid-rows-2 gap-4 md:grid" style={{ height: 540 }}>
            {TILE_LAYOUT.map((layout, i) => (
              <Skeleton key={i} className={cn("h-full rounded-card", layout)} />
            ))}
          </div>
        </div>
      </section>
    );
  }
  if (products.length === 0) return null;

  const featuredProduct = products[0];
  const restProducts = products.slice(1);
  // Three beside the featured tile fill the desktop bento (see the grid below).
  const productsPerPage = 3;
  const totalPages = Math.max(1, Math.ceil(restProducts.length / productsPerPage));
  const visibleProducts = restProducts.slice(
    currentPage * productsPerPage,
    (currentPage + 1) * productsPerPage
  );

  const nextPage = () => setCurrentPage((prev) => (prev + 1) % totalPages);
  const prevPage = () => setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);

  // Bento grid: 4 cols x 2 rows. That is all 8 cells: a fifth tile would fall
  // into an implicit, zero-height third row.
  const tiles = [featuredProduct, ...visibleProducts].slice(0, 4);

  return (
    <Reveal>
      <section className="py-12 md:py-20">
        <div className="container-custom">
          {/* Header: one heading at every width */}
          <div className="mb-4 flex items-end justify-between gap-3 px-1 md:mb-8 md:px-0">
            <Heading />
            <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
              <button
                type="button"
                aria-label="Scroll trending left"
                onClick={() => mobileScrollByPage('prev')}
                disabled={!canMobileTrendingScroll}
                className="btn-round md:hidden"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Scroll trending right"
                onClick={() => mobileScrollByPage('next')}
                disabled={!canMobileTrendingScroll}
                className="btn-round md:hidden"
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                onClick={prevPage}
                disabled={totalPages <= 1}
                aria-label="Previous trending products"
                className="btn-round hidden md:inline-flex"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                onClick={nextPage}
                disabled={totalPages <= 1}
                aria-label="Next trending products"
                className="btn-round hidden md:inline-flex"
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
              <Link to={TRENDING_LINK} className="link-arrow ml-1.5 md:ml-2">
                View all <ChevronRight aria-hidden="true" className="hidden size-4 md:block" />
              </Link>
            </div>
          </div>

          {/* Mobile: drifting row */}
          <div className="md:hidden">
            <div ref={mobileScrollRef} className="flex gap-3 overflow-x-auto scrollbar-hide pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
              {mobileTrendingProducts.map((product, index) => {
                const isLoopCopy = index >= products.length;
                return (
                  <div
                    key={`${product.id}-${index}`}
                    className="w-[160px] flex-none"
                    aria-hidden={isLoopCopy || undefined}
                    {...(isLoopCopy ? INERT : {})}
                  >
                    <ProductCard product={product} index={index} size="row" className="w-full" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Desktop: asymmetric bento mosaic */}
          <div className="hidden grid-cols-4 grid-rows-2 gap-4 md:grid" style={{ height: 540 }}>
            {tiles.map((product, idx) => {
              if (!product) return null;
              const isBig = idx === 0;
              return (
                <article
                  key={product.id}
                  className={cn(
                    "group relative isolate flex flex-col justify-end overflow-hidden rounded-card border border-foreground/[0.06] bg-charcoal",
                    "has-[a[data-card-link]:focus-visible]:outline has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-ring",
                    TILE_LAYOUT[idx],
                  )}
                >
                  <SmartImage
                    src={product.image}
                    alt=""
                    className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                    preset={isBig ? "detail" : "card"}
                  />
                  <div aria-hidden="true" className="photo-scrim absolute inset-0 -z-10" />

                  <WishlistToggle
                    name={product.title}
                    saved={isInWishlist(product.id)}
                    onToggle={() => toggleWishlist(product.id, product.title)}
                    variant="onPhoto"
                    className={cn(
                      "absolute right-3 top-3 z-raised",
                      // With a mouse it appears on hover or focus; touch screens always show it.
                      !isInWishlist(product.id) &&
                        "[@media(hover:hover)]:opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100",
                    )}
                  />

                  <div className={cn("text-charcoal-foreground", isBig ? "p-5 lg:p-6" : "p-4 lg:p-5")}>
                    <h3
                      title={product.title}
                      className={cn("on-photo line-clamp-2 font-semibold [text-wrap:pretty]", isBig ? "mb-2 text-xl lg:text-2xl" : "mb-1.5 text-sm lg:text-base")}
                      style={HEADING_FONT}
                    >
                      <Link
                        to={`/product/${product.id}`}
                        data-card-link=""
                        className="outline-none after:absolute after:inset-0 after:content-['']"
                      >
                        {product.title}
                      </Link>
                    </h3>
                    <div className="flex items-center justify-between gap-2">
                      <p className="on-photo flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <span className={cn("font-bold tabular-nums", isBig ? "text-lg" : "text-sm")}>{formatINR(product.price)}</span>
                        {product.oldPrice && product.oldPrice > product.price && (
                          <span className="text-xs tabular-nums text-charcoal-foreground/75 line-through">
                            <span className="sr-only">Was </span>
                            {formatINR(product.oldPrice)}
                          </span>
                        )}
                      </p>
                      <IconButton
                        label={`Add ${product.title} to cart`}
                        variant="onPhoto"
                        onClick={() => handleAddToCart(product)}
                        className="z-raised border border-charcoal-foreground/25 hover:border-primary hover:bg-primary hover:text-primary-foreground"
                      >
                        <ShoppingCart aria-hidden="true" />
                      </IconButton>
                    </div>
                    {isBig && (
                      <span
                        aria-hidden="true"
                        className="btn-line mt-4 w-fit text-charcoal-foreground group-hover:bg-charcoal-foreground group-hover:text-charcoal"
                      >
                        Shop now
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <style>{`
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>
      </section>
    </Reveal>
  );
};

export default TrendProductSection;
