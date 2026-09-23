import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getActiveProductsCached, useCatalogRevision } from "@/services/productCache";
import { UIProduct, adaptFirebaseToUI } from "@/lib/productAdapter";
import { useNavigate } from "react-router-dom";
import { SmartImage } from "@/components/ui/smart-image";

const FeaturedDeals = () => {
  /** Changes when an admin publishes; re-reads the catalog below. */
  const catalogRevision = useCatalogRevision();

  const navigate = useNavigate();
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const allProducts = await getActiveProductsCached();
        const uiProducts = allProducts.map(p => adaptFirebaseToUI(p as any));
        // Get featured deals (products with discount)
        const dealsProducts = uiProducts
          .filter(p => p.oldPrice && p.oldPrice > p.price)
          .slice(0, 8);
        setProducts(dealsProducts);
      } catch (error) {
        console.error('Error loading products:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProducts();
      // Re-runs when an admin publishes a new catalog, so a price change
      // reaches this screen without the visitor reloading it.
  }, [catalogRevision]);

  const scrollContainer = (direction: 'left' | 'right') => {
    const container = document.getElementById('featured-deals-scroll');
    if (container) {
      const scrollAmount = 280;
      container.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  if (loading) {
    return (
      <section className="py-8 bg-muted">
        <div className="container-custom">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </div>
      </section>
    );
  }

  if (products.length === 0) return null;

  return (
    <section className="py-8 bg-muted">
      <div className="container-custom">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
          {/* Main Deals Section */}
          <div className="bg-card rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                Best Deals on Silver Products
              </h2>
              <div className="hidden md:flex gap-2">
                <button
                  onClick={() => scrollContainer('left')}
                  className="w-10 h-10 bg-card hover:bg-muted border border-border rounded-full flex items-center justify-center transition-colors shadow-sm"
                  aria-label="Scroll left"
                >
                  <ChevronLeft className="w-5 h-5 text-foreground/80" />
                </button>
                <button
                  onClick={() => scrollContainer('right')}
                  className="w-10 h-10 bg-card hover:bg-muted border border-border rounded-full flex items-center justify-center transition-colors shadow-sm"
                  aria-label="Scroll right"
                >
                  <ChevronRight className="w-5 h-5 text-foreground/80" />
                </button>
              </div>
            </div>

            <div
              id="featured-deals-scroll"
              className="flex gap-4 overflow-x-auto scrollbar-hide pb-2"
            >
              {products.map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="min-w-[180px] flex-shrink-0 cursor-pointer group"
                  onClick={() => navigate(`/product/${product.id}`)}
                >
                  <div className="aspect-[3/4] relative overflow-hidden bg-muted rounded-lg mb-3">
                    <SmartImage
                      src={product.image}
                      alt={product.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" preset="card" />
                    {product.oldPrice && (
                      <div className="absolute top-2 left-2 bg-green-600 text-white px-2 py-0.5 rounded text-xs font-bold">
                        {Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)}% OFF
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-semibold text-sm text-foreground line-clamp-2">
                      {product.title}
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-foreground">
                        {product.oldPrice && product.oldPrice > product.price ? 'From' : 'Just'} ₹{product.price.toLocaleString()}*
                      </span>
                    </div>
                    {product.oldPrice && (
                      <div className="text-xs text-muted-foreground line-through">
                        ₹{product.oldPrice.toLocaleString()}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Side Promotional Banner */}
          <div className="hidden lg:block">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg overflow-hidden h-full flex flex-col items-center justify-center p-6 text-center text-white relative">
              <div className="absolute inset-0 opacity-10">
                <img
                  src="https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=400&h=600&fit=crop"
                  alt="Featured Collection"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="relative z-10 space-y-4">
                <div className="w-20 h-20 bg-white/20 rounded-full mx-auto flex items-center justify-center backdrop-blur-sm">
                  <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-1">Premium Collection</h3>
                  <p className="text-sm opacity-90">Exclusive silver jewelry</p>
                </div>
                <div className="text-3xl font-bold">
                  From ₹1,149*
                </div>
                <p className="text-xs opacity-75">*T&C Apply</p>
                <button className="bg-white text-blue-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors text-sm">
                  Explore Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FeaturedDeals;
