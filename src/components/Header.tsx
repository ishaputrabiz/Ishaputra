import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Search, Heart, ShoppingBag, User, Gift } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { getActiveProductsCached, useCatalogRevision } from "@/services/productCache";
import { UIProduct, adaptFirebaseToUI } from "@/lib/productAdapter";
import MobileHeader from "./MobileHeader";
import OfferRibbon from "./offers/OfferRibbon";
import ThemeToggle from "./ThemeToggle";
import SilverRateWidget from "./SilverRateWidget";
import { SmartImage } from "@/components/ui/smart-image";

const Header = () => {
  /** Changes when an admin publishes; re-reads the catalog below. */
  const catalogRevision = useCatalogRevision();

  const lightModeLogo = "/black_logo.png";
  const darkModeLogo = "/white_logo.png";
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile } = useAuth();
  const { resolvedTheme } = useTheme();
  const { totalItems, toggleCart } = useCart();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UIProduct[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [allProducts, setAllProducts] = useState<UIProduct[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);

  // Check if current page is an auth page
  const isAuthPage = location.pathname.startsWith('/signup') || 
                     location.pathname.startsWith('/forgot-password') ||
                     location.pathname.startsWith('/admin');

  // Load all products for search
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const products = await getActiveProductsCached();
        const uiProducts = products.map((p) => adaptFirebaseToUI(p));
        setAllProducts(uiProducts);
      } catch (error) {
        console.error('Error loading products:', error);
      }
    };
    loadProducts();
      // Re-runs when an admin publishes a new catalog, so a price change
      // reaches this screen without the visitor reloading it.
  }, [catalogRevision]);

  // Handle click outside search results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search functionality
  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = allProducts.filter(product => 
      product.title.toLowerCase().includes(query) ||
      product.category?.toLowerCase().includes(query) ||
      product.alt?.toLowerCase().includes(query)
    ).slice(0, 8); // Limit to 8 results

    setSearchResults(filtered);
    setShowSearchResults(true);
  }, [searchQuery, allProducts]);

  // Handle scroll - properly in useEffect with cleanup
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const goToSearchResults = () => {
    const query = searchQuery.trim();
    if (!query) return;
    navigate(`/search-results?q=${encodeURIComponent(query)}`);
    setShowSearchResults(false);
  };

  const navItems = [
    { name: "Contact", href: "/contact" },
  ];

  return (
    <>
      {/* Offers the admin marked "Show in offer banner". Sits above both headers
          and scrolls away with the page, so it never eats space once browsing. */}
      {!isAuthPage && <OfferRibbon />}

      {/* Mobile Header - Only on Mobile, hidden on auth pages */}
      {!isAuthPage && <MobileHeader />}

      {/* Main Header */}
      <header
        className={`hidden lg:block sticky top-0 z-50 transition-all duration-500 ${
          isScrolled
            ? "bg-background/98 backdrop-blur-xl shadow-[0_1px_0_rgba(0,0,0,0.06)] dark:shadow-[0_1px_0_rgba(255,255,255,0.06)]"
            : "bg-background"
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-8 lg:px-12">
          <div className="flex items-center justify-between gap-8 h-[68px]">
            {/* Logo */}
            <a href="/" className="flex items-center flex-shrink-0">
              <img src={resolvedTheme === 'dark' ? darkModeLogo : lightModeLogo} alt="Sreerasthu Silvers" className="h-8 lg:h-10 w-auto" />
            </a>

            {/* Search Bar - Premium Style */}
            <div className="flex-1 max-w-[560px] mx-8" ref={searchRef}>
              <div className="relative">
                <div className="relative flex items-center">
                  <div className="absolute left-4">
                    <Search className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={1.8} />
                  </div>
                  <input
                    type="text"
                    placeholder="Search for silver jewelry, furniture and more"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => searchQuery && setShowSearchResults(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') goToSearchResults();
                    }}
                    className="w-full pl-11 pr-14 py-2.5 bg-muted text-[13px] rounded-full border-none focus:outline-none focus:ring-1 focus:ring-border focus:bg-background transition-all placeholder:text-muted-foreground font-light"
                  />

                  <div className="absolute right-3 flex items-center gap-2">
                    <button 
                      onClick={() => navigate('/category/articles?sub=gifting')}
                      className="p-1 hover:bg-muted rounded-full transition-colors" 
                      aria-label="Gift articles"
                    >
                      <Gift className="w-[19px] h-[19px] text-foreground/80" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                {/* Search Results Dropdown */}
                <AnimatePresence>
                  {showSearchResults && searchResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-card rounded-lg shadow-2xl border border-border max-h-[400px] overflow-y-auto z-50"
                    >
                      <div className="p-2">
                        {searchResults.map((product) => (
                          <button
                            key={product.id}
                            onClick={() => {
                              navigate(`/product/${product.id}`);
                              setSearchQuery("");
                              setShowSearchResults(false);
                            }}
                            className="flex items-center gap-3 p-2 hover:bg-muted rounded-lg w-full text-left transition-colors"
                          >
                            <div className="w-12 h-12 flex-shrink-0 bg-muted rounded overflow-hidden">
                              {product.image ? (
                                <SmartImage
                                  src={product.image}
                                  alt={product.title}
                                  className="w-full h-full object-cover" preset="card" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ShoppingBag className="w-6 h-6 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">
                                {product.title}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {product.category}
                              </p>
                              <p className="text-sm font-semibold text-primary mt-0.5">
                                ₹{product.price.toLocaleString()}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                      {searchResults.length === 8 && (
                        <div className="border-t border-border p-3 text-center">
                          <button
                            onClick={goToSearchResults}
                            className="text-sm text-primary hover:text-primary/80 font-medium"
                          >
                            View all results for "{searchQuery}"
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* No Results Message */}
                <AnimatePresence>
                  {showSearchResults && searchQuery && searchResults.length === 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-card rounded-lg shadow-2xl border border-border z-50"
                    >
                      <div className="p-6 text-center">
                        <p className="text-muted-foreground">No products found for "{searchQuery}"</p>
                        <p className="text-sm text-muted-foreground/70 mt-1">Try searching with different keywords</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-5 flex-shrink-0">
              {/* Live silver rate */}
              <SilverRateWidget variant="icon" />

              {/* Theme Toggle */}
              <ThemeToggle />

              {/* Wishlist */}
              <button 
                onClick={() => navigate("/wishlist")}
                className="p-2 hover:bg-muted rounded-full transition-all duration-200 group relative"
                aria-label="Wishlist"
              >
                <Heart className="w-[20px] h-[20px] text-foreground/80 group-hover:text-primary transition-colors" strokeWidth={1.5} />
              </button>

              {/* User Profile */}
              <button 
                onClick={() => navigate(user ? "/account" : "/account")}
                className="p-2 hover:bg-muted rounded-full transition-all duration-200 group"
                aria-label="Account"
              >
                {user ? (
                  userProfile?.avatar || user.photoURL ? (
                    <SmartImage 
                      key={userProfile?.avatar || user.photoURL}
                      src={userProfile?.avatar || user.photoURL} 
                      alt="Profile" 
                      className="w-[22px] h-[22px] rounded-full object-cover ring-1 ring-border"
                      referrerPolicy="no-referrer" preset="thumb" />
                  ) : (
                    <div className="w-[22px] h-[22px] rounded-full bg-[#832729] flex items-center justify-center">
                      <span className="text-white font-semibold text-[9px]">
                        {(userProfile?.name || userProfile?.username || 'U').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )
                ) : (
                  <User className="w-[20px] h-[20px] text-foreground/80 group-hover:text-primary transition-colors" strokeWidth={1.5} />
                )}
              </button>

              {/* Cart with Badge */}
              <button 
                onClick={toggleCart}
                className="p-2 hover:bg-muted rounded-full transition-all duration-200 relative group" 
                aria-label="Cart"
              >
                <div className="relative">
                  <ShoppingBag className="w-[20px] h-[20px] text-foreground/80 group-hover:text-primary transition-colors" strokeWidth={1.5} />
                  {user && totalItems > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-[#832729] text-white text-[9px] rounded-full flex items-center justify-center font-bold px-1 shadow-sm">
                      {totalItems}
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Hamburger Menu - Works on All Screen Sizes */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute right-4 top-full mt-2 bg-card border border-border rounded-lg shadow-xl z-50 min-w-[180px] overflow-hidden"
            >
              <nav className="py-2">
                <a
                  href="/contact"
                  className="block px-4 py-3 text-base font-medium text-foreground hover:bg-muted transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Contact
                </a>
                {user && (
                  <a
                    href="/my-video-calls"
                    className="block px-4 py-3 text-base font-medium text-foreground hover:bg-muted transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    My Video Calls
                  </a>
                )}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
};

export default Header;
