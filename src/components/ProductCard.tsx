import { motion } from "framer-motion";
import { Star, ShoppingBag, ShoppingCart, Plus, Minus } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { useWishlist } from "@/hooks/useWishlist";
import { useAuth } from "@/contexts/AuthContext";
import { useSilverRate, computeSilverOriginalPrice } from "@/contexts/SilverRateContext";
import { SmartImage } from "@/components/ui/smart-image";
import { IconButton } from "@/components/ui/icon-button";
import { WishlistToggle } from "@/components/WishlistToggle";
import { formatINR } from "@/lib/format";
import { EASE_OUT, staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface Product {
  id: string;
  title: string;
  category: string;
  price: number;
  stock?: number;
  oldPrice?: number | null;
  rating: number;
  reviews: number;
  image: string;
  alt?: string;
  badge?: string;
  discount?: number;
  silverPricing?: {
    enabled: boolean;
    weightGrams: number;
    wastagePercent: number;
    makingCharges: number;
  };
}

interface ProductCardProps {
  product: Product;
  index?: number;
  onQuickView?: (product: Product) => void;
  /**
   * 'grid' (default): listing card with category, stars and a full-width
   * Add to cart / quantity stepper. 'row': the 230px home-row card with a
   * round cart button beside the price and no category label.
   */
  size?: "grid" | "row";
  /**
   * Show the five-star row even when a product has no reviews yet. On by
   * default (owner decision: keep the empty stars); set false to hide them
   * until a product has reviews.
   */
  showEmptyRating?: boolean;
  className?: string;
}

/**
 * The shared product card. The title is a real link stretched over the whole
 * card (keyboard, screen readers, open-in-new-tab, crawlers); the heart, cart
 * and stepper sit above it. Hover lift is pointer-only (.card-product).
 */
const ProductCard = ({ product, index = 0, size = "grid", showEmptyRating = true, className }: ProductCardProps) => {
  const { addToCart, items, updateQuantity, removeFromCart } = useCart();
  const { toast } = useToast();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { ratePerGram } = useSilverRate();

  const isRow = size === "row";
  const href = `/product/${product.id}`;
  const cartItem = items.find((i) => i.id === product.id);
  const inCartQty = cartItem?.quantity ?? 0;

  // Silver-enabled: price IS the live computed value, no MRP/discount concept
  const sp = product.silverPricing;
  const displayPrice = sp?.enabled && ratePerGram > 0
    ? computeSilverOriginalPrice(sp, ratePerGram)
    : product.price;
  const displayDiscount = !sp?.enabled && (product.discount ?? 0) > 0 ? (product.discount ?? 0) : null;
  const displayOldPrice = !sp?.enabled && (product.oldPrice ?? 0) > displayPrice ? (product.oldPrice as number) : null;

  const reviews = product.reviews ?? 0;
  const showRating = !isRow && (reviews > 0 || showEmptyRating);

  const handleAddToCart = () => {
    if (!user) {
      navigate('/login', { state: { from: location } });
      return;
    }

    try {
      const added = addToCart({
        id: product.id,
        name: product.title,
        price: product.price,
        originalPrice: product.oldPrice ?? undefined,
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

  const decrease = () => {
    if (!cartItem) return;
    if (inCartQty <= 1) removeFromCart(cartItem.id);
    else updateQuantity(cartItem.id, inCartQty - 1);
  };
  const increase = () => {
    if (cartItem) updateQuantity(cartItem.id, inCartQty + 1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: EASE_OUT, delay: staggerDelay(index) }}
      className={cn("h-full", isRow && "w-[230px] flex-none", className)}
    >
      <article
        className={cn(
          "card-product group relative flex h-full flex-col p-1.5 lg:p-2",
          "has-[a[data-card-link]:focus-visible]:outline has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-ring",
        )}
      >
        {/* Image */}
        <div className="tile-img relative mb-2.5 aspect-square overflow-hidden lg:mb-3">
          <SmartImage
            src={product.image}
            alt={product.alt || product.title}
            className="h-full w-full object-cover transition-[transform,opacity] duration-reveal ease-out group-hover:scale-[1.03]"
            preset="card"
            priority={!isRow && index < 4}
          />
          <WishlistToggle
            name={product.title}
            saved={isInWishlist(product.id)}
            onToggle={() => toggleWishlist(product.id, product.title)}
            size="sm"
            className="absolute right-1.5 top-1.5 z-raised lg:right-2 lg:top-2"
          />
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col gap-1 px-1 pb-1 lg:gap-1.5">
          {!isRow && (
            <span
              title={product.category}
              className="block truncate text-[10px] font-bold uppercase tracking-[0.16em] text-primary lg:tracking-[0.2em]"
            >
              {product.category}
            </span>
          )}

          <h3
            title={product.title}
            className="line-clamp-2 min-h-[2.6em] text-[13px] font-semibold leading-[1.3] text-foreground [text-wrap:pretty] md:text-sm md:leading-[1.3]"
            style={{ fontFamily: "var(--font-body)" }}
          >
            <Link
              to={href}
              data-card-link=""
              className="outline-none after:absolute after:inset-0 after:rounded-card after:content-['']"
            >
              {product.title}
            </Link>
          </h3>

          {showRating && (
            <div className="flex items-center gap-1">
              {reviews > 0 && (
                <span className="text-[11px] font-semibold tabular-nums text-highlight lg:text-xs">{product.rating.toFixed(1)}</span>
              )}
              <span className="sr-only">
                {reviews > 0 ? `Rated ${product.rating.toFixed(1)} out of 5 from ${reviews} reviews` : "No reviews yet"}
              </span>
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  aria-hidden="true"
                  className={`h-3 w-3 lg:h-3.5 lg:w-3.5 ${
                    i < Math.floor(product.rating)
                      ? "fill-highlight-soft text-highlight-soft"
                      : i < product.rating
                      ? "fill-charcoal-foreground text-highlight-soft"
                      : "fill-foreground/10 text-foreground/20"
                  }`}
                />
              ))}
              {reviews > 0 && (
                <span aria-hidden="true" className="ml-0.5 text-[11px] tabular-nums text-muted-foreground lg:text-xs">({reviews})</span>
              )}
            </div>
          )}
          {!isRow && !showRating && <div aria-hidden="true" className="h-4" />}

          {/* Price (+ round cart button on row cards) */}
          <div className={cn("flex gap-2", isRow ? "mt-auto items-end justify-between pt-1" : "items-center pb-2.5 pt-0.5 lg:pb-3 lg:pt-1")}>
            {isRow ? (
              /* Row cards sit side by side: price on one fixed line and the chip on its
                 own reserved line, so every price in a row shares one baseline. */
              <p className="flex min-w-0 flex-col gap-1">
                <span className="flex min-w-0 items-baseline gap-x-1.5 whitespace-nowrap">
                  <span className="price-now text-[15px] lg:text-lg">{formatINR(displayPrice)}</span>
                  {displayOldPrice && (
                    <span className="price-was text-xs lg:text-sm">
                      <span className="sr-only">Was </span>
                      {formatINR(displayOldPrice)}
                    </span>
                  )}
                </span>
                <span className="flex h-[18px] items-center">
                  {displayDiscount && <span className="chip-off">{displayDiscount}% off</span>}
                </span>
              </p>
            ) : (
              <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
                <span className="price-now text-[15px] lg:text-lg">{formatINR(displayPrice)}</span>
                {displayOldPrice && (
                  <span className="price-was text-xs lg:text-sm">
                    <span className="sr-only">Was </span>
                    {formatINR(displayOldPrice)}
                  </span>
                )}
                {displayDiscount && <span className="chip-off">{displayDiscount}% off</span>}
              </p>
            )}
            {isRow && (
              <IconButton
                label={`Add ${product.title} to cart`}
                variant="solid"
                className="relative z-raised hover:border-primary hover:bg-primary hover:text-primary-foreground"
                onClick={handleAddToCart}
              >
                <ShoppingCart aria-hidden="true" />
              </IconButton>
            )}
          </div>

          {/* Grid: Add to cart / quantity stepper */}
          {!isRow && (
            inCartQty > 0 ? (
              <div className="relative z-raised mt-auto flex h-10 items-center justify-between overflow-hidden rounded-control border border-primary/40">
                <button
                  type="button"
                  aria-label={`Decrease quantity of ${product.title}`}
                  onClick={decrease}
                  className="focus-inset grid size-10 place-items-center text-foreground transition-[background-color,color,transform] duration-press ease-out hover:bg-muted hover:text-primary active:scale-[0.97]"
                >
                  <Minus aria-hidden="true" className="size-4" />
                </button>
                <span aria-live="polite" className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary tabular-nums lg:text-[11px]">
                  {inCartQty} in cart
                </span>
                <button
                  type="button"
                  aria-label={`Increase quantity of ${product.title}`}
                  onClick={increase}
                  className="focus-inset grid size-10 place-items-center text-foreground transition-[background-color,color,transform] duration-press ease-out hover:bg-muted hover:text-primary active:scale-[0.97]"
                >
                  <Plus aria-hidden="true" className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAddToCart}
                className="relative z-raised mt-auto flex h-10 w-full items-center justify-center gap-1.5 rounded-control border border-foreground/15 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground transition-[background-color,border-color,color,transform] duration-press ease-out hover:border-primary hover:bg-primary hover:text-primary-foreground active:scale-[0.97] lg:gap-2 lg:text-[11px]"
              >
                <ShoppingBag aria-hidden="true" className="size-4" />
                Add to cart
                <span className="sr-only">: {product.title}</span>
              </button>
            )
          )}
        </div>
      </article>
    </motion.div>
  );
};

export default ProductCard;
