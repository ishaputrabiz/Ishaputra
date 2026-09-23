import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, ArrowLeft, SlidersHorizontal, ShoppingBag, X } from "lucide-react";
import { getActiveProductsCached, useCatalogRevision } from "@/services/productCache";
import { UIProduct, adaptFirebaseToUI } from "@/lib/productAdapter";
import ProductCard from "@/components/ProductCard";
import MobileBottomNav from "@/components/MobileBottomNav";
import ProductPagination from "@/components/ProductPagination";

/** Results per page; the page number lives in the URL (?page=2). */
const PAGE_SIZE = 24;

const SearchResults = () => {
  /** Changes when an admin publishes; re-reads the catalog below. */
  const catalogRevision = useCatalogRevision();

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const query = searchParams.get("q") || "";
  const highlightId = searchParams.get("highlight") || "";

  const [allProducts, setAllProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<string>("relevance");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      try {
        const products = await getActiveProductsCached();
        const uiProducts = products.map((p) => adaptFirebaseToUI(p as any));
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
    if (!query) return [];
    const q = query.toLowerCase();
    return allProducts.filter((product) => {
      const title = product.title.toLowerCase();
      const category = product.category?.toLowerCase() || "";
      if (q.length === 1) {
        return (
          title.split(/\s+/).some((w) => w.startsWith(q)) ||
          category.split(/\s+/).some((w) => w.startsWith(q)) ||
          title.startsWith(q)
        );
      }
      return title.includes(q) || category.includes(q);
    });
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

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900 pb-20">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button onClick={() => navigate(-1)} className="p-2 -ml-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-zinc-300" />
          </button>
          <button
            onClick={() => navigate("/search")}
            className="flex-1 flex items-center gap-2 bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-800 px-3 py-2.5"
          >
            <Search className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
            <span className="text-sm text-gray-700 dark:text-zinc-300 truncate">{query}</span>
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-full transition-colors ${showFilters ? "bg-primary/10 text-primary" : "hover:bg-gray-100"}`}
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
        </div>

        {/* Sort/Filter bar */}
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-100 dark:border-zinc-800 px-4 py-3 bg-gray-50 dark:bg-zinc-900"
          >
            <p className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wider font-medium mb-2">Sort By</p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "relevance", label: "Relevance" },
                { value: "price-low-high", label: "Price: Low to High" },
                { value: "price-high-low", label: "Price: High to Low" },
                { value: "newest", label: "Newest" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setSortBy(opt.value);
                    setShowFilters(false);
                    goToPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    sortBy === opt.value
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-gray-700 border-gray-200 hover:border-primary/30"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Results Count */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
        <p className="text-sm text-gray-500 dark:text-zinc-500">
          {loading ? (
            "Searching..."
          ) : (
            <>
              <span className="font-semibold text-gray-900 dark:text-zinc-100">{sortedProducts.length}</span> results for "
              <span className="font-medium text-gray-900 dark:text-zinc-100">{query}</span>"
            </>
          )}
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-2 gap-3 p-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-square bg-gray-200 dark:bg-zinc-800 rounded-xl mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-zinc-800 rounded w-3/4 mb-1" />
              <div className="h-3 bg-gray-200 dark:bg-zinc-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Results Grid */}
      {!loading && sortedProducts.length > 0 && (
        <div className="p-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-0 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            {pagedProducts.map((product, index) => (
              <motion.div
                key={product.id}
                id={`product-${product.id}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.5) }}
                className={`${product.id === highlightId ? "bg-primary/5" : ""} border-b border-r border-gray-200`}
              >
                <ProductCard product={product} index={index} />
              </motion.div>
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
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                Showing {pageStart + 1}–{pageStart + pagedProducts.length} of {sortedProducts.length}
              </p>
            </div>
          )}
        </div>
      )}

      {/* No Results */}
      {!loading && sortedProducts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-6">
          <ShoppingBag className="w-16 h-16 text-gray-200 mb-4" />
          <p className="text-lg font-medium text-gray-700 dark:text-zinc-300 mb-1">No products found</p>
          <p className="text-sm text-gray-400 dark:text-zinc-500 text-center mb-6">
            We couldn't find any products matching "{query}". Try a different search term.
          </p>
          <button
            onClick={() => navigate("/search")}
            className="px-6 py-2.5 bg-primary text-white text-sm font-medium rounded-full hover:bg-primary/90 transition-colors"
          >
            Search Again
          </button>
        </div>
      )}

      <MobileBottomNav />
    </div>
  );
};

export default SearchResults;
