import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Package, ShoppingCart } from "lucide-react";
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
const NEW_ARRIVALS_LINK = "/products?tag=new-arrivals";

/** New arrivals: a wide spotlight and a drifting row on phones, one drifting row on larger screens. */
const TrendProducts = () => {
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { toast } = useToast();
  const {
    scrollerRef: scrollRef,
    scrollByPage: mobileScrollByPage,
    canScroll: canMobileScroll,
  } = useAutoScroll({
    speed: 0.5,
    resumeDelay: 2400,
    loop: true,
    direction: 1,
    loopItemCount: Math.max(products.length - 1, 0),
  });
  const {
    scrollerRef: desktopNARef,
    scrollByPage: desktopNAScrollByPage,
    canScroll: canDesktopNAScroll,
  } = useAutoScroll({
    speed: 0.55,
    resumeDelay: 2400,
    loop: true,
    direction: -1,
    loopItemCount: products.length,
    pageStep: 246,
  });

  // Real-time listener for new arrivals
  useEffect(() => {
    const unsubscribe = subscribeToActiveProductsByFlag('isNewArrival',
      (fetchedProducts) => {
        const uiProducts = adaptFirebaseArrayToUI(fetchedProducts);
        setProducts(uiProducts);
        setLoading(false);
      },
      10
    );

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

  const spotlight = products[0];
  const mobileBaseProducts = products.slice(1);
  const mobileTrackProducts =
    canMobileScroll && mobileBaseProducts.length > 1
      ? [...mobileBaseProducts, ...mobileBaseProducts]
      : mobileBaseProducts;
  const desktopTrackProducts =
    canDesktopNAScroll && products.length > 1 ? [...products, ...products] : products;

  const empty = (
    <EmptyState
      icon={Package}
      title="New arrivals coming soon"
      description="New formulations are on their way."
      as="h3"
      className="py-10"
    />
  );

  const desktopArrowClass = cn(
    "btn-round absolute top-1/2 z-raised !size-11 -translate-y-1/2 !bg-card shadow-panel transition-[opacity,border-color,color,transform]",
    canDesktopNAScroll
      ? "pointer-events-none opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/new-arrivals:pointer-events-auto group-hover/new-arrivals:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
      : "hidden",
  );

  const section = (
    <section className="tx-contour py-12 md:py-20" aria-busy={loading || undefined}>
      <div className="container-custom">
        {/* Header: one heading at every width */}
        <div className="mb-4 flex items-end justify-between gap-3 px-1 md:mb-8 md:px-0">
          <h2 className="text-xl font-semibold text-foreground [text-wrap:balance] md:text-3xl lg:text-4xl" style={HEADING_FONT}>
            New arrivals
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label="Scroll new arrivals left"
              onClick={() => mobileScrollByPage('prev')}
              disabled={!canMobileScroll}
              className="btn-round md:hidden"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Scroll new arrivals right"
              onClick={() => mobileScrollByPage('next')}
              disabled={!canMobileScroll}
              className="btn-round md:hidden"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
            <Link to={NEW_ARRIVALS_LINK} className="link-arrow ml-1.5 md:ml-0">
              View all <ChevronRight aria-hidden="true" className="hidden size-4 md:block" />
            </Link>
          </div>
        </div>

        {/* Products Container */}
        <div className="relative">
          {/* Mobile: wide spotlight + drifting row */}
          <div className="pb-2 md:hidden">
            {loading ? (
              <>
                <span className="sr-only" role="status">Loading new arrivals</span>
                <Skeleton className="mb-3 aspect-[16/10] w-full rounded-card" />
                <ProductRowSkeleton count={3} label="" className="pb-2" itemClassName="h-[259px] w-[160px] overflow-hidden" />
              </>
            ) : products.length === 0 ? (
              empty
            ) : (
              <>
                {spotlight && (
                  <article className="group relative isolate mb-3 flex aspect-[16/10] flex-col justify-end overflow-hidden rounded-card border border-foreground/10 bg-charcoal has-[a[data-card-link]:focus-visible]:outline has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-ring">
                    <SmartImage
                      src={spotlight.image}
                      alt=""
                      className="absolute inset-0 -z-10 h-full w-full object-cover"
                      preset="detail"
                    />
                    <div aria-hidden="true" className="photo-scrim absolute inset-0 -z-10" />
                    <WishlistToggle
                      name={spotlight.title}
                      saved={isInWishlist(spotlight.id)}
                      onToggle={() => toggleWishlist(spotlight.id, spotlight.title)}
                      variant="onPhoto"
                      className="absolute right-3 top-3 z-raised"
                    />
                    <div className="p-4 text-charcoal-foreground">
                      <h3 title={spotlight.title} className="on-photo mb-1.5 line-clamp-2 text-lg font-semibold leading-tight" style={HEADING_FONT}>
                        <Link
                          to={`/product/${spotlight.id}`}
                          data-card-link=""
                          className="outline-none after:absolute after:inset-0 after:content-['']"
                        >
                          {spotlight.title}
                        </Link>
                      </h3>
                      <div className="flex items-center justify-between gap-3">
                        <p className="on-photo flex flex-wrap items-baseline gap-x-2">
                          <span className="text-base font-bold tabular-nums">{formatINR(spotlight.price)}</span>
                          {spotlight.oldPrice && spotlight.oldPrice > spotlight.price && (
                            <span className="text-xs tabular-nums text-charcoal-foreground/75 line-through">
                              <span className="sr-only">Was </span>
                              {formatINR(spotlight.oldPrice)}
                            </span>
                          )}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleAddToCart(spotlight)}
                          className="btn-copper relative z-raised h-10 !px-4 !py-0"
                        >
                          <ShoppingCart aria-hidden="true" className="size-4" />
                          Add<span className="sr-only"> {spotlight.title} to cart</span>
                        </button>
                      </div>
                    </div>
                  </article>
                )}

                {/* Drifting row of the rest */}
                <div
                  ref={scrollRef}
                  className="-mx-4 flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-2"
                  style={{ WebkitOverflowScrolling: 'touch', scrollPaddingLeft: '16px' }}
                >
                  {mobileTrackProducts.map((product, index) => {
                    const isLoopCopy = index >= mobileBaseProducts.length;
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
              </>
            )}
          </div>

          <div className="relative hidden md:block">
            {loading ? (
              <ProductRowSkeleton count={5} label="" className="py-4" itemClassName="h-[332px] w-[230px] overflow-hidden lg:h-[341px]" />
            ) : products.length === 0 ? (
              empty
            ) : (
              <div className="group/new-arrivals relative -mx-2 overflow-hidden py-2">
                <div ref={desktopNARef} className="overflow-x-auto scrollbar-hide px-2 py-2">
                  <div className={cn("flex gap-4", canDesktopNAScroll ? "w-max" : "justify-center")}>
                    {desktopTrackProducts.map((product, index) => {
                      const isLoopCopy = index >= products.length;
                      return (
                        <div
                          key={`desktop-${product.id}-${index}`}
                          className="w-[230px] flex-none"
                          aria-hidden={isLoopCopy || undefined}
                          {...(isLoopCopy ? INERT : {})}
                        >
                          <ProductCard product={product} index={index} size="row" className="w-full" />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => desktopNAScrollByPage("prev")}
                  disabled={!canDesktopNAScroll}
                  className={cn(desktopArrowClass, "left-6")}
                  aria-label="Show previous new arrivals"
                >
                  <ChevronLeft aria-hidden="true" className="size-5" />
                </button>

                <button
                  type="button"
                  onClick={() => desktopNAScrollByPage("next")}
                  disabled={!canDesktopNAScroll}
                  className={cn(desktopArrowClass, "right-6")}
                  aria-label="Show next new arrivals"
                >
                  <ChevronRight aria-hidden="true" className="size-5" />
                </button>
              </div>
            )}
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

  return loading ? section : <Reveal>{section}</Reveal>;
};

export default TrendProducts;
