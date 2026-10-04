import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { subscribeToUserOrders } from '@/services/orderService';
import { getActiveProductsCached } from '@/services/productCache';
import { adaptFirebaseToUI } from '@/lib/productAdapter';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import EmptyState from '@/components/EmptyState';
import WishlistToggle from '@/components/WishlistToggle';
import { IconButton } from '@/components/ui/icon-button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWishlist } from '@/hooks/useWishlist';
import { formatINR, plural } from '@/lib/format';
import { DUR, EASE_OUT, staggerDelay } from '@/lib/motion';
import { ArrowLeft, Package, ShoppingCart, Search, ShoppingBag, ChevronDown, X } from 'lucide-react';
import { SmartImage } from "@/components/ui/smart-image";

interface OrderedProduct {
  productId: string;
  name: string;
  image: string;
  price: number;
  lastOrderDate: Date;
}

type SortKey = 'recent' | 'price-low' | 'price-high';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'recent', label: 'Recently ordered' },
  { key: 'price-low', label: 'Price: low to high' },
  { key: 'price-high', label: 'Price: high to low' },
];

const BuyAgain = () => {
  const { user } = useAuth();
  const { addToCart, totalItems } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const navigate = useNavigate();
  const [orderedProducts, setOrderedProducts] = useState<OrderedProduct[]>([]);
  const [suggestedProducts, setSuggestedProducts] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // The shop's live products by id, so "Order again" uses today's price (owner decision ACCT-29).
  // null while loading; productsFailed falls back to the price on the old order.
  const [liveProducts, setLiveProducts] = useState<Map<string, any> | null>(null);
  const [productsFailed, setProductsFailed] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/account');
      return;
    }

    // Subscribe to user's orders
    const unsubscribe = subscribeToUserOrders(user.uid, (orders) => {
      // Extract products from delivered orders
      const deliveredOrders = orders.filter(
        order => order.status === 'delivered'
      );

      // Create a map of products with their latest order date
      const productMap = new Map<string, OrderedProduct>();

      deliveredOrders.forEach(order => {
        order.items.forEach(item => {
          const existingProduct = productMap.get(item.productId);
          const currentOrderDate = order.createdAt.toDate();

          if (!existingProduct || currentOrderDate > existingProduct.lastOrderDate) {
            productMap.set(item.productId, {
              productId: item.productId,
              name: item.name,
              image: item.image,
              price: item.price,
              lastOrderDate: currentOrderDate,
            });
          }
        });
      });

      // Convert to array and sort by latest order date
      const productsArray = Array.from(productMap.values()).sort(
        (a, b) => b.lastOrderDate.getTime() - a.lastOrderDate.getTime()
      );

      setOrderedProducts(productsArray);
      setLoading(false);
    });

    // Fetch live products (prices + suggestions)
    fetchSuggestedProducts();

    return () => unsubscribe();
  }, [user, navigate]);

  const fetchSuggestedProducts = async () => {
    try {
      const products = await getActiveProductsCached();
      const adaptedProducts = products.map(adaptFirebaseToUI);
      setLiveProducts(new Map(adaptedProducts.map((p) => [p.id, p])));
      // Shuffle and take random products for suggestions
      const shuffled = [...adaptedProducts].sort(() => Math.random() - 0.5);
      setSuggestedProducts(shuffled.slice(0, 20));
    } catch (error) {
      console.error('Error fetching suggested products:', error);
      setProductsFailed(true);
    }
  };

  // Build and sort the ordered products, priced from the live catalogue
  useEffect(() => {
    const productsToSort = orderedProducts.map(p => {
      const live = liveProducts?.get(p.productId);
      return {
        id: p.productId,
        name: p.name,
        image: p.image,
        // Today's price when the product is still on sale; the old order price only if the catalogue could not load.
        price: live ? live.price : p.price,
        category: live?.category,
        available: productsFailed || !!live,
        isOrdered: true,
        lastOrderDate: p.lastOrderDate,
      };
    });

    let sorted = [...productsToSort];
    if (sortBy === 'price-low') {
      sorted.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-high') {
      sorted.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'recent') {
      sorted.sort((a, b) => b.lastOrderDate.getTime() - a.lastOrderDate.getTime());
    }

    setAllProducts(sorted);
  }, [orderedProducts, sortBy, liveProducts, productsFailed]);

  // Filter products by search query
  const displayedProducts = searchQuery.trim()
    ? allProducts.filter(p => p.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : allProducts;

  const pageLoading = loading || (liveProducts === null && !productsFailed);

  const sortMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex min-h-[44px] items-center gap-1 rounded-control px-2 text-sm text-foreground transition-colors duration-hover hover:bg-muted data-[state=open]:bg-muted">
        Sort by
        <ChevronDown aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          {SORT_OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.key} value={o.key}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="min-h-dvh tx-paper">
      <div className="hidden lg:block">
        <Header />
      </div>

      {/* Mobile Header */}
      <header className="tx-sheet sticky top-0 z-sticky border-b border-foreground/[0.08] lg:hidden">
        {showSearch ? (
          /* Search Bar Mode */
          <div className="flex items-center gap-1 px-2 py-1.5">
            <IconButton label="Close search" onClick={() => { setShowSearch(false); setSearchQuery(''); }}>
              <ArrowLeft />
            </IconButton>
            <div className="relative flex-1">
              <label htmlFor="buy-again-search" className="sr-only">Search your past products</label>
              <input
                id="buy-again-search"
                type="search"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search your products"
                className="h-11 w-full rounded-control border border-input bg-card pl-3 pr-11 text-base text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
              />
              {searchQuery && (
                <IconButton
                  label="Clear search"
                  size="sm"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                >
                  <X />
                </IconButton>
              )}
            </div>
          </div>
        ) : (
          /* Normal Header */
          <div className="flex items-center justify-between px-2 py-1.5">
            <div className="flex flex-1 items-center gap-1">
              <IconButton label="Back" onClick={() => navigate(-1)}>
                <ArrowLeft />
              </IconButton>
              <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">Buy again</h1>
            </div>
            <div className="flex items-center gap-1">
              <IconButton label="Search" onClick={() => setShowSearch(true)}>
                <Search />
              </IconButton>
              <IconButton label={totalItems > 0 ? `Bag, ${plural(totalItems, 'item')}` : 'Bag'} onClick={() => navigate('/cart')}>
                <ShoppingBag />
                {totalItems > 0 && (
                  <span aria-hidden="true" className="absolute right-0.5 top-0.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold leading-5 text-primary-foreground tabular-nums">
                    {totalItems}
                  </span>
                )}
              </IconButton>
            </div>
          </div>
        )}

        {/* Sort Bar */}
        <div className="flex items-center justify-between border-t border-foreground/[0.08] py-0.5 pl-4 pr-2">
          <span className="text-sm text-muted-foreground tabular-nums">
            {plural(displayedProducts.length, 'item')}
          </span>
          {sortMenu}
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 pb-24 outline-none lg:py-8 lg:pb-8">
        {/* Desktop Back Button & Title */}
        <div className="mb-6 hidden items-center gap-2 lg:flex">
          <IconButton label="Back" onClick={() => navigate(-1)}>
            <ArrowLeft />
          </IconButton>
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground lg:text-2xl">Buy again</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Products from your past orders</p>
          </div>
        </div>

        {/* All Products Grid */}
        {pageLoading ? (
          <div aria-busy="true" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <span className="sr-only" role="status">Loading your products</span>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="card-product overflow-hidden p-1.5">
                <Skeleton className="aspect-[3/4] w-full rounded-[8px]" />
                <div className="space-y-2 p-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-10 w-full rounded-control" />
                </div>
              </div>
            ))}
          </div>
        ) : allProducts.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {displayedProducts.map((product, index) => (
              <motion.li
                key={product.id || index}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: DUR.modal, ease: EASE_OUT, delay: staggerDelay(index) }}
                className="card-product flex flex-col overflow-hidden p-1.5"
              >
                {/* Product Image + name: one link to the product */}
                <Link to={`/product/${product.id}`} className="group block rounded-[8px]">
                  <div className="tile-img relative aspect-[3/4] overflow-hidden">
                    <SmartImage
                      src={product.image}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105" preset="card" />
                    {product.isOrdered && (
                      <span className="tag-dark absolute left-2 top-2">Ordered</span>
                    )}
                  </div>

                  {/* Product Info */}
                  <div className="px-1.5 pb-2 pt-2.5">
                    <p className="text-sm font-semibold text-foreground tabular-nums">
                      {product.available ? formatINR(product.price) : 'Not available'}
                    </p>
                    <h2 className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-foreground" title={product.name}>
                      {product.name}
                    </h2>
                  </div>
                </Link>

                {/* Add to Bag Button */}
                <div className="mt-auto px-1.5 pb-1.5">
                  <button
                    type="button"
                    disabled={!product.available}
                    onClick={() => {
                      addToCart({
                        id: product.id,
                        name: product.name,
                        price: product.price,
                        image: product.image,
                        category: product.category,
                      });
                    }}
                    className="btn-copper h-10 w-full justify-center px-3"
                  >
                    {product.available ? 'Order again' : 'Unavailable'}
                    <span className="sr-only">: {product.name}</span>
                  </button>
                </div>
              </motion.li>
            ))}
          </ul>
        ) : (
          <div className="panel tx-sheet">
            <EmptyState
              icon={Package}
              title="No previous orders"
              description="Products from your delivered orders will appear here."
              action={{ label: 'Start shopping', to: '/' }}
            />
          </div>
        )}

        {/* You May Also Like Section - Horizontal Scroll */}
        {suggestedProducts.length > 0 && (
          <section aria-labelledby="suggestions-heading" className="mt-10">
            <h2 id="suggestions-heading" className="mb-4 font-heading text-lg font-semibold tracking-tight text-foreground lg:text-2xl">
              You may also like
            </h2>

            <ul className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-4">
              {suggestedProducts.map((product, index) => {
                const name: string = product.title ?? product.name ?? 'Product';
                return (
                  <motion.li
                    key={`suggest-${product.id || index}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: DUR.modal, ease: EASE_OUT, delay: staggerDelay(index) }}
                    className="card-product relative flex w-36 shrink-0 flex-col overflow-hidden p-1.5 lg:w-44"
                  >
                    <Link to={`/product/${product.id}`} className="group block rounded-[8px]">
                      <div className="tile-img relative aspect-square overflow-hidden">
                        <SmartImage
                          src={product.image}
                          alt=""
                          className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105" preset="card" />
                      </div>
                      <h3 className="mt-2 line-clamp-2 min-h-[2.5rem] px-1 text-sm leading-5 text-foreground" title={name}>
                        {name}
                      </h3>
                    </Link>
                    {/* Wishlist Heart */}
                    <WishlistToggle
                      name={name}
                      saved={isInWishlist(product.id)}
                      onToggle={() => toggleWishlist(product.id, name)}
                      size="sm"
                      className="absolute right-3 top-3 z-raised"
                    />
                    <div className="mt-auto flex items-center justify-between gap-1 px-1 pb-0.5 pt-1">
                      <p className="text-sm font-semibold text-foreground tabular-nums lg:text-base">
                        {formatINR(product.price)}
                      </p>
                      <IconButton
                        label={`Add ${name} to cart`}
                        size="sm"
                        onClick={() => {
                          addToCart({
                            id: product.id,
                            name,
                            price: product.price,
                            image: product.image,
                            category: product.category,
                          });
                        }}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                      >
                        <ShoppingCart />
                      </IconButton>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          </section>
        )}
      </main>

      <div className="hidden lg:block">
        <Footer />
      </div>
    </div>
  );
};

export default BuyAgain;
