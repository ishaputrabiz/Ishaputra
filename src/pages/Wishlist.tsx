import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, ShoppingBag, Trash2, ArrowLeft, Package, Search, SlidersHorizontal, ChevronRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MobileHeader from "@/components/MobileHeader";
import MobileBottomNav from "@/components/MobileBottomNav";
import MobileSearchBar from "@/components/MobileSearchBar";
import { Button } from "@/components/ui/button";
import { useWishlist } from "@/hooks/useWishlist";
import { getProduct } from "@/services/productService";
import { UIProduct, adaptFirebaseToUI } from "@/lib/productAdapter";
import { useAuth } from "@/contexts/AuthContext";
import { SmartImage } from "@/components/ui/smart-image";

const Wishlist = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { wishlist, removeFromWishlist, isLoaded } = useWishlist();
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const loadWishlistProducts = async () => {
      if (!isLoaded) return;
      
      setLoading(true);
      try {
        const productPromises = wishlist.map(id => getProduct(id));
        const fbProducts = await Promise.all(productPromises);
        const validProducts = fbProducts.filter(p => p !== null);
        const uiProducts = validProducts.map(p => adaptFirebaseToUI(p!));
        setProducts(uiProducts);
      } catch (error) {
        console.error('Error loading wishlist products:', error);
      } finally {
        setLoading(false);
      }
    };

    loadWishlistProducts();
  }, [wishlist, isLoaded]);

  const handleProductClick = (productId: string) => {
    navigate(`/product/${productId}`);
  };

  const handleRemove = (productId: string, productTitle: string) => {
    removeFromWishlist(productId, productTitle);
  };

  // Advanced search filter - searches across multiple fields
  const filteredProducts = products.filter(product => {
    if (!searchQuery || searchQuery.trim() === '') return true;
    
    const query = searchQuery.toLowerCase().trim();
    
    // Search in title
    if (product.title.toLowerCase().includes(query)) return true;
    
    // Search in category
    if (product.category && product.category.toLowerCase().includes(query)) return true;
    
    // Search in price (if user types numbers)
    if (product.price.toString().includes(query)) return true;
    
    // Search in old price
    if (product.oldPrice && product.oldPrice.toString().includes(query)) return true;
    
    return false;
  });

  if (loading || !isLoaded) {
    return (
      <>
        <div className="hidden lg:block">
          <Header />
        </div>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
        <div className="hidden lg:block">
          <Footer />
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop View */}
      <div className="hidden lg:block">
        <Header />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="min-h-screen"
        >
          {/* Hero Banner Section */}
          <section className="relative h-[200px] md:h-[280px] flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 z-0">
              <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/50 to-black/60 z-10" />
              <img 
                src="https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=1600&q=80" 
                alt="My Wishlist"
                className="w-full h-full object-cover"
              />
            </div>
            
            <div className="relative z-20 container mx-auto px-4 text-center">
              {/* Desktop Back Button */}
              <div className="absolute left-4 top-0 md:top-4">
                <button
                  onClick={() => navigate(-1)}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all duration-300 border border-white/20"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="text-sm font-medium">Back</span>
                </button>
              </div>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="mb-4">
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    My Wishlist
                  </h1>
                </div>
                <p className="text-white/90 text-lg md:text-xl mb-4" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  {products.length} {products.length === 1 ? 'item' : 'items'} saved for later
                </p>
                
                {/* Breadcrumb */}
                <div className="text-sm text-white/80 flex items-center justify-center gap-2">
                  <button onClick={() => navigate("/")} className="hover:text-white transition-colors">
                    Home
                  </button>
                  <span>/</span>
                  <span className="text-white">Wishlist</span>
                </div>
              </motion.div>
            </div>
          </section>

          {/* Content */}
          <div className="container mx-auto px-4 py-8 sm:py-12 bg-background">
            {!user ? (
              /* Not Logged In */
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-16 px-4"
              >
                <div className="w-32 h-32 bg-gradient-to-br from-red-50 to-pink-50 rounded-full flex items-center justify-center mb-6">
                  <Heart className="w-16 h-16 text-red-300" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mb-3">Login to View Wishlist</h2>
                <p className="text-gray-500 dark:text-zinc-500 dark:text-zinc-400 text-center mb-8 max-w-md">
                  Sign in to access your saved items and manage your wishlist.
                </p>
                <Button
                  onClick={() => navigate('/login')}
                  className="bg-gray-900 dark:bg-zinc-100 hover:bg-gray-800 dark:bg-zinc-100 text-white px-8 py-6 text-base rounded-lg"
                >
                  Login / Sign Up
                </Button>
              </motion.div>
            ) : products.length === 0 ? (
              // Empty State
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-12 sm:py-20"
              >
                <div className="relative mb-8">
                  <div className="w-48 h-48 sm:w-64 sm:h-64 flex items-center justify-center">
                    <div className="relative">
                      <div className="w-40 h-40 sm:w-52 sm:h-52 border-8 border-foreground/80 rounded-lg relative bg-background">
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-24 sm:w-32 h-12 sm:h-16 border-8 border-foreground/80 border-b-0 rounded-t-lg bg-background"></div>
                        <div className="absolute top-1/2 left-0 right-0 h-4 bg-foreground/20 -translate-y-1/2"></div>
                        <div className="absolute top-0 bottom-0 left-1/2 w-4 bg-foreground/20 -translate-x-1/2"></div>
                      </div>
                      <div className="absolute -right-12 bottom-4 w-10 h-10 border-4 border-foreground/60 rounded bg-background rotate-12"></div>
                      <div className="absolute -right-8 bottom-0 w-8 h-8 border-4 border-foreground/60 rounded bg-background -rotate-6"></div>
                    </div>
                  </div>
                </div>

                <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  My Wishlist is Empty!
                </h2>
                <p className="text-muted-foreground text-center mb-8 max-w-md">
                  {user 
                    ? "You haven't saved any items yet. Start adding your favorite jewellery to your wishlist!"
                    : "Please login to start saving your favorite items to your wishlist."
                  }
                </p>
                <div className="flex gap-4">
                  {!user && (
                    <Button
                      onClick={() => navigate("/auth/login")}
                      size="lg"
                      className="gap-2"
                    >
                      Login to Continue
                    </Button>
                  )}
                  <Button
                    onClick={() => navigate("/")}
                    variant={user ? "default" : "outline"}
                    size="lg"
                    className="gap-2"
                  >
                    <ShoppingBag className="w-5 h-5" />
                    Start Shopping
                  </Button>
                </div>
              </motion.div>
            ) : (
              // Product Grid
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <AnimatePresence mode="popLayout">
                  {products.map((product, index) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ delay: index * 0.05 }}
                      className="group bg-card rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 border border-border"
                    >
                      <div
                        className="relative aspect-square overflow-hidden cursor-pointer bg-muted"
                        onClick={() => handleProductClick(product.id)}
                      >
                        {product.image ? (
                          <SmartImage
                            src={product.image}
                            alt={product.title}
                            className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500" preset="card" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <ShoppingBag className="w-16 h-16 text-muted-foreground/30" />
                          </div>
                        )}
                        
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <Button
                            size="icon"
                            variant="destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemove(product.id, product.title);
                            }}
                            className="rounded-full shadow-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        {product.oldPrice && product.oldPrice > product.price && (
                          <div className="absolute top-3 left-3 bg-destructive text-destructive-foreground px-3 py-1 rounded-full text-sm font-semibold shadow-lg">
                            {Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)}% OFF
                          </div>
                        )}
                      </div>

                      <div className="p-4 space-y-3">
                        <div className="space-y-1">
                          <h3
                            className="font-normal text-foreground line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                            onClick={() => handleProductClick(product.id)}
                          >
                            {product.title}
                          </h3>
                          {product.category && (
                            <p className="text-sm text-muted-foreground">
                              {product.category}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xl font-normal text-primary">
                                ₹{product.price.toLocaleString()}
                              </span>
                              {product.oldPrice && product.oldPrice > product.price && (
                                <span className="text-sm text-muted-foreground line-through">
                                  ₹{product.oldPrice.toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>

                          <Button
                            size="icon"
                            variant="destructive"
                            onClick={() => handleRemove(product.id, product.title)}
                            className="rounded-full"
                          >
                            <Heart className="w-4 h-4" fill="currentColor" />
                          </Button>
                        </div>

                        <Button
                          onClick={() => handleProductClick(product.id)}
                          className="w-full gap-2"
                          variant="outline"
                        >
                          <ShoppingBag className="w-4 h-4" />
                          View Details
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
        <Footer />
      </div>

      {/* Mobile View */}
      <div className="lg:hidden min-h-screen bg-white dark:bg-zinc-900 pb-20 dark:bg-[linear-gradient(180deg,rgba(19,17,15,0.98)_0%,rgba(14,14,15,0.98)_100%)]">
        {/* Tanishq-style Header + Search */}
        <MobileHeader />
        <MobileSearchBar />

        {/* Breadcrumb */}
        <div className="px-4 py-4">
          <button
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                navigate('/');
              } else {
                navigate(-1);
              }
            }}
            className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#d4af37]/15 bg-white/85 px-3 py-2 text-xs font-medium text-gray-700 dark:text-zinc-300 shadow-sm backdrop-blur transition-colors hover:bg-white dark:border-[#d4af37]/20 dark:bg-zinc-900/85 dark:hover:bg-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <button onClick={() => navigate("/")} className="font-medium text-gray-900 dark:text-zinc-100 hover:underline">Home</button>
            <span className="text-gray-400 dark:text-zinc-500">|</span>
            <span className="text-xs text-gray-400 dark:text-zinc-500">Wishlist</span>
          </div>
        </div>

        {/* Wishlist Section Title */}
        <div className="px-4 mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>
            Wishlist
          </h2>
        </div>

        {/* Content */}
        <div className="px-4 pb-4">
          {!user ? (
            /* Not Logged In State */
            <div className="flex flex-col items-center justify-center py-10">
              {/* Heart Icon */}
              <div className="mb-6">
                <Heart className="w-16 h-16 text-pink-200" fill="#FBCFE8" strokeWidth={1} />
              </div>
              
              {/* Box illustration */}
              <div className="relative mb-8">
                <div className="w-48 h-40 bg-gray-100 dark:bg-zinc-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-zinc-700 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-3 bg-gray-300 rounded mx-auto mb-2" />
                    <div className="w-12 h-3 bg-gray-300 rounded mx-auto mb-4" />
                    <div className="flex justify-center gap-1">
                      <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-gray-400" />
                      <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-gray-400" />
                    </div>
                  </div>
                </div>
              </div>
              
              <p className="text-gray-500 dark:text-zinc-500 dark:text-zinc-400 text-sm text-center mb-6" style={{ fontFamily: "'Poppins', sans-serif" }}>
                Please login to view your wishlist
              </p>
              <Button
                onClick={() => navigate("/login")}
                size="sm"
                className="gap-2 bg-gray-900 dark:bg-zinc-100 hover:bg-gray-800 dark:bg-zinc-100 text-white rounded-lg"
              >
                Login / Sign Up
              </Button>
            </div>
          ) : filteredProducts.length === 0 ? (
            // Empty State - Tanishq Style
            <div className="flex flex-col items-center justify-center py-10">
              {/* Heart Icon */}
              <div className="mb-6">
                <Heart className="w-16 h-16 text-pink-200" fill="#FBCFE8" strokeWidth={1} />
              </div>
              
              {/* Box illustration */}
              <div className="relative mb-8">
                <div className="w-48 h-40 bg-gray-100 dark:bg-zinc-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-zinc-700 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-3 bg-gray-300 rounded mx-auto mb-2" />
                    <div className="w-12 h-3 bg-gray-300 rounded mx-auto mb-4" />
                    <div className="flex justify-center gap-1">
                      <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-gray-400" />
                      <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-gray-400" />
                    </div>
                  </div>
                </div>
              </div>
              
              <p className="text-gray-500 dark:text-zinc-500 dark:text-zinc-400 text-sm text-center mb-6" style={{ fontFamily: "'Poppins', sans-serif" }}>
                Your wishlist is empty. Start adding items you love!
              </p>
              <Button
                onClick={() => navigate("/")}
                size="sm"
                className="gap-2 bg-[#832729] hover:bg-[#6a1f21] text-white rounded-md"
              >
                <ShoppingBag className="w-4 h-4" />
                Start Shopping
              </Button>
            </div>
          ) : (
            // Product Grid - 2 columns
            <div className="grid grid-cols-2 gap-3">
              <AnimatePresence mode="popLayout">
                {filteredProducts.map((product, index) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: index * 0.03 }}
                    className="overflow-hidden rounded-lg border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/88"
                  >
                    {/* Product Image */}
                    <div
                      className="relative aspect-square overflow-hidden cursor-pointer bg-gray-50 dark:bg-zinc-900/50"
                      onClick={() => handleProductClick(product.id)}
                    >
                      {product.image ? (
                        <SmartImage
                          src={product.image}
                          alt={product.title}
                          className="w-full h-full object-cover" preset="card" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingBag className="w-12 h-12 text-gray-300" />
                        </div>
                      )}
                      
                      {/* Heart Icon - Top Right */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(product.id, product.title);
                        }}
                        className="absolute top-2 right-2 rounded-full bg-white/90 p-1.5 shadow-sm dark:bg-zinc-900/90"
                      >
                        <Heart className="w-4 h-4 text-red-500" fill="currentColor" />
                      </button>

                      {product.oldPrice && product.oldPrice > product.price && (
                        <div className="absolute top-2 left-2 bg-[#832729] text-white px-2 py-0.5 rounded text-[10px] font-semibold">
                          {Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)}% OFF
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="p-3">
                      <h3
                        className="mb-1 line-clamp-2 text-xs font-normal leading-relaxed text-gray-900 dark:text-zinc-100"
                        style={{ fontFamily: "'Poppins', sans-serif" }}
                        onClick={() => handleProductClick(product.id)}
                      >
                        {product.title}
                      </h3>
                      
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>
                          ₹{product.price.toLocaleString('en-IN')}
                        </span>
                        {product.oldPrice && product.oldPrice > product.price && (
                          <span className="text-[10px] text-gray-400 dark:text-zinc-500 line-through">
                            ₹{product.oldPrice.toLocaleString('en-IN')}
                          </span>
                        )}
                      </div>

                      {/* Add to Cart Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProductClick(product.id);
                        }}
                        className="w-full py-2 px-3 bg-[#832729] rounded text-xs font-medium text-white flex items-center justify-center gap-1.5 hover:bg-[#6a1f21] transition-colors"
                        style={{ fontFamily: "'Poppins', sans-serif" }}
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        Add to Cart
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
      <MobileBottomNav />
    </>
  );
};

export default Wishlist;