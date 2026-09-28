import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronRight, ChevronLeft, Heart, ShoppingCart } from "lucide-react";

import { UIProduct, adaptFirebaseArrayToUI } from "@/lib/productAdapter";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/hooks/useWishlist";
import { useToast } from "@/hooks/use-toast";
import useAutoScroll from "@/hooks/useAutoScroll";
import { SmartImage } from "@/components/ui/smart-image";
import { subscribeToActiveProductsByFlag } from '@/services/productCache';

const TopDeals = () => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { toast } = useToast();
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const {
    scrollerRef: mobileScrollRef,
    scrollByPage: mobileScrollByPage,
    canScroll: canMobileDealsScroll,
  } = useAutoScroll({ speed: 0.5, resumeDelay: 2400, loop: true, direction: 1, loopItemCount: products.length });

  const mobileDealProducts =
    canMobileDealsScroll && products.length > 1 ? [...products, ...products] : products;

  // Desktop: featured product on left, rest on right with pagination.
  // Keep these derived values before early returns so the hook setup below is
  // always executed in the same order while data loads and after products arrive.
  const featuredProduct = products[0];
  const restProducts = products.slice(1);
  const desktopProducts = restProducts.length > 0 ? restProducts : products;
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const canDesktopDealsScroll = desktopProducts.length > 3;

  const scrollDesktopByPage = (dir: 'prev' | 'next') => {
    const node = desktopScrollRef.current;
    if (!node) return;
    const delta = Math.max(260, node.clientWidth * 0.82) * (dir === 'next' ? 1 : -1);
    node.scrollBy({ left: delta, behavior: 'smooth' });
  };

  // Desktop auto-loop: rotate the right-hand product page automatically so the
  // section feels alive (matching the smooth mobile auto-scroll). Pauses while
  // the user hovers the desktop card grid and pauses after manual prev/next.
  const desktopHoverRef = useRef(false);
  const manualPauseUntilRef = useRef(0);
  const ROTATE_INTERVAL_MS = 4500;
  const RESUME_DELAY_MS = 6000;

  useEffect(() => {
    if (!canDesktopDealsScroll) return;
    const interval = window.setInterval(() => {
      if (desktopHoverRef.current) return;
      if (Date.now() < manualPauseUntilRef.current) return;
      const node = desktopScrollRef.current;
      if (!node) return;
      const maxLeft = node.scrollWidth - node.clientWidth;
      if (node.scrollLeft >= maxLeft - 8) {
        node.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        scrollDesktopByPage('next');
      }
    }, ROTATE_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [canDesktopDealsScroll]);

  const handleManualPage = (dir: 'prev' | 'next') => {
    manualPauseUntilRef.current = Date.now() + RESUME_DELAY_MS;
    scrollDesktopByPage(dir);
  };

  useEffect(() => {
    const unsubscribe = subscribeToActiveProductsByFlag('isTopDeal', (fbProducts) => {
      const uiProducts = adaptFirebaseArrayToUI(fbProducts);
      setProducts(uiProducts);
      setLoading(false);
    }, 10);

    return () => unsubscribe();
  }, []);

  const handleAddToCart = async (e: React.MouseEvent, product: UIProduct) => {
    e.stopPropagation();
    
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

  const handleWishlistClick = (e: React.MouseEvent, productId: string, productTitle: string) => {
    e.stopPropagation();
    toggleWishlist(productId, productTitle);
  };

  if (loading) {
    return null;
  }

  if (products.length === 0) return null;

  return (
    <section className="py-6 md:py-14">
      <div className="container-custom">
        <div className="panel tx-sheet tx-contour overflow-hidden px-3 py-5 md:px-8 md:py-10">

        {/* ====== MOBILE: Horizontal scroll cards ====== */}
        <div className="md:hidden">
          <div className="mb-4 px-1">
            <p className="eyebrow-no mb-2"><b>01</b><span>Top Deals</span></p>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
                Signature savings
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Scroll deals left"
                  onClick={() => mobileScrollByPage('prev')}
                  disabled={!canMobileDealsScroll}
                  className="btn-round !h-8 !w-8"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Scroll deals right"
                  onClick={() => mobileScrollByPage('next')}
                  disabled={!canMobileDealsScroll}
                  className="btn-round !h-8 !w-8"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => navigate('/products?tag=top-deals')}
                  className="link-arrow ml-1"
                >
                  View All
                </button>
              </div>
            </div>
          </div>
          <div ref={mobileScrollRef} className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 px-1" style={{ WebkitOverflowScrolling: 'touch', scrollPaddingLeft: '8px' }}>
            {mobileDealProducts.map((product, index) => (
              <motion.div
                key={`${product.id}-${index}`}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(index, 4) * 0.06 }}
                className="flex-shrink-0 w-[150px] cursor-pointer"
                onClick={() => navigate(`/product/${product.id}`)}
              >
                <div className="card-product overflow-hidden p-1.5">
                  <div className="tile-img aspect-square overflow-hidden relative">
                    <SmartImage src={product.image} alt={product.title} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" preset="card" />
                    <button
                      onClick={(e) => handleWishlistClick(e, product.id, product.title)}
                      className="absolute top-2 right-2 p-1.5 bg-background/95 dark:bg-card/95 rounded-full shadow-sm"
                    >
                      <Heart className={`w-3.5 h-3.5 ${isInWishlist(product.id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                    </button>
                  </div>
                  <div className="p-2.5">
                    <p className="text-[11px] font-medium text-foreground/80 line-clamp-1 mb-1">{product.title}</p>
                    <div className="flex items-end justify-between gap-1">
                      <div className="flex flex-col min-w-0">
                        <p className="price-now text-sm leading-tight">₹{product.price.toLocaleString()}</p>
                        {product.oldPrice && product.oldPrice > product.price && (
                          <p className="price-was text-[10px] leading-tight">₹{product.oldPrice.toLocaleString()}</p>
                        )}
                        {product.discount && product.discount > 0 && (
                          <p className="chip-off mt-1 w-fit">{product.discount}% off</p>
                        )}
                      </div>
                      <button
                        onClick={(e) => handleAddToCart(e, product)}
                        className="w-8 h-8 rounded-full border border-foreground/15 hover:bg-primary hover:border-primary flex items-center justify-center transition-colors group/cart flex-shrink-0"
                      >
                        <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground group-hover/cart:text-white transition-colors" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* ====== DESKTOP: Split layout (featured banner + product cards) ====== */}
        <div className="hidden md:block">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="eyebrow-no mb-3"><b>01</b><span>Top Deals</span></p>
              <h2 className="text-3xl lg:text-4xl font-semibold text-foreground" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
                Handpicked savings
              </h2>
              <p className="text-sm text-muted-foreground mt-1 font-light">Handpicked deals on our best rituals</p>
            </div>
            <button 
              onClick={() => navigate('/products?tag=top-deals')}
              className="link-arrow"
            >
              View All <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex gap-5" style={{ minHeight: 420 }}>
            {/* Left: Featured Product Banner */}
            <div 
              className="w-[38%] relative rounded-[var(--radius-card)] overflow-hidden cursor-pointer group"
              onClick={() => navigate(`/product/${featuredProduct.id}`)}
            >
              <SmartImage 
                src={featuredProduct.image} 
                alt={featuredProduct.title}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" preset="detail" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
              <div className="relative z-10 h-full flex flex-col justify-end p-8">
                <span className="eyebrow-no mb-3 text-white/70 [&_b]:text-highlight-soft"><b>★</b>Deal of the week</span>
                <h2 className="text-2xl font-semibold text-white mb-1" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
                  {featuredProduct.title}
                </h2>
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-xl font-bold text-white">₹{featuredProduct.price.toLocaleString()}</span>
                  {featuredProduct.oldPrice && featuredProduct.oldPrice > featuredProduct.price && (
                    <span className="text-sm text-white/50 line-through">₹{featuredProduct.oldPrice.toLocaleString()}</span>
                  )}
                </div>
                <button 
                  className="btn-line w-fit text-white hover:bg-white hover:text-charcoal"
                  onClick={(e) => { e.stopPropagation(); navigate(`/product/${featuredProduct.id}`); }}
                >
                  Shop Now
                </button>
              </div>
            </div>

            {/* Right: Product Cards Grid */}
            <div
              className="w-[62%] rounded-[var(--radius-card)] border border-foreground/[0.06] bg-background/40 p-6 flex flex-col justify-between"
              onMouseEnter={() => { desktopHoverRef.current = true; }}
              onMouseLeave={() => { desktopHoverRef.current = false; }}
            >
              <div
                ref={desktopScrollRef}
                /*
                  No `scroll-smooth` and no mandatory snap here.

                  `scroll-behavior: smooth` animates EVERY scroll, including the
                  user's own wheel and trackpad, which is what made this row
                  feel heavy and laggy to drag - the arrows pass
                  `behavior: 'smooth'` themselves, so nothing is lost. Mandatory
                  snapping then pulled the row back to the nearest card after
                  each programmatic page, producing a visible tug. Proximity
                  snapping still tidies the resting position without fighting.
                */
                className="flex gap-4 overflow-x-auto scrollbar-hide snap-x snap-proximity pb-1"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                {desktopProducts.map((product) => (
                  <motion.div 
                    key={product.id}
                    initial={false}
                    className="card-product p-2.5 cursor-pointer flex flex-col group flex-none w-[190px] lg:w-[205px] snap-start"
                    onClick={() => navigate(`/product/${product.id}`)}
                  >
                    <div className="tile-img aspect-square overflow-hidden mb-3 relative">
                      <SmartImage src={product.image} alt={product.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" preset="card" />
                      <button
                        onClick={(e) => handleWishlistClick(e, product.id, product.title)}
                        className="absolute top-1.5 right-1.5 p-1 bg-background/95 dark:bg-card/95 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      >
                        <Heart className={`w-3.5 h-3.5 ${isInWishlist(product.id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                      </button>
                    </div>
                    <div className="mt-auto">
                      <p className="text-[12px] font-medium text-foreground/85 line-clamp-1 mb-1.5">{product.title}</p>
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex flex-col min-w-0 overflow-hidden">
                          <span className="price-now text-sm truncate">₹{product.price.toLocaleString()}</span>
                          {product.oldPrice && product.oldPrice > product.price && (
                            <span className="price-was text-[10px] truncate">₹{product.oldPrice.toLocaleString()}</span>
                          )}
                        </div>
                        <button
                          onClick={(e) => handleAddToCart(e, product)}
                          className="w-8 h-8 rounded-full border border-foreground/15 hover:bg-primary hover:border-primary flex items-center justify-center transition-colors group/cart flex-shrink-0 ml-1"
                        >
                          <ShoppingCart className="w-[16px] h-[16px] text-muted-foreground group-hover/cart:text-white transition-colors" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Bottom: Navigation arrows + Shop Now */}
              <div className="flex items-center justify-between mt-5 pt-3">
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleManualPage('prev')}
                    disabled={!canDesktopDealsScroll}
                    aria-label="Previous deals"
                    className="btn-round"
                  >
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button 
                    onClick={() => handleManualPage('next')}
                    disabled={!canDesktopDealsScroll}
                    aria-label="Next deals"
                    className="btn-round"
                  >
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <button 
                  onClick={() => navigate('/products?tag=top-deals')}
                  className="btn-copper"
                >
                  View Collection
                </button>
              </div>
            </div>
          </div>
        </div>

        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
};

export default TopDeals;
