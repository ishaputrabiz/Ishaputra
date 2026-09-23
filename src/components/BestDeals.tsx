import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getActiveProductsCached, useCatalogRevision } from "@/services/productCache";
import { UIProduct, adaptFirebaseToUI } from "@/lib/productAdapter";
import { useNavigate } from "react-router-dom";
import { SmartImage } from "@/components/ui/smart-image";

const BestDeals = () => {
  /** Changes when an admin publishes; re-reads the catalog below. */
  const catalogRevision = useCatalogRevision();

  const navigate = useNavigate();
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [scrollPosition, setScrollPosition] = useState(0);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const allProducts = await getActiveProductsCached();
        const uiProducts = allProducts.map(p => adaptFirebaseToUI(p as any));
        // Get best deals (products with discount)
        const dealsProducts = uiProducts
          .filter(p => p.oldPrice && p.oldPrice > p.price)
          .slice(0, 10);
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

  const scroll = (direction: 'left' | 'right') => {
    const container = document.getElementById('deals-scroll');
    if (container) {
      const scrollAmount = 300;
      const newPosition = direction === 'left' 
        ? scrollPosition - scrollAmount 
        : scrollPosition + scrollAmount;
      
      container.scrollTo({ left: newPosition, behavior: 'smooth' });
      setScrollPosition(newPosition);
    }
  };

  if (loading) {
    return (
      <section className="py-12 bg-background">
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
    <section className="py-12 bg-background">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground">
            Best Deals on Silver Products
          </h2>
          <div className="hidden md:flex gap-2">
            <button
              onClick={() => scroll('left')}
              className="w-10 h-10 bg-muted hover:bg-muted/80 rounded-full flex items-center justify-center transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="w-10 h-10 bg-muted hover:bg-muted/80 rounded-full flex items-center justify-center transition-colors"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          id="deals-scroll"
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-4"
        >
          {products.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="min-w-[200px] md:min-w-[250px] flex-shrink-0 bg-card rounded-xl border border-border overflow-hidden hover:shadow-xl transition-shadow cursor-pointer group"
              onClick={() => navigate(`/product/${product.id}`)}
            >
              <div className="aspect-square relative overflow-hidden bg-muted">
                <SmartImage
                  src={product.image}
                  alt={product.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" preset="card" />
                {product.oldPrice && (
                  <div className="absolute top-2 left-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-bold">
                    {Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)}% OFF
                  </div>
                )}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-foreground line-clamp-2 mb-2">
                  {product.title}
                </h3>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-foreground">
                      From ₹{product.price.toLocaleString()}*
                    </span>
                  </div>
                  {product.oldPrice && (
                    <div className="text-sm text-muted-foreground line-through">
                      ₹{product.oldPrice.toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default BestDeals;
