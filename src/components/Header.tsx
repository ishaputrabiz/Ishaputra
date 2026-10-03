import { useState, useRef, useEffect, useId } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Heart, ShoppingBag, User } from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "@/contexts/ThemeContext";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { getActiveProductsCached, useCatalogRevision } from "@/services/productCache";
import { UIProduct, adaptFirebaseToUI } from "@/lib/productAdapter";
import MobileHeader, { SkipLink } from "./MobileHeader";
import OfferRibbon from "./offers/OfferRibbon";
import ThemeToggle from "./ThemeToggle";
import SilverRateWidget from "./SilverRateWidget";
import LoyaltyPointsButton from "./LoyaltyPointsButton";
import { SILVER_PRICING_ENABLED } from "@/config/features";
import { SmartImage } from "@/components/ui/smart-image";
import { IconButton } from "@/components/ui/icon-button";
import { formatINR, plural } from "@/lib/format";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

const MAX_RESULTS = 8;

/** Dropdown: grows out of the field, exits faster than it enters. */
const panelMotion = {
  initial: { opacity: 0, transform: "translateY(-4px) scale(0.98)" },
  animate: { opacity: 1, transform: "translateY(0px) scale(1)", transition: { duration: 0.18, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } },
};

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
  const [isScrolled, setIsScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UIProduct[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [allProducts, setAllProducts] = useState<UIProduct[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;

  // Check if current page is an auth page
  // Every storefront page, the auth pages included, shows the site chrome; only admin hides it.
  const isAuthPage = location.pathname.startsWith('/admin');

  const onWishlist = location.pathname.startsWith("/wishlist");
  const onAccount = location.pathname.startsWith("/account");
  const showBadge = !!user && totalItems > 0;

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
    setActiveIndex(-1);
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
    ).slice(0, MAX_RESULTS);

    setSearchResults(filtered);
    setShowSearchResults(true);
  }, [searchQuery, allProducts]);

  // Background and hairline once the page scrolls; passive, and only re-renders when it flips.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const next = window.scrollY > 50;
      setIsScrolled((prev) => (prev === next ? prev : next));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const goToSearchResults = () => {
    const query = searchQuery.trim();
    if (!query) return;
    navigate(`/search-results?q=${encodeURIComponent(query)}`);
    setShowSearchResults(false);
  };

  const openProduct = (product: UIProduct) => {
    navigate(`/product/${product.id}`);
    setSearchQuery("");
    setShowSearchResults(false);
  };

  const panelOpen = showSearchResults && searchQuery.trim().length > 0;
  const listOpen = panelOpen && searchResults.length > 0;

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown": {
        if (!searchResults.length) return;
        e.preventDefault();
        if (!showSearchResults) setShowSearchResults(true);
        setActiveIndex((i) => (i + 1) % searchResults.length);
        break;
      }
      case "ArrowUp": {
        if (!searchResults.length) return;
        e.preventDefault();
        if (!showSearchResults) setShowSearchResults(true);
        setActiveIndex((i) => (i <= 0 ? searchResults.length - 1 : i - 1));
        break;
      }
      case "Enter": {
        if (listOpen && activeIndex >= 0 && searchResults[activeIndex]) {
          e.preventDefault();
          openProduct(searchResults[activeIndex]);
        } else {
          goToSearchResults();
        }
        break;
      }
      case "Escape": {
        // First Escape closes the list; a second one clears the field (native search behaviour).
        if (panelOpen) {
          e.preventDefault();
          setShowSearchResults(false);
          setActiveIndex(-1);
        }
        break;
      }
    }
  };

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  return (
    <>
      <SkipLink />

      {/* Offers the admin marked "Show in offer banner". Sits above both headers
          and scrolls away with the page, so it never eats space once browsing. */}
      {!isAuthPage && <OfferRibbon />}

      {/* Mobile Header - Only on Mobile, hidden on auth pages */}
      {!isAuthPage && <MobileHeader skipLink={false} />}

      {/* Main Header */}
      <header
        className={cn(
          "hidden lg:block sticky top-0 z-header transition-[background-color,box-shadow] duration-hover ease-out",
          isScrolled
            ? "bg-background/95 backdrop-blur-xl shadow-[0_1px_0_hsl(var(--foreground)/0.07)]"
            : "bg-background",
        )}
      >
        <div className="max-w-[1440px] mx-auto px-8 lg:px-12">
          <div className="flex items-center justify-between gap-8 h-[68px]">
            {/* Logo */}
            <Link to="/" aria-label="Ishaputra Botanicals home" className="flex items-center flex-shrink-0 rounded-control">
              <img
                src={resolvedTheme === 'dark' ? darkModeLogo : lightModeLogo}
                alt=""
                width={137}
                height={40}
                decoding="async"
                className="h-10 w-auto"
              />
            </Link>

            {/* Search */}
            <div className="flex-1 max-w-[560px] mx-8" ref={searchRef}>
              <div className="relative">
                <div className="relative flex items-center">
                  <Search
                    aria-hidden="true"
                    className="pointer-events-none absolute left-4 size-[18px] text-muted-foreground"
                  />
                  <input
                    type="search"
                    role="combobox"
                    aria-label="Search products"
                    aria-expanded={listOpen}
                    aria-controls={listOpen ? listId : undefined}
                    aria-autocomplete="list"
                    aria-activedescendant={listOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
                    enterKeyHint="search"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Search shilajit, hair oil, face wash and more"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => searchQuery && setShowSearchResults(true)}
                    onKeyDown={handleSearchKeyDown}
                    className="h-10 w-full rounded-control border border-transparent bg-muted pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground transition-[background-color,border-color,box-shadow] duration-hover ease-out hover:border-input/60 focus-visible:border-ring focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
                  />
                </div>

                <AnimatePresence>
                  {panelOpen && (
                    <motion.div
                      key="search-panel"
                      {...panelMotion}
                      style={{ transformOrigin: "top center" }}
                      className="tx-sheet absolute left-0 right-0 top-full z-popover mt-2 overflow-hidden rounded-card border border-foreground/10 shadow-panel"
                    >
                      {searchResults.length > 0 ? (
                        <>
                          <ul
                            id={listId}
                            role="listbox"
                            aria-label="Matching products"
                            className="max-h-[400px] overflow-y-auto overscroll-contain p-1.5"
                          >
                            {searchResults.map((product, i) => {
                              const active = i === activeIndex;
                              return (
                                <li
                                  key={product.id}
                                  id={optionId(i)}
                                  role="option"
                                  aria-selected={active}
                                  onMouseDown={(e) => e.preventDefault()}
                                  onMouseMove={() => active || setActiveIndex(i)}
                                  onClick={() => openProduct(product)}
                                  className={cn(
                                    "flex cursor-pointer items-center gap-3 rounded-control p-2 transition-colors duration-hover",
                                    active ? "bg-accent text-accent-foreground" : "text-foreground",
                                  )}
                                >
                                  <div className="size-12 flex-shrink-0 overflow-hidden rounded-chip bg-muted">
                                    {product.image ? (
                                      <SmartImage src={product.image} alt="" className="h-full w-full object-cover" preset="card" />
                                    ) : (
                                      <div className="grid h-full w-full place-items-center">
                                        <ShoppingBag aria-hidden="true" className="size-5 text-muted-foreground" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{product.title}</p>
                                    {product.category && (
                                      <p className="truncate text-xs text-muted-foreground">{product.category}</p>
                                    )}
                                  </div>
                                  <p className="shrink-0 pl-2 text-sm font-semibold tabular-nums text-foreground">
                                    {formatINR(product.price)}
                                  </p>
                                </li>
                              );
                            })}
                          </ul>
                          {searchResults.length === MAX_RESULTS && (
                            <div className="border-t border-foreground/[0.08] p-1.5">
                              <button
                                type="button"
                                onClick={goToSearchResults}
                                className="focus-inset flex h-10 w-full items-center justify-center rounded-control text-sm font-medium text-primary transition-colors duration-hover hover:bg-accent"
                              >
                                View all results for “{searchQuery.trim()}”
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <div role="status" className="px-6 py-7 text-center">
                          <p className="text-sm font-medium text-foreground">No products match “{searchQuery.trim()}”</p>
                          <p className="mt-1 text-sm text-muted-foreground">Try a shorter word, like shilajit or oil.</p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Live silver rate (metal stores) or loyalty points */}
              {SILVER_PRICING_ENABLED ? <SilverRateWidget variant="icon" /> : <LoyaltyPointsButton />}

              <ThemeToggle />

              <IconButton
                label="Wishlist"
                tooltip
                onClick={() => navigate("/wishlist")}
                aria-current={onWishlist ? "page" : undefined}
                className={cn("hover:text-primary", onWishlist && "text-primary")}
              >
                <Heart aria-hidden="true" />
              </IconButton>

              <IconButton
                label="Account"
                tooltip
                onClick={() => navigate("/account")}
                aria-current={onAccount ? "page" : undefined}
                className={cn("hover:text-primary", onAccount && "text-primary")}
              >
                {user ? (
                  userProfile?.avatar || user.photoURL ? (
                    <SmartImage
                      key={userProfile?.avatar || user.photoURL}
                      src={userProfile?.avatar || user.photoURL}
                      alt=""
                      className={cn(
                        "size-[22px] rounded-full object-cover ring-1",
                        onAccount ? "ring-primary" : "ring-border",
                      )}
                      referrerPolicy="no-referrer" preset="thumb" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-[22px] place-items-center rounded-full bg-primary text-[10px] font-semibold leading-none text-primary-foreground ring-2",
                        onAccount ? "ring-primary/30" : "ring-background",
                      )}
                    >
                      {(userProfile?.name || userProfile?.username || 'U').charAt(0).toUpperCase()}
                    </span>
                  )
                ) : (
                  <User aria-hidden="true" />
                )}
              </IconButton>

              <IconButton
                label={showBadge ? `Cart, ${plural(totalItems, "item")}` : "Cart"}
                tooltip="Cart"
                onClick={toggleCart}
                className="hover:text-primary"
              >
                <ShoppingBag aria-hidden="true" />
                {showBadge && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none tabular-nums text-primary-foreground ring-2 ring-background"
                  >
                    {totalItems}
                  </span>
                )}
              </IconButton>
            </div>
          </div>
        </div>
      </header>
    </>
  );
};

export default Header;
