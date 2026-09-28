import { useState, useEffect, useMemo, useRef, memo } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  SlidersHorizontal,
  X,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  PanelLeftClose,
  PanelLeft,
  Loader2,
  Heart,
  Star,
  ShoppingBag,
  ArrowLeft,
  Home,
} from "lucide-react";
import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CategoryIconNav from "@/components/CategoryIconNav";
import MobileBottomNav from "@/components/MobileBottomNav";
import ProductPagination from "@/components/ProductPagination";
import { subscribeToActiveProducts } from "@/services/productCache";
import { UIProduct, adaptFirebaseArrayToUI } from "@/lib/productAdapter";
import { matchesTaxon } from "@/lib/taxonomy";
import {
  subscribeToCategories,
  seedDefaultCategories,
  Category,
} from "@/services/categoryService";
import { useCart } from "@/contexts/CartContext";
import { useWishlist } from "@/hooks/useWishlist";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { useSilverRate, computeSilverOriginalPrice } from "@/contexts/SilverRateContext";
import { SmartImage } from "@/components/ui/smart-image";
import { BRAND } from "@/config/brand";

// ─── helpers ──────────────────────────────────────────
const priceRanges = BRAND.priceRanges;

const sortOptions = [
  { value: "recent", label: "Newest First" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A-Z" },
];

// ─── Stable product card ────────────────────────────────────────
// IMPORTANT: this component is declared OUTSIDE `CategoryPage` so its
// component identity is stable across re-renders. When it lived inline inside
// `CategoryPage`, every filter toggle re-created the function (a brand-new
// React component type), forcing React to unmount and remount every visible
// card. That remount replayed the framer-motion enter animation, producing
// the visible "flash"/loading effect users were complaining about. Lifting it
// out + memoizing it keeps cards mounted across filter changes — the grid
// just reorders/diffs by product id.
type CategoryProductCardProps = {
  product: UIProduct;
  wishlisted: boolean;
  onAddToCart: (product: UIProduct) => void;
  onToggleWishlist: (product: UIProduct, wishlisted: boolean) => void;
  onOpen: (productId: string) => void;
};

const CategoryProductCard = memo(function CategoryProductCard({
  product,
  wishlisted,
  onAddToCart,
  onToggleWishlist,
  onOpen,
}: CategoryProductCardProps) {
  const { ratePerGram } = useSilverRate();
  const sp = product.silverPricing;
  const displayPrice = sp?.enabled && ratePerGram > 0
    ? computeSilverOriginalPrice(sp, ratePerGram)
    : product.price;
  const displayDiscount = !sp?.enabled && (product.discount ?? 0) > 0 ? (product.discount ?? 0) : null;
  const displayOldPrice = !sp?.enabled && displayDiscount
    ? (product.oldPrice ?? null)
    : null;
  return (
    <div className="card-product group overflow-hidden p-1.5 sm:p-2 flex flex-col">
      {/* Image */}
      <div
        className="tile-img relative aspect-square overflow-hidden cursor-pointer"
        onClick={() => onOpen(product.id)}
      >
        <SmartImage
          src={product.image}
          alt={product.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" preset="card" />
        {product.badge && (
          <span className="tag-dark absolute top-2 left-2">
            {product.badge}
          </span>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist(product, wishlisted);
          }}
          className="absolute top-2 right-2 z-10 w-8 h-8 bg-card/90 backdrop-blur-sm rounded-full flex items-center justify-center border border-foreground/10 hover:border-primary/40 transition-colors"
        >
          <Heart
            className={`w-3.5 h-3.5 ${wishlisted ? "fill-red-500 text-red-500" : "text-foreground/70"}`}
          />
        </button>
      </div>

      {/* Info */}
      <div className="px-1.5 pt-3 pb-1 space-y-1.5 flex flex-col flex-1">
        <h3
          className="text-[13px] sm:text-sm font-semibold text-foreground line-clamp-1 cursor-pointer hover:text-primary transition-colors"
          onClick={() => onOpen(product.id)}
        >
          {product.title}
        </h3>
        <div className="flex items-center gap-1">
          {product.reviews > 0 ? (
            <>
              <span className="text-xs font-semibold text-highlight">{product.rating.toFixed(1)}</span>
              {[...Array(5)].map((_, i) => (
                <Star key={i} className={`w-3 h-3 ${
                  i < Math.floor(product.rating) ? "fill-highlight-soft text-highlight-soft"
                  : i < product.rating ? "fill-charcoal-foreground text-highlight-soft"
                  : "fill-foreground/10 text-foreground/20"
                }`} />
              ))}
              <span className="text-xs text-muted-foreground">({product.reviews})</span>
            </>
          ) : (
            <>
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-3 h-3 fill-foreground/10 text-foreground/20" />
              ))}
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-3">
          <span className="price-now text-[15px]">
            ₹{displayPrice.toLocaleString("en-IN")}
          </span>
          {displayOldPrice && displayOldPrice > product.price && (
            <span className="price-was text-xs">
              ₹{displayOldPrice.toLocaleString("en-IN")}
            </span>
          )}
          {displayDiscount && (
            <span className="chip-off">
              {displayDiscount}% off
            </span>
          )}
        </div>
        <button
          onClick={() => onAddToCart(product)}
          className="w-full !mt-auto py-2.5 rounded-[6px] border border-foreground/15 text-[10px] font-bold uppercase tracking-[0.18em] text-foreground hover:bg-primary hover:border-primary hover:text-primary-foreground transition-colors"
        >
          Add to cart
        </button>
      </div>
    </div>
  );
});

// ─── Component ────────────────────────────────────────
const CategoryPage = () => {
  const { categorySlug } = useParams<{ categorySlug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { toast } = useToast();

  // Data
  const [allProducts, setAllProducts] = useState<UIProduct[]>([]);
  /**
   * True when this category's products were found by subcategory rather than by
   * category (see the products effect below). The sidebar then filters on the
   * level underneath - a product's sub-subcategory - because that is where the
   * detail lives for these categories.
   */
  const [subcategoryFallback, setSubcategoryFallback] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters from URL
  const activeSub = searchParams.get("sub") || "";
  const activeSubSub = searchParams.get("subsub") || "";
  const activePriceIdx = searchParams.get("price") || "";
  const activeSortBy = searchParams.get("sort") || "recent";
  const activeTag = searchParams.get("tag") || "";

  // Map known tag slugs to their Firestore flag + display label.
  const TAG_MAP: Record<string, { flag: string; label: string }> = {
    'top-deals': { flag: 'isTopDeal', label: 'Top Deals' },
    'best-sellers': { flag: 'isBestSeller', label: 'Best Sellers' },
    'new-arrivals': { flag: 'isNewArrival', label: 'New Arrivals' },
    'trending': { flag: 'isTrendProduct', label: 'Trending Now' },
    'featured': { flag: 'isFeatured', label: 'Featured Products' },
  };
  const tagMeta = activeTag ? TAG_MAP[activeTag] : undefined;
  /** Bare /products (no category, no tag): the whole catalogue. "Shop all" links land here. */
  const showAll = !categorySlug && !activeTag;

  // UI
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  // Desktop sidebar collapse — persisted per user
  const [desktopFiltersCollapsed, setDesktopFiltersCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('categoryFiltersCollapsed') === '1';
  });
  useEffect(() => {
    localStorage.setItem('categoryFiltersCollapsed', desktopFiltersCollapsed ? '1' : '0');
  }, [desktopFiltersCollapsed]);

  // Seed + subscribe to categories
  useEffect(() => {
    seedDefaultCategories().catch(console.error);
    const unsub = subscribeToCategories((cats) => {
      setCategories(cats);
      // If Firestore returned empty (new DB or permission error), stop loading
      if (cats.length === 0) {
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  // Current category object
  const currentCategory = useMemo(
    () => categories.find((c) => c.slug === categorySlug),
    [categories, categorySlug]
  );

  // NOTE: products are loaded by the single effect further down, which produces
  // the same `allProducts` but also carries subcategory/subSubcategory. A second
  // loader used to live here and was immediately overwritten by that one, so
  // every category view paid twice for the catalog. Removed.

  // Taxonomy options for the active category, used to reconcile products that
  // stored a subcategory *name* against filters that address it by *slug*.
  const subOptions = useMemo(
    () => currentCategory?.subcategories ?? [],
    [currentCategory],
  );
  const subSubOptions = useMemo(
    () => subOptions.find((s) => s.slug === activeSub)?.children ?? [],
    [subOptions, activeSub],
  );

  /**
   * How many products sit under each subcategory (and sub-subcategory) of the
   * category on screen.
   *
   * Used to hide taxonomy the catalogue does not actually use. The category
   * documents accumulated subcategories over time (and merging the duplicated
   * seed added a few more), so the sidebar listed filters that could only ever
   * return "Products Coming Soon".
   */
  const subCounts = useMemo(() => {
    const counts = new Map<string, number>();
    const childCounts = new Map<string, number>();

    for (const sub of subOptions) {
      const inSub = allProducts.filter((p) =>
        matchesTaxon(
          subcategoryFallback ? (p as any).subSubcategory : (p as any).subcategory,
          sub.slug,
          subOptions,
        ),
      );
      counts.set(sub.slug, inSub.length);
      for (const child of sub.children || []) {
        const n = inSub.filter((p) =>
          matchesTaxon((p as any).subSubcategory, child.slug, sub.children || []),
        ).length;
        childCounts.set(`${sub.slug}/${child.slug}`, n);
      }
    }
    return { counts, childCounts };
  }, [allProducts, subOptions, subcategoryFallback]);

  /**
   * Subcategories worth showing: ones with products, plus whichever is active
   * (so a link shared with a filter still renders its own chip).
   */
  const visibleSubOptions = useMemo(
    () => subOptions.filter((s) => (subCounts.counts.get(s.slug) || 0) > 0 || s.slug === activeSub),
    [subOptions, subCounts, activeSub],
  );

  // Apply filters
  const filteredProducts = useMemo(() => {
    let list = [...allProducts];

    // Subcategory filter.
    //
    // The admin form saves the subcategory *name* ("Men & Women") while these
    // filters address it by *slug* ("men-women"), so a direct comparison only
    // matched when the name happened to be a single plain word - anything with
    // a space or symbol silently returned zero products. Accept either form so
    // existing product data keeps working without a migration.
    if (activeSub) {
      list = list.filter((p) =>
        matchesTaxon(
          subcategoryFallback ? (p as any).subSubcategory : (p as any).subcategory,
          activeSub,
          subOptions,
        ),
      );
    }
    if (activeSubSub) {
      list = list.filter((p) =>
        matchesTaxon((p as any).subSubcategory, activeSubSub, subSubOptions),
      );
    }

    // price range
    if (activePriceIdx !== "") {
      const idx = parseInt(activePriceIdx);
      const range = priceRanges[idx];
      if (range) {
        list = list.filter((p) => p.price >= range.min && p.price < range.max);
      }
    }

    // sort
    switch (activeSortBy) {
      case "price-low":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price-high":
        list.sort((a, b) => b.price - a.price);
        break;
      case "name-asc":
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      default:
        break; // 'recent' — keep original order
    }

    return list;
  }, [allProducts, activeSub, activeSubSub, activePriceIdx, activeSortBy, subOptions, subSubOptions, subcategoryFallback]);

  // ── filter helpers ──
  /**
   * Write several filters in one URL update.
   *
   * Picking a sub-subcategory used to call `setFilter("sub", ...)` and then
   * `setFilter("subsub", ...)`. Both built their next URL from the same
   * `searchParams` snapshot, so the second call overwrote the first and the
   * `sub` parameter never survived - the page then filtered by sub-subcategory
   * alone against an empty option list, which is why choosing e.g. Watches
   * without first selecting Womens showed nothing.
   */
  const setFilters = (patch: Record<string, string>) => {
    const p = new URLSearchParams(searchParams);
    for (const [key, val] of Object.entries(patch)) {
      if (val) p.set(key, val);
      else p.delete(key);
      // Changing the subcategory invalidates any sub-subcategory not set here.
      if (key === "sub" && !("subsub" in patch)) p.delete("subsub");
    }
    // A different result set: page 3 of the old one means nothing, start again.
    p.delete("page");
    setSearchParams(p, { replace: true });
  };

  const setFilter = (key: string, val: string) => setFilters({ [key]: val });

  const clearAllFilters = () => setSearchParams({}, { replace: true });

  const toggleExpandSub = (slug: string) => {
    setExpandedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const activeFilterCount = [activeSub, activeSubSub, activePriceIdx].filter(Boolean).length;

  /**
   * Numbered pages.
   *
   * A category like Jewellery matches ~585 products. Mounting every card at once
   * made opening a category "buffer" for seconds on a phone, and scrolling kept
   * adding cards (and downloading their photos) with no end. Instead the grid
   * shows one page of PAGE_SIZE products, with the page number in the URL
   * (?page=2) so back/forward and shared links land on the same page.
   * Filter and sort changes go back to page 1 (see setFilters).
   */
  const PAGE_SIZE = 24;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const requestedPage = Number.parseInt(searchParams.get("page") || "1", 10);
  const currentPage = Math.min(Math.max(1, Number.isNaN(requestedPage) ? 1 : requestedPage), totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;

  const visibleProducts = useMemo(
    () => filteredProducts.slice(pageStart, pageStart + PAGE_SIZE),
    [filteredProducts, pageStart],
  );

  const pageHref = (page: number) => {
    const p = new URLSearchParams(searchParams);
    if (page <= 1) p.delete("page");
    else p.set("page", String(page));
    const qs = p.toString();
    return `${location.pathname}${qs ? `?${qs}` : ""}`;
  };

  // Not `replace`: each page is a history entry, so Back returns to the previous page.
  const goToPage = (page: number) => {
    const p = new URLSearchParams(searchParams);
    if (page <= 1) p.delete("page");
    else p.set("page", String(page));
    setSearchParams(p);
  };

  // A new page starts at the top of the results, not wherever the pager was.
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const shownPage = useRef(currentPage);
  useEffect(() => {
    if (shownPage.current === currentPage) return;
    shownPage.current = currentPage;
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentPage]);

  // ── Override adapter to carry subcategory data ──
  // We re-subscribe with raw data to keep subcategory info
  const [rawProducts, setRawProducts] = useState<any[]>([]);
  useEffect(() => {
    // Tag-only mode (e.g. /products?tag=top-deals — no category slug):
    // pull every active product and keep only those whose flag matches.
    if (!categorySlug && (tagMeta || showAll)) {
      setLoading(true);
      setSubcategoryFallback(false); // tag views are not category-scoped
      const unsub = subscribeToActiveProducts((fbProducts) => {
        const matching = tagMeta
          ? fbProducts.filter((p: any) => p?.flags?.[tagMeta.flag] === true)
          : fbProducts;
        const uiProducts = matching.map((fp) => {
          const ui = adaptFirebaseArrayToUI([fp])[0];
          return {
            ...ui,
            subcategory: fp.subcategory || "",
            subSubcategory: (fp as any).subSubcategory || "",
          };
        });
        setAllProducts(uiProducts);
        setRawProducts(matching);
        setLoading(false);
      });
      return unsub;
    }
    // Categories have loaded but this slug matches none of them - stop the
    // spinner so the "Category not found" branch can render instead of the page
    // buffering forever.
    if (!currentCategory) {
      if (categories.length > 0) setLoading(false);
      return;
    }
    const unsub = subscribeToActiveProducts((fbProducts) => {
      let catProducts = fbProducts.filter(
        (p) => p.category?.toLowerCase() === currentCategory.name.toLowerCase()
      );

      /**
       * Fallback: a top-level category whose products are actually filed one
       * level down.
       *
       * Men's, for instance, is its own category document, but every men's
       * piece is stored as Jewellery / subcategory "Mens" - so addressing it by
       * its own slug found nothing and the tab rendered an empty grid. Rather
       * than re-filing 600 products (or hardcoding a parent map, which is what
       * used to send Gifting to /category/articles?sub=gifting and broke when
       * Gifting became a real category), fall back to matching the slug against
       * the *subcategory* of every product.
       */
      const usedSubcategoryFallback = catProducts.length === 0;
      if (usedSubcategoryFallback) {
        catProducts = fbProducts.filter((p) =>
          matchesTaxon((p as any).subcategory, currentCategory.slug, []),
        );
      }
      setSubcategoryFallback(usedSubcategoryFallback && catProducts.length > 0);

      // Build UI products with extra fields
      const uiProducts = catProducts.map((fp) => {
        const ui = adaptFirebaseArrayToUI([fp])[0];
        return {
          ...ui,
          subcategory: fp.subcategory || "",
          subSubcategory: (fp as any).subSubcategory || "",
        };
      });
      setAllProducts(uiProducts);
      setRawProducts(catProducts);
      setLoading(false);
    });
    return unsub;
  }, [currentCategory, categorySlug, activeTag, categories.length]);

  // ── Render: filter sidebar content (reused desktop + mobile) ──
  const FilterContent = () => (
    <div className="space-y-6">
      {/* Subcategories */}
      {currentCategory && visibleSubOptions.length > 0 && (
        <div>
          <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.24em] mb-3">
            Subcategories
          </h3>
          <div className="space-y-1">
            <button
              onClick={() => { setFilter("sub", ""); setMobileFiltersOpen(false); }}
              className={`w-full text-left px-3 py-2 rounded-[6px] text-sm transition-colors ${
                !activeSub ? "bg-primary/10 text-primary font-semibold shadow-[inset_2px_0_0_hsl(var(--primary))]" : "text-foreground/80 hover:bg-foreground/[0.05]"
              }`}
            >
              All {currentCategory.name}
            </button>
            {visibleSubOptions.map((sub) => {
              const visibleChildren = (sub.children || []).filter(
                (c) =>
                  (subCounts.childCounts.get(`${sub.slug}/${c.slug}`) || 0) > 0 ||
                  (activeSub === sub.slug && activeSubSub === c.slug),
              );
              return (
              <div key={sub.slug}>
                <div className="flex items-center">
                  <button
                    onClick={() => { setFilter("sub", sub.slug); setMobileFiltersOpen(false); }}
                    className={`flex-1 text-left px-3 py-2 rounded-[6px] text-sm transition-colors flex items-center justify-between gap-2 ${
                      activeSub === sub.slug
                        ? "bg-primary/10 text-primary font-semibold shadow-[inset_2px_0_0_hsl(var(--primary))]"
                        : "text-foreground/80 hover:bg-foreground/[0.05]"
                    }`}
                  >
                    <span>{sub.name}</span>
                    <span className={`text-[11px] ${activeSub === sub.slug ? "text-primary/70" : "text-muted-foreground"}`}>
                      {subCounts.counts.get(sub.slug) || 0}
                    </span>
                  </button>
                  {visibleChildren.length > 0 && (
                    <button
                      onClick={() => toggleExpandSub(sub.slug)}
                      className="p-2 text-muted-foreground hover:text-foreground"
                    >
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${
                          expandedSubs.has(sub.slug) ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  )}
                </div>
                {/* Sub-sub-categories dropdown */}
                <AnimatePresence>
                  {expandedSubs.has(sub.slug) && visibleChildren.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden ml-4 space-y-1"
                    >
                      {visibleChildren.map((child) => (
                        <button
                          key={child.slug}
                          onClick={() => {
                            setFilters({ sub: sub.slug, subsub: child.slug });
                            setMobileFiltersOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 rounded-[6px] text-xs transition-colors flex items-center justify-between gap-2 ${
                            activeSubSub === child.slug
                              ? "bg-primary/10 text-primary font-medium"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          <span>{child.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {subCounts.childCounts.get(`${sub.slug}/${child.slug}`) || 0}
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Price Range */}
      <div>
        <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.24em] mb-3">
          Price Range
        </h3>
        <div className="space-y-1">
          {priceRanges.map((range, idx) => (
            <button
              key={idx}
              onClick={() => {
                setFilter("price", activePriceIdx === String(idx) ? "" : String(idx));
                setMobileFiltersOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-[6px] text-sm transition-colors ${
                activePriceIdx === String(idx)
                  ? "bg-primary/10 text-primary font-semibold shadow-[inset_2px_0_0_hsl(var(--primary))]"
                  : "text-foreground/80 hover:bg-foreground/[0.05]"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Clear all */}
      {activeFilterCount > 0 && (
        <button
          onClick={() => { clearAllFilters(); setMobileFiltersOpen(false); }}
          className="link-arrow mx-auto !flex w-fit"
        >
          Clear All Filters
        </button>
      )}
    </div>
  );

  // ── Product Card handlers ──
  // The card itself is a stable, memoized component declared at module scope
  // (see `CategoryProductCard`). We only need to provide event handlers here.
  const handleCardOpen = (productId: string) => {
    navigate(`/product/${productId}`);
  };

  const handleCardAddToCart = async (product: UIProduct) => {
    if (!user) {
      navigate("/login", { state: { from: location } });
      return;
    }
    const added = addToCart({
      id: product.id,
      name: product.title,
      price: product.price,
      image: product.image,
      stock: product.stock,
    });
    if (!added) return;
    toast({ title: "Added to cart" });
  };

  const handleCardToggleWishlist = (product: UIProduct, wishlisted: boolean) => {
    if (wishlisted) {
      removeFromWishlist(product.id);
    } else {
      addToWishlist(product.id, product.title);
      toast({ title: "Added to wishlist" });
    }
  };

  if (!currentCategory && !tagMeta && !showAll && !loading && categories.length > 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex flex-col items-center justify-center py-32">
          <p className="text-muted-foreground text-lg">Category not found</p>
          <Link to="/" className="mt-4 text-primary hover:underline">
            Go Home
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen tx-paper flex flex-col">
      <Header />
      <CategoryIconNav />

      {/* Back button + title bar */}
      <div className="tx-sheet tx-contour overflow-hidden border-b border-foreground/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 lg:py-10 flex items-center lg:items-end gap-3 lg:gap-5">
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="btn-round !h-9 !w-9 lg:!h-11 lg:!w-11 flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 lg:w-5 lg:h-5" />
          </button>
          <div className="min-w-0">
          <p className="eyebrow-no mb-2 hidden lg:inline-flex"><b>{String(filteredProducts.length).padStart(2, "0")}</b><span>{showAll ? "The full range" : tagMeta ? "Curated" : "Collection"}</span></p>
          <h1 className="text-lg lg:text-5xl font-semibold text-foreground leading-tight lg:block" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
            {currentCategory?.name || tagMeta?.label || "Products"}
            {activeSub && currentCategory && (
              <span className="text-muted-foreground font-normal">
                {" / "}
                {currentCategory.subcategories.find((s) => s.slug === activeSub)?.name}
              </span>
            )}
          </h1>
          </div>
        </div>
      </div>

      {/* Mobile: Sort + Filter bar */}
      <div className="lg:hidden sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-foreground/[0.08]">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            {/* Sort */}
            <div className="relative">
              <button
                onClick={() => setShowSortDropdown(!showSortDropdown)}
                className="flex items-center gap-1.5 px-3.5 py-2 border border-foreground/15 rounded-[6px] text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/85"
              >
                Sort
                <ChevronDown className="w-3 h-3" />
              </button>
              {showSortDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSortDropdown(false)} />
                  <div className="tx-sheet absolute right-0 top-full mt-1.5 border border-foreground/10 rounded-[8px] shadow-[var(--shadow-panel)] py-1 z-20 min-w-[180px]">
                    {sortOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setFilter("sort", opt.value);
                          setShowSortDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm ${
                          activeSortBy === opt.value
                            ? "text-primary font-semibold bg-primary/10"
                            : "text-foreground/80 hover:bg-muted"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Filter button (mobile) */}
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger asChild>
                <button className="flex items-center gap-1.5 px-3.5 py-2 border border-foreground/15 rounded-[6px] text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/85 relative">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-primary text-white w-4 h-4 rounded-full text-[10px] flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="tx-sheet h-[75vh] rounded-t-[var(--radius-panel)]">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="mt-4 overflow-y-auto max-h-[calc(75vh-80px)] pb-6">
                  <FilterContent />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
        {/* Active filter chips on mobile */}
        {activeFilterCount > 0 && (
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
            {activeSub && (
              <span className="flex items-center gap-1 border border-primary/40 text-primary text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap">
                {currentCategory?.subcategories.find((s) => s.slug === activeSub)?.name}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setFilter("sub", "")} />
              </span>
            )}
            {activePriceIdx && (
              <span className="flex items-center gap-1 border border-primary/40 text-primary text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap">
                {priceRanges[parseInt(activePriceIdx)]?.label}
                <X className="w-3 h-3 cursor-pointer" onClick={() => setFilter("price", "")} />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6 lg:gap-8">
          {/* Desktop sidebar — collapsible */}
          <aside
            className={`hidden lg:block flex-shrink-0 transition-all duration-300 ease-in-out ${
              desktopFiltersCollapsed ? 'w-12' : 'w-64'
            }`}
          >
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 scrollbar-thin">
              {desktopFiltersCollapsed ? (
                /* Collapsed rail */
                <button
                  onClick={() => setDesktopFiltersCollapsed(false)}
                  className="btn-round group relative mx-auto !flex"
                  aria-label="Show filters"
                  title="Show filters"
                >
                  <PanelLeft className="w-4 h-4 text-foreground/70 group-hover:text-primary" />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              ) : (
                <div className="panel tx-sheet space-y-2 p-5">
                  <div className="flex items-center justify-between mb-5 pb-4 border-b border-foreground/[0.08]">
                    <h2 className="text-xs font-bold uppercase tracking-[0.24em] text-foreground">Filters</h2>
                    <button
                      onClick={() => setDesktopFiltersCollapsed(true)}
                      className="p-1.5 rounded-md hover:bg-muted text-foreground/60 hover:text-foreground transition-colors"
                      aria-label="Hide filters"
                      title="Hide filters"
                    >
                      <PanelLeftClose className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Sort */}
                  <div className="mb-4">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.24em] mb-2">
                      Sort By
                    </h3>
                    <select
                      value={activeSortBy}
                      onChange={(e) => setFilter("sort", e.target.value)}
                      className="w-full border border-foreground/15 rounded-[6px] px-3 py-2 text-sm text-foreground/85 bg-card focus:outline-none focus:border-primary"
                    >
                      {sortOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <FilterContent />
                </div>
              )}
            </div>
          </aside>

          {/* Products grid */}
          <div ref={resultsRef} className="flex-1 min-w-0 scroll-mt-32">
            {/* Desktop: result count + sort */}
            <div className="hidden lg:flex items-center justify-between mb-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Showing {filteredProducts.length} product{filteredProducts.length !== 1 ? "s" : ""}
              </p>
              <span className="h-px flex-1 ml-5 bg-gradient-to-r from-foreground/10 to-transparent" />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-32">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <ShoppingBag className="w-16 h-16 text-primary/30 mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>Products coming soon</h3>
                <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                  We're adding exciting new products to this category. Check back soon for our latest collection!
                </p>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearAllFilters}
                    className="link-arrow"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
                  {visibleProducts.map((product) => (
                    <CategoryProductCard
                      key={product.id}
                      product={product}
                      wishlisted={isInWishlist(product.id)}
                      onOpen={handleCardOpen}
                      onAddToCart={(p) => { void handleCardAddToCart(p); }}
                      onToggleWishlist={handleCardToggleWishlist}
                    />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <ProductPagination
                      page={currentPage}
                      totalPages={totalPages}
                      onPageChange={goToPage}
                      hrefFor={pageHref}
                    />
                    <p className="text-xs text-muted-foreground">
                      Showing {pageStart + 1}–{pageStart + visibleProducts.length} of {filteredProducts.length}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default CategoryPage;
