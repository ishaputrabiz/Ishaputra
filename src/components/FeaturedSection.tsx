import { useState, useEffect } from "react";
import { ChevronRight, ChevronLeft, ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";

import { UIProduct, adaptFirebaseArrayToUI } from "@/lib/productAdapter";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/hooks/useWishlist";
import { useToast } from "@/hooks/use-toast";
import { SmartImage } from "@/components/ui/smart-image";
import { Skeleton } from "@/components/ui/skeleton";
import { IconButton } from "@/components/ui/icon-button";
import ProductCard from "@/components/ProductCard";
import { WishlistToggle } from "@/components/WishlistToggle";
import Reveal from "@/components/Reveal";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { subscribeToActiveProductsByFlag } from '@/services/productCache';

const HEADING_FONT = { fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" };
const FEATURED_LINK = "/products?tag=featured";
/** A card is outlined when its title link has keyboard focus (the link covers the whole card). */
const CARD_FOCUS =
  "has-[a[data-card-link]:focus-visible]:outline has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-highlight-soft";

const Shell = ({ children, busy }: { children: React.ReactNode; busy?: boolean }) => (
  <section className="relative py-8 md:py-12" aria-busy={busy || undefined}>
    <div className="container-custom">
      <div className="panel tx-slate relative overflow-hidden px-4 py-5 text-charcoal-foreground md:px-8 md:py-10">{children}</div>
    </div>
  </section>
);

const Heading = () => (
  <h2 className="text-xl font-semibold text-charcoal-foreground [text-wrap:balance] md:text-3xl lg:text-4xl" style={HEADING_FONT}>
    Editor’s picks
  </h2>
);

const FeaturedSection = () => {
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { toast } = useToast();
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToActiveProductsByFlag('isFeatured', (fbProducts) => {
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
      <Shell busy>
        <span className="sr-only" role="status">Loading featured products</span>
        <div className="mb-4 px-1 md:mb-8 md:px-0">
          <Heading />
        </div>
        <div className="space-y-4 md:hidden">
          <Skeleton className="h-[304px] rounded-card bg-charcoal-foreground/[0.08]" />
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[255px] rounded-card bg-charcoal-foreground/[0.08]" />
            ))}
          </div>
        </div>
        <div className="hidden space-y-5 md:block">
          <div className="grid grid-cols-[minmax(0,1.32fr)_minmax(340px,0.9fr)] gap-5">
            <Skeleton className="min-h-[520px] rounded-card bg-charcoal-foreground/[0.08]" />
            <div className="grid gap-5">
              <Skeleton className="rounded-card bg-charcoal-foreground/[0.08]" />
              <Skeleton className="rounded-card bg-charcoal-foreground/[0.08]" />
            </div>
          </div>
          <div className="grid h-[248px] grid-cols-2 gap-5">
            <Skeleton className="rounded-card bg-charcoal-foreground/[0.08]" />
            <Skeleton className="rounded-card bg-charcoal-foreground/[0.08]" />
          </div>
        </div>
      </Shell>
    );
  }
  if (products.length === 0) return null;

  const featuredProduct = products[0];
  const restProducts = products.slice(1);
  const productsPerPage = 4;
  const totalPages = Math.max(1, Math.ceil(restProducts.length / productsPerPage));
  const visibleProducts = restProducts.slice(
    currentPage * productsPerPage,
    (currentPage + 1) * productsPerPage
  );

  const nextPage = () => setCurrentPage((prev) => (prev + 1) % totalPages);
  const prevPage = () => setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
  const upperProducts = visibleProducts.slice(0, 2);
  const lowerProducts = visibleProducts.slice(2, 4);

  const priceRow = (product: UIProduct, size: "sm" | "md" | "lg") => (
    <p className="on-photo flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className={cn("font-bold tabular-nums", size === "lg" ? "text-2xl" : size === "md" ? "text-lg" : "text-base")}>
        {formatINR(product.price)}
      </span>
      {product.oldPrice && product.oldPrice > product.price && (
        <span className="text-xs tabular-nums text-charcoal-foreground/75 line-through md:text-sm">
          <span className="sr-only">Was </span>
          {formatINR(product.oldPrice)}
        </span>
      )}
    </p>
  );

  const titleLink = (product: UIProduct) => (
    <Link
      to={`/product/${product.id}`}
      data-card-link=""
      className="outline-none after:absolute after:inset-0 after:content-['']"
    >
      {product.title}
    </Link>
  );

  /** Photo card with the text on a scrim. The title link covers the card; heart and cart sit above it. */
  const renderDesktopCard = (product: UIProduct, compact = false) => (
    <article
      className={cn(
        "group relative isolate flex h-full min-h-[248px] flex-col justify-end overflow-hidden rounded-card border border-charcoal-foreground/10 bg-charcoal",
        CARD_FOCUS,
      )}
    >
      <SmartImage
        src={product.image}
        alt=""
        className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        preset="card"
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

      <div className="p-5 lg:p-6">
        <h3
          title={product.title}
          className={cn("on-photo mb-2 line-clamp-2 font-semibold [text-wrap:pretty]", compact ? "text-lg lg:text-xl" : "text-xl")}
          style={HEADING_FONT}
        >
          {titleLink(product)}
        </h3>
        <div className="flex items-center justify-between gap-2">
          {priceRow(product, compact ? "sm" : "md")}
          <IconButton
            label={`Add ${product.title} to cart`}
            variant="onPhoto"
            onClick={() => handleAddToCart(product)}
            className="z-raised border border-charcoal-foreground/25 hover:border-primary hover:bg-primary hover:text-primary-foreground"
          >
            <ShoppingCart aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </article>
  );

  return (
    <Reveal>
      <Shell>
        {/* Header: one heading at every width */}
        <div className="mb-4 flex items-end justify-between gap-3 px-1 md:mb-8 md:px-0">
          <div className="flex min-w-0 flex-1 items-end gap-4">
            <Heading />
            <span
              aria-hidden="true"
              className="mb-3 ml-2 hidden h-px min-w-[120px] flex-1 bg-gradient-to-r from-highlight-soft/50 via-highlight-soft/15 to-transparent lg:block"
            />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={prevPage}
              disabled={totalPages <= 1}
              aria-label="Previous featured products"
              className="btn-round hidden !border-charcoal-foreground/20 !bg-charcoal-foreground/5 !text-charcoal-foreground md:inline-flex"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              onClick={nextPage}
              disabled={totalPages <= 1}
              aria-label="Next featured products"
              className="btn-round hidden !border-charcoal-foreground/20 !bg-charcoal-foreground/5 !text-charcoal-foreground md:inline-flex"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
            <Link to={FEATURED_LINK} className="link-arrow !text-charcoal-foreground md:ml-2">
              View all <ChevronRight aria-hidden="true" className="hidden size-4 md:block" />
            </Link>
          </div>
        </div>

        {/* Mobile */}
        <div className="space-y-4 md:hidden">
          <article
            className={cn(
              "group relative isolate flex min-h-[304px] flex-col justify-end overflow-hidden rounded-card border border-charcoal-foreground/10 bg-charcoal",
              CARD_FOCUS,
            )}
          >
            <SmartImage src={featuredProduct.image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" preset="detail" />
            <div aria-hidden="true" className="photo-scrim absolute inset-0 -z-10" />
            <WishlistToggle
              name={featuredProduct.title}
              saved={isInWishlist(featuredProduct.id)}
              onToggle={() => toggleWishlist(featuredProduct.id, featuredProduct.title)}
              variant="onPhoto"
              className="absolute right-3 top-3 z-raised"
            />
            <div className="p-5">
              <h3 title={featuredProduct.title} className="on-photo mb-2 line-clamp-2 text-2xl font-semibold [text-wrap:pretty]" style={HEADING_FONT}>
                {titleLink(featuredProduct)}
              </h3>
              {priceRow(featuredProduct, "md")}
            </div>
          </article>

          {restProducts.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {restProducts.slice(0, 4).map((product, index) => (
                <ProductCard key={product.id} product={product} index={index} size="row" className="w-full" />
              ))}
            </div>
          )}
        </div>

        {/* Desktop: salon wall layout */}
        <div className="hidden space-y-5 md:block">
          <div className="grid grid-cols-[minmax(0,1.32fr)_minmax(340px,0.9fr)] gap-5">
            <article
              className={cn(
                "group relative isolate flex min-h-[520px] flex-col justify-end overflow-hidden rounded-card border border-charcoal-foreground/10 bg-charcoal",
                CARD_FOCUS,
              )}
            >
              <SmartImage
                src={featuredProduct.image}
                alt=""
                className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                preset="detail"
              />
              <div aria-hidden="true" className="photo-scrim absolute inset-0 -z-10" />
              <WishlistToggle
                name={featuredProduct.title}
                saved={isInWishlist(featuredProduct.id)}
                onToggle={() => toggleWishlist(featuredProduct.id, featuredProduct.title)}
                variant="onPhoto"
                className={cn(
                  "absolute right-4 top-4 z-raised",
                  !isInWishlist(featuredProduct.id) &&
                    "[@media(hover:hover)]:opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100",
                )}
              />
              <div className="p-8">
                <h3 title={featuredProduct.title} className="on-photo mb-3 line-clamp-2 text-3xl font-semibold [text-wrap:balance]" style={HEADING_FONT}>
                  {titleLink(featuredProduct)}
                </h3>
                <div className="mb-6">{priceRow(featuredProduct, "lg")}</div>
                <span
                  aria-hidden="true"
                  className="btn-line text-charcoal-foreground group-hover:bg-charcoal-foreground group-hover:text-charcoal"
                >
                  Explore
                </span>
              </div>
            </article>

            <div className="grid auto-rows-[1fr] gap-5">
              {upperProducts.map((product) => (
                <div key={`upper-${product.id}`} className="min-h-[248px]">
                  {renderDesktopCard(product, true)}
                </div>
              ))}
            </div>
          </div>

          {lowerProducts.length > 0 && (
            <div className={cn("grid gap-5", lowerProducts.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
              {lowerProducts.map((product) => (
                <div key={`lower-${product.id}`} className="min-h-[248px]">
                  {renderDesktopCard(product)}
                </div>
              ))}
            </div>
          )}
        </div>
      </Shell>
    </Reveal>
  );
};

export default FeaturedSection;
