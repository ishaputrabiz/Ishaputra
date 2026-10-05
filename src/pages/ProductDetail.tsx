import { useState, useEffect, useRef, type ReactNode } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Star, Minus, Plus, ChevronRight, ShoppingBag, Truck, Shield, RotateCcw, Check, X, ChevronLeft, ArrowLeft, Share2, PenLine, ThumbsUp, ThumbsDown, Play, Mail, Link2, PackageSearch, ArrowRight } from "lucide-react";
import { getProduct, type Product as FirebaseProduct } from "@/services/productService";
import { getActiveProductsCached, useCatalogRevision } from "@/services/productCache";
import { UIProductDetail, adaptFirebaseToUIDetail, adaptFirebaseArrayToUI } from "@/lib/productAdapter";
import { useSilverRate, computeSilverOriginalPrice } from "@/contexts/SilverRateContext";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useWishlist } from "@/hooks/useWishlist";
import { useDealer, useDealerUnit } from "@/hooks/useDealer";
import { DealerPriceBlock } from "@/components/dealer/DealerPrice";
import { getProductReviews, getProductReviewStats, hasUserPurchasedProduct, getUserProductReview, voteReviewHelpful, Review } from "@/services/reviewService";
import logo from "@/assets/dark.png";
import Header from "@/components/Header";
import MobileHeader from "@/components/MobileHeader";
import MobileBottomNav from "@/components/MobileBottomNav";
import MobileSearchBar from "@/components/MobileSearchBar";
import Footer from "@/components/Footer";
import CategoryIconNav from "@/components/CategoryIconNav";
import VideoCallRequestModal from "@/components/VideoCallRequestModal";
import WhatsAppEnquiryButton from "@/components/WhatsAppEnquiryButton";
import ProductCard from "@/components/ProductCard";
import { Video, Maximize2 } from "lucide-react";
import ProductOfferTag from "@/components/offers/ProductOfferTag";
import { SmartImage } from "@/components/ui/smart-image";
import { cldUrl } from "@/lib/cloudinaryUrl";
import { IconButton } from "@/components/ui/icon-button";
import { WishlistToggle } from "@/components/WishlistToggle";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { usePageMeta } from "@/hooks/usePageMeta";
import { formatDate, formatINR, plural } from "@/lib/format";
import { DUR, EASE_IN_OUT, EASE_OUT, tap } from "@/lib/motion";
import { SITE_URL } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

/** "Personal Care" -> "personal-care", the slug the category pages use. */
const categorySlug = (name: string) =>
  name.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Hover zoom only where there is a real pointer; a tap on a phone opens the viewer instead. */
const canHoverZoom = () =>
  typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/**
 * Can this product be bought right now?
 *
 * A hidden product's page stays reachable - old WhatsApp shares and search
 * results still point at it, and a 404 would be worse - but it used to offer
 * Add to Cart and Buy Now as if nothing had changed, so the customer only found
 * out at the payment step.
 */
const isUnavailable = (p?: { isActive?: boolean; stock?: number } | null) =>
  !!p && (p.isActive === false || (typeof p.stock === 'number' && p.stock <= 0));

/** Readable labels for the spec keys the old silver catalogue used; any other key shows as typed. */
const SPEC_LABELS: Record<string, string> = { dimensions: "Size", material: "Material", purity: "Purity" };
/** Quantity and ingredients first, directions last, everything else in between. */
const specRank = (key: string) => {
  const k = key.toLowerCase();
  if (k.startsWith("net")) return 0;
  if (k.startsWith("key ingredient") || k === "ingredients") return 1;
  if (k.startsWith("how to use") || k === "directions") return 9;
  return 5;
};
const specEntries = (specs?: Record<string, unknown>) =>
  Object.entries(specs || {})
    .filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== "")
    .sort((a, b) => specRank(a[0]) - specRank(b[0]));

const ProductDetail = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { addToCart, openCart, closeCart } = useCart();
  const { toast } = useToast();
  const { user } = useAuth();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const { ratePerGram } = useSilverRate();
  /** Changes when an admin publishes, so the catalog copy below is re-read. */
  const catalogRevision = useCatalogRevision();
  const [quantity, setQuantity] = useState(1);
  const [addedToCart, setAddedToCart] = useState(false);
  const [showVideoCallModal, setShowVideoCallModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const [product, setProduct] = useState<UIProductDetail | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<UIProductDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showImagePopup, setShowImagePopup] = useState(false);
  /** The viewer's zoom URL that has finished loading (then the cached gallery image underneath is hidden). */
  const [viewerZoomSrc, setViewerZoomSrc] = useState<string | null>(null);

  /** How many images/videos this product has, for arrow-key paging. */
  const mediaCountRef = useRef(0);

  /**
   * Keyboard control for the full-screen viewer.
   *
   * Built for phones, where swiping is the only input; on a desktop a viewer
   * that cannot be closed with Escape or paged with the arrow keys feels
   * broken. The body is locked meanwhile so the page behind does not scroll
   * under the overlay.
   *
   * Declared here, above the loading/not-found returns, because hooks must run
   * in the same order every render. The media count comes from a ref, which is
   * a plain assignment and so may be written after those returns.
   */
  // Escape, focus trap and scroll lock come from the Radix dialog the viewer
  // is built on; only arrow-key paging is ours.
  useEffect(() => {
    if (!showImagePopup) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setSelectedImage((i) => Math.min(i + 1, Math.max(0, mediaCountRef.current - 1)));
      } else if (e.key === 'ArrowLeft') {
        setSelectedImage((i) => Math.max(i - 1, 0));
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [showImagePopup]);

  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [swipeDir, setSwipeDir] = useState<1 | -1>(1);
  const touchStartRef = useRef<number | null>(null);
  const videoOverlayRef = useRef<HTMLDivElement | null>(null);
  // Desktop hover-zoom on main image
  const [isZooming, setIsZooming] = useState(false);
  const [zoomPos, setZoomPos] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  // Review states
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStats, setReviewStats] = useState<{ averageRating: number; totalReviews: number; ratingDistribution: Record<number, number> }>({ averageRating: 0, totalReviews: 0, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  const [canWriteReview, setCanWriteReview] = useState(false);
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set());
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [helpfulVotes, setHelpfulVotes] = useState<Record<string, { up: number; down: number; voted: 'up' | 'down' | null }>>({});
  // Review image lightbox
  const [reviewLightbox, setReviewLightbox] = useState<{ images: string[]; index: number } | null>(null);

  // The share sheet, photo viewer and review lightbox are opened from state,
  // not a Radix Trigger, so they remember what had focus and hand it back.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const rememberFocus = () => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    returnFocusRef.current?.focus({ preventScroll: true });
  };

  const handleHelpfulVote = async (reviewId: string, type: 'up' | 'down') => {
    // Check localStorage to prevent re-voting after page refresh
    const storageKey = `helpful_voted_${user?.uid ?? 'anon'}_${reviewId}`;
    if (localStorage.getItem(storageKey)) return;

    setHelpfulVotes(prev => {
      const current = prev[reviewId] || { up: 0, down: 0, voted: null };
      if (current.voted) return prev;
      return {
        ...prev,
        [reviewId]: {
          up: type === 'up' ? current.up + 1 : current.up,
          down: type === 'down' ? current.down + 1 : current.down,
          voted: type,
        },
      };
    });
    localStorage.setItem(storageKey, type);
    try {
      await voteReviewHelpful(reviewId, type);
    } catch {
      // revert on failure
      const storageKey2 = `helpful_voted_${user?.uid ?? 'anon'}_${reviewId}`;
      localStorage.removeItem(storageKey2);
      setHelpfulVotes(prev => {
        const current = prev[reviewId];
        if (!current) return prev;
        return {
          ...prev,
          [reviewId]: {
            up: type === 'up' ? current.up - 1 : current.up,
            down: type === 'down' ? current.down - 1 : current.down,
            voted: null,
          },
        };
      });
    }
  };

  // Fetch product and related products.
  // The shared catalog (no Firestore reads) renders the page at once; a single
  // read of this product then refreshes price and stock, which can change
  // between catalog snapshots. A product missing from the catalog (inactive,
  // or added moments ago) comes from that read alone.
  useEffect(() => {
    let cancelled = false;

    const fetchProductData = async () => {
      if (!productId) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setNotFound(false);

      let catalog: FirebaseProduct[] = [];
      try {
        catalog = await getActiveProductsCached();
      } catch (error) {
        console.warn("Catalog unavailable, loading the product directly:", error);
      }
      if (cancelled) return;

      // Related products: same category first, others to fill 4 slots
      const showRelated = (category: string) => {
        const others = catalog.filter(p => p.id !== productId);
        const related = [
          ...others.filter(p => p.category === category),
          ...others.filter(p => p.category !== category),
        ]
          .slice(0, 4)
          .map(adaptFirebaseToUIDetail);
        setRelatedProducts(related);
      };

      const cached = catalog.find(p => p.id === productId) ?? null;
      if (cached) {
        setProduct(adaptFirebaseToUIDetail(cached));
        showRelated(cached.category);
        setLoading(false);
      }

      try {
        const fresh = await getProduct(productId);
        if (cancelled) return;
        if (fresh) {
          setProduct(adaptFirebaseToUIDetail(fresh));
          if (!cached) showRelated(fresh.category);
        } else if (!cached) {
          setNotFound(true);
        }
      } catch (error) {
        console.error("Error fetching product:", error);
        // Already showing the catalog copy: keep it rather than blanking the page.
        if (!cached && !cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProductData();
    return () => {
      cancelled = true;
    };
    // `catalogRevision` re-runs this when an admin publishes, so the price
    // painted from the catalog matches the one the product page settles on.
  }, [productId, catalogRevision]);

  // Fetch reviews and check if user can review
  useEffect(() => {
    const fetchReviewData = async () => {
      if (!productId) return;
      
      try {
        setReviewsLoading(true);
        const [fetchedReviews, stats] = await Promise.all([
          getProductReviews(productId),
          getProductReviewStats(productId),
        ]);
        
        setReviews(fetchedReviews);
        setReviewStats(stats);
        
        // Initialize helpful votes from stored counts + localStorage voted state
        const initialVotes: Record<string, { up: number; down: number; voted: 'up' | 'down' | null }> = {};
        fetchedReviews.forEach(r => {
          const storageKey = `helpful_voted_${user?.uid ?? 'anon'}_${r.id}`;
          const voted = localStorage.getItem(storageKey) as 'up' | 'down' | null;
          initialVotes[r.id] = { up: r.helpfulUp ?? 0, down: r.helpfulDown ?? 0, voted };
        });
        setHelpfulVotes(initialVotes);
        
        // Check if logged-in user can write a review (must have purchased AND not yet reviewed or review was rejected)
        if (user?.uid) {
          const [purchased, existingReview] = await Promise.all([
            hasUserPurchasedProduct(user.uid, productId),
            getUserProductReview(user.uid, productId),
          ]);
          setUserReview(existingReview);
          // Can write review if: purchased + (no review OR review was rejected)
          setCanWriteReview(purchased && (!existingReview || existingReview.status === 'rejected'));
        }
      } catch (error) {
        console.error('Error fetching reviews:', error);
      } finally {
        setReviewsLoading(false);
      }
    };
    
    fetchReviewData();
  }, [productId, user]);

  // NOTE: scrolling on navigation is owned by <ScrollToTop>, which scrolls to
  // top on PUSH and restores the saved position on POP. A local scrollTo(0,0)
  // used to live here and forced the top even when the user pressed Back,
  // fighting restoration.

  const incrementQuantity = () => setQuantity((prev) => prev + 1);
  const decrementQuantity = () => setQuantity((prev) => (prev > 1 ? prev - 1 : 1));

  const handleAddToCart = async () => {
    if (!product) return;
    if (isUnavailable(product)) {
      toast({ title: 'Sold out', description: `${product.title} is not available right now.`, variant: 'destructive' });
      return;
    }

    if (!user) {
      navigate('/login', { state: { from: { pathname: `/product/${productId}` } } });
      return;
    }

    try {
      const added = addToCart({
        id: product.id,
        name: product.title,
        price: product.price,
        image: product.image,
        category: product.category || 'Products',
        stock: product.stock,
      }, quantity);
      if (!added) return;
      
      // Show success state
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
      
      // Show toast notification
      toast({
        title: "Added to cart",
        description: `${product.title} (${quantity}) has been added to your cart.`,
      });
    } catch (error) {
      console.error('Error adding to cart:', error);
      toast({
        title: "Could not add to cart",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleBuyNow = async () => {
    if (!product) return;
    if (isUnavailable(product)) {
      toast({ title: 'Sold out', description: `${product.title} is not available right now.`, variant: 'destructive' });
      return;
    }

    if (!user) {
      navigate('/login', { state: { from: { pathname: `/product/${productId}` } } });
      return;
    }

    try {
      const added = addToCart({
        id: product.id,
        name: product.title,
        price: product.price,
        image: product.image,
        category: product.category || 'Products',
        stock: product.stock,
      }, quantity);
      if (!added) return;
      // Close cart drawer and navigate to checkout
      closeCart();
      navigate('/checkout', { state: { from: 'product' } });
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleShare = async (platform: string) => {
    if (!product) return;
    
    const productUrl = window.location.href;
    const productTitle = product.title;
    const productImage = product.image.startsWith('http') ? product.image : `${window.location.origin}${product.image}`;
    const shareText = `${productTitle} from Ishaputra Botanicals, ${formatINR(product.price)}`;
    const openWindow = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

    // Helper function to share with image via native share API
    const shareWithImage = async (text: string) => {
      if (navigator.share && navigator.canShare) {
        try {
          const response = await fetch(productImage);
          const blob = await response.blob();
          const ext = blob.type.includes('png') ? 'png' : 'jpg';
          const file = new File([blob], `${productTitle.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`, { type: blob.type });
          
          const shareData = { 
            title: productTitle, 
            text: text + '\n' + productUrl, 
            files: [file]
          };
          
          if (navigator.canShare(shareData)) {
            await navigator.share(shareData);
            return true;
          }
        } catch {
          // Fallback below
        }
      }
      return false;
    };

    switch (platform) {
      case 'whatsapp': {
        // Try native share with image first (mobile), fallback to URL
        const shared = await shareWithImage(shareText);
        if (!shared) {
          openWindow(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + '\n' + productUrl)}`);
        }
        break;
      }
      case 'facebook': {
        const shared = await shareWithImage(shareText);
        if (!shared) {
          openWindow(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productUrl)}&quote=${encodeURIComponent(shareText)}`);
        }
        break;
      }
      case 'twitter': {
        const shared = await shareWithImage(shareText);
        if (!shared) {
          openWindow(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(productUrl)}`);
        }
        break;
      }
      case 'telegram': {
        const shared = await shareWithImage(shareText);
        if (!shared) {
          openWindow(`https://t.me/share/url?url=${encodeURIComponent(productUrl)}&text=${encodeURIComponent(shareText)}`);
        }
        break;
      }
      case 'pinterest':
        openWindow(`https://pinterest.com/pin/create/button/?url=${encodeURIComponent(productUrl)}&media=${encodeURIComponent(productImage)}&description=${encodeURIComponent(shareText)}`);
        break;
      case 'email': {
        const shared = await shareWithImage(shareText);
        if (!shared) {
          const emailBody = `${shareText}\n\nProduct Link: ${productUrl}`;
          openWindow(`mailto:?subject=${encodeURIComponent(productTitle + ' from Ishaputra Botanicals')}&body=${encodeURIComponent(emailBody)}`);
        }
        break;
      }
      case 'copy':
        try {
          await navigator.clipboard.writeText(productUrl);
          toast({ title: "Link copied" });
        } catch {
          toast({ title: "Could not copy the link", description: "Please copy it from the address bar.", variant: "destructive" });
        }
        break;
      case 'native':
        if (navigator.share) {
          try {
            const response = await fetch(productImage);
            const blob = await response.blob();
            const ext = blob.type.includes('png') ? 'png' : 'jpg';
            const file = new File([blob], `${productTitle.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}`, { type: blob.type });
            
            const shareData: ShareData = { 
              title: productTitle, 
              text: shareText + '\n' + productUrl,
              files: [file]
            };
            
            if (navigator.canShare && navigator.canShare(shareData)) {
              await navigator.share(shareData);
            } else {
              await navigator.share({ title: productTitle, text: shareText, url: productUrl });
            }
          } catch {
            // User cancelled or error
          }
        }
        break;
    }
    setShowShareMenu(false);
  };

  // Swipe handlers for main image and image popup
  const minSwipeDistance = 50;
  const didSwipeRef = useRef(false);

  // Slide variants: dir 1 = next (left swipe), dir -1 = prev (right swipe)
  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%' }),
    center: { x: '0%' },
    exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%' }),
  };

  // Navigate with direction tracking — used by thumbnails and swipe
  const navigateMedia = (newIndex: number) => {
    setSwipeDir(newIndex >= selectedImage ? 1 : -1);
    setSelectedImage(newIndex);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    const x = e.targetTouches[0].clientX;
    touchStartRef.current = x;
    didSwipeRef.current = false;
    setIsDragging(true);
    setDragX(0);
    setTouchEnd(null);
    setTouchStart(x);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const currentX = e.targetTouches[0].clientX;
    setTouchEnd(currentX);
    if (touchStartRef.current !== null) {
      setDragX(currentX - touchStartRef.current);
    }
  };

  const onTouchEnd = () => {
    setIsDragging(false);
    if (!touchStart || !touchEnd) {
      setDragX(0);
      return;
    }
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      didSwipeRef.current = true;
      setDragX(0);
      setSwipeDir(1);
      setSelectedImage(prev => (prev + 1) % allMedia.length);
    } else if (isRightSwipe) {
      didSwipeRef.current = true;
      setDragX(0);
      setSwipeDir(-1);
      setSelectedImage(prev => (prev - 1 + allMedia.length) % allMedia.length);
    } else {
      // Not enough — snap back
      setDragX(0);
    }
  };

  // Search and link-preview tags. Called before the loading and not-found
  // returns so the hook order never changes.
  const metaDescription = product?.description
    ? product.description.length > 160
      ? `${product.description.slice(0, 157).trimEnd()}…`
      : product.description
    : undefined;
  usePageMeta({
    title: notFound ? "Product not found" : product?.title,
    description: notFound ? undefined : metaDescription,
    canonicalPath: productId ? `/product/${productId}` : undefined,
    image: product?.image,
    noindex: notFound,
    jsonLd:
      product && !notFound
        ? {
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.title,
            image: (product.images && product.images.length > 0 ? product.images : [product.image]).filter(Boolean),
            ...(product.description ? { description: product.description } : {}),
            sku: product.id,
            brand: { "@type": "Brand", name: "Ishaputra Botanicals" },
            ...(product.category ? { category: product.category } : {}),
            offers: {
              "@type": "Offer",
              url: `${SITE_URL}/product/${product.id}`,
              priceCurrency: "INR",
              price: product.price,
              availability: isUnavailable(product) ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
            },
          }
        : null,
  });

  // An approved dealer's unit price for this product, or null (guests,
  // non-dealers, programme off, no saving): the usual price block then renders.
  // Called before the loading and not-found returns so the hook order never changes.
  const regularPrice = product
    ? product.silverPricing?.enabled && ratePerGram > 0
      ? computeSilverOriginalPrice(product.silverPricing, ratePerGram)
      : product.price
    : 0;
  const dealer = useDealerUnit(product?.id ?? "", regularPrice);
  const { settings: dealerSettings } = useDealer();

  // The loading and not-found states use the same frame as the loaded page
  // (desktop header + category row, phone header + search bar), so the chrome
  // does not jump when loading finishes.
  const pageChrome = (
    <>
      <div className="hidden lg:block">
        <Header />
        <CategoryIconNav />
      </div>
      <div className="lg:hidden">
        <MobileHeader />
        <MobileSearchBar />
      </div>
    </>
  );

  // Show loading state: the page's own shape inside the normal header and footer.
  if (loading) {
    return (
      <div className="tx-paper min-h-screen w-full overflow-x-clip">
        {pageChrome}
        <main id="main" tabIndex={-1} aria-busy="true" className="container-custom py-6 md:py-10">
          <span className="sr-only">Loading product</span>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-14">
            <Skeleton className="mx-auto aspect-square w-full max-w-lg !rounded-panel" />
            <div className="flex flex-col gap-4">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-4/5 lg:h-11" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-3 w-44" />
              <div className="mt-2 flex flex-col gap-2">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-11/12" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
              <Skeleton className="mt-2 h-32 w-full !rounded-panel" />
              <div className="mt-2 hidden gap-4 md:flex">
                <Skeleton className="h-12 w-32" />
                <Skeleton className="h-12 flex-1" />
                <Skeleton className="h-12 flex-1" />
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Product not found
  if (notFound || !product) {
    return (
      <div className="tx-paper min-h-screen w-full overflow-x-clip flex flex-col">
        {pageChrome}
        <main id="main" tabIndex={-1} className="container-custom flex flex-1 items-center justify-center py-16 sm:py-24">
          <EmptyState
            as="h1"
            icon={PackageSearch}
            title="This product isn't available"
            description="It may have been removed or renamed."
            action={{ label: "Back to shop", to: "/products" }}
          />
        </main>
        <Footer />
      </div>
    );
  }

  // Product images for gallery - use all images from product, fallback to main image if no images array
  const productImages = product.images && product.images.length > 0 ? product.images : [product.image];

  // Build media items: images + videos for the gallery
  const productVideos = product.videos && product.videos.length > 0 ? product.videos : [];
  const allMedia: { type: 'image' | 'video'; src: string; thumb: string }[] = [
    ...productImages.map((img) => ({ type: 'image' as const, src: img, thumb: img })),
    ...productVideos.map((v) => {
      const isYt = v.startsWith('yt:');
      const ytId = isYt ? v.replace('yt:', '') : null;
      return {
        type: 'video' as const,
        src: ytId ? `https://www.youtube.com/embed/${ytId}` : v,
        thumb: ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : product.image,
      };
    }),
  ];
  mediaCountRef.current = allMedia.length;

  /** The full-screen viewer's sharp image for the current photo. */
  const zoomSrc = cldUrl(allMedia[selectedImage]?.src || product.image, 'zoom');
  const saved = isInWishlist(product.id);
  const reviewCount = reviewStats.totalReviews > 0 ? reviewStats.totalReviews : (product.reviews || 0);
  const shownReviews = showAllReviews ? reviews : reviews.slice(0, 5);
  const headingFont = { fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" };

  /** One share target: a monochrome round tile that turns copper on hover. */
  const shareTile = (key: string, label: string, glyph: ReactNode) => (
    <button
      type="button"
      key={key}
      onClick={() => handleShare(key)}
      className="group flex flex-col items-center gap-1.5 rounded-card p-2 transition-[background-color,transform] duration-press ease-out hover:bg-muted/60 active:scale-[0.97]"
    >
      <span className="grid size-11 place-items-center rounded-full border border-foreground/12 bg-card text-foreground transition-[border-color,color] duration-hover ease-out group-hover:border-primary group-hover:text-primary [&_svg]:size-5">
        {glyph}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </button>
  );

  const brandGlyph = (d: string) => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={d} /></svg>
  );

  return (
    <div className="tx-paper min-h-screen w-full overflow-x-clip">
      {/* Desktop Header */}
      <div className="hidden lg:block">
        <Header />
        <CategoryIconNav />
      </div>
      <main id="main" tabIndex={-1}>
        {/* Mobile Header and Search */}
        <div className="lg:hidden">
          <MobileHeader />
          <MobileSearchBar />
        </div>

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="hidden lg:block border-b border-foreground/[0.08] py-3">
          <div className="container-custom">
            <ol className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <li>
                <Link to="/" className="transition-colors duration-hover ease-out hover:text-primary">Home</Link>
              </li>
              {product.category && (
                <>
                  <li aria-hidden="true"><ChevronRight className="size-3.5 text-primary/60" /></li>
                  <li className="shrink-0">
                    <Link
                      to={`/category/${categorySlug(product.category)}`}
                      className="transition-colors duration-hover ease-out hover:text-primary"
                    >
                      {product.category.replace(/-/g, " ")}
                    </Link>
                  </li>
                </>
              )}
              <li aria-hidden="true"><ChevronRight className="size-3.5 text-primary/60" /></li>
              <li className="min-w-0">
                <span aria-current="page" title={product.title} className="block max-w-[40ch] truncate text-foreground">
                  {product.title}
                </span>
              </li>
            </ol>
          </div>
        </nav>

        {/* Product Details Section */}
        <section className="py-4 md:py-8">
          <div className="container-custom">
            {/* Back button */}
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="-ml-1 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-control px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground transition-colors duration-hover ease-out hover:text-primary"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              <span>Back</span>
            </button>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14">
              {/* Product Images & Videos: stays in view on desktop while the details scroll */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: DUR.modal, ease: EASE_OUT }}
                className="lg:sticky lg:top-[var(--sticky-top)] lg:self-start"
              >
                {/* Main Media */}
                <div
                  className="group relative tile-img !rounded-[var(--radius-panel)] border border-foreground/[0.08] shadow-[var(--shadow-panel)] overflow-hidden aspect-square max-w-lg mx-auto mb-4 cursor-pointer md:cursor-zoom-in"
                  onClick={() => {
                    if (didSwipeRef.current) { didSwipeRef.current = false; return; }
                    // Every screen size, not just phones. On desktop the only
                    // way to look closely was the hover magnifier, which shows
                    // a fraction of the piece at a time and vanishes the moment
                    // the pointer leaves.
                    rememberFocus();
                    setShowImagePopup(true);
                  }}
                  onTouchStart={onTouchStart}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                  onMouseEnter={() => allMedia[selectedImage]?.type !== 'video' && canHoverZoom() && setIsZooming(true)}
                  onMouseLeave={() => setIsZooming(false)}
                  onMouseMove={(e) => {
                    if (allMedia[selectedImage]?.type === 'video') return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    setZoomPos({ x, y });
                  }}
                >
                  {/* Live-drag + slide animation wrapper */}
                  <div
                    className="absolute inset-0"
                    style={{
                      transform: `translateX(${dragX}px)`,
                      transition: isDragging ? 'none' : 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)',
                    }}
                  >
                    <AnimatePresence custom={swipeDir} mode="popLayout" initial={false}>
                      <motion.div
                        key={selectedImage}
                        custom={swipeDir}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ type: 'tween', ease: EASE_IN_OUT, duration: 0.28 }}
                        className="absolute inset-0"
                      >
                        {allMedia[selectedImage]?.type === 'video' ? (
                          <>
                            <iframe
                              src={allMedia[selectedImage].src}
                              title={`${product.title} video`}
                              className="w-full h-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                            {/* Transparent overlay to capture swipe events on the iframe */}
                            <div
                              ref={videoOverlayRef}
                              className="absolute inset-0 z-10"
                              style={{ touchAction: 'pan-x' }}
                              onTouchStart={(e) => { e.stopPropagation(); onTouchStart(e); }}
                              onTouchMove={(e) => { e.stopPropagation(); onTouchMove(e); }}
                              onTouchEnd={(e) => {
                                e.stopPropagation();
                                onTouchEnd();
                                // If it was a tap (not a real swipe), let pointer through to iframe
                                if (!didSwipeRef.current && videoOverlayRef.current) {
                                  videoOverlayRef.current.style.pointerEvents = 'none';
                                  setTimeout(() => {
                                    if (videoOverlayRef.current) videoOverlayRef.current.style.pointerEvents = 'auto';
                                  }, 350);
                                }
                              }}
                            />
                          </>
                        ) : (
                          <>
                            {/* Desktop image with zoom - 2x scale needs the retina
                                variant, which the detail srcset already tops out at */}
                            <SmartImage
                              src={allMedia[selectedImage]?.src || product.image}
                              alt={product.alt}
                              className="w-full h-full object-cover transition-transform duration-dropdown ease-out hidden md:block"
                              preset="detail"
                              priority
                              style={{
                                transform: isZooming ? 'scale(2)' : 'scale(1)',
                                transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                              }}
                            />
                            {/* Mobile image (no zoom) */}
                            <SmartImage
                              src={allMedia[selectedImage]?.src || product.image}
                              alt={product.alt}
                              className="w-full h-full object-cover md:hidden"
                              preset="detail"
                              priority
                            />
                          </>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                  {/* Copper hairline on hover (pointer devices) */}
                  <div aria-hidden="true" className="hidden md:block absolute inset-0 ring-1 ring-inset ring-primary/0 group-hover:ring-primary/30 rounded-[var(--radius-panel)] transition-shadow duration-hover ease-out pointer-events-none" />
                  {allMedia.length > 1 && (
                    <span className="sr-only" aria-live="polite">
                      Image {selectedImage + 1} of {allMedia.length}
                    </span>
                  )}

                  {/* Wishlist & Share */}
                  <div className="absolute top-3 right-3 z-raised flex flex-col gap-2">
                    <WishlistToggle
                      name={product.title}
                      saved={saved}
                      onToggle={() => toggleWishlist(product.id, product.title)}
                      className={cn(saved && "border-primary/40")}
                    />
                    <IconButton
                      label="Share"
                      variant="solid"
                      aria-haspopup="dialog"
                      onClick={(e) => {
                        e.stopPropagation();
                        rememberFocus();
                        setShowShareMenu(true);
                      }}
                    >
                      <Share2 aria-hidden="true" />
                    </IconButton>
                  </div>

                  {/*
                    Nothing previously said the image could be opened, so on
                    desktop the full view was undiscoverable. Fades in on hover
                    beside the magnifier, and stays out of the way on phones,
                    where tapping the image already opens it. It comes after the
                    wishlist and share buttons in the DOM so Tab runs top to
                    bottom (it sits bottom-right, absolutely positioned).
                  */}
                  {allMedia[selectedImage]?.type !== 'video' && (
                    <IconButton
                      label="View image full screen"
                      variant="onPhoto"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        rememberFocus();
                        setShowImagePopup(true);
                      }}
                      className="absolute bottom-3 right-3 z-raised hidden opacity-0 transition-[opacity,background-color,transform] group-hover:opacity-100 focus-visible:opacity-100 md:inline-flex"
                    >
                      <Maximize2 aria-hidden="true" />
                    </IconButton>
                  )}
                </div>

                {/* Thumbnail Gallery - images + videos */}
                {allMedia.length > 1 && (
                  <div className="grid grid-cols-4 gap-2 max-w-lg mx-auto">
                    {allMedia.map((item, index) => (
                      <button
                        type="button"
                        key={index}
                        onClick={() => navigateMedia(index)}
                        aria-label={`Show ${item.type === 'video' ? 'video' : 'image'} ${index + 1} of ${allMedia.length}`}
                        aria-current={selectedImage === index ? "true" : undefined}
                        className={`tile-img aspect-square !rounded-[8px] overflow-hidden border relative transition-[border-color,box-shadow] duration-hover ease-out ${
                          selectedImage === index
                            ? "border-primary shadow-[inset_0_0_0_1px_hsl(var(--primary))]"
                            : "border-foreground/10 hover:border-primary/50"
                        }`}
                      >
                        <SmartImage
                          src={item.thumb}
                          alt=""
                          className="w-full h-full object-contain p-1"
                          preset="tile"
                        />
                        {item.type === 'video' && (
                          <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-charcoal/20">
                            <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground">
                              <Play className="ml-0.5 size-3.5 fill-current" />
                            </span>
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Product Info */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: DUR.modal, ease: EASE_OUT, delay: 0.04 }}
                className="flex flex-col"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {/* Title */}
                <p className="eyebrow-no mb-3">
                  <span>{product.category.replace(/-/g, " ")}</span>
                </p>
                <h1
                  className="text-2xl md:text-3xl lg:text-[2.6rem] font-semibold leading-[1.08] text-foreground mb-4 [text-wrap:balance]"
                  style={headingFont}
                >
                  {product.title}
                </h1>

                {/* Price */}
                <div className="mb-1">
                  {dealer && (
                    <DealerPriceBlock
                      unit={dealer.unit}
                      regular={regularPrice}
                      percentOff={dealer.percentOff}
                      minOrder={dealerSettings.minOrder}
                    />
                  )}
                  {!dealer && (() => {
                    // Compute live MRP for silver-priced products
                    const sp = product.silverPricing;
                    const livePriceDisplay = sp?.enabled && ratePerGram > 0
                      ? computeSilverOriginalPrice(sp, ratePerGram)
                      : product.price;
                    const hasDiscount = !sp?.enabled && (product.discount ?? 0) > 0;
                    const liveMRP = hasDiscount
                      ? (product.oldPrice ?? null)
                      : null;
                    const liveDiscount = hasDiscount ? product.discount : null;
                    return (
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="price-now text-3xl lg:text-4xl">
                          {formatINR(livePriceDisplay)}
                        </span>
                        {liveMRP && liveMRP > product.price && (
                          <>
                            <span className="price-was text-lg md:text-xl">
                              <span className="sr-only">Was </span>
                              {formatINR(liveMRP)}
                            </span>
                            {liveDiscount && liveDiscount > 0 && (
                              <span className="chip-off !text-[11px] !px-2.5 !py-0.5">
                                {liveDiscount}% off
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                  {!dealer && (
                    <p className="text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mt-2">
                      MRP inclusive of all taxes
                    </p>
                  )}
                  {!isUnavailable(product) && (
                    <ProductOfferTag
                      // The same figure the price above shows: the live silver
                      // price for silver-priced pieces, the stored price otherwise.
                      price={
                        product.silverPricing?.enabled && ratePerGram > 0
                          ? computeSilverOriginalPrice(product.silverPricing, ratePerGram)
                          : product.price
                      }
                      category={product.category}
                      subcategory={product.subcategory}
                    />
                  )}
                </div>

                {/* Description */}
                <div className="mb-4 mt-4">
                  <p id="product-description" className={`text-sm md:text-[15px] text-foreground/75 leading-relaxed [text-wrap:pretty] ${
                    !showFullDescription ? 'line-clamp-3' : ''
                  }`}>
                    {product.description || 'Details for this product are coming soon.'}
                  </p>
                  {(product.description || '').length > 100 && (
                    <button
                      type="button"
                      aria-expanded={showFullDescription}
                      aria-controls="product-description"
                      onClick={() => setShowFullDescription(!showFullDescription)}
                      className="link-arrow mt-2.5"
                    >
                      {showFullDescription ? 'Read less' : 'Read more'}
                    </button>
                  )}
                </div>

                {/* Specifications: every field the admin entered (net quantity, ingredients, how to use...) */}
                {specEntries(product.specifications).length > 0 && (
                  <dl className="panel tx-sheet mb-6 divide-y divide-foreground/[0.07] overflow-hidden">
                    {specEntries(product.specifications).map(([key, value]) => (
                      <div key={key} className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,2fr)] gap-4 px-4 py-3 md:px-5">
                        <dt className="pt-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                          {SPEC_LABELS[key] || key}
                        </dt>
                        <dd className="text-sm text-foreground">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {/* Divider */}
                <div className="border-t border-foreground/[0.08] my-5" />

                {/* Quantity & Actions - Hidden on mobile, shown on desktop */}
                <div className="hidden md:flex flex-wrap items-center gap-4 mb-6">
                  {/* Quantity Selector - pointless for a piece that cannot be bought */}
                  <div
                    role="group"
                    aria-label="Quantity"
                    className={`${isUnavailable(product) ? 'hidden' : 'flex'} items-center border border-foreground/15 rounded-control overflow-hidden bg-card/60`}
                  >
                    <button
                      type="button"
                      onClick={decrementQuantity}
                      disabled={quantity <= 1}
                      className="focus-inset w-12 h-12 flex items-center justify-center transition-colors duration-hover ease-out hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Decrease quantity"
                    >
                      <Minus aria-hidden="true" className="w-4 h-4" />
                    </button>
                    <span aria-live="polite" className="w-10 text-center font-bold tabular-nums">{quantity}</span>
                    <button
                      type="button"
                      onClick={incrementQuantity}
                      className="focus-inset w-12 h-12 flex items-center justify-center transition-colors duration-hover ease-out hover:text-primary"
                      aria-label="Increase quantity"
                    >
                      <Plus aria-hidden="true" className="w-4 h-4" />
                    </button>
                  </div>

                  {isUnavailable(product) ? (
                    <div className="flex-1 min-w-[160px] rounded-control border border-foreground/15 bg-foreground/[0.04] text-foreground/70 px-6 py-3.5 text-center text-sm font-semibold">
                      Sold out · Ask us about similar products below
                    </div>
                  ) : (<>
                  {/* Add to Cart Button */}
                  <motion.button
                    type="button"
                    onClick={handleAddToCart}
                    whileTap={tap}
                    className={`flex-1 min-w-[160px] h-12 px-6 text-[11px] font-bold uppercase tracking-[0.16em] rounded-control transition-[background-color,border-color,color] duration-hover ease-out flex items-center justify-center gap-2 border ${
                      addedToCart
                        ? "bg-primary/10 text-primary border-primary"
                        : "bg-card/60 text-foreground border-foreground/20 hover:border-primary hover:text-primary"
                    }`}
                  >
                    {addedToCart ? (
                      <>
                        <Check aria-hidden="true" className="size-5" />
                        Added to cart
                      </>
                    ) : (
                      <>
                        <ShoppingBag aria-hidden="true" className="size-5" />
                        Add to cart
                      </>
                    )}
                  </motion.button>

                  {/* Buy Now Button */}
                  <motion.button
                    type="button"
                    onClick={handleBuyNow}
                    whileTap={tap}
                    className="btn-copper flex-1 min-w-[160px] h-12"
                  >
                    Buy now
                  </motion.button>
                  </>)}
                </div>

                {/* Talk to us: video call demo and WhatsApp, side by side.
                    Labels shorten on narrow screens so both stay on one line. */}
                <div className="mt-2 flex items-stretch gap-2 sm:gap-3">
                  <motion.button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => {
                      if (!user) {
                        navigate('/login', { state: { from: location } });
                        return;
                      }
                      setShowVideoCallModal(true);
                    }}
                    whileTap={tap}
                    className="flex-1 min-w-0 min-h-11 px-3 sm:px-5 py-3 text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.14em] rounded-control border border-foreground/15 text-foreground transition-[border-color,color] duration-hover ease-out hover:border-primary hover:text-primary flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap"
                  >
                    <Video aria-hidden="true" className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">Video consultation</span>
                    <span className="sm:hidden">Consult</span>
                  </motion.button>

                  <WhatsAppEnquiryButton product={product} className="flex-1 min-w-0" />
                </div>

                {/* Share sheet */}
                <Sheet open={showShareMenu} onOpenChange={setShowShareMenu}>
                  <SheetContent side="bottom" className="tx-sheet mx-auto max-w-screen-sm" onCloseAutoFocus={restoreFocus}>
                    <SheetHeader className="mb-4">
                      <SheetTitle>Share this product</SheetTitle>
                      <SheetDescription className="truncate">{product.title}</SheetDescription>
                    </SheetHeader>
                    <div className="grid grid-cols-4 gap-2 sm:gap-4">
                      {shareTile('whatsapp', 'WhatsApp', brandGlyph("M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"))}
                      {shareTile('facebook', 'Facebook', brandGlyph("M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"))}
                      {shareTile('twitter', 'X', brandGlyph("M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"))}
                      {shareTile('telegram', 'Telegram', brandGlyph("M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"))}
                      {shareTile('pinterest', 'Pinterest', brandGlyph("M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z"))}
                      {shareTile('email', 'Email', <Mail aria-hidden="true" />)}
                      {shareTile('copy', 'Copy link', <Link2 aria-hidden="true" />)}
                      {/* Native share (phones) */}
                      {typeof navigator !== 'undefined' && !!navigator.share && shareTile('native', 'More', <Share2 aria-hidden="true" />)}
                    </div>
                  </SheetContent>
                </Sheet>

                {/* Features */}
                <ul className="grid grid-cols-3 gap-2 md:gap-4 mt-4 md:mt-5 mb-6 md:mb-8">
                  {[
                    { icon: Truck, label: "Ships across India" },
                    { icon: Shield, label: "Secure checkout" },
                    { icon: RotateCcw, label: "7-day returns" },
                  ].map(({ icon: Icon, label }) => (
                    <li
                      key={label}
                      className="flex flex-col md:flex-row items-center gap-1.5 md:gap-3 p-3 md:p-3.5 border border-foreground/[0.08] bg-card/60 rounded-card text-center md:text-left"
                    >
                      <Icon aria-hidden="true" className="size-5 text-primary flex-shrink-0" />
                      <span className="text-[10.5px] md:text-[11px] font-bold uppercase tracking-[0.08em] leading-tight text-foreground/80 [text-wrap:balance]">
                        {label}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Divider */}
                <div className="border-t border-foreground/[0.08] my-5" />

                {/* Customer Reviews */}
                <section className="mb-6 scroll-mt-28" id="reviews" aria-labelledby="reviews-heading">
                  {/* Header */}
                  <div className="mb-4 flex items-center justify-between">
                    <h2 id="reviews-heading" className="text-lg md:text-2xl font-semibold text-foreground" style={headingFont}>
                      Customer reviews
                      {reviewCount > 0 && (
                        <span className="ml-1.5 font-normal tabular-nums text-muted-foreground">({reviewCount})</span>
                      )}
                    </h2>
                  </div>

                  {/* Write a Review Button / Already Reviewed state */}
                  {canWriteReview && (
                    <button
                      type="button"
                      onClick={() => navigate(`/write-review?productId=${encodeURIComponent(product.id)}`, {
                        state: {
                          productId: product.id,
                          productName: product.title,
                          productImage: product.image,
                        }
                      })}
                      className="mb-4 flex h-11 w-full items-center justify-center gap-2 rounded-control border border-foreground/15 px-4 text-[11px] font-bold uppercase tracking-[0.14em] text-foreground transition-[border-color,color,transform] duration-press ease-out hover:border-primary hover:text-primary active:scale-[0.97]"
                    >
                      <PenLine aria-hidden="true" className="size-4" />
                      Write a review
                    </button>
                  )}
                  {userReview?.status === 'pending' && (
                    <Notice tone="neutral" compact className="mb-4">
                      Thanks. Your review is waiting for approval.
                    </Notice>
                  )}
                  {userReview?.status === 'rejected' && (
                    <Notice tone="warning" compact className="mb-4">
                      Your last review wasn't approved. You can write a new one.
                    </Notice>
                  )}

                  {/* Individual Reviews */}
                  {reviewsLoading && reviews.length === 0 ? (
                    <div aria-busy="true" className="space-y-3">
                      <span className="sr-only">Loading reviews</span>
                      {[0, 1].map((i) => (
                        <div key={i} className="rounded-card border border-foreground/[0.08] bg-card/70 p-4">
                          <Skeleton className="mb-3 h-4 w-24" />
                          <Skeleton className="mb-2 h-3.5 w-full" />
                          <Skeleton className="h-3.5 w-2/3" />
                        </div>
                      ))}
                    </div>
                  ) : reviews.length > 0 ? (
                    <>
                    <ul className="space-y-3">
                      {shownReviews.map((review) => {
                        const isExpanded = expandedReviews.has(review.id);
                        const dateStr = formatDate(review.createdAt);
                        const isLong = review.reviewText.length > 150;
                        const votes = helpfulVotes[review.id] || { up: 0, down: 0, voted: null };
                        const textId = `review-text-${review.id}`;
                        return (
                          <li key={review.id} className="rounded-card border border-foreground/[0.08] bg-card/70 py-4 px-4">
                            {/* Rating chip + date */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className="inline-flex h-6 items-center gap-1 rounded-chip bg-primary/10 px-2 text-xs font-bold tabular-nums text-primary">
                                <Star aria-hidden="true" className="size-3 fill-current" />
                                {review.rating}
                                <span className="sr-only"> out of 5 stars</span>
                              </span>
                              {dateStr && <span className="text-xs text-muted-foreground">{dateStr}</span>}
                            </div>

                            {/* Review text */}
                            <p id={textId} className={`text-sm text-foreground/80 mb-1 [text-wrap:pretty] ${!isExpanded && isLong ? 'line-clamp-3' : ''}`}>
                              {review.reviewText}
                            </p>
                            {isLong && (
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                aria-controls={textId}
                                onClick={() => setExpandedReviews(prev => {
                                  const next = new Set(prev);
                                  isExpanded ? next.delete(review.id) : next.add(review.id);
                                  return next;
                                })}
                                className="mb-2 min-h-8 text-xs font-semibold text-primary hover:underline underline-offset-2"
                              >
                                {isExpanded ? 'Read less' : 'Read more'}
                              </button>
                            )}

                            {/* Review Images */}
                            {review.images?.length > 0 && (
                              <div className="flex gap-2 mb-3">
                                {review.images.map((img, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    aria-haspopup="dialog"
                                    aria-label={`Open photo ${i + 1} from ${review.userName}'s review`}
                                    onClick={() => { rememberFocus(); setReviewLightbox({ images: review.images, index: i }); }}
                                    className="size-14 shrink-0 overflow-hidden rounded-control transition-transform duration-press ease-out active:scale-[0.97]"
                                  >
                                    <SmartImage src={img} alt="" className="w-full h-full object-cover" preset="tile" />
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Footer: username + helpful */}
                            <div className="flex items-center justify-between gap-3 mt-2">
                              <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-foreground/75">
                                <Check aria-hidden="true" className="size-3 shrink-0 text-primary" />
                                <span className="truncate">{review.userName}</span>
                              </span>
                              <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                                <span className="mr-1">Helpful?</span>
                                <button
                                  type="button"
                                  onClick={() => handleHelpfulVote(review.id, 'up')}
                                  disabled={!!votes.voted}
                                  aria-pressed={votes.voted === 'up'}
                                  aria-label={`Yes, helpful (${votes.up})`}
                                  className={`relative flex h-8 items-center gap-1 rounded-control border px-2 tabular-nums transition-colors duration-hover ease-out after:absolute after:-inset-1 after:content-[''] disabled:cursor-default ${
                                    votes.voted === 'up'
                                      ? 'border-primary/50 text-primary'
                                      : 'border-transparent enabled:hover:text-foreground'
                                  }`}
                                >
                                  <ThumbsUp aria-hidden="true" className="size-3.5" /> {votes.up}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleHelpfulVote(review.id, 'down')}
                                  disabled={!!votes.voted}
                                  aria-pressed={votes.voted === 'down'}
                                  aria-label={`No, not helpful (${votes.down})`}
                                  className={`relative flex h-8 items-center gap-1 rounded-control border px-2 tabular-nums transition-colors duration-hover ease-out after:absolute after:-inset-1 after:content-[''] disabled:cursor-default ${
                                    votes.voted === 'down'
                                      ? 'border-foreground/30 text-foreground'
                                      : 'border-transparent enabled:hover:text-foreground'
                                  }`}
                                >
                                  <ThumbsDown aria-hidden="true" className="size-3.5" /> {votes.down}
                                </button>
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {reviews.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setShowAllReviews((v) => !v)}
                        aria-expanded={showAllReviews}
                        className="link-arrow mt-4"
                      >
                        {showAllReviews ? 'Show fewer reviews' : `Show all ${plural(reviews.length, 'review')}`}
                      </button>
                    )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground [text-wrap:pretty]">
                      No reviews yet. Reviews come from customers after their order is delivered.
                    </p>
                  )}
                </section>

              </motion.div>
            </div>
          </div>
        </section>

        {/* Related Products */}
        <section aria-labelledby="related-heading" className="tx-sheet py-10 md:py-16 border-t border-foreground/[0.08]">
          <div className="container-custom">
            <h2
              id="related-heading"
              className="text-2xl md:text-4xl font-semibold text-left mb-6 md:mb-10 [text-wrap:balance]"
              style={headingFont}
            >
              You may also like
            </h2>
            {/* Mobile: Horizontal Scroll */}
            <div className="md:hidden flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide snap-x">
              {relatedProducts.map((relatedProduct, idx) => (
                <div key={relatedProduct.id} className="w-40 flex-shrink-0 snap-start">
                  <ProductCard product={relatedProduct} index={idx} />
                </div>
              ))}
            </div>
            {/* Desktop: Grid */}
            <div className="hidden md:grid grid-cols-4 gap-4 lg:gap-5">
              {relatedProducts.map((relatedProduct, idx) => (
                <ProductCard key={relatedProduct.id} product={relatedProduct} index={idx} />
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Fixed Bottom Bar for Mobile */}
      {!showShareMenu && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-sticky border-t border-foreground/[0.08] bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          {isUnavailable(product) ? (
            <div className="rounded-control border border-foreground/15 bg-foreground/[0.04] text-foreground/70 py-3.5 text-center text-sm font-semibold">
              Sold out
            </div>
          ) : (
          <div className="flex gap-3">
          <motion.button
            type="button"
            onClick={handleAddToCart}
            whileTap={tap}
            className={`flex-1 h-12 text-[11px] font-bold uppercase tracking-[0.14em] rounded-control border flex items-center justify-center gap-2 transition-[background-color,border-color,color] duration-hover ease-out ${
              addedToCart ? "bg-primary/10 border-primary text-primary" : "border-foreground/20 bg-card/60 text-foreground"
            }`}
          >
            {addedToCart ? (
              <>
                <Check aria-hidden="true" className="size-5" />
                Added
              </>
            ) : (
              <>
                <ShoppingBag aria-hidden="true" className="size-4" />
                Add to cart
              </>
            )}
          </motion.button>
          <motion.button
            type="button"
            onClick={handleBuyNow}
            whileTap={tap}
            className="btn-copper flex-1 h-12 !px-3 tabular-nums"
          >
            {dealer ? "Buy now" : <>Buy at {formatINR(product.price)}</>}
          </motion.button>
        </div>
          )}
      </div>
      )}

      {/* Video Call Request Modal */}
      <VideoCallRequestModal
        open={showVideoCallModal}
        onClose={() => setShowVideoCallModal(false)}
        productId={product?.id}
        productTitle={product?.title}
        productImage={product?.images?.[0]}
      />

      {/* Full-screen image viewer (all screen sizes): a Radix dialog, so
          Escape closes it, focus is trapped and returns to the photo. */}
      <Dialog open={showImagePopup} onOpenChange={setShowImagePopup}>
        <DialogPortal>
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onCloseAutoFocus={restoreFocus}
            className="fixed inset-0 z-overlay flex flex-col bg-charcoal text-charcoal-foreground outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:duration-200 data-[state=closed]:duration-150 ease-out"
          >
            <DialogPrimitive.Title className="sr-only">{product.title}: photos</DialogPrimitive.Title>
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 sm:px-4">
              <span className="pl-1 text-sm tabular-nums text-charcoal-foreground/70" aria-live="polite">
                {allMedia.length > 1 ? `${selectedImage + 1} / ${allMedia.length}` : ""}
              </span>
              <DialogPrimitive.Close asChild>
                <IconButton label="Close" variant="onPhoto">
                  <X aria-hidden="true" />
                </IconButton>
              </DialogPrimitive.Close>
            </div>

            {/* Image Container with Swipe */}
            <div
              className="relative flex min-h-0 flex-1 items-center justify-center"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              {allMedia[selectedImage]?.type === 'video' ? (
                <iframe
                  key={selectedImage}
                  src={allMedia[selectedImage].src}
                  title={`${product.title} video`}
                  className="w-full h-full max-w-full max-h-full p-4"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <motion.div
                  key={selectedImage}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="absolute inset-0"
                >
                  {/* The gallery's own image (same src and srcset, so it comes
                      from the browser cache) shows at once; the sharper zoom
                      image fades in over it when it has loaded. */}
                  <SmartImage
                    src={allMedia[selectedImage]?.src || product.image}
                    alt=""
                    aria-hidden="true"
                    preset="detail"
                    priority
                    className={cn(
                      "absolute inset-0 h-full w-full object-contain p-4",
                      viewerZoomSrc === zoomSrc && "invisible",
                    )}
                  />
                  <img
                    src={zoomSrc}
                    alt={product.alt}
                    onLoad={() => setViewerZoomSrc(zoomSrc)}
                    className={cn(
                      "absolute inset-0 h-full w-full object-contain p-4 transition-opacity duration-200 ease-out",
                      viewerZoomSrc === zoomSrc ? "opacity-100" : "opacity-0",
                    )}
                  />
                </motion.div>
              )}

              {/* Navigation Arrows */}
              {allMedia.length > 1 && (
                <>
                  {selectedImage > 0 && (
                    <IconButton
                      label="Previous image"
                      variant="onPhoto"
                      onClick={() => setSelectedImage(selectedImage - 1)}
                      className="absolute left-2 top-1/2 -translate-y-1/2"
                    >
                      <ChevronLeft aria-hidden="true" />
                    </IconButton>
                  )}
                  {selectedImage < allMedia.length - 1 && (
                    <IconButton
                      label="Next image"
                      variant="onPhoto"
                      onClick={() => setSelectedImage(selectedImage + 1)}
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                    >
                      <ChevronRight aria-hidden="true" />
                    </IconButton>
                  )}
                </>
              )}
            </div>

            {/* Dots */}
            {allMedia.length > 1 && (
              <div className="flex justify-center gap-0.5 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                {allMedia.map((_, index) => (
                  <button
                    type="button"
                    key={index}
                    onClick={() => setSelectedImage(index)}
                    aria-label={`Show image ${index + 1}`}
                    aria-current={selectedImage === index ? "true" : undefined}
                    className="grid h-8 min-w-8 place-items-center p-2"
                  >
                    <span
                      className={`block h-2 rounded-full transition-[width,background-color] duration-dropdown ease-out ${
                        selectedImage === index ? "w-4 bg-charcoal-foreground" : "w-2 bg-charcoal-foreground/45"
                      }`}
                    />
                  </button>
                ))}
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>

      {/* Footer */}
      <Footer />

      {/* Bottom padding for mobile to account for fixed bar */}
      <div aria-hidden="true" className="md:hidden h-[calc(5rem+env(safe-area-inset-bottom))]"></div>
      <MobileBottomNav />

      {/* Review photo lightbox */}
      <Dialog open={!!reviewLightbox} onOpenChange={(next) => { if (!next) setReviewLightbox(null); }}>
        <DialogPortal>
          <DialogOverlay className="bg-charcoal/90" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onCloseAutoFocus={restoreFocus}
            onClick={(e) => { if (e.target === e.currentTarget) setReviewLightbox(null); }}
            className="fixed inset-0 z-overlay flex items-center justify-center outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:duration-200 data-[state=closed]:duration-150 ease-out"
          >
            <DialogPrimitive.Title className="sr-only">Review photo</DialogPrimitive.Title>
            {reviewLightbox && (
              <>
                <DialogPrimitive.Close asChild>
                  <IconButton label="Close" variant="onPhoto" className="absolute right-3 top-3">
                    <X aria-hidden="true" />
                  </IconButton>
                </DialogPrimitive.Close>
                {reviewLightbox.index > 0 && (
                  <IconButton
                    label="Previous photo"
                    variant="onPhoto"
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    onClick={() => setReviewLightbox(prev => prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev)}
                  >
                    <ChevronLeft aria-hidden="true" />
                  </IconButton>
                )}
                <SmartImage
                  src={reviewLightbox.images[reviewLightbox.index]}
                  alt={`Review photo ${reviewLightbox.index + 1} of ${reviewLightbox.images.length}`}
                  className="max-h-[85vh] max-w-[90vw] rounded-card object-contain"
                  preset="zoom"
                />
                {reviewLightbox.index < reviewLightbox.images.length - 1 && (
                  <IconButton
                    label="Next photo"
                    variant="onPhoto"
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    onClick={() => setReviewLightbox(prev => prev && prev.index < prev.images.length - 1 ? { ...prev, index: prev.index + 1 } : prev)}
                  >
                    <ChevronRight aria-hidden="true" />
                  </IconButton>
                )}
                {reviewLightbox.images.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-chip bg-charcoal/70 px-3 py-1 text-sm tabular-nums text-charcoal-foreground">
                    {reviewLightbox.index + 1} / {reviewLightbox.images.length}
                  </div>
                )}
              </>
            )}
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </div>
  );
};

export default ProductDetail;
