import { useRef, useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";
import { ChevronLeft, ChevronRight, Package, ShoppingCart, Heart } from "lucide-react";
import ProductQuickView from "./ProductQuickView";

import { UIProduct, adaptFirebaseArrayToUI } from "@/lib/productAdapter";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/hooks/useWishlist";
import { useToast } from "@/hooks/use-toast";
import useAutoScroll from "@/hooks/useAutoScroll";
import { SmartImage } from "@/components/ui/smart-image";
import { subscribeToActiveProductsByFlag } from '@/services/productCache';

const TrendProducts = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [selectedProduct, setSelectedProduct] = useState<UIProduct | null>(null);
  const [isQuickViewOpen, setIsQuickViewOpen] = useState(false);
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
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

  const closeQuickView = () => {
    setIsQuickViewOpen(false);
    setSelectedProduct(null);
  };

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

  const displayProducts = products;
  const mobileBaseProducts = displayProducts.slice(1);
  const mobileTrackProducts =
    canMobileScroll && mobileBaseProducts.length > 1
      ? [...mobileBaseProducts, ...mobileBaseProducts]
      : mobileBaseProducts;
  const desktopTrackProducts =
    canDesktopNAScroll && products.length > 1 ? [...products, ...products] : products;

  return (
    <section ref={ref} className="py-4 md:py-12 bg-[linear-gradient(180deg,rgba(212,175,55,0.04)_0%,rgba(131,39,41,0.02)_100%)] dark:bg-[linear-gradient(180deg,rgba(19,17,15,0.98)_0%,rgba(14,14,15,0.98)_100%)]">
      <div className="container-custom">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-3 md:mb-8 hidden md:flex md:items-end md:justify-between"
        >
          <div>
            <h2 className="text-2xl md:text-3xl font-semibold text-foreground font-serif">
              New Arrivals
            </h2>
            <p className="text-sm text-muted-foreground mt-1 font-light">Fresh designs crafted just for you</p>
          </div>
          <button onClick={() => navigate('/products?tag=new-arrivals')} className="text-sm text-primary font-medium hover:underline underline-offset-4 flex items-center gap-1">
            View All <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>
        {/* Mobile header without animation */}
        <div className="mb-3 md:mb-6 md:hidden px-1">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="h-px w-6 bg-primary/50" />
            <span className="text-[10px] font-medium uppercase tracking-[0.32em] text-primary/80">New Arrivals</span>
          </div>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground font-serif">
              Freshly dropped
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Scroll new arrivals left"
                onClick={() => mobileScrollByPage('prev')}
                disabled={!canMobileScroll}
                className="w-8 h-8 rounded-full border border-border/70 bg-background/90 dark:bg-zinc-900/80 flex items-center justify-center active:scale-95 transition-transform disabled:cursor-default disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Scroll new arrivals right"
                onClick={() => mobileScrollByPage('next')}
                disabled={!canMobileScroll}
                className="w-8 h-8 rounded-full border border-border/70 bg-background/90 dark:bg-zinc-900/80 flex items-center justify-center active:scale-95 transition-transform disabled:cursor-default disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => navigate('/products?tag=new-arrivals')} className="text-xs text-primary font-medium ml-1">
                View All
              </button>
            </div>
          </div>
        </div>

        {/* Products Container */}
        <div className="relative">
          {/* Mobile premium layout: featured hero + horizontal snap row */}
          <div className="md:hidden pb-2">
            {loading ? (
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={`skeleton-${index}`} className="flex-shrink-0 w-[150px]">
                    <div className="animate-pulse">
                      <div className="bg-gray-200 dark:bg-zinc-800 dark:bg-muted rounded-2xl aspect-square mb-2"></div>
                      <div className="h-3 bg-gray-200 dark:bg-zinc-800 dark:bg-muted rounded mb-1"></div>
                      <div className="h-3 bg-gray-200 dark:bg-zinc-800 dark:bg-muted rounded w-2/3"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="w-full py-12 text-center">
                <Package className="w-12 h-12 mx-auto mb-3 text-primary/40" />
                <p className="text-base font-medium text-foreground/70 mb-1">New Arrivals Coming Soon</p>
                <p className="text-sm text-muted-foreground">Fresh designs are on their way. Stay tuned!</p>
              </div>
            ) : (
              <>
                {/* Featured wide hero card */}
                {displayProducts[0] && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    onClick={() => navigate(`/product/${displayProducts[0].id}`)}
                    className="relative mb-3 cursor-pointer overflow-hidden rounded-[26px] aspect-[16/10] shadow-[0_20px_44px_-26px_rgba(0,0,0,0.5)]"
                  >
                    <SmartImage
                      src={displayProducts[0].image}
                      alt={displayProducts[0].title}
                      className="absolute inset-0 w-full h-full object-cover" preset="detail" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
                    <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/25 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-white">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
                      Just In
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleWishlistClick(e, displayProducts[0].id, displayProducts[0].title); }}
                      className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center"
                    >
                      <Heart className={`w-4 h-4 ${isInWishlist(displayProducts[0].id) ? 'fill-red-500 text-red-500' : 'text-white'}`} />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="text-white text-lg font-semibold leading-tight mb-1.5 line-clamp-1" style={{ fontFamily: "'Playfair Display', serif" }}>
                        {displayProducts[0].title}
                      </h3>
                      <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-2">
                          <span className="text-white text-base font-bold">₹{displayProducts[0].price.toLocaleString()}</span>
                          {displayProducts[0].oldPrice && displayProducts[0].oldPrice > displayProducts[0].price && (
                            <span className="text-white/60 text-xs line-through">₹{displayProducts[0].oldPrice.toLocaleString()}</span>
                          )}
                        </div>
                        <button
                          onClick={(e) => handleAddToCart(e, displayProducts[0])}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-zinc-900 text-black px-4 py-1.5 text-[11px] font-semibold tracking-wide shadow-lg active:scale-95 transition-transform"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          Add
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Horizontal snap row of remaining */}
                <div
                  ref={scrollRef}
                  className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4"
                  style={{ WebkitOverflowScrolling: 'touch', scrollPaddingLeft: '16px' }}
                >
                  {mobileTrackProducts.map((product, index) => (
                    <div
                      key={`${product.id}-${index}`}
                      className="w-[148px] flex-shrink-0 cursor-pointer"
                      onClick={() => navigate(`/product/${product.id}`)}
                    >
                      <div className="flex h-full flex-col overflow-hidden rounded-[20px] border border-border/70 bg-card shadow-[0_12px_28px_-22px_rgba(114,77,31,0.4)] dark:border-[#d4af37]/15 dark:shadow-[0_14px_28px_-20px_rgba(0,0,0,0.7)]">
                        <div className="aspect-square overflow-hidden bg-secondary/50 dark:bg-muted relative">
                          <SmartImage
                            src={product.image}
                            alt={product.title}
                            className="w-full h-full object-cover" preset="card" />
                          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.18em] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/70">
                            New
                          </span>
                          <button
                            onClick={(e) => handleWishlistClick(e, product.id, product.title)}
                            className="absolute top-1.5 right-1.5 p-1.5 bg-background/90 dark:bg-card/90 backdrop-blur-sm rounded-full shadow-sm"
                            aria-label="Add to wishlist"
                          >
                            <Heart className={`w-3 h-3 ${isInWishlist(product.id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                          </button>
                        </div>
                        <div className="p-2.5 flex flex-col flex-grow">
                          <h3 className="text-[11px] font-medium text-foreground line-clamp-1 mb-1">
                            {product.title}
                          </h3>
                          <div className="mt-auto flex items-end justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-1">
                                <p className="text-sm font-bold text-foreground">₹{product.price.toLocaleString()}</p>
                                {product.oldPrice && product.oldPrice > product.price && (
                                  <p className="text-[9px] text-muted-foreground line-through">₹{product.oldPrice.toLocaleString()}</p>
                                )}
                              </div>
                              {product.discount && product.discount > 0 && (
                                <p className="text-[9px] font-semibold text-[#b88a2a] dark:text-[#f4cf73]">{product.discount}% Off</p>
                              )}
                            </div>
                            <button
                              onClick={(e) => handleAddToCart(e, product)}
                              className="w-7 h-7 rounded-full bg-muted hover:bg-primary flex items-center justify-center transition-colors group/cart"
                              aria-label="Add to cart"
                            >
                              <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground group-hover/cart:text-white" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="relative hidden md:block">
            {loading ? (
              <div className="grid grid-cols-4 gap-4 pb-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={`desktop-skeleton-${index}`} className="animate-pulse rounded-[26px] border border-border bg-card p-3">
                    <div className="mb-3 aspect-square rounded-2xl bg-gray-200 dark:bg-zinc-800 dark:bg-muted" />
                    <div className="mb-2 h-4 rounded bg-gray-200 dark:bg-zinc-800 dark:bg-muted" />
                    <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-zinc-800 dark:bg-muted" />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="w-full py-12 text-center">
                <Package className="mx-auto mb-3 h-12 w-12 text-primary/40" />
                <p className="mb-1 text-base font-medium text-foreground/70">New Arrivals Coming Soon</p>
                <p className="text-sm text-muted-foreground">Fresh designs are on their way. Stay tuned!</p>
              </div>
            ) : (
              <div className="group/new-arrivals relative overflow-hidden rounded-[28px] border border-border/60 bg-background/70 py-2 dark:border-[#d4af37]/12 dark:bg-white/[0.03]">
                <div
                  ref={desktopNARef}
                  className="overflow-x-auto scrollbar-hide px-2 py-2"
                >
                  <div className={`flex gap-4 px-2 ${canDesktopNAScroll ? 'w-max' : 'justify-center'}`}>
                    {desktopTrackProducts.map((product, index) => (
                      <div
                        key={`desktop-${product.id}-${index}`}
                        className="w-[230px] flex-shrink-0 cursor-pointer"
                        onClick={() => navigate(`/product/${product.id}`)}
                      >
                        <div className="group flex h-full flex-col overflow-hidden rounded-[26px] border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-xl">
                          <div className="relative aspect-square overflow-hidden bg-secondary/50 dark:bg-muted">
                            <SmartImage
                              src={product.image}
                              alt={product.title}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" preset="card" />
                            <button
                              onClick={(e) => handleWishlistClick(e, product.id, product.title)}
                              className="absolute right-2.5 top-2.5 rounded-full bg-background/95 p-2 shadow-sm backdrop-blur-sm transition-all duration-200 hover:shadow-md dark:bg-card/95"
                              aria-label="Add to wishlist"
                            >
                              <Heart
                                className={`h-4 w-4 ${
                                  isInWishlist(product.id)
                                    ? 'fill-red-500 text-red-500'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            </button>
                          </div>

                          <div className="flex flex-grow flex-col p-4">
                            <div className="mb-2 flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-amber-800 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                                New
                              </span>
                              {product.discount && product.discount > 0 && (
                                <span className="inline-flex rounded-full border border-[#d4af37]/30 bg-[#d4af37]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#b88a2a] dark:border-[#f4cf73]/30 dark:bg-[#f4cf73]/10 dark:text-[#f4cf73]">
                                  {product.discount}% Off
                                </span>
                              )}
                            </div>
                            <h3 className="mb-2 line-clamp-1 text-sm font-medium text-foreground">{product.title}</h3>
                            <div className="mt-auto flex items-end justify-between">
                              <div>
                                <p className="text-lg font-bold text-foreground">₹{product.price.toLocaleString()}</p>
                                {product.oldPrice && product.oldPrice > product.price && (
                                  <p className="text-xs text-muted-foreground line-through">₹{product.oldPrice.toLocaleString()}</p>
                                )}
                              </div>
                              <button
                                onClick={(e) => handleAddToCart(e, product)}
                                className="group/cart flex h-9 w-9 items-center justify-center rounded-full bg-muted transition-colors duration-200 hover:bg-primary"
                                aria-label="Add to cart"
                              >
                                <ShoppingCart className="h-[18px] w-[18px] text-muted-foreground group-hover/cart:text-white" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    desktopNAScrollByPage("prev");
                  }}
                  disabled={!canDesktopNAScroll}
                  className={`absolute left-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/92 text-foreground shadow-lg backdrop-blur transition-all duration-200 hover:scale-105 dark:border-white/10 dark:bg-zinc-900/90 ${canDesktopNAScroll ? 'pointer-events-none opacity-0 group-hover/new-arrivals:pointer-events-auto group-hover/new-arrivals:opacity-100' : 'pointer-events-none opacity-0'}`}
                  aria-label="Show previous new arrivals"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    desktopNAScrollByPage("next");
                  }}
                  disabled={!canDesktopNAScroll}
                  className={`absolute right-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/92 text-foreground shadow-lg backdrop-blur transition-all duration-200 hover:scale-105 dark:border-white/10 dark:bg-zinc-900/90 ${canDesktopNAScroll ? 'pointer-events-none opacity-0 group-hover/new-arrivals:pointer-events-auto group-hover/new-arrivals:opacity-100' : 'pointer-events-none opacity-0'}`}
                  aria-label="Show next new arrivals"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Quick View Modal */}
      <ProductQuickView
        product={selectedProduct}
        isOpen={isQuickViewOpen}
        onClose={closeQuickView}
      />

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
};

export default TrendProducts;
