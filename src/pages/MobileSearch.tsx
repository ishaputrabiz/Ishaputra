import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Mic, ArrowLeft, X, Clock, TrendingUp, ShoppingBag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getActiveProductsCached, useCatalogRevision } from "@/services/productCache";
import { UIProduct, adaptFirebaseToUI } from "@/lib/productAdapter";
import { SmartImage } from "@/components/ui/smart-image";

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

const SEARCH_HISTORY_KEY = "sreerasthu_search_history";
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
  const [allProducts, setAllProducts] = useState<UIProduct[]>([]);
  const [suggestions, setSuggestions] = useState<UIProduct[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>(getSearchHistory());
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasSpokenRef = useRef(false);

  // Popular/trending searches (static list for now)
  const trendingSearches = ["Necklace", "Silver Ring", "Earrings", "Bracelet", "Pooja Items", "Silver Idols"];

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // Load all products
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const products = await getActiveProductsCached();
        const uiProducts = products.map((p) => adaptFirebaseToUI(p as any));
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
      alert("Speech recognition is not supported in your browser.");
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
      .filter((product) => {
        const title = product.title.toLowerCase();
        const category = product.category?.toLowerCase() || "";
        if (q.length === 1) {
          return title.split(/\s+/).some((w) => w.startsWith(q)) || category.split(/\s+/).some((w) => w.startsWith(q));
        }
        return title.includes(q) || category.includes(q);
      })
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

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900 dark:bg-zinc-950 lg:hidden">
      {/* Search Bar Header */}
      <div className="sticky top-0 z-50 bg-white dark:bg-zinc-900 dark:bg-zinc-950 shadow-sm dark:shadow-black/40 border-b border-transparent dark:border-zinc-800 px-3 py-2.5 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-2 -ml-1 rounded-full hover:bg-gray-100 dark:bg-zinc-800 dark:hover:bg-zinc-800 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-zinc-300 dark:text-zinc-200" />
        </button>
        <div
          className={`flex-1 flex items-center bg-gray-50 dark:bg-zinc-900 rounded-lg border ${isListening ? "border-red-500 ring-2 ring-red-200 dark:ring-red-900/50" : "border-gray-200 dark:border-zinc-800"} overflow-hidden`}
        >
          <Search className="ml-3 w-4 h-4 text-gray-400 dark:text-zinc-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder={isListening ? "Listening..." : "Search any Product.."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch(searchQuery);
            }}
            className="flex-1 px-3 py-2.5 text-sm bg-transparent text-gray-900 dark:text-zinc-100 focus:outline-none placeholder-gray-400 dark:placeholder-zinc-500"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="p-2">
              <X className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
            </button>
          )}
          <button
            onClick={toggleVoiceSearch}
            className={`p-2 mr-1 rounded-md transition-colors ${isListening ? "bg-red-500" : "hover:bg-gray-200 dark:hover:bg-zinc-800"}`}
          >
            {isListening ? (
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
                <Mic className="w-4 h-4 text-white" />
              </motion.div>
            ) : (
              <Mic className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
            )}
          </button>
        </div>
      </div>

      {/* Voice listening indicator */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="flex items-center justify-center gap-2 py-3 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900/50"
          >
            <div className="flex gap-1">
              {[0, 0.1, 0.2, 0.3].map((delay, i) => (
                <motion.div
                  key={i}
                  animate={{ scaleY: [1, i % 2 === 0 ? 1.5 : 2, 1] }}
                  transition={{ repeat: Infinity, duration: 0.5, delay }}
                  className="w-1 h-4 bg-red-500 rounded-full"
                />
              ))}
            </div>
            <span className="text-xs text-red-600 dark:text-red-400 font-medium">Speak now...</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 py-3">
        {/* Product Suggestions (when typing) */}
        {searchQuery.trim() && suggestions.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wider font-medium mb-3">Suggestions</p>
            <div className="space-y-1">
              {suggestions.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  className="flex items-center gap-3 w-full p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-900 active:bg-gray-100 dark:bg-zinc-800 dark:active:bg-zinc-800 transition-colors"
                >
                  <div className="w-11 h-11 flex-shrink-0 bg-gray-100 dark:bg-zinc-800 rounded-lg overflow-hidden">
                    {product.image ? (
                      <SmartImage src={product.image} alt={product.title} className="w-full h-full object-cover" preset="card" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-5 h-5 text-gray-400 dark:text-zinc-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">{product.title}</p>
                    <p className="text-xs text-gray-500 dark:text-zinc-500 dark:text-zinc-400">{product.category}</p>
                  </div>
                  <p className="text-sm font-semibold text-primary flex-shrink-0">₹{product.price.toLocaleString()}</p>
                </button>
              ))}
            </div>
            {/* Search for keyword button */}
            <button
              onClick={() => handleSearch(searchQuery)}
              className="w-full mt-3 py-2.5 text-sm text-primary font-medium rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors flex items-center justify-center gap-2"
            >
              <Search className="w-4 h-4" />
              Search for "{searchQuery}"
            </button>
          </div>
        )}

        {/* No results */}
        {searchQuery.trim() && suggestions.length === 0 && allProducts.length > 0 && (
          <div className="text-center py-10">
            <ShoppingBag className="w-12 h-12 text-gray-300 dark:text-zinc-700 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-zinc-500 dark:text-zinc-400 text-sm">No products found for "{searchQuery}"</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">Try searching with different keywords</p>
          </div>
        )}

        {/* When input is empty: show history + trending */}
        {!searchQuery.trim() && (
          <>
            {/* Search History */}
            {searchHistory.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wider font-medium">Recent Searches</p>
                  <button onClick={clearHistory} className="text-xs text-red-500 dark:text-red-400 font-medium">
                    Clear All
                  </button>
                </div>
                <div className="space-y-0.5">
                  {searchHistory.map((term) => (
                    <div key={term} className="flex items-center gap-3 group">
                      <button
                        onClick={() => handleSearch(term)}
                        className="flex-1 flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-900 text-left transition-colors"
                      >
                        <Clock className="w-4 h-4 text-gray-400 dark:text-zinc-500 flex-shrink-0" />
                        <span className="text-sm text-gray-700 dark:text-zinc-300 dark:text-zinc-200 truncate">{term}</span>
                      </button>
                      <button
                        onClick={() => removeHistoryItem(term)}
                        className="p-1.5 rounded-full hover:bg-gray-100 dark:bg-zinc-800 dark:hover:bg-zinc-800 transition-colors"
                      >
                        <X className="w-4 h-4 text-gray-400 dark:text-zinc-500" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Trending Searches */}
            <div className="mb-6">
              <p className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Popular Searches
              </p>
              <div className="flex flex-wrap gap-2">
                {trendingSearches.map((term) => (
                  <button
                    key={term}
                    onClick={() => handleSearch(term)}
                    className="px-4 py-2 bg-gray-50 dark:bg-zinc-900 text-gray-700 dark:text-zinc-300 dark:text-zinc-200 text-sm rounded-full border border-gray-200 dark:border-zinc-800 hover:bg-primary/5 hover:border-primary/30 hover:text-primary dark:hover:bg-primary/10 transition-colors"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>

            {/* Popular Products */}
            {allProducts.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 dark:text-zinc-500 uppercase tracking-wider font-medium mb-3">Popular Products</p>
                <div className="grid grid-cols-3 gap-2">
                  {allProducts.slice(0, 6).map((product) => (
                    <button
                      key={product.id}
                      onClick={() => {
                        addToSearchHistory(product.title);
                        setSearchHistory(getSearchHistory());
                        navigate(`/product/${product.id}`);
                      }}
                      className="bg-gray-50 dark:bg-zinc-900 rounded-xl overflow-hidden border border-gray-100 dark:border-zinc-800 hover:border-primary/30 transition-colors"
                    >
                      <div className="aspect-square bg-gray-100 dark:bg-zinc-800">
                        {product.image ? (
                          <SmartImage src={product.image} alt={product.title} className="w-full h-full object-cover" preset="card" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ShoppingBag className="w-6 h-6 text-gray-300 dark:text-zinc-700" />
                          </div>
                        )}
                      </div>
                      <div className="p-2">
                        <p className="text-[11px] text-gray-700 dark:text-zinc-300 dark:text-zinc-200 font-medium truncate">{product.title}</p>
                        <p className="text-[11px] text-primary font-semibold">₹{product.price.toLocaleString()}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MobileSearch;
