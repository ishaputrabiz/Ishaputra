import { useState } from "react";
import { motion } from "framer-motion";
import { Clock, Minus, Plus, Heart } from "lucide-react";
import silverSofa from "@/assets/silversofa.png";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";

const ProductDetailSection = () => {
  const [quantity, setQuantity] = useState(1);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const { addToCart } = useCart();
  const { toast } = useToast();

  const handleAddToCart = async () => {
    try {
      const added = addToCart({
        id: 'royal-silver-sofa',
        name: 'Royal Silver Sofa',
        price: 99500,
        image: silverSofa,
        category: 'Chair Collection',
      }, quantity);
      if (!added) return;
      toast({
        title: "Added to cart",
        description: `Royal Silver Sofa${quantity > 1 ? ` (×${quantity})` : ''} has been added to your cart.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add item to cart.",
        variant: "destructive",
      });
    }
  };

  const incrementQuantity = () => setQuantity((prev) => prev + 1);
  const decrementQuantity = () => setQuantity((prev) => (prev > 1 ? prev - 1 : 1));

  return (
    <section className="py-12 md:py-20 bg-background">
      <div className="container-custom">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-start">
          {/* Left: Product Image */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="relative bg-[#f5ebe0] rounded-lg overflow-hidden aspect-square">
              {/* Subtle gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-primary/5" />
              
              {/* Product Image */}
              <img
                src={silverSofa}
                alt="Royal Silver Sofa"
                className="w-full h-full object-contain p-8"
              />
            </div>
          </motion.div>

          {/* Right: Product Details */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="lg:pl-4"
          >
            {/* Category Badge */}
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
              Chair Collection
            </p>

            {/* Product Title */}
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-heading font-medium text-foreground mb-4">
              Royal Silver Sofa
            </h1>

            {/* Delivery Info */}
            <div className="flex items-center gap-2 text-muted-foreground mb-6">
              <Clock className="w-4 h-4" />
              <span className="text-sm">Delivery from 3 weeks</span>
            </div>

            {/* Description Section */}
            <div className="mb-8">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground mb-3">
                Description
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Taking cues from timeless artisan designs, our Royal Silver Sofa remains a signature favourite. 
                Handcrafted with a tapered, solid wood frame allows for a comfortable deep sit with down and 
                leather-wrapped cushions, while silver detail accents add a vintage touch. Place in any corner 
                of the home alongside matching pieces to recreate our cosy reading nook.
              </p>
            </div>

            {/* Pricing */}
            <div className="mb-8">
              <div className="flex items-start gap-12">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Regular price</p>
                  <p className="text-2xl md:text-3xl font-heading font-medium text-foreground">
                    ₹99,500
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Member (Save ₹20,900 per year)
                  </p>
                  <p className="text-2xl md:text-3xl font-heading font-medium text-foreground">
                    ₹84,600
                  </p>
                </div>
              </div>
            </div>

            {/* Quantity Selector */}
            <div className="flex items-center gap-4 mb-8">
              <div className="flex items-center border border-border rounded-full overflow-hidden">
                <button
                  onClick={decrementQuantity}
                  className="w-12 h-12 flex items-center justify-center hover:bg-muted transition-colors"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center font-medium">{quantity}</span>
                <button
                  onClick={incrementQuantity}
                  className="w-12 h-12 flex items-center justify-center hover:bg-muted transition-colors"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Wishlist Button */}
              <button
                onClick={() => setIsWishlisted(!isWishlisted)}
                className={`w-12 h-12 rounded-full border flex items-center justify-center transition-all duration-300 ${
                  isWishlisted
                    ? "bg-red-50 border-red-200 text-red-500"
                    : "border-border hover:border-primary/50 text-muted-foreground hover:text-primary"
                }`}
                aria-label="Add to wishlist"
              >
                <Heart
                  className="w-5 h-5"
                  fill={isWishlisted ? "currentColor" : "none"}
                />
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <motion.button
                onClick={handleAddToCart}
                className="flex-1 px-8 py-4 border border-foreground text-foreground font-medium text-sm uppercase tracking-wider rounded-full hover:bg-foreground hover:text-background transition-all duration-300"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Add to cart
              </motion.button>
              <motion.button
                onClick={() => {
                  handleAddToCart();
                  // Navigate to checkout after adding
                }}
                className="flex-1 px-8 py-4 bg-foreground text-background font-medium text-sm uppercase tracking-wider rounded-full hover:bg-foreground/90 transition-all duration-300"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Buy Now
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default ProductDetailSection;
