import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Heart, GitCompare, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
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
}

interface ProductQuickViewProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

const ProductQuickView = ({ product, isOpen, onClose }: ProductQuickViewProps) => {
  const [quantity, setQuantity] = useState(1);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const { addToCart } = useCart();
  const { toast } = useToast();

  const handleAddToCart = async () => {
    if (!product) return;
    setIsAdding(true);
    try {
      const added = addToCart({
        id: product.id,
        name: product.title,
        price: product.price,
        originalPrice: product.oldPrice ?? undefined,
        image: product.image,
        category: product.category,
        stock: product.stock,
      }, quantity);
      if (!added) return;
      toast({
        title: "Added to cart",
        description: `${product.title}${quantity > 1 ? ` (×${quantity})` : ''} has been added to your cart.`,
      });
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add item to cart. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  if (!product) return null;

  const incrementQuantity = () => setQuantity((prev) => prev + 1);
  const decrementQuantity = () => setQuantity((prev) => (prev > 1 ? prev - 1 : 1));

  // Generate a random SKU based on product id
  const sku = `sreerasthu-${product.category.toLowerCase().replace(/[^a-z]/g, '-')}-${product.id}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />

          {/* Modal Container - Centered */}
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="relative w-full max-w-4xl max-h-[90vh] bg-background rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 p-2 hover:bg-muted rounded-full transition-colors"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Content */}
              <div className="max-h-[90vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2">
                  {/* Product Image */}
                  <div className="relative bg-muted aspect-square">
                    <SmartImage
                      src={product.image}
                      alt={product.alt || product.title}
                      className="w-full h-full object-contain p-6 md:p-10" preset="card" />
                    {product.discount && (
                      <div className="absolute top-4 left-4 bg-destructive text-destructive-foreground text-xs font-bold px-3 py-1 rounded-full">
                        {product.discount}% OFF
                      </div>
                    )}
                    {product.badge && (
                      <div className="absolute top-4 left-4 bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                        {product.badge}
                      </div>
                    )}
                  </div>

                {/* Product Details */}
                <div className="p-6 md:p-8 flex flex-col" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  {/* Title */}
                  <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-2">
                    {product.title}
                  </h2>

                  {/* Rating */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center gap-0.5">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${
                            i < Math.floor(product.rating)
                              ? "fill-primary text-primary"
                              : "fill-muted text-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-sm text-muted-foreground">
                      ({product.reviews} reviews)
                    </span>
                  </div>

                  {/* Price */}
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl md:text-3xl font-bold text-foreground">
                      ₹{product.price.toLocaleString('en-IN')}
                    </span>
                    {product.oldPrice && (
                      <span className="text-lg text-muted-foreground line-through">
                        ₹{product.oldPrice.toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="border-t border-border my-4" />

                  {/* Description */}
                  <p className="text-sm text-muted-foreground leading-relaxed mb-6">
                    Exquisitely crafted with attention to detail. This stunning piece from our {product.category} collection showcases timeless elegance and superior craftsmanship.
                  </p>

                  {/* Quantity & Actions */}
                  <div className="flex flex-wrap items-center gap-3 mb-6">
                    {/* Quantity Selector */}
                    <div className="flex items-center border border-border rounded-full overflow-hidden">
                      <button
                        onClick={decrementQuantity}
                        className="w-10 h-10 flex items-center justify-center hover:bg-muted transition-colors"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-10 text-center text-sm font-medium">{quantity}</span>
                      <button
                        onClick={incrementQuantity}
                        className="w-10 h-10 flex items-center justify-center hover:bg-muted transition-colors"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Add to Cart Button */}
                    <button
                      onClick={handleAddToCart}
                      disabled={isAdding}
                      className="flex-1 min-w-[140px] px-6 py-3 bg-foreground text-background font-medium text-sm rounded-full hover:bg-foreground/90 active:scale-[0.97] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isAdding ? 'Adding...' : 'Add to cart'}
                    </button>
                  </div>

                  {/* Wishlist & Compare */}
                  <div className="flex items-center gap-6 mb-6">
                    <button
                      onClick={() => setIsWishlisted(!isWishlisted)}
                      className={`flex items-center gap-2 text-sm transition-colors ${
                        isWishlisted ? "text-red-500" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Heart
                        className="w-5 h-5"
                        fill={isWishlisted ? "currentColor" : "none"}
                      />
                      Add To Wishlist
                    </button>
                    <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                      <GitCompare className="w-5 h-5" />
                      Compare
                    </button>
                  </div>

                  {/* SKU & Category */}
                  <div className="mt-auto space-y-2 text-sm">
                    <p>
                      <span className="text-muted-foreground">SKU:</span>{" "}
                      <span className="text-foreground">{sku}</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Category:</span>{" "}
                      <span className="text-primary">{product.category}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ProductQuickView;
