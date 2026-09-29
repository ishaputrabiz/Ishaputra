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
                src="https://res.cloudinary.com/dcoimqij/image/upload/f_auto,q_auto,w_1600/v1790515752/ishaputrabotanicals/demo/jsk5fcgynmfin5gfvlik.jpg" 
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
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white" style={{ fontFamily: "var(--font-body)" }}>
                    My Wishlist
                  </h1>
                </div>
                <p className="text-white/90 text-lg md:text-xl mb-4" style={{ fontFamily: "var(--font-body)" }}>
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
                <div className="w-32 h-32 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <Heart className="w-16 h-16 text-primary" strokeWidth={1.4} />
                </div>
                <h2 className="text-2xl font-semibold text-foreground mb-3" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>Log in to see your wishlist</h2>
                <p className="text-muted-foreground text-center mb-8 max-w-md">
                  Sign in to access your saved items and manage your wishlist.
                </p>
                <Button
                  onClick={() => navigate('/login')}
                  className="btn-copper h-auto px-8 py-4 text-[12px] font-bold rounded-[6px]"
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
                <div className="tx-slate mb-6 grid h-24 w-24 place-items-center rounded-[14px] shadow-[var(--shadow-panel)]">
                <Heart className="h-10 w-10 text-highlight-soft" strokeWidth={1.4} />
              </div>

                <h2 className="text-2xl sm:text-3xl font-semibold text-foreground mb-2" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
                  Your wishlist is empty
                </h2>
                <p className="text-muted-foreground text-center mb-8 max-w-md">
                  {user 
                    ? "You haven't saved any items yet. Start adding your favourite products to your wishlist!"
                    : "Please login to start saving your favorite items to your wishlist."
                  }
                </p>
                <div className="flex gap-4">
                  {!user && (
                    <Button
                      onClick={() => navigate("/auth/login")}
                      size="lg"
                      className="btn-copper gap-2 h-auto py-3.5 text-[11px] font-bold rounded-[6px]"
                    >
                      Login to Continue
                    </Button>
                  )}
                  <Button
                    onClick={() => navigate("/")}
                    variant={user ? "default" : "outline"}
                    size="lg"
                    className="btn-copper gap-2 h-auto py-3.5 text-[11px] font-bold rounded-[6px]"
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
                      className="group bg-card rounded-[var(--radius-card)] overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 border border-border"
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
      <div className="lg:hidden min-h-screen tx-paper pb-20 dark:bg-[linear-gradient(180deg,rgba(19,17,15,0.98)_0%,rgba(14,14,15,0.98)_100%)]">
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
            className="mb-3 inline-flex items-center gap-2 rounded-full border border-highlight/15 bg-white/85 px-3 py-2 text-xs font-medium text-foreground/80 shadow-sm backdrop-blur transition-colors hover:bg-card dark:border-highlight/20"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <button onClick={() => navigate("/")} className="font-medium text-foreground hover:underline">Home</button>
            <span className="text-muted-foreground/70">|</span>
            <span className="text-xs text-muted-foreground/70">Wishlist</span>
          </div>
        </div>

        {/* Wishlist Section Title */}
        <div className="px-4 mb-4">
          <h2 className="text-2xl font-semibold text-foreground" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
            Wishlist
          </h2>
        </div>

        {/* Content */}
        <div className="px-4 pb-4">
          {!user ? (
            /* Not Logged In State */
            <div className="flex flex-col items-center justify-center py-10">
              <div className="tx-slate mb-6 grid h-20 w-20 place-items-center rounded-[14px] shadow-[var(--shadow-panel)]">
                <Heart className="h-8 w-8 text-highlight-soft" strokeWidth={1.4} />
              </div>
              
              <p className="text-muted-foreground text-sm text-center mb-6" style={{ fontFamily: "var(--font-body)" }}>
                Please login to view your wishlist
              </p>
              <Button
                onClick={() => navigate("/login")}
                size="sm"
                className="btn-copper gap-2 h-auto py-3 text-[11px] font-bold rounded-[6px]"
              >
                Login / Sign Up
              </Button>
            </div>
          ) : filteredProducts.length === 0 ? (
            // Empty State
            <div className="flex flex-col items-center justify-center py-10">
              <div className="tx-slate mb-6 grid h-20 w-20 place-items-center rounded-[14px] shadow-[var(--shadow-panel)]">
                <Heart className="h-8 w-8 text-highlight-soft" strokeWidth={1.4} />
              </div>
              
              <p className="text-muted-foreground text-sm text-center mb-6" style={{ fontFamily: "var(--font-body)" }}>
                Your wishlist is empty. Start adding items you love!
              </p>
              <Button
                onClick={() => navigate("/")}
                size="sm"
                className="btn-copper gap-2 h-auto py-3 text-[11px] font-bold rounded-[6px]"
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
                    className="overflow-hidden rounded-lg border border-foreground/[0.06] bg-card shadow-sm"
                  >
                    {/* Product Image */}
                    <div
                      className="relative aspect-square overflow-hidden cursor-pointer bg-foreground/[0.03]"
                      onClick={() => handleProductClick(product.id)}
                    >
                      {product.image ? (
                        <SmartImage
                          src={product.image}
                          alt={product.title}
                          className="w-full h-full object-cover" preset="card" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingBag className="w-12 h-12 text-muted-foreground/40" />
                        </div>
                      )}
                      
                      {/* Heart Icon - Top Right */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(product.id, product.title);
                        }}
                        className="absolute top-2 right-2 rounded-full bg-white/90 p-1.5 shadow-sm"
                      >
                        <Heart className="w-4 h-4 text-red-500" fill="currentColor" />
                      </button>

                      {product.oldPrice && product.oldPrice > product.price && (
                        <div className="absolute top-2 left-2 bg-primary text-white px-2 py-0.5 rounded text-[10px] font-semibold">
                          {Math.round(((product.oldPrice - product.price) / product.oldPrice) * 100)}% OFF
                        </div>
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="p-3">
                      <h3
                        className="mb-1 line-clamp-2 text-xs font-normal leading-relaxed text-foreground"
                        style={{ fontFamily: "var(--font-body)" }}
                        onClick={() => handleProductClick(product.id)}
                      >
                        {product.title}
                      </h3>
                      
                      <div className="flex items-center gap-1.5 mb-2.5">
                        <span className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                          ₹{product.price.toLocaleString('en-IN')}
                        </span>
                        {product.oldPrice && product.oldPrice > product.price && (
                          <span className="text-[10px] text-muted-foreground/70 line-through">
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
                        className="w-full py-2 px-3 bg-primary rounded text-xs font-medium text-white flex items-center justify-center gap-1.5 hover:bg-primary-dark transition-colors"
                        style={{ fontFamily: "var(--font-body)" }}
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