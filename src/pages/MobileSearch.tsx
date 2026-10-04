import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Mic, ArrowLeft, X, Clock, TrendingUp, ShoppingBag, SearchX } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getActiveProductsCached, useCatalogRevision } from "@/services/productCache";
import { UIProduct, adaptFirebaseToUI } from "@/lib/productAdapter";
import { SmartImage } from "@/components/ui/smart-image";
import { IconButton } from "@/components/ui/icon-button";
import { usePageMeta } from "@/hooks/usePageMeta";
import { formatINR } from "@/lib/format";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { BRAND } from '@/config/brand';

type SearchableProduct = UIProduct & { searchText: string };

/**
 * Every word must appear in the name, category or subcategory, in any order
 * ("hair oil" finds "Bhringraj Hair Strength Oil"). One-letter words only
 * match the start of a word. Same rule as the results page.
 */
const matchesQuery = (searchText: string, query: string) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const hayWords = searchText.split(/[^a-z0-9]+/);
  return words.every((w) => (w.length === 1 ? hayWords.some((hw) => hw.startsWith(w)) : searchText.includes(w)));
};

// Speech Recognition types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  onstart: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

const SEARCH_HISTORY_KEY = BRAND.storageKeys.searchHistory;
const MAX_HISTORY = 10;

const getSearchHistory = (): string[] => {
  try {
    const data = localStorage.getItem(SEARCH_HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveSearchHistory = (history: string[]) => {
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
};

const addToSearchHistory = (term: string) => {
  const history = getSearchHistory();
  const filtered = history.filter((h) => h.toLowerCase() !== term.toLowerCase());
  filtered.unshift(term);
  saveSearchHistory(filtered);
};

const MobileSearch = () => {
  /** Changes when an admin publishes; re-reads the catalog below. */
  const catalogRevision = useCatalogRevision();

  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [allProducts, setAllProducts] = useState<SearchableProduct[]>([]);
  const [suggestions, setSuggestions] = useState<SearchableProduct[]>([]);

  usePageMeta({ title: "Search", noindex: true });
  const [searchHistory, setSearchHistory] = useState<string[]>(getSearchHistory());
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasSpokenRef = useRef(false);

  // Popular/trending searches (static list for now)
  const trendingSearches = ["Shilajit", "Ashwagandha", "Hair oil", "Beard oil", "Face wash", "Herbal tea"];

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Load all products
  useEffect(() => {
    const loadProducts = async () => {
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
      }
    };
    loadProducts();
      // Re-runs when an admin publishes a new catalog, so a price change
      // reaches this screen without the visitor reloading it.
  }, [catalogRevision]);

  // Clear silence timeout helper
  const clearSilenceTimeout = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, []);

  const startSilenceTimeout = useCallback(() => {
    clearSilenceTimeout();
    silenceTimeoutRef.current = setTimeout(() => {
      if (recognitionRef.current && hasSpokenRef.current) {
        recognitionRef.current.stop();
      }
    }, 1500);
  }, [clearSilenceTimeout]);

  // Init speech recognition
  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognitionAPI) {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-IN";

      recognition.onstart = () => {
        setIsListening(true);
        hasSpokenRef.current = false;
      };
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let fullTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          fullTranscript += event.results[i][0].transcript;
        }
        if (fullTranscript) {
          hasSpokenRef.current = true;
          setSearchQuery(fullTranscript.trim());
          startSilenceTimeout();
        }
      };
      recognition.onend = () => {
        setIsListening(false);
        clearSilenceTimeout();
        hasSpokenRef.current = false;
      };
      recognition.onerror = () => {
        setIsListening(false);
        clearSilenceTimeout();
        hasSpokenRef.current = false;
      };
      recognitionRef.current = recognition;
    }
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
      clearSilenceTimeout();
    };
  }, [startSilenceTimeout, clearSilenceTimeout]);

  const toggleVoiceSearch = useCallback(() => {
    if (!recognitionRef.current) {
      toast("Voice search isn't supported in this browser");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      clearSilenceTimeout();
    } else {
      setSearchQuery("");
      hasSpokenRef.current = false;
      try {
        recognitionRef.current.start();
      } catch (error) {
        console.error("Error starting speech recognition:", error);
      }
    }
  }, [isListening, clearSilenceTimeout]);

  // Product suggestion filtering
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length === 0) {
      setSuggestions([]);
      return;
    }
    const filtered = allProducts
      .filter((product) => matchesQuery(product.searchText, q))
      .slice(0, 8);
    setSuggestions(filtered);
  }, [searchQuery, allProducts]);

  const handleSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    addToSearchHistory(trimmed);
    setSearchHistory(getSearchHistory());
    navigate(`/search-results?q=${encodeURIComponent(trimmed)}`);
  };

  const handleProductClick = (product: UIProduct) => {
    addToSearchHistory(searchQuery.trim() || product.title);
    setSearchHistory(getSearchHistory());
    navigate(`/search-results?q=${encodeURIComponent(searchQuery.trim() || product.title)}&highlight=${product.id}`);
  };

  const clearHistory = () => {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    setSearchHistory([]);
  };

  const removeHistoryItem = (term: string) => {
    const updated = searchHistory.filter((h) => h !== term);
    saveSearchHistory(updated);
    setSearchHistory(updated);
  };

  const trimmedQuery = searchQuery.trim();

  return (
    <div className="min-h-screen tx-paper">
      {/* Search Bar Header */}
      <div className="sticky top-0 z-header border-b border-foreground/[0.08] bg-card">
        <div className="mx-auto flex max-w-2xl items-center gap-1.5 px-2 py-2 sm:px-4">
          <IconButton label="Go back" onClick={() => navigate(-1)}>
            <ArrowLeft aria-hidden="true" />
          </IconButton>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(searchQuery);
            }}
            className={cn(
              "flex h-11 min-w-0 flex-1 items-center rounded-control border bg-background transition-[border-color,box-shadow] duration-hover ease-out",
              isListening
                ? "border-primary ring-2 ring-primary/20"
                : "border-input focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
            )}
          >
            <Search aria-hidden="true" className="ml-3 size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              aria-label="Search products"
              placeholder={isListening ? "Listening" : "Try shilajit or hair oil"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm [&::-webkit-search-cancel-button]:appearance-none"
            />
            {searchQuery && (
              <IconButton
                label="Clear search"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  inputRef.current?.focus();
                }}
                className="text-muted-foreground"
              >
                <X aria-hidden="true" />
              </IconButton>
            )}
            <IconButton
              label={isListening ? "Stop voice search" : "Search by voice"}
              aria-pressed={isListening}
              size="sm"
              onClick={toggleVoiceSearch}
              className={cn(
                "mr-1",
                isListening ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "text-muted-foreground",
              )}
            >
              <Mic aria-hidden="true" />
            </IconButton>
          </form>
        </div>
      </div>

      {/* Voice listening indicator */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            role="status"
            className="flex items-center justify-center gap-2 border-b border-primary/20 bg-primary/10 py-3"
          >
            <div aria-hidden="true" className="flex h-5 items-center gap-1">
              {[0, 0.1, 0.2, 0.3].map((delay, i) => (
                <motion.div
                  key={i}
                  animate={{ scaleY: [1, i % 2 === 0 ? 1.5 : 2, 1] }}
                  transition={{ repeat: Infinity, duration: 0.5, delay }}
                  className="h-3 w-1 rounded-full bg-primary"
                />
              ))}
            </div>
            <span className="text-xs font-semibold text-primary">Listening</span>
          </motion.div>
        )}
      </AnimatePresence>

      <main id="main" tabIndex={-1} className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
        <h1 className="sr-only">Search</h1>

        {/* Product Suggestions (when typing) */}
        {trimmedQuery && suggestions.length > 0 && (
          <section aria-labelledby="search-suggestions" className="mb-4">
            <h2 id="search-suggestions" className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Suggestions
            </h2>
            <ul className="space-y-0.5">
              {suggestions.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => handleProductClick(product)}
                    className="flex w-full items-center gap-3 rounded-card p-2 text-left transition-[background-color] duration-hover ease-out hover:bg-muted/60 active:bg-muted"
                  >
                    <div className="tile-img size-11 shrink-0 overflow-hidden !rounded-control">
                      {product.image ? (
                        <SmartImage src={product.image} alt="" className="h-full w-full object-cover" preset="thumb" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <ShoppingBag aria-hidden="true" className="size-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{product.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{product.category}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatINR(product.price)}</p>
                  </button>
                </li>
              ))}
            </ul>
            {/* Search for keyword button */}
            <button
              type="button"
              onClick={() => handleSearch(searchQuery)}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-control border border-primary/30 bg-primary/5 px-4 text-sm font-medium text-primary transition-[background-color,transform] duration-press ease-out hover:bg-primary/10 active:scale-[0.97]"
            >
              <Search aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">See all results for “{trimmedQuery}”</span>
            </button>
          </section>
        )}

        {/* No results */}
        {trimmedQuery && suggestions.length === 0 && allProducts.length > 0 && (
          <div role="status" className="flex flex-col items-center py-12 text-center">
            <div className="tx-slate mb-4 grid size-12 place-items-center rounded-card">
              <SearchX aria-hidden="true" className="size-5 text-highlight-soft" />
            </div>
            <p className="font-heading text-base font-semibold text-foreground [text-wrap:balance]">
              Nothing matches “{trimmedQuery}”
            </p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground [text-wrap:pretty]">
              Check the spelling or try a broader word such as oil, serum or churna.
            </p>
          </div>
        )}

        {/* When input is empty: show history + trending */}
        {!trimmedQuery && (
          <>
            {/* Search History */}
            {searchHistory.length > 0 && (
              <section aria-labelledby="recent-searches" className="mb-6">
                <div className="mb-1 flex items-center justify-between">
                  <h2 id="recent-searches" className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                    Recent searches
                  </h2>
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="-mr-2 h-9 rounded-control px-2 text-xs font-medium text-muted-foreground transition-colors duration-hover ease-out hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                <ul className="space-y-0.5">
                  {searchHistory.map((term) => (
                    <li key={term} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSearch(term)}
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-card px-2 text-left transition-[background-color] duration-hover ease-out hover:bg-muted/60"
                      >
                        <Clock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm text-foreground">{term}</span>
                      </button>
                      <IconButton
                        label={`Remove ${term} from recent searches`}
                        size="sm"
                        onClick={() => removeHistoryItem(term)}
                        className="text-muted-foreground"
                      >
                        <X aria-hidden="true" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Trending Searches */}
            <section aria-labelledby="popular-searches" className="mb-7">
              <h2
                id="popular-searches"
                className="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground"
              >
                <TrendingUp aria-hidden="true" className="size-3.5" /> Popular searches
              </h2>
              <div className="flex flex-wrap gap-2">
                {trendingSearches.map((term) => (
                  <button
                    type="button"
                    key={term}
                    onClick={() => handleSearch(term)}
                    className="h-9 rounded-control border border-foreground/15 bg-card px-3.5 text-sm text-foreground transition-[background-color,border-color,color,transform] duration-press ease-out hover:border-primary/40 hover:text-primary active:scale-[0.97]"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </section>

            {/* A few products to start from */}
            {allProducts.length > 0 && (
              <section aria-labelledby="shop-the-range">
                <h2 id="shop-the-range" className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Shop the range
                </h2>
                {/* Two full rows at every width: 3 x 2 on phones, 4 x 2 from md. */}
                <ul className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4">
                  {allProducts.slice(0, 8).map((product, index) => (
                    <li key={product.id} className={cn(index >= 6 && "hidden md:block")}>
                      <Link
                        to={`/product/${product.id}`}
                        onClick={() => {
                          addToSearchHistory(product.title);
                          setSearchHistory(getSearchHistory());
                        }}
                        className="card-product group flex h-full flex-col overflow-hidden p-1"
                      >
                        <div className="tile-img aspect-square overflow-hidden">
                          {product.image ? (
                            <SmartImage
                              src={product.image}
                              alt=""
                              className="h-full w-full object-cover transition-transform duration-reveal ease-out group-hover:scale-[1.03]"
                              preset="card"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <ShoppingBag aria-hidden="true" className="size-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="px-1 pb-1 pt-2">
                          <p title={product.title} className="line-clamp-2 min-h-[2.6em] text-[13px] font-semibold leading-[1.3] text-foreground transition-colors duration-hover ease-out group-hover:text-primary md:text-sm">
                            {product.title}
                          </p>
                          <p className="price-now mt-1 text-[15px]">{formatINR(product.price)}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default MobileSearch;
