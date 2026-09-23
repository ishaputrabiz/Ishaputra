import { useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Clock, Minus, Plus, Heart } from "lucide-react";
import silverSofa from "@/assets/silversofa.png";

const LuxurySofaSection = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [quantity, setQuantity] = useState(1);
  const [isWishlisted, setIsWishlisted] = useState(false);

  const incrementQuantity = () => setQuantity((prev) => prev + 1);
  const decrementQuantity = () => setQuantity((prev) => (prev > 1 ? prev - 1 : 1));

  // Track scroll progress through the entire container
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Sofa image animations - very slow, subtle movement
  const sofaY = useTransform(scrollYProgress, [0, 1], [0, -30]);
  const sofaScale = useTransform(scrollYProgress, [0, 1], [1, 0.96]);
  const sofaOpacity = useTransform(scrollYProgress, [0, 0.7, 1], [1, 1, 0]);

  // Details reveal animations - very slow fade in
  const detailsY = useTransform(scrollYProgress, [0.4, 1], [30, 0]);
  const detailsOpacity = useTransform(scrollYProgress, [0.4, 0.8], [0, 1]);

  // Individual element reveals with very slow stagger effect
  const titleY = useTransform(scrollYProgress, [0.45, 0.9], [20, 0]);
  const titleOpacity = useTransform(scrollYProgress, [0.45, 0.8], [0, 1]);

  const subtitleY = useTransform(scrollYProgress, [0.5, 0.95], [18, 0]);
  const subtitleOpacity = useTransform(scrollYProgress, [0.5, 0.85], [0, 1]);

  const featuresY = useTransform(scrollYProgress, [0.55, 1], [15, 0]);
  const featuresOpacity = useTransform(scrollYProgress, [0.55, 0.9], [0, 1]);

  const buttonY = useTransform(scrollYProgress, [0.6, 1], [12, 0]);
  const buttonOpacity = useTransform(scrollYProgress, [0.6, 0.95], [0, 1]);

  return (
    <section
      ref={containerRef}
      className="relative bg-gradient-to-b from-background via-cream to-cream h-[250vh] md:h-[400vh]"
    >
      {/* Sticky container that holds both layers */}
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* Subtle background texture */}
        <div className="absolute inset-0 opacity-[0.015]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 0.5px, transparent 0)`,
              backgroundSize: "32px 32px",
            }}
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            LAYER 2 (BEHIND): DETAILS - Initially hidden, reveals on scroll
        ═══════════════════════════════════════════════════════════════════ */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center z-10"
          style={{
            y: detailsY,
            opacity: detailsOpacity,
          }}
        >
          <div className="container-custom w-full">
            <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center" style={{ fontFamily: "'Poppins', sans-serif" }}>
              {/* Left: Product Image */}
              <motion.div
                className="relative max-w-md mx-auto lg:mx-0"
                style={{ y: titleY, opacity: titleOpacity }}
              >
                <div className="relative bg-secondary/50 dark:bg-muted rounded-lg overflow-hidden aspect-[4/3]">
                  <img
                    src={silverSofa}
                    alt="Royal Silver Sofa"
                    className="w-full h-full object-contain p-6"
                  />
                </div>
              </motion.div>

              {/* Right: Product Details */}
              <motion.div
                className="lg:pl-4 max-w-md"
                style={{ y: subtitleY, opacity: subtitleOpacity }}
              >
                {/* Product Title */}
                <h1 className="text-xl md:text-2xl font-semibold text-foreground mb-2" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  Royal Silver Sofa
                </h1>

                {/* Delivery Info */}
                <div className="flex items-center gap-2 text-muted-foreground mb-4">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-xs">Delivery from 3 weeks</span>
                </div>

                {/* Description Section */}
                <motion.div 
                  className="mb-5"
                  style={{ y: featuresY, opacity: featuresOpacity }}
                >
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground mb-2">
                    Description
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Taking cues from timeless artisan designs, our Royal Silver Sofa remains a signature favourite. 
                    Handcrafted with a tapered, solid wood frame allows for a comfortable deep sit with down and 
                    leather-wrapped cushions, while silver detail accents add a vintage touch. Place in any corner 
                    of the home alongside matching pieces to recreate our cosy reading nook.
                  </p>
                </motion.div>

                {/* Pricing */}
                <motion.div 
                  className="mb-4"
                  style={{ y: featuresY, opacity: featuresOpacity }}
                >
                  <div className="flex items-start gap-8">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Regular price</p>
                      <p className="text-lg md:text-xl font-semibold text-foreground" style={{ fontFamily: "'Poppins', sans-serif" }}>
                        ₹99,500
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">
                        Member (Save ₹20,900 per year)
                      </p>
                      <p className="text-lg md:text-xl font-semibold text-foreground" style={{ fontFamily: "'Poppins', sans-serif" }}>
                        ₹84,600
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Quantity Selector & Actions */}
                <motion.div style={{ y: buttonY, opacity: buttonOpacity }}>
                  {/* Quantity Selector */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center border border-border rounded-full overflow-hidden">
                      <button
                        onClick={decrementQuantity}
                        className="w-10 h-10 flex items-center justify-center hover:bg-muted transition-colors"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-10 text-center text-sm font-medium">{quantity}</span>
                      <button
                        onClick={incrementQuantity}
                        className="w-10 h-10 flex items-center justify-center hover:bg-muted transition-colors"
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Wishlist Button */}
                    <button
                      onClick={() => setIsWishlisted(!isWishlisted)}
                      className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all duration-300 ${
                        isWishlisted
                          ? "bg-red-50 border-red-200 text-red-500"
                          : "border-border hover:border-primary/50 text-muted-foreground hover:text-primary"
                      }`}
                      aria-label="Add to wishlist"
                    >
                      <Heart
                        className="w-4 h-4"
                        fill={isWishlisted ? "currentColor" : "none"}
                      />
                    </button>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <motion.button
                      className="flex-1 px-6 py-3 border border-foreground text-foreground font-medium text-xs uppercase tracking-wider rounded-full hover:bg-foreground hover:text-background transition-all duration-300"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Add to cart
                    </motion.button>
                    <motion.button
                      className="flex-1 px-6 py-3 bg-foreground text-background font-medium text-xs uppercase tracking-wider rounded-full hover:bg-foreground/90 transition-all duration-300"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Buy Now
                    </motion.button>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* ═══════════════════════════════════════════════════════════════════
            LAYER 1 (FRONT): SOFA IMAGE - Moves up and fades on scroll
            16:9 aspect ratio, full section width
        ═══════════════════════════════════════════════════════════════════ */}
        <motion.div
          className="absolute inset-0 z-20 pointer-events-none"
          style={{
            y: sofaY,
            scale: sofaScale,
            opacity: sofaOpacity,
          }}
        >
          {/* Full screen Container */}
          <div className="relative w-full h-full">
            {/* Soft ambient glow behind sofa */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-[90%] h-[70%] bg-primary/15 rounded-full blur-[150px]" />
            </div>

            {/* Premium shadow beneath sofa */}
            <div className="absolute bottom-[5%] left-1/2 -translate-x-1/2 w-[85%] h-12 bg-foreground/15 blur-3xl rounded-full" />

            {/* Sofa Image - Maximum size, edge to edge */}
            <img
              src={silverSofa}
              alt="Royal Silver Luxury Sofa"
              className="absolute inset-0 w-full h-full object-contain scale-125"
              style={{
                filter: "drop-shadow(0 50px 100px rgba(0,0,0,0.25))",
              }}
            />
          </div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2"
          style={{ opacity: useTransform(scrollYProgress, [0, 0.2], [1, 0]) }}
        >
          <span className="text-xs text-muted-foreground uppercase tracking-widest">Scroll to reveal</span>
          <motion.div
            className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex justify-center pt-2"
            animate={{ y: [0, 5, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
};

export default LuxurySofaSection;
