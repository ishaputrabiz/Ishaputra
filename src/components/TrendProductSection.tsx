import { useState, useEffect } from "react";
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

const TrendProductSection = () => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { toast } = useToast();
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const {
    scrollerRef: mobileScrollRef,
    scrollByPage: mobileScrollByPage,
    canScroll: canMobileTrendingScroll,
  } = useAutoScroll({ speed: 0.55, resumeDelay: 2400, loop: true, direction: -1, loopItemCount: products.length });

  const mobileTrendingProducts =
    canMobileTrendingScroll && products.length > 1 ? [...products, ...products] : products;

  useEffect(() => {
    const unsubscribe = subscribeToActiveProductsByFlag('isTrendProduct', (fbProducts) => {
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

  if (loading) return null;
  if (products.length === 0) return null;

  const featuredProduct = products[0];
  const restProducts = products.slice(1);
  // Three beside the featured tile fill the desktop bento (see the grid below).
  const productsPerPage = 3;
  const totalPages = Math.max(1, Math.ceil(restProducts.length / productsPerPage));
  const visibleProducts = restProducts.slice(
    currentPage * productsPerPage,
    (currentPage + 1) * productsPerPage
  );

  const nextPage = () => setCurrentPage((prev) => (prev + 1) % totalPages);
  const prevPage = () => setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);

  return (
    <section className="py-6 md:py-12">
      <div className="container-custom">
        {/* Mobile */}
        <div className="md:hidden">
          <div className="flex items-end justify-between mb-4 px-1">
            <div>
            <p className="eyebrow-no mb-2"><b>05</b><span>This week</span></p>
            <h2 className="text-xl font-semibold text-foreground" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
              Trending Now
            </h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Scroll trending left"
                onClick={() => mobileScrollByPage('prev')}
                disabled={!canMobileTrendingScroll}
                className="btn-round !h-8 !w-8"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label="Scroll trending right"
                onClick={() => mobileScrollByPage('next')}
                disabled={!canMobileTrendingScroll}
                className="btn-round !h-8 !w-8"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => navigate('/products?tag=trending')} className="link-arrow ml-1">
                View All
              </button>
            </div>
          </div>
          <div ref={mobileScrollRef} className="flex gap-3 overflow-x-auto scrollbar-hide pb-2" style={{ WebkitOverflowScrolling: 'touch' }}>
            {mobileTrendingProducts.map((product, index) => (
              <motion.div
                key={`${product.id}-${index}`}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(index, 4) * 0.06 }}
                className="flex-shrink-0 w-[150px] cursor-pointer"
                onClick={() => navigate(`/product/${product.id}`)}
              >
                <div className="card-product overflow-hidden h-full flex flex-col p-1.5">
                  <div className="tile-img aspect-square overflow-hidden relative">
                    <SmartImage src={product.image} alt={product.title} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" preset="card" />
                    <button
                      onClick={(e) => handleWishlistClick(e, product.id, product.title)}
                      className="absolute top-2 right-2 p-1.5 bg-card/90 rounded-full border border-foreground/10"
                    >
                      <Heart className={`w-3.5 h-3.5 ${isInWishlist(product.id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                    </button>
                  </div>
                  <div className="p-2.5 flex flex-col flex-grow">
                    <p className="text-[11px] font-medium text-foreground/80 line-clamp-1 mb-1">{product.title}</p>
                    <div className="mt-auto flex items-end justify-between gap-1">
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

        {/* Desktop \u2014 Asymmetric bento mosaic */}
        <div className="hidden md:block">
          <div className="flex items-end justify-between mb-8">
            <div>
              <p className="eyebrow-no mb-3"><b>05</b><span className="inline-flex items-center gap-2">Live this week
                <span className="relative inline-flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-primary opacity-60 animate-ping" />
                  <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-primary" />
                </span></span>
              </p>
              <h2 className="text-3xl lg:text-4xl font-semibold text-foreground" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
                Trending Now
              </h2>
              <p className="text-sm text-muted-foreground mt-1 font-light">What men are reaching for this week</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={prevPage}
                disabled={totalPages <= 1}
                aria-label="Previous trending products"
                className="btn-round"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={nextPage}
                disabled={totalPages <= 1}
                aria-label="Next trending products"
                className="btn-round"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => navigate('/products?tag=trending')} className="link-arrow ml-2">
                View All <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Bento grid: 4 cols x 2 rows. Big tile spans 2x2, one wide tile top-right, two small below it.
              That is all 8 cells: a fifth tile would fall into an implicit, zero-height third row. */}
          {(() => {
            const tiles = [featuredProduct, ...visibleProducts].slice(0, 4);
            return (
              <div className="grid grid-cols-4 grid-rows-2 gap-4" style={{ height: 540 }}>
                {tiles.map((product, idx) => {
                  // 0 = big (2x2), 1 = top-right wide (2x1), 2 and 3 = bottom-right (1x1 each)
                  const layoutClass =
                    idx === 0 ? 'col-span-2 row-span-2' :
                    idx === 1 ? 'col-span-2 row-span-1' :
                    'col-span-1 row-span-1';
                  if (!product) return null;
                  return (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, scale: 0.96 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.07, duration: 0.4 }}
                      className={`relative cursor-pointer group rounded-[var(--radius-card)] overflow-hidden border border-foreground/[0.06] bg-charcoal ${layoutClass}`}
                      onClick={() => navigate(`/product/${product.id}`)}
                    >
                      <SmartImage
                        src={product.image}
                        alt={product.title}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" preset="card" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                      {/* Trending rank badge */}
                      <div className={`absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 h-6 px-2 rounded-[4px] bg-charcoal/85 text-[10px] font-bold tracking-[0.12em] text-highlight-soft backdrop-blur-sm`}>
                        <span className="relative inline-flex w-1.5 h-1.5">
                          <span className="absolute inset-0 rounded-full bg-highlight-soft opacity-60 animate-ping" />
                          <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-highlight-soft" />
                        </span>
                        <span>No. {String(idx + 1).padStart(2, '0')}</span>
                      </div>

                      <button
                        onClick={(e) => handleWishlistClick(e, product.id, product.title)}
                        className="absolute top-3 right-3 z-10 p-2 bg-black/35 backdrop-blur rounded-full border border-white/25 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Heart className={`w-3.5 h-3.5 ${isInWishlist(product.id) ? 'fill-red-500 text-red-500' : 'text-white'}`} />
                      </button>

                      <div className="absolute inset-x-0 bottom-0 z-10 p-4 lg:p-5">
                        {idx === 0 && (
                          <span className="eyebrow-no mb-2 !text-white/70 [&_b]:!text-highlight-soft"><b>★</b>Top trending</span>
                        )}
                        <h3 className={`font-semibold text-white line-clamp-2 ${idx === 0 ? 'text-xl mb-2' : 'text-sm mb-1'}`} style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
                          {product.title}
                        </h3>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-white ${idx === 0 ? 'text-lg' : 'text-sm'}`}>₹{product.price.toLocaleString()}</span>
                            {product.oldPrice && product.oldPrice > product.price && (
                              <span className="text-[10px] text-white/50 line-through">₹{product.oldPrice.toLocaleString()}</span>
                            )}
                          </div>
                          <button
                            onClick={(e) => handleAddToCart(e, product)}
                            className="w-8 h-8 rounded-full border border-white/30 bg-white/10 hover:bg-primary hover:border-primary backdrop-blur flex items-center justify-center transition-colors group/cart flex-shrink-0"
                          >
                            <ShoppingCart className="w-3.5 h-3.5 text-white transition-colors" />
                          </button>
                        </div>
                        {idx === 0 && (
                          <button
                            className="btn-line mt-4 w-fit text-white hover:bg-white hover:text-charcoal"
                            onClick={(e) => { e.stopPropagation(); navigate(`/product/${product.id}`); }}
                          >
                            Shop Now
                          </button>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
};

export default TrendProductSection;
