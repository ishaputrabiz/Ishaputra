import { useState, useEffect, useMemo, useRef, type FormEvent } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ArrowLeft, ArrowUpDown, SearchX } from "lucide-react";
import { getActiveProductsCached, useCatalogRevision } from "@/services/productCache";
import { UIProduct, adaptFirebaseToUI } from "@/lib/productAdapter";
import ProductCard from "@/components/ProductCard";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CategoryIconNav from "@/components/CategoryIconNav";
import MobileBottomNav from "@/components/MobileBottomNav";
import ProductPagination from "@/components/ProductPagination";
import { IconButton } from "@/components/ui/icon-button";
import { EmptyState } from "@/components/EmptyState";
import { ProductGridSkeleton } from "@/components/skeletons";
import { usePageMeta } from "@/hooks/usePageMeta";
import { formatNumber } from "@/lib/format";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Results per page; the page number lives in the URL (?page=2). */
const PAGE_SIZE = 24;

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "price-low-high", label: "Price: low to high" },
  { value: "price-high-low", label: "Price: high to low" },
  { value: "newest", label: "Newest" },
];

type SearchableProduct = UIProduct & { searchText: string };

/**
 * Every word of the query must appear somewhere in the product's name,
 * category or subcategory, in any order: "hair oil" finds "Bhringraj Hair
 * Strength Oil". A one-letter word only matches the start of a word, so "a"
 * does not return the whole catalogue.
 */
const matchesQuery = (searchText: string, query: string) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const hayWords = searchText.split(/[^a-z0-9]+/);
  return words.every((w) => (w.length === 1 ? hayWords.some((hw) => hw.startsWith(w)) : searchText.includes(w)));
};

const SearchResults = () => {
  /** Changes when an admin publishes; re-reads the catalog below. */
  const catalogRevision = useCatalogRevision();

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const query = searchParams.get("q") || "";
  const highlightId = searchParams.get("highlight") || "";

  const [allProducts, setAllProducts] = useState<SearchableProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<string>("relevance");
  const [showFilters, setShowFilters] = useState(false);

  usePageMeta({ title: query ? `Search results for ${query}` : "Search", noindex: true });

  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      try {
        const products = await getActiveProductsCached();
        const uiProducts = products.map((p) => {
          const ui = adaptFirebaseToUI(p as any);
          const raw = p as any;
          return {
            ...ui,
            searchText: [ui.title, ui.category, raw.subcategory, raw.subSubcategory]
              .filter(Boolean)
              .join(" ")
              .toLowerCase(),
          };
        });
        setAllProducts(uiProducts);
      } catch (error) {
        console.error("Error loading products:", error);
      } finally {
        setLoading(false);
      }
    };
    loadProducts();
      // Re-runs when an admin publishes a new catalog, so a price change
      // reaches this screen without the visitor reloading it.
  }, [catalogRevision]);

  // Filter products based on search query
  const filteredProducts = useMemo(() => {
    if (!query.trim()) return [];
    return allProducts.filter((product) => matchesQuery(product.searchText, query));
  }, [query, allProducts]);

  // Sort products - highlighted product first, then by sort
  const sortedProducts = useMemo(() => {
    const products = [...filteredProducts];

    // Sort
    switch (sortBy) {
      case "price-low-high":
        products.sort((a, b) => a.price - b.price);
        break;
      case "price-high-low":
        products.sort((a, b) => b.price - a.price);
        break;
      case "newest":
        products.sort((a, b) => b.id.localeCompare(a.id));
        break;
      default:
        break;
    }

    // Move highlighted product to front
    if (highlightId) {
      const idx = products.findIndex((p) => p.id === highlightId);
      if (idx > 0) {
        const [highlighted] = products.splice(idx, 1);
        products.unshift(highlighted);
      }
    }

    return products;
  }, [filteredProducts, sortBy, highlightId]);

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / PAGE_SIZE));
  const requestedPage = Number.parseInt(searchParams.get("page") || "1", 10);
  const currentPage = Math.min(Math.max(1, Number.isNaN(requestedPage) ? 1 : requestedPage), totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pagedProducts = sortedProducts.slice(pageStart, pageStart + PAGE_SIZE);

  const pageHref = (page: number) => {
    const p = new URLSearchParams(searchParams);
    if (page <= 1) p.delete("page");
    else p.set("page", String(page));
    return `${location.pathname}?${p.toString()}`;
  };

  function goToPage(page: number) {
    const p = new URLSearchParams(searchParams);
    if (page <= 1) p.delete("page");
    else p.set("page", String(page));
    if (p.toString() !== searchParams.toString()) setSearchParams(p);
  }

  // A new page starts at the top, not wherever the pager was.
  const shownPage = useRef(currentPage);
  useEffect(() => {
    if (shownPage.current === currentPage) return;
    shownPage.current = currentPage;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentPage]);

  // Scroll to highlighted product on load
  useEffect(() => {
    if (highlightId && !loading && sortedProducts.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(`product-${highlightId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);
    }
  }, [highlightId, loading, sortedProducts]);

  const count = sortedProducts.length;

  const refineInputRef = useRef<HTMLInputElement>(null);

  /** md and up: run the new search on this page (a new URL starts at page 1). */
  const submitRefine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = (refineInputRef.current?.value ?? "").trim();
    if (!next) {
      refineInputRef.current?.focus();
      return;
    }
    navigate(`/search-results?q=${encodeURIComponent(next)}`);
  };

  /** "Search again": the inline field from md up, the search screen on phones. */
  const searchAgain = () => {
    const input = refineInputRef.current;
    if (input && input.offsetParent !== null) {
      input.focus();
      input.select();
    } else {
      navigate("/search");
    }
  };

  return (
    <div className="min-h-screen tx-paper flex flex-col">
      {/* The normal site header and footer from tablet width up (owner decision);
          phones keep the focused search bar below as their header. */}
      <div className="hidden md:block">
        <Header />
        {/* Same desktop chrome as /products and the product page. */}
        <div className="hidden lg:block">
          <CategoryIconNav />
        </div>
      </div>

      {/* Search bar: the page header on phones, a query row under the site header from md */}
      <div className="sticky top-0 z-header border-b border-foreground/[0.08] bg-card md:static md:z-auto md:border-b-0 md:bg-transparent">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-2 py-2 sm:px-4 md:px-6 md:pt-6 lg:px-8">
          <IconButton label="Go back" onClick={() => navigate(-1)}>
            <ArrowLeft aria-hidden="true" />
          </IconButton>
          {/* Phones: opens the focused search screen (recent searches, suggestions). */}
          <button
            type="button"
            onClick={() => navigate("/search")}
            aria-label={query ? `Search: ${query}. Change search` : "Search products"}
            className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-control border border-input bg-background px-3 text-left transition-[border-color] duration-hover ease-out hover:border-primary/50 md:hidden"
          >
            <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className={cn("truncate text-sm", query ? "text-foreground" : "text-muted-foreground")}>
              {query || "Search shilajit, hair oil, face wash"}
            </span>
          </button>
          {/* Tablet and desktop: refine the search in place, without leaving the
              page's header and footer for the bare /search screen. */}
          <form
            role="search"
            aria-label="Refine search"
            onSubmit={submitRefine}
            className="hidden h-11 min-w-0 flex-1 items-center gap-2 rounded-control border border-input bg-background px-3 transition-[border-color] duration-hover ease-out focus-within:border-primary hover:border-primary/50 md:flex md:max-w-xl"
          >
            <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <label htmlFor="search-refine" className="sr-only">Search products</label>
            <input
              key={query}
              ref={refineInputRef}
              id="search-refine"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Search shilajit, hair oil, face wash"
              autoComplete="off"
              enterKeyHint="search"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            />
            <button
              type="submit"
              className="-mr-1.5 h-8 shrink-0 rounded-control px-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary transition-[background-color,transform] duration-press ease-out hover:bg-primary/10 active:scale-[0.97]"
            >
              Search
            </button>
          </form>
          <IconButton
            label="Sort results"
            tooltip={false}
            aria-expanded={showFilters}
            aria-controls="search-sort-panel"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(showFilters && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary")}
          >
            <ArrowUpDown aria-hidden="true" />
          </IconButton>
        </div>

        {/* Sort bar */}
        <AnimatePresence initial={false}>
          {showFilters && (
            <motion.div
              id="search-sort-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="overflow-hidden"
            >
              <div className="mx-auto max-w-7xl px-4 pb-3 pt-1 md:px-6 lg:px-8">
                <p id="search-sort-label" className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Sort by
                </p>
                <div role="group" aria-labelledby="search-sort-label" className="flex flex-wrap gap-2">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      type="button"
                      key={opt.value}
                      aria-pressed={sortBy === opt.value}
                      onClick={() => {
                        setSortBy(opt.value);
                        setShowFilters(false);
                        goToPage(1);
                      }}
                      className={cn(
                        "h-9 rounded-control border px-3 text-xs font-medium transition-[background-color,border-color,color,transform] duration-press ease-out active:scale-[0.97]",
                        sortBy === opt.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-foreground/15 bg-card text-foreground hover:border-primary/40 hover:text-primary",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 pb-10 md:px-6 lg:px-8">
        {/* Results count */}
        <div className="border-b border-foreground/[0.08] py-3 md:pt-4">
          <h1 className="text-sm text-muted-foreground" aria-live="polite">
            {loading ? (
              "Searching…"
            ) : (
              <>
                <span className="font-semibold tabular-nums text-foreground">{formatNumber(count)}</span>{" "}
                {count === 1 ? "result" : "results"}
                {query && (
                  <>
                    {" "}for <span className="font-medium text-foreground">“{query}”</span>
                  </>
                )}
              </>
            )}
          </h1>
        </div>

        {/* Loading */}
        {loading && <ProductGridSkeleton count={8} className="pt-4 sm:grid-cols-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4" />}

        {/* Results Grid */}
        {!loading && count > 0 && (
          <div className="pt-4">
            <h2 className="sr-only">Results</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
              {pagedProducts.map((product, index) => (
                <div
                  key={product.id}
                  id={`product-${product.id}`}
                  className={cn(
                    "scroll-mt-24 rounded-card",
                    product.id === highlightId && "ring-1 ring-primary/40 ring-offset-2 ring-offset-background",
                  )}
                >
                  <ProductCard product={product} index={index} />
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex flex-col items-center gap-3 py-6">
                <ProductPagination
                  page={currentPage}
                  totalPages={totalPages}
                  onPageChange={goToPage}
                  hrefFor={pageHref}
                />
                <p className="text-xs tabular-nums text-muted-foreground">
                  Showing {pageStart + 1}-{pageStart + pagedProducts.length} of {formatNumber(count)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* No Results */}
        {!loading && count === 0 && (
          query.trim() ? (
            <EmptyState
              icon={SearchX}
              title={`Nothing matches “${query}”`}
              description="Check the spelling or try a broader word such as oil, serum or churna."
              action={{ label: "Search again", onClick: searchAgain }}
              className="py-16 sm:py-20"
            />
          ) : (
            <EmptyState
              icon={Search}
              title="What are you looking for?"
              description="Search by product, ingredient or concern."
              action={{ label: "Search", onClick: searchAgain }}
              className="py-16 sm:py-20"
            />
          )
        )}
      </main>

      <div className="hidden md:block">
        <Footer />
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default SearchResults;
