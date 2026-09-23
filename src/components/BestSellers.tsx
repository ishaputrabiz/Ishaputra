import { useRef, useEffect, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Package, ShoppingCart, Heart, ChevronLeft, ChevronRight } from "lucide-react";

import { UIProduct, adaptFirebaseArrayToUI } from "@/lib/productAdapter";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/hooks/useWishlist";
import { useToast } from "@/hooks/use-toast";
import useAutoScroll from "@/hooks/useAutoScroll";
import { SmartImage } from "@/components/ui/smart-image";
import { subscribeToActiveProductsByFlag } from '@/services/productCache';

const BestSellers = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
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

  const mobileBaseProducts = products.slice(1);
  const mobileCarouselProducts =
    canMobileBSScroll && mobileBaseProducts.length > 1
      ? [...mobileBaseProducts, ...mobileBaseProducts]
      : mobileBaseProducts;
  const desktopCarouselProducts =
    canDesktopBSScroll && products.length > 1 ? [...products, ...products] : products;

  return (
    <section ref={ref} className="relative py-6 md:py-16">
      <div className="pointer-events-none absolute inset-x-0 top-10 h-32 bg-[radial-gradient(circle,rgba(212,175,55,0.18)_0%,rgba(212,175,55,0)_72%)] blur-3xl" />
      <div className="container-custom">
        <div className="relative overflow-hidden rounded-[34px] border border-[#ead9ba]/80 bg-[linear-gradient(180deg,rgba(255,252,247,0.96)_0%,rgba(255,247,236,0.95)_55%,rgba(255,255,255,0.98)_100%)] px-4 py-5 shadow-[0_30px_90px_-65px_rgba(114,77,31,0.45)] dark:border-[#d4af37]/20 dark:bg-[linear-gradient(180deg,rgba(20,16,10,0.96)_0%,rgba(28,20,16,0.96)_55%,rgba(13,12,11,0.98)_100%)] dark:shadow-[0_38px_110px_-70px_rgba(0,0,0,0.88)] md:px-7 md:py-8">
          <div className="pointer-events-none absolute -right-8 top-0 h-32 w-32 rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.28)_0%,rgba(212,175,55,0)_72%)] blur-2xl dark:bg-[radial-gradient(circle,rgba(212,175,55,0.18)_0%,rgba(212,175,55,0)_72%)]" />
          <div className="pointer-events-none absolute left-12 bottom-0 h-28 w-40 rounded-full bg-[radial-gradient(circle,rgba(131,39,41,0.12)_0%,rgba(131,39,41,0)_75%)] blur-2xl dark:bg-[radial-gradient(circle,rgba(96,165,250,0.15)_0%,rgba(96,165,250,0)_75%)]" />
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-6 md:mb-8 hidden md:flex items-end justify-between"
        >
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="h-px w-8 bg-primary/50" />
              <span className="text-[10px] uppercase tracking-[0.32em] text-primary/80 font-medium">Best Sellers</span>
            </div>
            <h2 className="text-3xl lg:text-4xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
              Most loved right now
            </h2>
            <p className="text-sm text-muted-foreground mt-1 font-light">Our most loved pieces, chosen by you</p>
          </div>
          <button
            onClick={() => navigate('/products?tag=best-sellers')}
            className="text-sm font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
          >
            View All <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>
        {/* Mobile header */}
        <div className="mb-4 md:hidden px-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="h-px w-6 bg-primary/50" />
            <span className="text-[10px] uppercase tracking-[0.32em] text-primary/80 font-medium">Best Sellers</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
              Signature Collection
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Scroll best sellers left"
                onClick={() => mobileBSScrollByPage('prev')}
                disabled={!canMobileBSScroll}
                className="w-8 h-8 rounded-full border border-border/70 bg-background/90 dark:bg-zinc-900/80 flex items-center justify-center active:scale-95 transition-transform disabled:cursor-default disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Scroll best sellers right"
                onClick={() => mobileBSScrollByPage('next')}
                disabled={!canMobileBSScroll}
                className="w-8 h-8 rounded-full border border-border/70 bg-background/90 dark:bg-zinc-900/80 flex items-center justify-center active:scale-95 transition-transform disabled:cursor-default disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => navigate('/products?tag=best-sellers')}
                className="text-xs font-medium text-primary tracking-wide ml-1"
              >
                View All
              </button>
            </div>
          </div>
        </div>

        {/* Products Container */}
        <div className="relative">
          <div className="md:hidden pb-2">
            {loading ? (
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={`skeleton-${index}`} className="animate-pulse flex-shrink-0 w-[150px]">
                    <div className="bg-gray-200 dark:bg-zinc-800 rounded-2xl aspect-square mb-2"></div>
                    <div className="h-3 bg-gray-200 dark:bg-zinc-800 rounded mb-1"></div>
                    <div className="h-3 bg-gray-200 dark:bg-zinc-800 rounded w-2/3"></div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="w-full py-12 text-center">
                <Package className="w-12 h-12 mx-auto mb-3 text-primary/40" />
                <p className="text-base font-medium text-foreground/70 mb-1">Best Sellers Coming Soon</p>
                <p className="text-sm text-muted-foreground">Our most loved pieces will appear here. Check back shortly!</p>
              </div>
            ) : (
              <>
                {/* Hero spotlight card (#1 best seller) */}
                {products[0] && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5 }}
                    onClick={() => navigate(`/product/${products[0].id}`)}
                    className="relative mb-3 cursor-pointer overflow-hidden rounded-[26px] border border-[#d4af37]/30 bg-gradient-to-br from-[#fff7e6] via-[#fffaf0] to-[#fdf2d4] shadow-[0_18px_48px_-26px_rgba(212,175,55,0.55)] dark:border-[#d4af37]/25 dark:from-[#1a140a] dark:via-[#1d1610] dark:to-[#15110a] dark:shadow-[0_18px_48px_-26px_rgba(0,0,0,0.85)]"
                  >
                    <div className="flex">
                      <div className="relative w-[44%] overflow-hidden">
                        <SmartImage
                          src={products[0].image}
                          alt={products[0].title}
                          className="w-full h-full object-cover aspect-[4/5]" preset="detail" />
                        <span className="absolute top-2 left-2 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[8px] font-bold tracking-wide text-black shadow-sm" style={{ background: 'linear-gradient(135deg, #f4d57a 0%, #d4af37 50%, #b8941f 100%)' }}>
                          ★ #1 BEST
                        </span>
                      </div>
                      <div className="flex-1 p-4 flex flex-col justify-between">
                        <div>
                          <p className="text-[9px] uppercase tracking-[0.28em] text-primary/80 font-semibold mb-1.5">Most Loved</p>
                          <h3 className="text-base font-semibold text-foreground line-clamp-2 mb-2 leading-snug" style={{ fontFamily: "'Playfair Display', serif" }}>
                            {products[0].title}
                          </h3>
                          <div className="flex items-baseline gap-2 mb-3">
                            <span className="text-lg font-bold text-foreground">₹{products[0].price.toLocaleString()}</span>
                            {products[0].oldPrice && products[0].oldPrice > products[0].price && (
                              <span className="text-[11px] text-muted-foreground line-through">₹{products[0].oldPrice.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => handleAddToCart(e, products[0])}
                            className="flex-1 flex items-center justify-center gap-1.5 rounded-full bg-foreground/90 text-background py-2 text-[11px] font-semibold tracking-wide hover:bg-foreground transition-colors dark:bg-primary dark:text-white"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            Add
                          </button>
                          <button
                            onClick={(e) => handleWishlistClick(e, products[0].id, products[0].title)}
                            className="w-9 h-9 rounded-full bg-background/95 dark:bg-card/95 border border-border flex items-center justify-center"
                          >
                            <Heart className={`w-4 h-4 ${isInWishlist(products[0].id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Horizontal auto-scroll row for the rest (lighter than the previous 3-row grid) */}
                <div
                  ref={mobileBSRef}
                  className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 -mx-1 px-1"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {mobileCarouselProducts.map((product, idx) => {
                    const sourceIndex = mobileBaseProducts.length > 0 ? idx % mobileBaseProducts.length : idx;
                    const rank = sourceIndex + 2; // continues from #2
                    return (
                      <motion.div
                        key={`${product.id}-${idx}`}
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: Math.min(idx, 4) * 0.05, duration: 0.4 }}
                        onClick={() => navigate(`/product/${product.id}`)}
                        className="group cursor-pointer flex-shrink-0 w-[150px] flex flex-col overflow-hidden rounded-[20px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,249,240,0.98)_100%)] shadow-[0_12px_28px_-22px_rgba(114,77,31,0.45)] transition-all duration-300 active:scale-[0.98] dark:border-[#d4af37]/15 dark:bg-[linear-gradient(180deg,rgba(28,22,16,0.98)_0%,rgba(16,14,12,0.98)_100%)] dark:shadow-[0_14px_28px_-20px_rgba(0,0,0,0.7)]"
                      >
                        <div className="relative aspect-square overflow-hidden bg-muted">
                          <SmartImage
                            src={product.image}
                            alt={product.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" preset="card" />
                          {rank <= 5 && (
                            <span className="absolute top-2 left-2 inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold text-black shadow-sm" style={{ background: 'linear-gradient(135deg, #f4d57a 0%, #d4af37 50%, #b8941f 100%)' }}>
                              #{rank}
                            </span>
                          )}
                          <button
                            onClick={(e) => handleWishlistClick(e, product.id, product.title)}
                            className="absolute top-1.5 right-1.5 p-1.5 bg-background/95 dark:bg-card/95 backdrop-blur-sm rounded-full shadow-sm"
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
                      </motion.div>
                    );
                  })}
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
                <Package className="w-12 h-12 mx-auto mb-3 text-primary/40" />
                <p className="text-base font-medium text-foreground/70 mb-1">Best Sellers Coming Soon</p>
                <p className="text-sm text-muted-foreground">Our most loved pieces will appear here. Check back shortly!</p>
              </div>
            ) : (
              <div className="group/best-sellers relative overflow-hidden rounded-[28px] border border-border/60 bg-background/70 py-2 dark:border-[#d4af37]/12 dark:bg-white/[0.03]">
                <div
                  ref={desktopBSRef}
                  className="overflow-x-auto scrollbar-hide px-2 py-2"
                >
                  <div className={`flex gap-4 px-2 ${canDesktopBSScroll ? 'w-max' : 'justify-center'}`}>
                    {desktopCarouselProducts.map((product, index) => {
                      const sourceIndex = products.length > 0 ? index % products.length : index;
                      const showRankBadge = sourceIndex < Math.min(products.length, 5);

                      return (
                        <div
                          key={`desktop-${product.id}-${index}`}
                          className="w-[230px] flex-shrink-0 cursor-pointer"
                          onClick={() => navigate(`/product/${product.id}`)}
                        >
                          <div className="bg-card rounded-[26px] overflow-hidden h-full flex flex-col shadow-sm hover:shadow-xl transition-all duration-300 group border border-border">
                            <div className="aspect-square overflow-hidden bg-muted relative">
                              <SmartImage
                                src={product.image}
                                alt={product.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" preset="card" />

                              {showRankBadge && (
                                <div className="absolute top-2.5 left-2.5 z-10">
                                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold tracking-tight text-black" style={{ background: 'linear-gradient(135deg, #f4d57a 0%, #d4af37 50%, #b8941f 100%)', boxShadow: '0 2px 8px rgba(212, 175, 55, 0.35)' }}>
                                    #{sourceIndex + 1}
                                  </span>
                                </div>
                              )}

                              <button
                                onClick={(e) => handleWishlistClick(e, product.id, product.title)}
                                className="absolute top-2.5 right-2.5 p-2 bg-background/95 dark:bg-card/95 backdrop-blur-sm rounded-full shadow-sm hover:shadow-md transition-all duration-200 z-10"
                                aria-label="Add to wishlist"
                              >
                                <Heart 
                                  className={`w-4 h-4 ${
                                    isInWishlist(product.id) 
                                      ? 'fill-red-500 text-red-500' 
                                      : 'text-muted-foreground'
                                  }`}
                                />
                              </button>
                            </div>

                            <div className="p-4 flex flex-col flex-grow">
                              <h3 className="text-sm font-medium text-foreground line-clamp-1 mb-2">
                                {product.title}
                              </h3>

                              <div className="mt-auto">
                                <div className="flex items-end justify-between">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className="text-lg font-bold text-foreground">
                                        ₹{product.price.toLocaleString()}
                                      </p>
                                      {product.oldPrice && product.oldPrice > product.price && (
                                        <p className="text-xs text-muted-foreground line-through">
                                          ₹{product.oldPrice.toLocaleString()}
                                        </p>
                                      )}
                                    </div>
                                    {product.discount && product.discount > 0 && (
                                      <p className="text-xs font-semibold text-[#b88a2a] dark:text-[#f4cf73]">
                                        {product.discount}% Off
                                      </p>
                                    )}
                                  </div>

                                  <button
                                    onClick={(e) => handleAddToCart(e, product)}
                                    className="w-9 h-9 rounded-full bg-muted hover:bg-primary flex items-center justify-center transition-all duration-200 group/cart"
                                    aria-label="Add to cart"
                                  >
                                    <ShoppingCart className="w-[18px] h-[18px] text-muted-foreground group-hover/cart:text-white transition-colors" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    desktopBSScrollByPage("prev");
                  }}
                  disabled={!canDesktopBSScroll}
                  className={`absolute left-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/92 text-foreground shadow-lg backdrop-blur transition-all duration-200 hover:scale-105 dark:border-white/10 dark:bg-zinc-900/90 ${canDesktopBSScroll ? 'pointer-events-none opacity-0 group-hover/best-sellers:pointer-events-auto group-hover/best-sellers:opacity-100' : 'pointer-events-none opacity-0'}`}
                  aria-label="Show previous best sellers"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    desktopBSScrollByPage("next");
                  }}
                  disabled={!canDesktopBSScroll}
                  className={`absolute right-4 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/92 text-foreground shadow-lg backdrop-blur transition-all duration-200 hover:scale-105 dark:border-white/10 dark:bg-zinc-900/90 ${canDesktopBSScroll ? 'pointer-events-none opacity-0 group-hover/best-sellers:pointer-events-auto group-hover/best-sellers:opacity-100' : 'pointer-events-none opacity-0'}`}
                  aria-label="Show next best sellers"
                >
                  <ChevronRight className="h-4 w-4" />
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
};

export default BestSellers;
