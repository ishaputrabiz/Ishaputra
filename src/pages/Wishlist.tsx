import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, ShoppingBag, ArrowLeft, ArrowRight, ChevronRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MobileHeader from "@/components/MobileHeader";
import MobileBottomNav from "@/components/MobileBottomNav";
import MobileSearchBar from "@/components/MobileSearchBar";
import { useWishlist } from "@/hooks/useWishlist";
import { getProduct } from "@/services/productService";
import { UIProduct, adaptFirebaseToUI } from "@/lib/productAdapter";
import { SmartImage } from "@/components/ui/smart-image";
import { WishlistToggle } from "@/components/WishlistToggle";
import { EmptyState } from "@/components/EmptyState";
import { ProductGridSkeleton } from "@/components/skeletons";
import { formatINR, plural } from "@/lib/format";
import { DUR, EASE_OUT, staggerDelay } from "@/lib/motion";

/** Percentage saved, only when the product really has a higher old price. */
const percentOff = (p: UIProduct) =>
  p.oldPrice && p.oldPrice > p.price ? Math.round(((p.oldPrice - p.price) / p.oldPrice) * 100) : 0;

const Breadcrumb = ({ onPhoto = false }: { onPhoto?: boolean }) => (
  <nav aria-label="Breadcrumb">
    <ol className={`flex items-center gap-1.5 text-sm ${onPhoto ? "text-charcoal-foreground/80" : "text-muted-foreground"}`}>
      <li>
        <Link
          to="/"
          className={`underline-offset-4 transition-colors duration-hover hover:underline ${
            onPhoto ? "hover:text-charcoal-foreground" : "font-medium text-foreground"
          }`}
        >
          Home
        </Link>
      </li>
      <li aria-hidden="true">
        <ChevronRight className="size-3" />
      </li>
      <li aria-current="page" className={onPhoto ? "text-charcoal-foreground" : undefined}>
        Wishlist
      </li>
    </ol>
  </nav>
);

const Wishlist = () => {
  const navigate = useNavigate();
  const { wishlist, removeFromWishlist, isLoaded } = useWishlist();
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery] = useState("");

  useEffect(() => {
    const loadWishlistProducts = async () => {
      if (!isLoaded) return;

      setLoading(true);
      try {
        const productPromises = wishlist.map(id => getProduct(id));
        const fbProducts = await Promise.all(productPromises);
        const validProducts = fbProducts.filter(p => p !== null);
        const uiProducts = validProducts.map(p => adaptFirebaseToUI(p!));
        setProducts(uiProducts);
      } catch (error) {
        console.error('Error loading wishlist products:', error);
      } finally {
        setLoading(false);
      }
    };

    loadWishlistProducts();
  }, [wishlist, isLoaded]);

  /** Remove; the hook's toast offers Undo. */
  const handleRemove = (productId: string, productTitle: string) => {
    removeFromWishlist(productId, productTitle);
  };

  // Advanced search filter - searches across multiple fields
  const filteredProducts = products.filter(product => {
    if (!searchQuery || searchQuery.trim() === '') return true;

    const query = searchQuery.toLowerCase().trim();

    // Search in title
    if (product.title.toLowerCase().includes(query)) return true;

    // Search in category
    if (product.category && product.category.toLowerCase().includes(query)) return true;

    // Search in price (if user types numbers)
    if (product.price.toString().includes(query)) return true;

    // Search in old price
    if (product.oldPrice && product.oldPrice.toString().includes(query)) return true;

    return false;
  });

  const isBusy = loading || !isLoaded;

  const emptyState = (
    <EmptyState
      icon={Heart}
      title="Nothing saved yet"
      description="Tap the heart on any product to keep it here."
      action={{ label: "Explore the range", to: "/" }}
    />
  );

  return (
    <div className="min-h-screen max-lg:tx-paper max-lg:pb-20">
      <div className="hidden lg:block">
        <Header />
      </div>
      {/* Both are lg:hidden themselves; no wrapper, so the header stays sticky. */}
      <MobileHeader />
      <MobileSearchBar />

      <main id="main" tabIndex={-1} className="outline-none">
        {/* ─── Desktop ─── */}
        <div className="hidden lg:block">
          {/* Hero Banner Section */}
          <section className="relative flex h-[280px] items-center justify-center overflow-hidden bg-charcoal">
            <img
              src="https://res.cloudinary.com/dcoimqij/image/upload/f_auto,q_auto,w_1600/v1790515752/ishaputrabotanicals/demo/jsk5fcgynmfin5gfvlik.jpg"
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-charcoal/60" />

            <div className="relative z-raised mx-auto w-full max-w-[1440px] px-8 text-center lg:px-12">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="absolute left-8 top-0 inline-flex h-10 items-center gap-2 rounded-full border border-charcoal-foreground/25 bg-charcoal/40 px-4 text-sm font-medium text-charcoal-foreground backdrop-blur-sm transition-[background-color,transform] duration-press ease-out hover:bg-charcoal/60 active:scale-[0.97] lg:left-12"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                Back
              </button>
              <h1 className="on-photo font-heading text-5xl font-semibold tracking-tight text-charcoal-foreground lg:text-6xl">
                My wishlist
              </h1>
              {!isBusy && products.length > 0 && (
                <p className="on-photo mt-3 text-lg text-charcoal-foreground/90 tabular-nums">
                  {plural(products.length, "item")} saved for later
                </p>
              )}
              <div className="mt-4 flex justify-center">
                <Breadcrumb onPhoto />
              </div>
            </div>
          </section>

          {/* Content */}
          <div className="mx-auto max-w-[1440px] px-8 py-10 lg:px-12 lg:py-12">
            {isBusy ? (
              <ProductGridSkeleton count={8} label="Loading your wishlist" className="lg:grid-cols-3 lg:gap-6 xl:grid-cols-4" />
            ) : products.length === 0 ? (
              emptyState
            ) : (
              <ul className="grid grid-cols-3 gap-6 xl:grid-cols-4">
                <AnimatePresence mode="popLayout">
                  {products.map((product, index) => {
                    const off = percentOff(product);
                    return (
                      <motion.li
                        key={product.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: DUR.exit } }}
                        transition={{ duration: DUR.modal, ease: EASE_OUT, delay: staggerDelay(index) }}
                        className="card-product group relative flex flex-col p-3"
                      >
                        <Link
                          to={`/product/${product.id}`}
                          className="tile-img relative block aspect-square overflow-hidden"
                          tabIndex={-1}
                          aria-hidden="true"
                        >
                          {product.image ? (
                            <SmartImage src={product.image} alt="" className="h-full w-full object-cover" preset="card" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center">
                              <ShoppingBag className="size-12 text-muted-foreground" />
                            </span>
                          )}
                        </Link>
                        <WishlistToggle
                          name={product.title}
                          saved
                          size="sm"
                          variant="ghost"
                          onToggle={() => handleRemove(product.id, product.title)}
                          className="absolute right-5 top-5 z-raised bg-background/90 shadow-sm hover:bg-background dark:bg-card/90"
                        />

                        <div className="flex flex-1 flex-col gap-3 px-1 pb-1 pt-4">
                          <div className="space-y-1">
                            {product.category && (
                              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                {product.category}
                              </p>
                            )}
                            <h2 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground" title={product.title}>
                              <Link
                                to={`/product/${product.id}`}
                                className="transition-colors duration-hover hover:text-primary"
                              >
                                {product.title}
                              </Link>
                            </h2>
                          </div>

                          <p className="flex flex-wrap items-center gap-2">
                            <span className="price-now text-base">{formatINR(product.price)}</span>
                            {off > 0 && (
                              <>
                                <span className="price-was text-sm">
                                  <span className="sr-only">Was </span>
                                  {formatINR(product.oldPrice)}
                                </span>
                                <span className="chip-off">{off}% off</span>
                              </>
                            )}
                          </p>

                          <Link to={`/product/${product.id}`} className="btn-line mt-auto h-11 w-full text-foreground">
                            View product
                            <ArrowRight aria-hidden="true" className="size-4" />
                          </Link>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>

        {/* ─── Mobile ─── */}
        <div className="lg:hidden">
          <div className="px-4 py-4">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                  navigate('/');
                } else {
                  navigate(-1);
                }
              }}
              className="mb-3 inline-flex h-10 items-center gap-2 rounded-full border border-foreground/10 bg-card/85 px-3.5 text-xs font-medium text-foreground/80 shadow-sm backdrop-blur transition-[background-color,transform] duration-press ease-out hover:bg-card active:scale-[0.97] dark:bg-card/70"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back
            </button>
            <Breadcrumb />
          </div>

          <div className="mb-4 px-4">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Wishlist</h1>
          </div>

          <div className="px-4 pb-4">
            {isBusy ? (
              <ProductGridSkeleton count={4} label="Loading your wishlist" className="md:grid-cols-2" />
            ) : filteredProducts.length === 0 ? (
              emptyState
            ) : (
              <ul className="grid grid-cols-2 gap-3">
                <AnimatePresence mode="popLayout">
                  {filteredProducts.map((product, index) => {
                    const off = percentOff(product);
                    return (
                      <motion.li
                        key={product.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: DUR.exit } }}
                        transition={{ duration: DUR.modal, ease: EASE_OUT, delay: staggerDelay(index) }}
                        className="card-product relative flex flex-col overflow-hidden p-2"
                      >
                        <Link
                          to={`/product/${product.id}`}
                          className="tile-img relative block aspect-square overflow-hidden"
                          tabIndex={-1}
                          aria-hidden="true"
                        >
                          {product.image ? (
                            <SmartImage src={product.image} alt="" className="h-full w-full object-cover" preset="card" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center">
                              <ShoppingBag className="size-10 text-muted-foreground" />
                            </span>
                          )}
                        </Link>
                        <WishlistToggle
                          name={product.title}
                          saved
                          size="sm"
                          variant="ghost"
                          onToggle={() => handleRemove(product.id, product.title)}
                          className="absolute right-3 top-3 z-raised bg-background/90 shadow-sm dark:bg-card/90"
                        />

                        <div className="flex flex-1 flex-col px-1 pb-1 pt-2.5">
                          <h2 className="mb-1 line-clamp-2 text-xs font-semibold leading-snug text-foreground" title={product.title}>
                            <Link to={`/product/${product.id}`}>{product.title}</Link>
                          </h2>

                          <p className="mb-2.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                            <span className="price-now text-sm">{formatINR(product.price)}</span>
                            {off > 0 && (
                              <>
                                <span className="price-was text-[11px]">
                                  <span className="sr-only">Was </span>
                                  {formatINR(product.oldPrice)}
                                </span>
                                <span className="chip-off">{off}% off</span>
                              </>
                            )}
                          </p>

                          <Link to={`/product/${product.id}`} className="btn-copper mt-auto h-10 w-full !px-3 !text-[10px] !tracking-[0.16em]">
                            View product
                            <ArrowRight aria-hidden="true" className="size-3.5" />
                          </Link>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>
      </main>

      <div className="hidden lg:block">
        <Footer />
      </div>
      <MobileBottomNav />
    </div>
  );
};

export default Wishlist;
