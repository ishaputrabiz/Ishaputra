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
      className="relative h-full min-h-[248px] cursor-pointer group rounded-[28px] overflow-hidden"
      onClick={() => navigate(`/product/${product.id}`)}
    >
      <SmartImage
        src={product.image}
        alt={product.title}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" preset="card" />
      <div className={`absolute inset-0 ${compact ? "bg-gradient-to-t from-black/80 via-black/22 to-transparent" : "bg-gradient-to-t from-black/82 via-black/18 to-transparent"}`} />

      <button
        onClick={(e) => handleWishlistClick(e, product.id, product.title)}
        className="absolute top-3 right-3 z-10 p-2 bg-white/95 backdrop-blur rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Heart className={`w-3.5 h-3.5 ${isInWishlist(product.id) ? 'fill-red-500 text-red-500' : 'text-gray-700'}`} />
      </button>

      <div className="absolute inset-x-0 bottom-0 z-10 p-5 lg:p-6">
        <p className="text-[10px] uppercase tracking-[0.24em] text-white/70 mb-1 font-light">
          {compact ? `Spotlight 0${idx + 1}` : `Featured 0${idx + 1}`}
        </p>
        <h3 className={`${compact ? "text-lg lg:text-xl" : "text-xl"} font-semibold text-white mb-2 line-clamp-2`} style={{ fontFamily: "'Playfair Display', serif" }}>
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
            className="w-9 h-9 rounded-full bg-white/20 hover:bg-primary backdrop-blur flex items-center justify-center transition-colors group/cart flex-shrink-0"
          >
            <ShoppingCart className="w-[18px] h-[18px] text-white transition-colors" />
          </button>
        </div>
      </div>
    </motion.div>
  );

  return (
    <section className="relative py-6 md:py-16">
      <div className="pointer-events-none absolute inset-x-0 top-10 h-36 bg-[radial-gradient(circle,rgba(212,175,55,0.14)_0%,rgba(212,175,55,0)_72%)] blur-3xl" />
      <div className="container-custom">
        <div className="relative overflow-hidden rounded-[36px] border border-[#ead9ba]/80 bg-[linear-gradient(180deg,rgba(255,253,248,0.98)_0%,rgba(255,255,255,0.98)_42%,rgba(255,246,232,0.95)_100%)] px-4 py-5 shadow-[0_34px_100px_-70px_rgba(114,77,31,0.55)] dark:border-[#d4af37]/20 dark:bg-[linear-gradient(180deg,rgba(18,17,15,0.98)_0%,rgba(24,20,17,0.98)_42%,rgba(12,12,11,0.98)_100%)] dark:shadow-[0_40px_120px_-74px_rgba(0,0,0,0.9)] md:px-7 md:py-8">
          <div className="pointer-events-none absolute -left-8 top-8 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(131,39,41,0.12)_0%,rgba(131,39,41,0)_75%)] blur-2xl dark:bg-[radial-gradient(circle,rgba(96,165,250,0.12)_0%,rgba(96,165,250,0)_75%)]" />
          <div className="pointer-events-none absolute right-0 top-0 h-36 w-36 rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.24)_0%,rgba(212,175,55,0)_72%)] blur-2xl dark:bg-[radial-gradient(circle,rgba(212,175,55,0.18)_0%,rgba(212,175,55,0)_72%)]" />
        {/* Mobile */}
        <div className="md:hidden">
          <div className="mb-4 px-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="h-px w-6 bg-primary/50" />
              <span className="text-[10px] uppercase tracking-[0.32em] text-primary/80 font-medium">Featured</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
                The spotlight edit
              </h2>
              <button onClick={() => navigate('/products?tag=featured')} className="text-xs font-medium text-primary tracking-wide">
                View All
              </button>
            </div>
            <p className="text-xs text-muted-foreground/90">A layered mobile edit with one hero pick and sharper supporting cards.</p>
          </div>

          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="relative min-h-[304px] cursor-pointer overflow-hidden rounded-[30px] border border-white/40 shadow-[0_26px_60px_-36px_rgba(0,0,0,0.58)]"
              onClick={() => navigate(`/product/${featuredProduct.id}`)}
            >
              <SmartImage src={featuredProduct.image} alt={featuredProduct.title} className="absolute inset-0 w-full h-full object-cover" preset="detail" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                <span className="inline-flex rounded-full border border-white/20 bg-white/10 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-[0.26em] text-white/80 mb-3">
                  Editor's Pick
                </span>
                <h3 className="text-2xl font-semibold mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
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
                  <div className="overflow-hidden rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,249,240,0.98)_100%)] shadow-[0_18px_42px_-28px_rgba(114,77,31,0.48)] dark:border-[#d4af37]/12 dark:bg-[linear-gradient(180deg,rgba(30,25,19,0.98)_0%,rgba(17,15,13,0.98)_100%)] dark:shadow-[0_24px_48px_-34px_rgba(0,0,0,0.82)]">
                    <div className="aspect-[4/4.5] overflow-hidden bg-muted relative">
                      <SmartImage src={product.image} alt={product.title} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" preset="card" />
                      <button
                        onClick={(e) => handleWishlistClick(e, product.id, product.title)}
                        className="absolute top-2 right-2 p-1.5 bg-background/95 dark:bg-card/95 rounded-full shadow-sm"
                      >
                        <Heart className={`w-3.5 h-3.5 ${isInWishlist(product.id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
                      </button>
                    </div>
                    <div className="p-3">
                      <p className="text-[11px] text-muted-foreground line-clamp-1 mb-1">{product.title}</p>
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-sm font-bold text-foreground">₹{product.price.toLocaleString()}</p>
                        <button
                          onClick={(e) => handleAddToCart(e, product)}
                          className="w-7 h-7 rounded-full bg-muted hover:bg-primary flex items-center justify-center transition-colors group/cart flex-shrink-0"
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
                <span className="text-[10px] uppercase tracking-[0.3em] text-primary font-medium">Editor's Picks</span>
                <h2 className="text-3xl lg:text-4xl font-semibold text-foreground mt-1" style={{ fontFamily: "'Playfair Display', serif" }}>
                  Featured
                </h2>
              </div>
              <span className="hidden lg:block h-px flex-1 bg-gradient-to-r from-primary/40 via-primary/20 to-transparent mb-3 ml-2" style={{ minWidth: 80 }} />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={prevPage} className="w-10 h-10 rounded-full border border-border bg-card flex items-center justify-center hover:bg-muted transition-all shadow-sm">
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <button onClick={nextPage} className="w-10 h-10 rounded-full border border-border bg-card flex items-center justify-center hover:bg-muted transition-all shadow-sm">
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
              <button onClick={() => navigate('/products?tag=featured')} className="text-sm font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1 ml-2">
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
                className="relative rounded-[32px] overflow-hidden cursor-pointer group min-h-[520px]"
                onClick={() => navigate(`/product/${featuredProduct.id}`)}
              >
                <SmartImage
                  src={featuredProduct.image}
                  alt={featuredProduct.title}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" preset="detail" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 z-10 p-8 text-white">
                  <span className="inline-flex rounded-full border border-white/20 bg-white/10 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/80 mb-4">
                    Featured
                  </span>
                  <h3 className="text-3xl font-semibold mb-3 line-clamp-2" style={{ fontFamily: "'Playfair Display', serif" }}>
                    {featuredProduct.title}
                  </h3>
                  <div className="flex items-center gap-3 mb-6">
                    <span className="text-2xl font-bold">₹{featuredProduct.price.toLocaleString()}</span>
                    {featuredProduct.oldPrice && featuredProduct.oldPrice > featuredProduct.price && (
                      <span className="text-sm text-white/60 line-through">₹{featuredProduct.oldPrice.toLocaleString()}</span>
                    )}
                  </div>
                  <button
                    className="bg-white text-gray-900 px-6 py-2.5 rounded-full text-sm font-medium hover:bg-gray-100 transition-all shadow-lg"
                    onClick={(e) => { e.stopPropagation(); navigate(`/product/${featuredProduct.id}`); }}
                  >
                    Explore Piece
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
