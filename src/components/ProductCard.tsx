import { motion } from "framer-motion";
import { Star, Heart, Eye, ShoppingBag, Plus, Minus } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { useWishlist } from "@/hooks/useWishlist";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSilverRate, computeSilverOriginalPrice } from "@/contexts/SilverRateContext";
import { SmartImage } from "@/components/ui/smart-image";

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
}

const ProductCard = ({ product, index = 0, onQuickView }: ProductCardProps) => {
  const { addToCart, items, updateQuantity, removeFromCart } = useCart();
  const { toast } = useToast();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { ratePerGram } = useSilverRate();

  const cartItem = items.find((i) => i.id === product.id);
  const inCartQty = cartItem?.quantity ?? 0;

  // Silver-enabled: price IS the live computed value, no MRP/discount concept
  const sp = product.silverPricing;
  const displayPrice = sp?.enabled && ratePerGram > 0
    ? computeSilverOriginalPrice(sp, ratePerGram)
    : product.price;
  const displayDiscount = !sp?.enabled && (product.discount ?? 0) > 0 ? (product.discount ?? 0) : null;
  const displayOldPrice = !sp?.enabled && displayDiscount
    ? (product.oldPrice ?? null)
    : null;

  const handleCardClick = () => {
    // Navigate to product detail page
    navigate(`/product/${product.id}`);
  };

  const handleQuickViewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onQuickView?.(product);
  };

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleWishlist(product.id, product.title);
  };

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.stopPropagation();

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
        description: `${product.title} has been added to your cart.`,
      });
    } catch (error) {
      console.error('Error adding to cart:', error);
      toast({
        title: "Error",
        description: "Failed to add item to cart. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="product-card group cursor-pointer border border-border rounded-xl p-2 lg:p-0 lg:border-0"
      onClick={handleCardClick}
    >
      {/* Image Container */}
      <div className="product-card-image relative bg-muted rounded-xl lg:rounded-2xl overflow-hidden aspect-square mb-2 lg:mb-3">
        <SmartImage
          src={product.image}
          alt={product.alt || product.title}
          className="w-full h-full object-cover"
          preset="card"
          priority={index < 4}
        />

        {/* Wishlist Heart - Top Right */}
        <button
          onClick={handleWishlistClick}
          className="absolute top-1.5 right-1.5 lg:top-2 lg:right-2 p-1.5 lg:p-2 bg-background/90 dark:bg-card/90 backdrop-blur-sm rounded-full shadow-md hover:bg-background transition-all"
          aria-label={isInWishlist(product.id) ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart 
            className={`w-4 h-4 lg:w-5 lg:h-5 transition-colors ${
              isInWishlist(product.id) 
                ? "text-red-500 fill-red-500" 
                : "text-foreground/70 hover:text-red-500"
            }`}
          />
        </button>
      </div>

      {/* Product Info */}
      <div className="space-y-0.5 lg:space-y-1.5">
        {/* Category */}
        <span className="text-[10px] lg:text-xs uppercase tracking-wider font-medium" style={{ color: '#D4AF37' }}>
          {product.category}
        </span>

        {/* Title - Single Line with Ellipsis */}
        <h4 className="font-medium text-xs lg:text-base leading-snug text-foreground truncate" style={{ fontFamily: "'Poppins', sans-serif" }}>
          {product.title}
        </h4>

        {/* Rating with review count */}
        <div className="flex items-center gap-1">
          {(product.reviews ?? 0) > 0 && (
            <span className="text-[10px] lg:text-xs font-semibold text-amber-500">{product.rating.toFixed(1)}</span>
          )}
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              className={`w-3 h-3 lg:w-3.5 lg:h-3.5 ${
                i < Math.floor(product.rating)
                  ? "fill-yellow-400 text-yellow-400"
                  : i < product.rating
                  ? "fill-yellow-200 text-yellow-400"
                  : "fill-gray-200 text-gray-400"
              }`}
            />
          ))}
          {(product.reviews ?? 0) > 0 && (
            <span className="text-[10px] lg:text-xs text-muted-foreground ml-0.5">({product.reviews})</span>
          )}
        </div>

        {/* Price */}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 lg:gap-2 pt-0.5 lg:pt-1">
          <span className="text-sm lg:text-xl font-bold text-foreground">₹{displayPrice.toLocaleString('en-IN')}</span>
          {displayOldPrice && displayOldPrice > displayPrice && (
            <span className="text-[10px] lg:text-sm text-muted-foreground line-through">
              ₹{displayOldPrice.toLocaleString('en-IN')}
            </span>
          )}
          {displayDiscount && (
            <span className="basis-full lg:basis-auto text-[10px] lg:text-xs font-semibold text-[#b88a2a] dark:text-[#f4cf73]">{displayDiscount}% Off</span>
          )}
        </div>

        {/* Add to Cart / Qty Stepper */}
        {inCartQty > 0 ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full mt-1 lg:mt-2 py-1.5 lg:py-2 px-2 bg-foreground/5 border border-border rounded-full flex items-center justify-between"
          >
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={(e) => {
                e.stopPropagation();
                if (inCartQty <= 1 && cartItem) removeFromCart(cartItem.id);
                else if (cartItem) updateQuantity(cartItem.id, inCartQty - 1);
              }}
              className="w-7 h-7 rounded-full bg-background border border-border flex items-center justify-center hover:bg-muted"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-xs lg:text-sm font-semibold">{inCartQty} in cart</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={(e) => {
                e.stopPropagation();
                if (cartItem) updateQuantity(cartItem.id, inCartQty + 1);
              }}
              className="w-7 h-7 rounded-full bg-background border border-border flex items-center justify-center hover:bg-muted"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleAddToCart}
            className="w-full mt-1 lg:mt-2 py-1.5 lg:py-2.5 px-3 lg:px-4 bg-foreground/5 text-foreground text-[11px] lg:text-sm font-medium rounded-full hover:bg-foreground/10 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-1.5 lg:gap-2 border border-border"
          >
            <ShoppingBag className="w-3 h-3 lg:w-4 lg:h-4" />
            Add to Cart
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default ProductCard;
