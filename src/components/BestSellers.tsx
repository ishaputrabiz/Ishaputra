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
      <div className="container-custom">
        <div className="panel tx-sheet relative overflow-hidden px-4 py-5 md:px-8 md:py-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-6 md:mb-8 hidden md:flex items-end justify-between"
        >
          <div>
            <p className="eyebrow-no mb-3"><b>02</b><span>Best Sellers</span></p>
            <h2 className="text-3xl lg:text-4xl font-semibold text-foreground" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
              Most loved right now
            </h2>
            <p className="text-sm text-muted-foreground mt-1 font-light">Our most loved rituals, chosen by you</p>
          </div>
          <button
            onClick={() => navigate('/products?tag=best-sellers')}
            className="link-arrow"
          >
            View All <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>
        {/* Mobile header */}
        <div className="mb-4 md:hidden px-1">
          <p className="eyebrow-no mb-2"><b>02</b><span>Best Sellers</span></p>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
              Signature Collection
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Scroll best sellers left"
                onClick={() => mobileBSScrollByPage('prev')}
                disabled={!canMobileBSScroll}
                className="btn-round !h-8 !w-8"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Scroll best sellers right"
                onClick={() => mobileBSScrollByPage('next')}
                disabled={!canMobileBSScroll}
                className="btn-round !h-8 !w-8"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => navigate('/products?tag=best-sellers')}
                className="link-arrow ml-1"
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
                    <div className="bg-foreground/[0.06] rounded-[var(--radius-card)] aspect-square mb-2"></div>
                    <div className="h-3 bg-gray-200 dark:bg-zinc-800 rounded mb-1"></div>
                    <div className="h-3 bg-gray-200 dark:bg-zinc-800 rounded w-2/3"></div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="w-full py-12 text-center">
                <Package className="w-12 h-12 mx-auto mb-3 text-primary/40" />
                <p className="text-base font-medium text-foreground/70 mb-1">Best Sellers Coming Soon</p>
                <p className="text-sm text-muted-foreground">Our most loved products will appear here. Check back shortly!</p>
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
                    className="card-product relative mb-3 cursor-pointer overflow-hidden"
                  >
                    <div className="flex">
                      <div className="relative w-[44%] overflow-hidden">
                        <SmartImage
                          src={products[0].image}
                          alt={products[0].title}
                          className="w-full h-full object-cover aspect-[4/5]" preset="detail" />
                        <span className="absolute top-2 left-2 inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-[4px] bg-charcoal/85 text-[10px] font-bold tracking-[0.12em] text-highlight-soft backdrop-blur-sm">No. 01</span>
                      </div>
                      <div className="flex-1 p-4 flex flex-col justify-between">
                        <div>
                          <p className="eyebrow-no mb-2 !text-[9px]"><span>Most loved</span></p>
                          <h3 className="text-base font-semibold text-foreground line-clamp-2 mb-2 leading-snug" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
                            {products[0].title}
                          </h3>
                          <div className="flex items-baseline gap-2 mb-3">
                            <span className="price-now text-lg">₹{products[0].price.toLocaleString()}</span>
                            {products[0].oldPrice && products[0].oldPrice > products[0].price && (
                              <span className="price-was text-[11px]">₹{products[0].oldPrice.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => handleAddToCart(e, products[0])}
                            className="btn-copper flex-1 !px-3 !py-2.5"
                          >
                            <ShoppingCart className="w-3.5 h-3.5" />
                            Add
                          </button>
                          <button
                            onClick={(e) => handleWishlistClick(e, products[0].id, products[0].title)}
                            className="w-9 h-9 rounded-full border border-foreground/15 bg-card flex items-center justify-center"
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
                        className="card-product group cursor-pointer flex-shrink-0 w-[150px] flex flex-col overflow-hidden p-1.5 active:scale-[0.98]"
                      >
                        <div className="tile-img relative aspect-square overflow-hidden">
                          <SmartImage
                            src={product.image}
                            alt={product.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" preset="card" />
                          {rank <= 5 && (
                            <span className="absolute top-2 left-2 inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-[4px] bg-charcoal/85 text-[10px] font-bold tracking-[0.12em] text-highlight-soft backdrop-blur-sm">
                              {String(rank).padStart(2, '0')}
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
                                <p className="price-now text-sm">₹{product.price.toLocaleString()}</p>
                                {product.oldPrice && product.oldPrice > product.price && (
                                  <p className="price-was text-[9px]">₹{product.oldPrice.toLocaleString()}</p>
                                )}
                              </div>
                              {product.discount && product.discount > 0 && (
                                <p className="chip-off mt-1 w-fit !text-[9px]">{product.discount}% off</p>
                              )}
                            </div>
                            <button
                              onClick={(e) => handleAddToCart(e, product)}
                              className="w-8 h-8 rounded-full border border-foreground/15 hover:bg-primary hover:border-primary flex items-center justify-center transition-colors group/cart"
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
                  <div key={`desktop-skeleton-${index}`} className="animate-pulse card-product p-3">
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
                <p className="text-sm text-muted-foreground">Our most loved products will appear here. Check back shortly!</p>
              </div>
            ) : (
              <div className="group/best-sellers relative overflow-hidden rounded-[var(--radius-card)] py-2">
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
                          <div className="card-product overflow-hidden h-full flex flex-col group p-2.5">
                            <div className="tile-img aspect-square overflow-hidden relative">
                              <SmartImage
                                src={product.image}
                                alt={product.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" preset="card" />

                              {showRankBadge && (
                                <div className="absolute top-2.5 left-2.5 z-10">
                                  <span className={`inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-[4px] bg-charcoal/85 text-[10px] font-bold tracking-[0.12em] text-highlight-soft backdrop-blur-sm`}>
                                    No. {String(sourceIndex + 1).padStart(2, '0')}
                                  </span>
                                </div>
                              )}

                              <button
                                onClick={(e) => handleWishlistClick(e, product.id, product.title)}
                                className="absolute top-2.5 right-2.5 p-2 bg-card/90 backdrop-blur-sm rounded-full border border-foreground/10 transition-all duration-200 z-10 hover:border-primary/40"
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

                            <div className="px-1.5 pt-3.5 pb-1 flex flex-col flex-grow">
                              <h3 className="text-sm font-medium text-foreground line-clamp-1 mb-2">
                                {product.title}
                              </h3>

                              <div className="mt-auto">
                                <div className="flex items-end justify-between">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <p className="price-now text-lg">
                                        ₹{product.price.toLocaleString()}
                                      </p>
                                      {product.oldPrice && product.oldPrice > product.price && (
                                        <p className="price-was text-xs">
                                          ₹{product.oldPrice.toLocaleString()}
                                        </p>
                                      )}
                                    </div>
                                    {product.discount && product.discount > 0 && (
                                      <p className="chip-off mt-1.5 w-fit">
                                        {product.discount}% off
                                      </p>
                                    )}
                                  </div>

                                  <button
                                    onClick={(e) => handleAddToCart(e, product)}
                                    className="w-9 h-9 rounded-full border border-foreground/15 hover:bg-primary hover:border-primary flex items-center justify-center transition-all duration-200 group/cart"
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
                  className={`btn-round absolute left-4 top-1/2 z-20 !h-11 !w-11 -translate-y-1/2 !bg-card shadow-lg ${canDesktopBSScroll ? 'pointer-events-none opacity-0 group-hover/best-sellers:pointer-events-auto group-hover/best-sellers:opacity-100' : 'pointer-events-none opacity-0'}`}
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
                  className={`btn-round absolute right-4 top-1/2 z-20 !h-11 !w-11 -translate-y-1/2 !bg-card shadow-lg ${canDesktopBSScroll ? 'pointer-events-none opacity-0 group-hover/best-sellers:pointer-events-auto group-hover/best-sellers:opacity-100' : 'pointer-events-none opacity-0'}`}
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
