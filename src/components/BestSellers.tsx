import { useEffect, useState } from "react";
import { Package, ShoppingCart, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { UIProduct, adaptFirebaseArrayToUI } from "@/lib/productAdapter";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/hooks/useWishlist";
import { useToast } from "@/hooks/use-toast";
import useAutoScroll from "@/hooks/useAutoScroll";
import { SmartImage } from "@/components/ui/smart-image";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductRowSkeleton } from "@/components/skeletons";
import ProductCard from "@/components/ProductCard";
import { WishlistToggle } from "@/components/WishlistToggle";
import { EmptyState } from "@/components/EmptyState";
import Reveal from "@/components/Reveal";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { subscribeToActiveProductsByFlag } from '@/services/productCache';

const HEADING_FONT = { fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" };
const INERT = { inert: "" } as Record<string, string>;
const BEST_SELLERS_LINK = "/products?tag=best-sellers";

const rankLabel = (rank: number) => `No. ${String(rank).padStart(2, "0")}`;

/** The rank tag on a best seller's photo: the section's one label per card. */
const RankTag = ({ rank, className }: { rank: number; className?: string }) => (
  <span className={cn("tag-dark pointer-events-none absolute z-raised tabular-nums", className)}>
    <span className="sr-only">Best seller </span>
    {rankLabel(rank)}
  </span>
);

/**
 * A row card with its rank on the photo. Loop copies (the second set that makes
 * the drift seamless) are hidden from screen readers and the keyboard.
 */
const RankedCard = ({
  product,
  index,
  rank,
  isLoopCopy,
  widthClass,
}: {
  product: UIProduct;
  index: number;
  rank: number | null;
  isLoopCopy: boolean;
  widthClass: string;
}) => (
  <div
    className={cn("group/rank relative flex-none", widthClass)}
    aria-hidden={isLoopCopy || undefined}
    {...(isLoopCopy ? INERT : {})}
  >
    <ProductCard product={product} index={index} size="row" className="w-full" />
    {rank !== null && (
      <RankTag
        rank={rank}
        // Lifts with the card on hover (.card-product moves 3px with a mouse).
        className="left-3.5 top-3.5 transition-transform [transition-duration:220ms] ease-out lg:left-4 lg:top-4 [@media(hover:hover)_and_(pointer:fine)]:group-hover/rank:-translate-y-[3px]"
      />
    )}
  </div>
);

const BestSellers = () => {
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { toast } = useToast();
  const {
    scrollerRef: mobileBSRef,
    scrollByPage: mobileBSScrollByPage,
    canScroll: canMobileBSScroll,
  } = useAutoScroll({
    speed: 0.5,
    resumeDelay: 2400,
    loop: true,
    direction: -1,
    loopItemCount: Math.max(products.length - 1, 0),
  });
  const {
    scrollerRef: desktopBSRef,
    scrollByPage: desktopBSScrollByPage,
    canScroll: canDesktopBSScroll,
  } = useAutoScroll({
    speed: 0.55,
    resumeDelay: 2400,
    loop: true,
    direction: 1,
    loopItemCount: products.length,
    pageStep: 246,
  });

  // Real-time subscription to best sellers
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToActiveProductsByFlag('isBestSeller', (fbProducts) => {
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

  const mobileBaseProducts = products.slice(1);
  const mobileCarouselProducts =
    canMobileBSScroll && mobileBaseProducts.length > 1
      ? [...mobileBaseProducts, ...mobileBaseProducts]
      : mobileBaseProducts;
  const desktopCarouselProducts =
    canDesktopBSScroll && products.length > 1 ? [...products, ...products] : products;

  const spotlight = products[0];

  const empty = (
    <EmptyState icon={Package} title="Best sellers will appear here soon" as="h3" className="py-10" />
  );

  // Desktop arrows: shown on hover or keyboard focus with a mouse, always on touch screens.
  const desktopArrowClass = cn(
    "btn-round absolute top-1/2 z-raised !size-11 -translate-y-1/2 !bg-card shadow-panel transition-[opacity,border-color,color,transform]",
    canDesktopBSScroll
      ? "pointer-events-none opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/best-sellers:pointer-events-auto group-hover/best-sellers:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
      : "hidden",
  );

  const panel = (
    <section className="relative py-8 md:py-12" aria-busy={loading || undefined}>
      <div className="container-custom">
        <div className="panel tx-sheet relative overflow-hidden px-4 py-5 md:px-8 md:py-10">
          {/* Header: one heading at every width */}
          <div className="mb-4 flex items-end justify-between gap-3 px-1 md:mb-8 md:px-0">
            <h2 className="text-xl font-semibold text-foreground [text-wrap:balance] md:text-3xl lg:text-4xl" style={HEADING_FONT}>
              Most loved right now
            </h2>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                aria-label="Scroll best sellers left"
                onClick={() => mobileBSScrollByPage('prev')}
                disabled={!canMobileBSScroll}
                className="btn-round md:hidden"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Scroll best sellers right"
                onClick={() => mobileBSScrollByPage('next')}
                disabled={!canMobileBSScroll}
                className="btn-round md:hidden"
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
              <Link to={BEST_SELLERS_LINK} className="link-arrow ml-1.5 md:ml-0">
                View all <ChevronRight aria-hidden="true" className="hidden size-4 md:block" />
              </Link>
            </div>
          </div>

          {/* Products Container */}
          <div className="relative">
            <div className="pb-2 md:hidden">
              {loading ? (
                <>
                  <span className="sr-only" role="status">Loading best sellers</span>
                  <Skeleton className="mb-3 h-[191px] w-full rounded-card" />
                  <ProductRowSkeleton count={3} label="" className="pb-2" itemClassName="h-[259px] w-[160px] overflow-hidden" />
                </>
              ) : products.length === 0 ? (
                empty
              ) : (
                <>
                  {/* Spotlight card (#1 best seller) */}
                  {spotlight && (
                    <article
                      className={cn(
                        "card-product group relative mb-3 flex overflow-hidden",
                        "has-[a[data-card-link]:focus-visible]:outline has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-ring",
                      )}
                    >
                      <div className="relative w-[44%] overflow-hidden">
                        <SmartImage
                          src={spotlight.image}
                          alt={spotlight.alt || spotlight.title}
                          className="aspect-[4/5] h-full w-full object-cover"
                          preset="detail"
                        />
                        <RankTag rank={1} className="left-2 top-2" />
                      </div>
                      <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                        <div>
                          <h3
                            title={spotlight.title}
                            className="mb-2 line-clamp-2 text-base font-semibold leading-snug text-foreground [text-wrap:pretty]"
                            style={HEADING_FONT}
                          >
                            <Link
                              to={`/product/${spotlight.id}`}
                              data-card-link=""
                              className="outline-none after:absolute after:inset-0 after:content-['']"
                            >
                              {spotlight.title}
                            </Link>
                          </h3>
                          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="price-now text-lg">{formatINR(spotlight.price)}</span>
                            {spotlight.oldPrice && spotlight.oldPrice > spotlight.price && (
                              <span className="price-was text-xs">
                                <span className="sr-only">Was </span>
                                {formatINR(spotlight.oldPrice)}
                              </span>
                            )}
                            {(spotlight.discount ?? 0) > 0 && <span className="chip-off">{spotlight.discount}% off</span>}
                          </p>
                        </div>
                        <div className="relative z-raised flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleAddToCart(spotlight)}
                            className="btn-copper h-11 flex-1 !px-3 !py-0"
                          >
                            <ShoppingCart aria-hidden="true" className="size-4" />
                            Add<span className="sr-only"> {spotlight.title} to cart</span>
                          </button>
                          <WishlistToggle
                            name={spotlight.title}
                            saved={isInWishlist(spotlight.id)}
                            onToggle={() => toggleWishlist(spotlight.id, spotlight.title)}
                          />
                        </div>
                      </div>
                    </article>
                  )}

                  {/* Horizontal auto-scroll row for the rest */}
                  <div
                    ref={mobileBSRef}
                    className="-mx-1 flex gap-3 overflow-x-auto scrollbar-hide px-1 pb-2"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                  >
                    {mobileCarouselProducts.map((product, idx) => {
                      const sourceIndex = mobileBaseProducts.length > 0 ? idx % mobileBaseProducts.length : idx;
                      const rank = sourceIndex + 2; // continues from #2
                      return (
                        <RankedCard
                          key={`${product.id}-${idx}`}
                          product={product}
                          index={idx}
                          rank={rank <= 5 ? rank : null}
                          isLoopCopy={idx >= mobileBaseProducts.length}
                          widthClass="w-[160px]"
                        />
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="relative hidden md:block">
              {loading ? (
                <ProductRowSkeleton count={5} label="" className="py-4" itemClassName="h-[332px] w-[230px] overflow-hidden lg:h-[341px]" />
              ) : products.length === 0 ? (
                empty
              ) : (
                <div className="group/best-sellers relative -mx-2 overflow-hidden rounded-card py-2">
                  <div ref={desktopBSRef} className="overflow-x-auto scrollbar-hide px-2 py-2">
                    <div className={cn("flex gap-4", canDesktopBSScroll ? "w-max" : "justify-center")}>
                      {desktopCarouselProducts.map((product, index) => {
                        const sourceIndex = products.length > 0 ? index % products.length : index;
                        return (
                          <RankedCard
                            key={`desktop-${product.id}-${index}`}
                            product={product}
                            index={index}
                            rank={sourceIndex < Math.min(products.length, 5) ? sourceIndex + 1 : null}
                            isLoopCopy={index >= products.length}
                            widthClass="w-[230px]"
                          />
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => desktopBSScrollByPage("prev")}
                    disabled={!canDesktopBSScroll}
                    className={cn(desktopArrowClass, "left-6")}
                    aria-label="Show previous best sellers"
                  >
                    <ChevronLeft aria-hidden="true" className="size-5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => desktopBSScrollByPage("next")}
                    disabled={!canDesktopBSScroll}
                    className={cn(desktopArrowClass, "right-6")}
                    aria-label="Show next best sellers"
                  >
                    <ChevronRight aria-hidden="true" className="size-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </section>
  );

  // The reveal waits for the data, so the panel and its cards appear together.
  return loading ? panel : <Reveal>{panel}</Reveal>;
};

export default BestSellers;
