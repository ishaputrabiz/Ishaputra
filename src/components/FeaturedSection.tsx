import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ChevronRight, ChevronLeft, Heart, ShoppingCart } from "lucide-react";

import { UIProduct, adaptFirebaseArrayToUI } from "@/lib/productAdapter";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/hooks/useWishlist";
import { useToast } from "@/hooks/use-toast";
import { SmartImage } from "@/components/ui/smart-image";
import { subscribeToActiveProductsByFlag } from '@/services/productCache';

const FeaturedSection = () => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { toast } = useToast();
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToActiveProductsByFlag('isFeatured', (fbProducts) => {
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
  const productsPerPage = 4;
  const totalPages = Math.max(1, Math.ceil(restProducts.length / productsPerPage));
  const visibleProducts = restProducts.slice(
    currentPage * productsPerPage,
    (currentPage + 1) * productsPerPage
  );

  const nextPage = () => setCurrentPage((prev) => (prev + 1) % totalPages);
  const prevPage = () => setCurrentPage((prev) => (prev - 1 + totalPages) % totalPages);
  const upperProducts = visibleProducts.slice(0, 2);
  const lowerProducts = visibleProducts.slice(2, 4);

  const renderDesktopCard = (product: UIProduct, idx: number, compact = false) => (
    <motion.div
      key={`${compact ? "compact" : "wide"}-${product.id}`}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: idx * 0.08, duration: 0.4 }}
      className="relative h-full min-h-[248px] cursor-pointer group rounded-[var(--radius-card)] overflow-hidden border border-white/10"
      onClick={() => navigate(`/product/${product.id}`)}
    >
      <SmartImage
        src={product.image}
        alt={product.title}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" preset="card" />
      <div className={`absolute inset-0 ${compact ? "bg-gradient-to-t from-black/80 via-black/22 to-transparent" : "bg-gradient-to-t from-black/82 via-black/18 to-transparent"}`} />

      <button
        onClick={(e) => handleWishlistClick(e, product.id, product.title)}
        className="absolute top-3 right-3 z-10 p-2 bg-black/35 backdrop-blur rounded-full border border-white/25 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Heart className={`w-3.5 h-3.5 ${isInWishlist(product.id) ? 'fill-red-500 text-red-500' : 'text-white'}`} />
      </button>

      <div className="absolute inset-x-0 bottom-0 z-10 p-5 lg:p-6">
        <p className="eyebrow-no mb-2 !text-white/70 [&_b]:!text-highlight-soft">
          <b>{String(idx + 1).padStart(2, "0")}</b>{compact ? "Spotlight" : "Featured"}
        </p>
        <h3 className={`${compact ? "text-lg lg:text-xl" : "text-xl"} font-semibold text-white mb-2 line-clamp-2`} style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
          {product.title}
        </h3>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`${compact ? "text-base" : "text-lg"} font-bold text-white`}>₹{product.price.toLocaleString()}</span>
            {product.oldPrice && product.oldPrice > product.price && (
              <span className="text-xs text-white/50 line-through">₹{product.oldPrice.toLocaleString()}</span>
            )}
          </div>
          <button
            onClick={(e) => handleAddToCart(e, product)}
            className="w-9 h-9 rounded-full border border-white/30 bg-white/10 hover:bg-primary hover:border-primary backdrop-blur flex items-center justify-center transition-colors group/cart flex-shrink-0"
          >
            <ShoppingCart className="w-[18px] h-[18px] text-white transition-colors" />
          </button>
        </div>
      </div>
    </motion.div>
  );

  return (
    <section className="relative py-6 md:py-16">
      <div className="container-custom">
        <div className="panel tx-slate relative overflow-hidden px-4 py-5 text-charcoal-foreground md:px-8 md:py-10">
        {/* Mobile */}
        <div className="md:hidden">
          <div className="mb-4 px-1">
            <p className="eyebrow-no !text-charcoal-foreground/60 [&_b]:!text-highlight-soft mb-2"><b>03</b><span>Featured</span></p>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-charcoal-foreground" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
                The spotlight edit
              </h2>
              <button onClick={() => navigate('/products?tag=featured')} className="link-arrow !text-charcoal-foreground">
                View All
              </button>
            </div>
            <p className="mt-1 text-xs text-charcoal-foreground/60">Our editors’ picks for the modern man’s routine.</p>
          </div>

          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="relative min-h-[304px] cursor-pointer overflow-hidden rounded-[var(--radius-card)] border border-white/10"
              onClick={() => navigate(`/product/${featuredProduct.id}`)}
            >
              <SmartImage src={featuredProduct.image} alt={featuredProduct.title} className="absolute inset-0 w-full h-full object-cover" preset="detail" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <p className="eyebrow-no mb-3 !text-white/70 [&_b]:!text-highlight-soft"><b>01</b>Editor's pick</p>
                <h3 className="text-2xl font-semibold mb-2" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
                  {featuredProduct.title}
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">₹{featuredProduct.price.toLocaleString()}</span>
                  {featuredProduct.oldPrice && featuredProduct.oldPrice > featuredProduct.price && (
                    <span className="text-xs text-white/60 line-through">₹{featuredProduct.oldPrice.toLocaleString()}</span>
                  )}
                </div>
              </div>
            </motion.div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {restProducts.slice(0, 4).map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 15 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.06 }}
                  className="cursor-pointer"
                  onClick={() => navigate(`/product/${product.id}`)}
                >
                  <div className="card-product overflow-hidden p-1.5">
                    <div className="tile-img aspect-[4/4.5] overflow-hidden relative">
                      <SmartImage src={product.image} alt={product.title} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" preset="card" />
                      <button
                        onClick={(e) => handleWishlistClick(e, product.id, product.title)}
                        className="absolute top-2 right-2 p-1.5 bg-background/95 dark:bg-card/95 rounded-full shadow-sm"
                      >
                        <Heart className={`w-3.5 h-3.5 ${isInWishlist(product.id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                      </button>
                    </div>
                    <div className="p-3">
                      <p className="text-[11px] font-medium text-foreground/80 line-clamp-1 mb-1">{product.title}</p>
                      <div className="flex items-center justify-between gap-1">
                        <p className="price-now text-sm">₹{product.price.toLocaleString()}</p>
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
        </div>

        {/* Desktop — salon wall layout */}
        <div className="hidden md:block">
          <div className="flex items-end justify-between mb-8">
            <div className="flex items-end gap-4">
              <div>
                <p className="eyebrow-no !text-charcoal-foreground/60 [&_b]:!text-highlight-soft"><b>03</b><span>Editor's picks</span></p>
                <h2 className="text-3xl lg:text-4xl font-semibold text-charcoal-foreground mt-2" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
                  Featured
                </h2>
              </div>
              <span className="hidden lg:block h-px flex-1 bg-gradient-to-r from-highlight-soft/50 via-highlight-soft/15 to-transparent mb-3 ml-2" style={{ minWidth: 120 }} />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={prevPage} className="btn-round !border-white/20 !bg-white/5 !text-charcoal-foreground">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={nextPage} className="btn-round !border-white/20 !bg-white/5 !text-charcoal-foreground">
                <ChevronRight className="w-4 h-4" />
              </button>
              <button onClick={() => navigate('/products?tag=featured')} className="link-arrow ml-2 !text-charcoal-foreground">
                View All <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-[minmax(0,1.32fr)_minmax(340px,0.9fr)] gap-5">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4 }}
                className="relative rounded-[var(--radius-card)] overflow-hidden cursor-pointer group min-h-[520px] border border-white/10"
                onClick={() => navigate(`/product/${featuredProduct.id}`)}
              >
                <SmartImage
                  src={featuredProduct.image}
                  alt={featuredProduct.title}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" preset="detail" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 z-10 p-8 text-white">
                  <p className="eyebrow-no mb-4 !text-white/70 [&_b]:!text-highlight-soft"><b>01</b>Featured</p>
                  <h3 className="text-3xl font-semibold mb-3 line-clamp-2" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
                    {featuredProduct.title}
                  </h3>
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-2xl font-bold">₹{featuredProduct.price.toLocaleString()}</span>
                    {featuredProduct.oldPrice && featuredProduct.oldPrice > featuredProduct.price && (
                      <span className="text-sm text-white/60 line-through">₹{featuredProduct.oldPrice.toLocaleString()}</span>
                    )}
                  </div>
                  <button
                    className="btn-line text-white hover:bg-white hover:text-charcoal"
                    onClick={(e) => { e.stopPropagation(); navigate(`/product/${featuredProduct.id}`); }}
                  >
                    Explore
                  </button>
                </div>
              </motion.div>

              <div className="grid gap-5 auto-rows-[1fr]">
                {upperProducts.map((product, idx) => (
                  <div key={`upper-${product.id}`} className="min-h-[248px]">
                    {renderDesktopCard(product, idx, true)}
                  </div>
                ))}
              </div>
            </div>

            {lowerProducts.length > 0 && (
              <div className={`grid gap-5 ${lowerProducts.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
                {lowerProducts.map((product, idx) => (
                  <div key={`lower-${product.id}`} className="min-h-[248px]">
                    {renderDesktopCard(product, idx + 2)}
                  </div>
                ))}
              </div>
            )}
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

export default FeaturedSection;
