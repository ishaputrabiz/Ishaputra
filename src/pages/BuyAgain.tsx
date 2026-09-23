import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { subscribeToUserOrders, Order } from '@/services/orderService';
import { getActiveProductsCached } from '@/services/productCache';
import { adaptFirebaseToUI } from '@/lib/productAdapter';
import ProductCard from '@/components/ProductCard';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import { useWishlist } from '@/hooks/useWishlist';
import { ArrowLeft, Package, Loader2, ShoppingCart, Search, ShoppingBag, ChevronDown, X, Heart } from 'lucide-react';
import { SmartImage } from "@/components/ui/smart-image";

interface OrderedProduct {
  productId: string;
  name: string;
  image: string;
  price: number;
  lastOrderDate: Date;
}

const BuyAgain = () => {
  const { user } = useAuth();
  const { addToCart, totalItems } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const navigate = useNavigate();
  const [orderedProducts, setOrderedProducts] = useState<OrderedProduct[]>([]);
  const [suggestedProducts, setSuggestedProducts] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'recent' | 'price-low' | 'price-high'>('recent');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/account');
      return;
    }

    // Subscribe to user's orders
    const unsubscribe = subscribeToUserOrders(user.uid, (orders) => {
      // Extract products from delivered orders
      const deliveredOrders = orders.filter(
        order => order.status === 'delivered'
      );

      // Create a map of products with their latest order date
      const productMap = new Map<string, OrderedProduct>();

      deliveredOrders.forEach(order => {
        order.items.forEach(item => {
          const existingProduct = productMap.get(item.productId);
          const currentOrderDate = order.createdAt.toDate();

          if (!existingProduct || currentOrderDate > existingProduct.lastOrderDate) {
            productMap.set(item.productId, {
              productId: item.productId,
              name: item.name,
              image: item.image,
              price: item.price,
              lastOrderDate: currentOrderDate,
            });
          }
        });
      });

      // Convert to array and sort by latest order date
      const productsArray = Array.from(productMap.values()).sort(
        (a, b) => b.lastOrderDate.getTime() - a.lastOrderDate.getTime()
      );

      setOrderedProducts(productsArray);
      setLoading(false);
    });

    // Fetch suggested products
    fetchSuggestedProducts();

    return () => unsubscribe();
  }, [user, navigate]);

  const fetchSuggestedProducts = async () => {
    try {
      const products = await getActiveProductsCached();
      const adaptedProducts = products.map(adaptFirebaseToUI);
      // Shuffle and take random products for suggestions
      const shuffled = [...adaptedProducts].sort(() => Math.random() - 0.5);
      setSuggestedProducts(shuffled.slice(0, 20));
    } catch (error) {
      console.error('Error fetching suggested products:', error);
    }
  };

  // Sort ordered products only
  useEffect(() => {
    const productsToSort = orderedProducts.map(p => ({
      id: p.productId,
      name: p.name,
      image: p.image,
      price: p.price,
      isOrdered: true,
      lastOrderDate: p.lastOrderDate,
    }));

    let sorted = [...productsToSort];
    if (sortBy === 'price-low') {
      sorted.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-high') {
      sorted.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'recent') {
      sorted.sort((a, b) => b.lastOrderDate.getTime() - a.lastOrderDate.getTime());
    }
    
    setAllProducts(sorted);
  }, [orderedProducts, sortBy]);

  // Filter products by search query
  const displayedProducts = searchQuery.trim()
    ? allProducts.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : allProducts;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900">
      <div className="hidden lg:block">
        <Header />
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden bg-white dark:bg-zinc-900 sticky top-0 z-40 shadow-sm">
        {showSearch ? (
          /* Search Bar Mode */
          <div className="flex items-center gap-2 px-4 py-3">
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
              className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 relative">
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-3 pr-8 py-2 text-sm border border-gray-300 dark:border-zinc-700 rounded-full outline-none focus:border-blue-500 bg-gray-50 dark:bg-zinc-900"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
                >
                  <X className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Normal Header */
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3 flex-1">
              <button
                onClick={() => navigate(-1)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">Buy Again</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSearch(true)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
              >
                <Search className="w-5 h-5 text-gray-600 dark:text-zinc-400" />
              </button>
              <button
                onClick={() => navigate('/cart')}
                className="relative p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
              >
                <ShoppingBag className="w-5 h-5 text-gray-600 dark:text-zinc-400" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Sort Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 relative">
          <span className="text-sm text-gray-600 dark:text-zinc-400">
            {displayedProducts.length} Items
          </span>
          <div className="relative">
            <button 
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              className="flex items-center gap-1 text-sm text-gray-700 dark:text-zinc-300"
            >
              Sort By
              <ChevronDown className={`w-4 h-4 transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Sort Dropdown */}
            {showSortDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-lg z-50 overflow-hidden">
                <button
                  onClick={() => { setSortBy('recent'); setShowSortDropdown(false); }}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors ${sortBy === 'recent' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  Recently Ordered
                </button>
                <button
                  onClick={() => { setSortBy('price-low'); setShowSortDropdown(false); }}
                  className={`w-full text-left px-4 py-3 text-sm border-t border-gray-100 transition-colors ${sortBy === 'price-low' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  Price - Low to High
                </button>
                <button
                  onClick={() => { setSortBy('price-high'); setShowSortDropdown(false); }}
                  className={`w-full text-left px-4 py-3 text-sm border-t border-gray-100 transition-colors ${sortBy === 'price-high' ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  Price - High to Low
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 pb-24 lg:py-8 lg:pb-8">
        {/* Desktop Back Button & Title */}
        <div className="hidden lg:flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-zinc-100">Buy Again</h1>
        </div>

        {/* All Products Grid */}
        {allProducts.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            {displayedProducts.map((product, index) => (
              <motion.div
                key={product.id || index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.02 }}
                className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm overflow-hidden border border-gray-200 dark:border-zinc-800 hover:shadow-md transition-shadow"
              >
                {/* Product Image */}
                <div 
                  className="aspect-[3/4] relative overflow-hidden bg-gray-100 dark:bg-zinc-800 cursor-pointer"
                  onClick={() => navigate(`/product/${product.id}`)}
                >
                  <SmartImage
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" preset="card" />
                  {product.isOrdered && (
                    <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded">
                      ORDERED
                    </div>
                  )}
                </div>
                
                {/* Product Info */}
                <div className="p-3">
                  <p className="text-xs font-bold text-gray-900 dark:text-zinc-100 mb-1">
                    ₹{product.price?.toFixed(0)}
                  </p>
                  <h3 
                    className="text-[11px] text-gray-600 dark:text-zinc-400 line-clamp-1 mb-3 leading-tight cursor-pointer"
                    onClick={() => navigate(`/product/${product.id}`)}
                  >
                    {product.name}
                  </h3>
                  
                  {/* Add to Bag Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      addToCart({
                        id: product.id,
                        name: product.name,
                        price: product.price,
                        image: product.image,
                        category: product.category,
                      });
                    }}
                    className="w-full py-2 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                  >
                    ORDER AGAIN
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-sm p-8 lg:p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-2">
              No Previous Orders
            </h3>
            <p className="text-gray-600 dark:text-zinc-400 mb-6">
              You haven't placed any orders yet. Start shopping to see your order history here!
            </p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors"
            >
              Start Shopping
            </button>
          </div>
        )}

        {/* You May Also Like Section - Horizontal Scroll */}
        {suggestedProducts.length > 0 && (
          <section className="mt-8">
            <h2 className="text-base lg:text-xl font-semibold text-gray-900 dark:text-zinc-100 mb-3">
              You May Also Like
            </h2>

            <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
              {suggestedProducts.map((product, index) => (
                <motion.div
                  key={`suggest-${product.id || index}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex-shrink-0 w-32 lg:w-40 bg-white dark:bg-zinc-900 rounded-lg shadow-sm overflow-hidden border border-gray-200 dark:border-zinc-800 hover:shadow-md transition-shadow cursor-pointer group"
                  onClick={() => navigate(`/product/${product.id}`)}
                >
                  <div className="aspect-square relative overflow-hidden bg-gray-100 dark:bg-zinc-800">
                    <SmartImage
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" preset="card" />
                    {/* Wishlist Heart Icon */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWishlist(product.id, product.name);
                      }}
                      className="absolute top-2 right-2 p-1 bg-white/90 dark:bg-zinc-900/90 hover:bg-white rounded-full shadow transition-colors"
                    >
                      <Heart className={`w-4 h-4 ${isInWishlist(product.id) ? 'fill-red-500 text-red-500' : 'text-gray-600'}`} />
                    </button>
                  </div>
                  <div className="p-2">
                    <h3 className="text-xs lg:text-sm font-medium text-gray-900 dark:text-zinc-100 line-clamp-1 mb-2 leading-tight">
                      {product.name}
                    </h3>
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm lg:text-base font-bold text-gray-900 dark:text-zinc-100">
                        ₹{product.price?.toFixed(0)}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart({
                            id: product.id,
                            name: product.name,
                            price: product.price,
                            image: product.image,
                            category: product.category,
                          });
                        }}
                        className="p-1 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors"
                      >
                        <ShoppingCart className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="hidden lg:block">
        <Footer />
      </div>
    </div>
  );
};

export default BuyAgain;
