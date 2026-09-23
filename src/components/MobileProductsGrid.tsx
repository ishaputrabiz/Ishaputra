import { useState, useEffect, useMemo } from "react";
import { Star, Heart, ShoppingBag, ShoppingCart, Eye, SlidersHorizontal, ChevronDown, X, Search, Check, Plus, Minus } from "lucide-react";
import { Product } from '@/services/productService';

import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { useWishlist } from "@/hooks/useWishlist";
import { useNavigate } from "react-router-dom";
import { useSilverRate, computeSilverOriginalPrice } from "@/contexts/SilverRateContext";
import { SmartImage } from "@/components/ui/smart-image";
import { subscribeToActiveProducts } from '@/services/productCache';

type SortOption = "newest" | "price-low" | "price-high" | "popularity" | "discount" | "rating";
type PriceRange = "all" | "under500" | "500-999" | "1000-above";

const SHOP_CATEGORIES = [
  'Top Deals',
  'Best Sellers',
  'Trend Products',
  'Jewellery',
  'Furniture',
  'Articles',
  'Other Products',
];

const SPECIFIC_CATEGORIES = [
  'Bracelets',
  'Necklaces',
  'Rings',
  'Jewelry',
];

const ALL_CATEGORIES = [...SHOP_CATEGORIES, ...SPECIFIC_CATEGORIES];

const MobileProductsGrid = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSort, setActiveSort] = useState<SortOption>("newest");
  const [activePriceRange, setActivePriceRange] = useState<PriceRange>("all");
  const { ratePerGram } = useSilverRate();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showSortModal, setShowSortModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const { addToCart, items, updateQuantity, removeFromCart } = useCart();
  const { toast } = useToast();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = subscribeToActiveProducts((fetchedProducts) => {
      setProducts(fetchedProducts);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Prevent body scroll when modals are open
  useEffect(() => {
    if (showSortModal || showCategoryModal) {
      document.body.style.overflow = 'hidden';
      // Dispatch event to hide bottom nav
      window.dispatchEvent(new Event('mobile-modal-open'));
    } else {
      document.body.style.overflow = 'unset';
      // Dispatch event to show bottom nav
      window.dispatchEvent(new Event('mobile-modal-close'));
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.dispatchEvent(new Event('mobile-modal-close'));
    };
  }, [showSortModal, showCategoryModal]);

  const handleAddToCart = async (product: Product) => {
    try {
      const added = addToCart({
        id: product.id || "",
        name: product.name,
        price: product.price,
        originalPrice: product.originalPrice,
        image: product.media.images[0] || "",
        category: product.category,
        stock: product.inventory?.stock,
      });
      if (!added) return;
      
      toast({
        title: "Added to cart",
        description: `${product.name} has been added to your cart.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add item to cart. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleWishlistToggle = (product: Product) => {
    toggleWishlist(product.id || "", product.name);
  };

  const handleProductClick = (productId: string) => {
    navigate(`/product/${productId}`);
  };

  const formatPrice = (price: number) => {
    return `₹${price.toLocaleString('en-IN')}`;
  };

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let result = [...products];

    // Category filter
    if (selectedCategories.length > 0) {
      result = result.filter((p) => selectedCategories.includes(p.category));
    }

    // Price range filter
    if (activePriceRange === "under500") {
      result = result.filter((p) => p.price < 500);
    } else if (activePriceRange === "500-999") {
      result = result.filter((p) => p.price >= 500 && p.price <= 999);
    } else if (activePriceRange === "1000-above") {
      result = result.filter((p) => p.price >= 1000);
    }

    // Sort
    if (activeSort === "price-low") {
      result.sort((a, b) => a.price - b.price);
    } else if (activeSort === "price-high") {
      result.sort((a, b) => b.price - a.price);
    } else if (activeSort === "discount") {
      result.sort((a, b) => (b.discount || 0) - (a.discount || 0));
    } else if (activeSort === "popularity") {
      // Sort by bestseller flag, then by price
      result.sort((a, b) => {
        if (a.flags?.isBestSeller && !b.flags?.isBestSeller) return -1;
        if (!a.flags?.isBestSeller && b.flags?.isBestSeller) return 1;
        return 0;
      });
    } else if (activeSort === "rating") {
      // Default rating sort (highest first)
      result.sort((a, b) => b.price - a.price); // Placeholder since we don't have ratings
    }

    return result;
  }, [products, selectedCategories, activePriceRange, activeSort]);

  const getSortLabel = (sort: SortOption): string => {
    switch (sort) {
      case "price-low": return "Price: Low to High";
      case "price-high": return "Price: High to Low";
      case "popularity": return "Popularity";
      case "discount": return "Discount";
      case "newest": return "What's New";
      case "rating": return "Customer Rating";
      default: return "Sort";
    }
  };

  const toggleCategorySelection = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const filteredCategoryList = useMemo(() => {
    if (!categorySearch.trim()) return ALL_CATEGORIES;
    return ALL_CATEGORIES.filter(cat => 
      cat.toLowerCase().includes(categorySearch.toLowerCase())
    );
  }, [categorySearch]);

  if (loading) {
    return (
      <section className="md:hidden py-6 px-4 bg-muted">
        <div className="text-center text-muted-foreground">Loading products...</div>
      </section>
    );
  }

  if (products.length === 0) {
    return null;
  }

  return (
    <>
      <section className="md:hidden py-6 bg-muted">
        {/* ─── FILTER PILLS ROW 1: Sort + Price Range ─── */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-2">
          {/* Sort Pill */}
          <button
            onClick={() => setShowSortModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              activeSort !== "newest"
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-foreground/80 border-border"
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            Sort
            <ChevronDown className="w-3 h-3" />
          </button>

          {/* Price Range Pills */}
          <button
            onClick={() => setActivePriceRange(activePriceRange === "1000-above" ? "all" : "1000-above")}
            className={`px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              activePriceRange === "1000-above"
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-foreground/80 border-border"
            }`}
          >
            ₹1000 And Above
          </button>

          <button
            onClick={() => setActivePriceRange(activePriceRange === "500-999" ? "all" : "500-999")}
            className={`px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              activePriceRange === "500-999"
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-foreground/80 border-border"
            }`}
          >
            ₹500 - ₹999
          </button>

          <button
            onClick={() => setActivePriceRange(activePriceRange === "under500" ? "all" : "under500")}
            className={`px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              activePriceRange === "under500"
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-foreground/80 border-border"
            }`}
          >
            Under ₹500
          </button>
        </div>

        {/* ─── FILTER PILLS ROW 2: Product Type ─── */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-3 mb-1">
          <button
            onClick={() => setShowCategoryModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
              selectedCategories.length > 0
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-foreground/80 border-border"
            }`}
          >
            Product Type
            {selectedCategories.length > 0 && (
              <span className="ml-0.5">({selectedCategories.length})</span>
            )}
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        {/* Active filter count */}
        {filteredProducts.length !== products.length && (
          <div className="flex items-center justify-between px-4 pb-3">
            <span className="text-[11px] text-muted-foreground">
            Showing {filteredProducts.length} of {products.length} products
          </span>
          <button
            onClick={() => {
              setActiveSort("newest");
              setActivePriceRange("all");
              setSelectedCategories([]);
            }}
            className="text-[11px] text-blue-600 font-medium"
          >
            Clear All
          </button>
        </div>
      )}

      {/* Products Grid */}
      <div className="grid grid-cols-2 gap-3 px-4">
        {filteredProducts.map((product) => {
          const price = product.price;
          const sp = (product as any).silverPricing;
          const discount = product.discount;
          const displayPrice = sp?.enabled && ratePerGram > 0
            ? computeSilverOriginalPrice(sp, ratePerGram)
            : product.price;
          const oldPrice = !sp?.enabled && discount && discount > 0
            ? product.originalPrice
            : null;
          const isWishlisted = isInWishlist(product.id || "");

          return (
            <div
              key={product.id}
              className="bg-card rounded-2xl overflow-hidden shadow-sm border border-border relative"
            >
              {/* Wishlist Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleWishlistToggle(product);
                }}
                className="absolute top-2 left-2 z-10 w-7 h-7 bg-card rounded-full flex items-center justify-center shadow-md"
              >
                <Heart
                  className={`w-4 h-4 ${
                    isWishlisted ? "fill-red-500 text-red-500" : "text-muted-foreground"
                  }`}
                />
              </button>

              {/* Discount Badge */}
              {discount && discount > 0 && (
                <div className="absolute top-2 right-2 z-10 bg-primary text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  {discount}% OFF
                </div>
              )}

              {/* Product Image */}
              <div
                onClick={() => handleProductClick(product.id || "")}
                className="relative aspect-square bg-muted cursor-pointer overflow-hidden"
              >
                <SmartImage
                  src={product.media.images[0] || "/placeholder.jpg"}
                  alt={product.name}
                  className="w-full h-full object-cover" preset="card" />
              </div>

              {/* Product Info */}
              <div className="p-2.5">
                {/* Cart control & Rating - Same Row */}
                <div className="flex items-center justify-between mb-1.5">
                  {(() => {
                    const cartItem = items.find((i) => i.id === product.id);
                    const qty = cartItem?.quantity ?? 0;
                    if (qty > 0) {
                      return (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 bg-primary/10 rounded-full px-1 py-0.5"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (qty <= 1) removeFromCart(product.id || "");
                              else updateQuantity(product.id || "", qty - 1);
                            }}
                            className="w-5 h-5 rounded-full bg-card border border-border flex items-center justify-center"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3 h-3 text-foreground" />
                          </button>
                          <span className="text-[11px] font-bold text-primary min-w-[14px] text-center">{qty}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateQuantity(product.id || "", qty + 1);
                            }}
                            className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    }
                    return (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddToCart(product);
                        }}
                        className="text-primary hover:text-primary/80 transition-colors"
                        aria-label="Add to cart"
                      >
                        <ShoppingCart className="w-5 h-5" />
                      </button>
                    );
                  })()}

                  {/* Rating & Reviews - Only show if product has rating */}
                  {product.rating && product.reviewCount && (
                    <div className="flex items-center gap-1">
                      <div className="flex items-center gap-0.5 bg-green-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                        <span>{product.rating}</span>
                        <Star className="w-2.5 h-2.5 fill-current" />
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        ({product.reviewCount})
                      </span>
                    </div>
                  )}
                </div>

                {/* Product Name */}
                <h3
                  onClick={() => handleProductClick(product.id || "")}
                  className="text-xs font-medium text-foreground mb-1.5 line-clamp-1 leading-snug cursor-pointer hover:text-primary"
                >
                  {product.name}
                </h3>

                {/* Price */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-sm font-bold text-foreground">
                    {formatPrice(displayPrice)}
                  </span>
                  {oldPrice && (
                    <span className="text-[10px] text-muted-foreground line-through">
                      {formatPrice(oldPrice)}
                    </span>
                  )}
                </div>

                {/* Explore Button */}
                <button
                  onClick={() => handleProductClick(product.id || "")}
                  className="w-full flex items-center justify-center gap-1.5 bg-primary text-white text-[10px] font-semibold py-1.5 rounded-full hover:bg-primary/90"
                >
                  <Eye className="w-3 h-3" />
                  EXPLORE
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* No results */}
      {filteredProducts.length === 0 && (
        <div className="text-center py-10 px-4">
          <p className="text-sm text-muted-foreground mb-2">No products found for selected filters</p>
          <button
            onClick={() => {
              setActiveSort("newest");
              setActivePriceRange("all");
              setSelectedCategories([]);
            }}
            className="text-sm text-primary font-medium"
          >
            Clear all filters
          </button>
        </div>
      )}
      </section>

      {/* ─── SORT MODAL ─── */}
      {showSortModal && (
        <div className="fixed inset-0 bg-black/50 z-50 md:hidden" onClick={() => setShowSortModal(false)}>
          <div 
            className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">Sort</h3>
              <button 
                onClick={() => setShowSortModal(false)}
                className="p-1 rounded-full hover:bg-muted"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Sort Options */}
            <div className="py-2">
              {[
                { value: "price-low" as SortOption, label: "Price: Low to High" },
                { value: "price-high" as SortOption, label: "Price: High to Low" },
                { value: "popularity" as SortOption, label: "Popularity" },
                { value: "discount" as SortOption, label: "Discount" },
                { value: "newest" as SortOption, label: "What's New" },
                { value: "rating" as SortOption, label: "Customer Rating" },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setActiveSort(option.value);
                    setShowSortModal(false);
                  }}
                  className={`w-full px-4 py-3.5 text-left text-sm transition-colors ${
                    activeSort === option.value
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground/80 hover:bg-muted"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── PRODUCT TYPE MODAL ─── */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 z-50 md:hidden" onClick={() => setShowCategoryModal(false)}>
          <div 
            className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-border flex-shrink-0">
              <h3 className="text-base font-semibold text-foreground">Product Type</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedCategories([])}
                  className="text-sm text-primary font-medium"
                >
                  Clear All
                </button>
                <button 
                  onClick={() => setShowCategoryModal(false)}
                  className="p-1 rounded-full hover:bg-muted"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-border flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search"
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground"
                />
              </div>
            </div>

            {/* Category List */}
            <div className="flex-1 overflow-y-auto">
              {/* Select All */}
              <button
                onClick={() => {
                  if (selectedCategories.length === ALL_CATEGORIES.length) {
                    setSelectedCategories([]);
                  } else {
                    setSelectedCategories([...ALL_CATEGORIES]);
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 flex items-center justify-center">
                    {selectedCategories.length === ALL_CATEGORIES.length && (
                      <Check className="w-5 h-5 text-blue-600" strokeWidth={3} />
                    )}
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    Select All ({ALL_CATEGORIES.length})
                  </span>
                </div>
              </button>

              {/* Shop Categories Header */}
              <div className="px-4 py-2 bg-muted">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Shop</h4>
              </div>

              {/* Shop Categories */}
              {SHOP_CATEGORIES.filter(cat => 
                !categorySearch || cat.toLowerCase().includes(categorySearch.toLowerCase())
              ).map((category) => (
                <button
                  key={category}
                  onClick={() => toggleCategorySelection(category)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 flex items-center justify-center">
                      {selectedCategories.includes(category) && (
                        <Check className="w-5 h-5 text-blue-600" strokeWidth={3} />
                      )}
                    </div>
                    <span className="text-sm text-foreground/80">{category}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {products.filter(p => p.category === category).length}
                  </span>
                </button>
              ))}

              {/* Specific Categories Header */}
              <div className="px-4 py-2 bg-muted mt-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Categories</h4>
              </div>

              {/* Specific Categories */}
              {SPECIFIC_CATEGORIES.filter(cat => 
                !categorySearch || cat.toLowerCase().includes(categorySearch.toLowerCase())
              ).map((category) => (
                <button
                  key={category}
                  onClick={() => toggleCategorySelection(category)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 flex items-center justify-center">
                      {selectedCategories.includes(category) && (
                        <Check className="w-5 h-5 text-blue-600" strokeWidth={3} />
                      )}
                    </div>
                    <span className="text-sm text-foreground/80">{category}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {products.filter(p => p.category === category).length}
                  </span>
                </button>
              ))}
            </div>

            {/* Footer Button */}
            <div className="px-4 py-3 border-t border-border bg-card flex-shrink-0">
              <button
                onClick={() => setShowCategoryModal(false)}
                className="w-full py-3 bg-foreground hover:bg-foreground/90 text-background text-sm font-semibold rounded-lg transition-colors"
              >
                Show Results
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileProductsGrid;
