import { useState, useEffect, useMemo, useRef, memo } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  SlidersHorizontal,
  X,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
  Star,
  ShoppingBag,
  ArrowLeft,
  PackageSearch,
  SearchX,
} from "lucide-react";
import { Link } from "react-router-dom";
import { WishlistToggle } from "@/components/WishlistToggle";
import { IconButton } from "@/components/ui/icon-button";
import { EmptyState } from "@/components/EmptyState";
import { ProductGridSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePageMeta } from "@/hooks/usePageMeta";
import { formatINR, plural } from "@/lib/format";
import { EASE_OUT } from "@/lib/motion";
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
  { value: "recent", label: "Newest first", short: "Newest" },
  { value: "price-low", label: "Price: low to high", short: "Price low" },
  { value: "price-high", label: "Price: high to low", short: "Price high" },
  { value: "name-asc", label: "Name A to Z", short: "A to Z" },
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
//
// The products page keeps its own card (owner decision) but follows the shared
// ProductCard spec: the title is a real link stretched over the card, so
// keyboards, screen readers, open-in-new-tab and crawlers all reach the
// product; the heart and Add to cart sit above it (z-raised).
type CategoryCardProduct = UIProduct & { isNew?: boolean };

type CategoryProductCardProps = {
  product: CategoryCardProduct;
  wishlisted: boolean;
  onAddToCart: (product: UIProduct) => void;
  onToggleWishlist: (product: UIProduct, wishlisted: boolean) => void;
  /** First cards on the page load their photo eagerly. */
  priority?: boolean;
};

const CategoryProductCard = memo(function CategoryProductCard({
  product,
  wishlisted,
  onAddToCart,
  onToggleWishlist,
  priority = false,
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
  const href = `/product/${product.id}`;
  return (
    <article
      className={
        "card-product group relative flex flex-col p-1.5 sm:p-2 " +
        "has-[a[data-card-link]:focus-visible]:outline has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-ring"
      }
    >
      {/* Image */}
      <div className="tile-img relative aspect-square overflow-hidden">
        <SmartImage
          src={product.image}
          alt={product.alt || product.title}
          className="h-full w-full object-cover transition-transform duration-reveal ease-out group-hover:scale-[1.03]"
          preset="card"
          priority={priority}
        />
        {/* One meaningful flag at most: the discount already sits by the price,
            so the photo only says "New" for genuinely new products. */}
        {product.isNew && (
          <span className="tag-dark pointer-events-none absolute left-2 top-2">New</span>
        )}
        <WishlistToggle
          name={product.title}
          saved={wishlisted}
          onToggle={() => onToggleWishlist(product, wishlisted)}
          size="sm"
          className="absolute right-1.5 top-1.5 z-raised sm:right-2 sm:top-2"
        />
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1.5 px-1.5 pb-1 pt-3">
        <h3
          title={product.title}
          className="line-clamp-2 min-h-[2.6em] text-[13px] font-semibold leading-[1.3] text-foreground [text-wrap:pretty] sm:text-sm"
        >
          <Link
            to={href}
            data-card-link=""
            className="outline-none transition-colors duration-hover ease-out after:absolute after:inset-0 after:rounded-card after:content-[''] group-hover:text-primary"
          >
            {product.title}
          </Link>
        </h3>
        <div className="flex items-center gap-1">
          {product.reviews > 0 && (
            <span className="text-xs font-semibold tabular-nums text-highlight">{product.rating.toFixed(1)}</span>
          )}
          <span className="sr-only">
            {product.reviews > 0
              ? `Rated ${product.rating.toFixed(1)} out of 5 from ${plural(product.reviews, "review")}`
              : "No reviews yet"}
          </span>
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              aria-hidden="true"
              className={`h-3 w-3 ${
                product.reviews > 0 && i < Math.floor(product.rating)
                  ? "fill-highlight-soft text-highlight-soft"
                  : product.reviews > 0 && i < product.rating
                  ? "fill-charcoal-foreground text-highlight-soft"
                  : "fill-foreground/10 text-foreground/20"
              }`}
            />
          ))}
          {product.reviews > 0 && (
            <span aria-hidden="true" className="text-xs tabular-nums text-muted-foreground">({product.reviews})</span>
          )}
        </div>
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pb-3">
          <span className="price-now text-[15px]">{formatINR(displayPrice)}</span>
          {displayOldPrice && displayOldPrice > product.price && (
            <span className="price-was text-xs">
              <span className="sr-only">Was </span>
              {formatINR(displayOldPrice)}
            </span>
          )}
          {displayDiscount && <span className="chip-off">{displayDiscount}% off</span>}
        </p>
        <button
          type="button"
          onClick={() => onAddToCart(product)}
          className="relative z-raised mt-auto flex h-10 w-full items-center justify-center rounded-control border border-foreground/15 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-foreground transition-[background-color,border-color,color,transform] duration-press ease-out hover:border-primary hover:bg-primary hover:text-primary-foreground active:scale-[0.97]"
        >
          Add to cart<span className="sr-only">: {product.title}</span>
        </button>
      </div>
    </article>
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
  const [allProducts, setAllProducts] = useState<CategoryCardProduct[]>([]);
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
    'top-deals': { flag: 'isTopDeal', label: 'Top deals' },
    'best-sellers': { flag: 'isBestSeller', label: 'Best sellers' },
    'new-arrivals': { flag: 'isNewArrival', label: 'New arrivals' },
    'trending': { flag: 'isTrendProduct', label: 'Trending now' },
    'featured': { flag: 'isFeatured', label: 'Featured products' },
  };
  const tagMeta = activeTag ? TAG_MAP[activeTag] : undefined;
  /** Bare /products (no category, no tag): the whole catalogue. "Shop all" links land here. */
  const showAll = !categorySlug && !activeTag;

  // UI
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
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
            isNew: (fp as any).flags?.isNewArrival === true,
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
          isNew: (fp as any).flags?.isNewArrival === true,
        };
      });
      setAllProducts(uiProducts);
      setRawProducts(catProducts);
      setLoading(false);
    });
    return unsub;
  }, [currentCategory, categorySlug, activeTag, categories.length]);

  // ── Render: filter sidebar content (reused desktop + mobile) ──
  // Called as a function, not rendered as <FilterContent />: a component
  // declared inside the render is a new type on every render, so React
  // remounted the whole tree after each click (focus lost, accordion replayed).
  const renderFilterContent = () => (
    <div className="space-y-6">
      {/* Subcategories */}
      {currentCategory && visibleSubOptions.length > 0 && (
        <div>
          <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
            Subcategories
          </h3>
          <div className="space-y-1">
            <button
              type="button"
              aria-pressed={!activeSub}
              onClick={() => { setFilter("sub", ""); setMobileFiltersOpen(false); }}
              className={`min-h-10 w-full rounded-control px-3 py-2 text-left text-sm transition-colors duration-hover ease-out ${
                !activeSub ? "bg-primary/10 font-semibold text-primary shadow-[inset_2px_0_0_hsl(var(--primary))]" : "text-foreground/80 hover:bg-foreground/[0.05]"
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
              const expanded = expandedSubs.has(sub.slug);
              const childListId = `filter-children-${sub.slug}`;
              return (
              <div key={sub.slug}>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={activeSub === sub.slug}
                    onClick={() => { setFilter("sub", sub.slug); setMobileFiltersOpen(false); }}
                    className={`flex min-h-10 flex-1 items-center justify-between gap-2 rounded-control px-3 py-2 text-left text-sm transition-colors duration-hover ease-out ${
                      activeSub === sub.slug
                        ? "bg-primary/10 font-semibold text-primary shadow-[inset_2px_0_0_hsl(var(--primary))]"
                        : "text-foreground/80 hover:bg-foreground/[0.05]"
                    }`}
                  >
                    <span>{sub.name}</span>
                    <span className={`text-[11px] tabular-nums ${activeSub === sub.slug ? "text-primary" : "text-muted-foreground"}`}>
                      {subCounts.counts.get(sub.slug) || 0}
                    </span>
                  </button>
                  {visibleChildren.length > 0 && (
                    <IconButton
                      label={expanded ? `Hide ${sub.name} types` : `Show ${sub.name} types`}
                      aria-expanded={expanded}
                      aria-controls={childListId}
                      size="sm"
                      onClick={() => toggleExpandSub(sub.slug)}
                      className="text-muted-foreground"
                    >
                      <ChevronDown
                        aria-hidden="true"
                        className={`transition-transform duration-dropdown ease-out ${expanded ? "rotate-180" : ""}`}
                      />
                    </IconButton>
                  )}
                </div>
                {/* Sub-sub-categories dropdown */}
                <AnimatePresence initial={false}>
                  {expanded && visibleChildren.length > 0 && (
                    <motion.div
                      id={childListId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                      className="ml-4 space-y-1 overflow-hidden"
                    >
                      {visibleChildren.map((child) => (
                        <button
                          type="button"
                          key={child.slug}
                          aria-pressed={activeSubSub === child.slug}
                          onClick={() => {
                            setFilters({ sub: sub.slug, subsub: child.slug });
                            setMobileFiltersOpen(false);
                          }}
                          className={`focus-inset flex min-h-9 w-full items-center justify-between gap-2 rounded-control px-3 py-1.5 text-left text-xs transition-colors duration-hover ease-out ${
                            activeSubSub === child.slug
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <span>{child.name}</span>
                          <span className="text-[10px] tabular-nums text-muted-foreground">
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

      {/* Price range */}
      <div>
        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
          Price range
        </h3>
        <div className="space-y-1">
          {priceRanges.map((range, idx) => (
            <button
              type="button"
              key={idx}
              aria-pressed={activePriceIdx === String(idx)}
              onClick={() => {
                setFilter("price", activePriceIdx === String(idx) ? "" : String(idx));
                setMobileFiltersOpen(false);
              }}
              className={`min-h-10 w-full rounded-control px-3 py-2 text-left text-sm tabular-nums transition-colors duration-hover ease-out ${
                activePriceIdx === String(idx)
                  ? "bg-primary/10 font-semibold text-primary shadow-[inset_2px_0_0_hsl(var(--primary))]"
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
          type="button"
          onClick={() => { clearAllFilters(); setMobileFiltersOpen(false); }}
          className="link-arrow mx-auto !flex w-fit"
        >
          Clear filters
        </button>
      )}
    </div>
  );

  // ── Product Card handlers ──
  // The card itself is a stable, memoized component declared at module scope
  // (see `CategoryProductCard`). We only need to provide event handlers here.
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

  const activeSubName = currentCategory?.subcategories.find((s) => s.slug === activeSub)?.name;
  const activeSort = sortOptions.find((o) => o.value === activeSortBy) ?? sortOptions[0];
  /** Category documents still loading: the title is not known yet. */
  const titlePending = loading && !currentCategory && !tagMeta && !showAll;
  const pageTitle = currentCategory?.name || tagMeta?.label || "Products";
  const categoryMissing = !currentCategory && !tagMeta && !showAll && !loading && categories.length > 0;

  usePageMeta({
    title: categoryMissing ? "Collection not found" : titlePending ? undefined : showAll ? "All products" : pageTitle,
    description: categoryMissing || titlePending
      ? undefined
      : showAll
      ? "The full range from Ishaputra Botanicals: Ayurvedic and botanical care for men."
      : `Shop ${pageTitle} from Ishaputra Botanicals.`,
    noindex: categoryMissing,
  });

  if (categoryMissing) {
    return (
      <div className="min-h-screen tx-paper flex flex-col">
        <Header />
        <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center px-4 py-16 sm:py-24">
          <EmptyState
            as="h1"
            icon={PackageSearch}
            title="We couldn't find that collection"
            description="It may have been renamed or retired. Everything we make is in the full catalogue."
            action={{ label: "Browse all products", to: "/products" }}
            secondaryAction={{ label: "Go home", to: "/" }}
          />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen tx-paper flex flex-col">
      <Header />
      <CategoryIconNav />

      <main id="main" tabIndex={-1} className="flex flex-1 flex-col">
      {/* Back button + title bar */}
      <div className="tx-sheet tx-contour overflow-hidden border-b border-foreground/[0.08]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-10 flex items-center lg:items-end gap-3 lg:gap-5">
          <IconButton label="Go back" variant="solid" onClick={() => navigate(-1)} className="lg:size-11 lg:[&_svg]:size-5">
            <ArrowLeft aria-hidden="true" />
          </IconButton>
          <div className="min-w-0">
            <p className="eyebrow-no mb-2 hidden lg:inline-flex">
              <span>{showAll ? "The full range" : tagMeta ? "Curated" : "Collection"}</span>
            </p>
            {titlePending ? (
              <>
                <h1 className="sr-only">Loading collection</h1>
                <Skeleton aria-hidden="true" className="h-8 w-48 lg:h-12 lg:w-72" />
              </>
            ) : (
              <h1
                className="text-2xl sm:text-3xl lg:text-5xl font-semibold text-foreground leading-tight [text-wrap:balance]"
                style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
              >
                {pageTitle}
                {activeSub && currentCategory && activeSubName && (
                  <span className="text-muted-foreground font-normal">
                    {" / "}
                    {activeSubName}
                  </span>
                )}
              </h1>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: Sort + Filter bar */}
      <div className="lg:hidden sticky top-0 z-sticky bg-background/95 backdrop-blur border-b border-foreground/[0.08]">
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <p className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground tabular-nums" aria-live="polite">
            {loading ? <span aria-label="Loading products">-</span> : plural(filteredProducts.length, "product")}
          </p>
          <div className="flex gap-2">
            {/* Sort */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-11 items-center gap-1.5 whitespace-nowrap rounded-control border border-foreground/15 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground transition-[border-color,color,transform] duration-press ease-out active:scale-[0.97] data-[state=open]:border-primary data-[state=open]:text-primary"
                >
                  <span>Sort: {activeSort.short}</span>
                  <ChevronDown aria-hidden="true" className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="tx-sheet min-w-[200px]">
                <DropdownMenuRadioGroup value={activeSortBy} onValueChange={(v) => setFilter("sort", v)}>
                  {sortOptions.map((opt) => (
                    <DropdownMenuRadioItem
                      key={opt.value}
                      value={opt.value}
                      className="min-h-11 data-[state=checked]:font-semibold data-[state=checked]:text-primary"
                    >
                      {opt.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Filter button (mobile) */}
            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className="relative flex h-11 items-center gap-1.5 whitespace-nowrap rounded-control border border-foreground/15 px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground transition-[border-color,color,transform] duration-press ease-out active:scale-[0.97]"
                >
                  <SlidersHorizontal aria-hidden="true" className="size-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-primary text-[10px] tabular-nums text-primary-foreground">
                      {activeFilterCount}
                      <span className="sr-only"> active</span>
                    </span>
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="tx-sheet h-[75dvh]">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="mt-4 max-h-[calc(75dvh-80px)] overflow-y-auto pb-6">
                  {renderFilterContent()}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
        {/* Active filter chips on mobile */}
        {activeFilterCount > 0 && (
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
            {activeSub && (
              <button
                type="button"
                onClick={() => setFilter("sub", "")}
                aria-label={`Remove ${activeSubName ?? activeSub} filter`}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border border-primary/40 px-3 text-xs font-medium text-primary transition-[background-color,transform] duration-press ease-out hover:bg-primary/10 active:scale-[0.97]"
              >
                {activeSubName ?? activeSub}
                <X aria-hidden="true" className="size-3.5" />
              </button>
            )}
            {activePriceIdx && (
              <button
                type="button"
                onClick={() => setFilter("price", "")}
                aria-label={`Remove ${priceRanges[parseInt(activePriceIdx)]?.label ?? "price"} filter`}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border border-primary/40 px-3 text-xs font-medium text-primary transition-[background-color,transform] duration-press ease-out hover:bg-primary/10 active:scale-[0.97]"
              >
                {priceRanges[parseInt(activePriceIdx)]?.label}
                <X aria-hidden="true" className="size-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6 lg:gap-8">
          {/* Desktop sidebar: collapsible, switches width instantly (no width animation) */}
          <aside
            aria-label="Filters"
            className={`hidden lg:block flex-shrink-0 ${desktopFiltersCollapsed ? "w-12" : "w-64"}`}
          >
            <div className="sticky top-[var(--sticky-top)] max-h-[calc(100dvh-152px)] overflow-y-auto pr-2 scrollbar-thin">
              {desktopFiltersCollapsed ? (
                /* Collapsed rail */
                <div className="relative mx-auto w-fit">
                  <IconButton
                    label={activeFilterCount > 0 ? `Show filters (${activeFilterCount} active)` : "Show filters"}
                    tooltip="Show filters"
                    tooltipSide="right"
                    variant="solid"
                    onClick={() => setDesktopFiltersCollapsed(false)}
                  >
                    <PanelLeft aria-hidden="true" />
                  </IconButton>
                  {activeFilterCount > 0 && (
                    <span aria-hidden="true" className="pointer-events-none absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-bold tabular-nums text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  )}
                </div>
              ) : (
                <div className="panel tx-sheet space-y-2 p-5">
                  <div className="flex items-center justify-between mb-5 pb-4 border-b border-foreground/[0.08]">
                    <h2 className="text-xs font-bold uppercase tracking-[0.24em] text-foreground">Filters</h2>
                    <IconButton
                      label="Hide filters"
                      tooltip
                      size="sm"
                      onClick={() => setDesktopFiltersCollapsed(true)}
                      className="-mr-2 text-muted-foreground"
                    >
                      <PanelLeftClose aria-hidden="true" />
                    </IconButton>
                  </div>

                  {/* Sort */}
                  <div className="mb-6">
                    <label
                      htmlFor="sort-select"
                      className="mb-2 block text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground"
                    >
                      Sort by
                    </label>
                    <Select value={activeSortBy} onValueChange={(v) => setFilter("sort", v)}>
                      <SelectTrigger id="sort-select" className="h-10 bg-card">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {sortOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {renderFilterContent()}
                </div>
              )}
            </div>
          </aside>

          {/* Products grid */}
          <div ref={resultsRef} className="flex-1 min-w-0 scroll-mt-32">
            {/* Desktop: result count */}
            <div className="hidden lg:flex items-center justify-between mb-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground tabular-nums">
                {loading ? <span aria-label="Loading products">Showing -</span> : `Showing ${plural(filteredProducts.length, "product")}`}
              </p>
              <span aria-hidden="true" className="h-px flex-1 ml-5 bg-gradient-to-r from-foreground/10 to-transparent" />
            </div>

            {loading ? (
              <ProductGridSkeleton
                count={8}
                className="sm:grid-cols-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4"
              />
            ) : filteredProducts.length === 0 ? (
              activeFilterCount > 0 ? (
                <EmptyState
                  icon={SearchX}
                  title="No products in this range"
                  description="Try another price range or clear the filters."
                  action={{ label: "Clear filters", onClick: clearAllFilters }}
                />
              ) : (
                <EmptyState
                  icon={ShoppingBag}
                  title="Nothing here yet"
                  description="This range is being stocked. Browse the full catalogue meanwhile."
                  secondaryAction={showAll ? undefined : { label: "Browse all products", to: "/products" }}
                />
              )
            ) : (
              <>
                <h2 className="sr-only">Products</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
                  {visibleProducts.map((product, idx) => (
                    <CategoryProductCard
                      key={product.id}
                      product={product}
                      priority={idx < 4}
                      wishlisted={isInWishlist(product.id)}
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
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Showing {pageStart + 1}-{pageStart + visibleProducts.length} of {filteredProducts.length}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      </main>

      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default CategoryPage;
