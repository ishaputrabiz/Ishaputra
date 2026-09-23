import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Heart, Minus, Plus, ChevronRight, ShoppingBag, Truck, Shield, RotateCcw, Check, Loader2, X, ChevronLeft, ArrowLeft, Share2, PenLine, CheckCircle, Image as ImageIcon, ThumbsUp, ThumbsDown } from "lucide-react";
import { getProduct, type Product as FirebaseProduct } from "@/services/productService";
import { getActiveProductsCached, useCatalogRevision } from "@/services/productCache";
import { UIProductDetail, adaptFirebaseToUIDetail, adaptFirebaseArrayToUI } from "@/lib/productAdapter";
import { useSilverRate, computeSilverOriginalPrice } from "@/contexts/SilverRateContext";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useWishlist } from "@/hooks/useWishlist";
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
  useEffect(() => {
    if (!showImagePopup) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowImagePopup(false);
      else if (e.key === 'ArrowRight') {
        setSelectedImage((i) => Math.min(i + 1, Math.max(0, mediaCountRef.current - 1)));
      } else if (e.key === 'ArrowLeft') {
        setSelectedImage((i) => Math.max(i - 1, 0));
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
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
  const [helpfulVotes, setHelpfulVotes] = useState<Record<string, { up: number; down: number; voted: 'up' | 'down' | null }>>({});
  // Review image lightbox
  const [reviewLightbox, setReviewLightbox] = useState<{ images: string[]; index: number } | null>(null);

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
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add item to cart. Please try again.",
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
    const shareText = `Check out ${productTitle} at Sreerasthu Silvers! ₹${product.price.toLocaleString("en-IN")}`;

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
          window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + '\n' + productUrl)}`, '_blank');
        }
        break;
      }
      case 'facebook': {
        const shared = await shareWithImage(shareText);
        if (!shared) {
          window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productUrl)}&quote=${encodeURIComponent(shareText)}`, '_blank');
        }
        break;
      }
      case 'twitter': {
        const shared = await shareWithImage(shareText);
        if (!shared) {
          window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(productUrl)}`, '_blank');
        }
        break;
      }
      case 'telegram': {
        const shared = await shareWithImage(shareText);
        if (!shared) {
          window.open(`https://t.me/share/url?url=${encodeURIComponent(productUrl)}&text=${encodeURIComponent(shareText)}`, '_blank');
        }
        break;
      }
      case 'pinterest':
        window.open(`https://pinterest.com/pin/create/button/?url=${encodeURIComponent(productUrl)}&media=${encodeURIComponent(productImage)}&description=${encodeURIComponent(shareText)}`, '_blank');
        break;
      case 'email': {
        const shared = await shareWithImage(shareText);
        if (!shared) {
          const emailBody = `${shareText}\n\nProduct Link: ${productUrl}`;
          window.open(`mailto:?subject=${encodeURIComponent(productTitle + ' - Sreerasthu Silvers')}&body=${encodeURIComponent(emailBody)}`, '_blank');
        }
        break;
      }
      case 'copy':
        try {
          await navigator.clipboard.writeText(productUrl);
          toast({ title: "Link copied!", description: "Product link copied to clipboard." });
        } catch {
          toast({ title: "Error", description: "Failed to copy link.", variant: "destructive" });
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

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen w-full">
        <main className="container-custom py-20 flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  // Product not found
  if (notFound || !product) {
    return (
      <div className="min-h-screen w-full">
        <main className="container-custom py-20 text-center">
          <h1 className="text-2xl font-semibold mb-4">Product Not Found</h1>
          <p className="text-muted-foreground mb-6">The product you're looking for doesn't exist or has been removed.</p>
          <button
            onClick={() => navigate("/shop/necklaces")}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-all"
          >
            Back to Shop
          </button>
        </main>
      </div>
    );
  }

  // Generate SKU
  const sku = `sreerasthu-${product.category.toLowerCase().replace(/[^a-z]/g, "-")}-${product.id}`;

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


  return (
    <div className="min-h-screen w-full overflow-x-clip">
      {/* Desktop Header */}
      <div className="hidden lg:block">
        <Header />
        <CategoryIconNav />
      </div>
      <main>
        {/* Mobile Header and Search */}
        <div className="lg:hidden">
          <MobileHeader />
          <MobileSearchBar />
        </div>

        {/* Breadcrumb */}
        <section className="hidden lg:block bg-secondary/50 dark:bg-secondary/30 py-2">
          <div className="container-custom">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <a href="/" className="hover:text-primary transition-colors">Home</a>
              <ChevronRight className="w-4 h-4" />
              <span className="text-foreground">
                {product.title.length > 30 ? product.title.slice(0, 30) + '...' : product.title}
              </span>
            </div>
          </div>
        </section>

        {/* Product Details Section */}
        <section className="py-4 md:py-6">
          <div className="container-custom">
            {/* Back button */}
            <button
              onClick={() => navigate(-1)}
              className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
              {/* Product Images & Videos */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
              >
                {/* Main Media */}
                <div 
                  className="group relative bg-muted rounded-2xl overflow-hidden aspect-square max-w-lg mx-auto mb-4 cursor-pointer md:cursor-zoom-in"
                  onClick={() => {
                    if (didSwipeRef.current) { didSwipeRef.current = false; return; }
                    // Every screen size, not just phones. On desktop the only
                    // way to look closely was the hover magnifier, which shows
                    // a fraction of the piece at a time and vanishes the moment
                    // the pointer leaves.
                    setShowImagePopup(true);
                  }}
                  onTouchStart={onTouchStart}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                  onMouseEnter={() => allMedia[selectedImage]?.type !== 'video' && setIsZooming(true)}
                  onMouseLeave={() => setIsZooming(false)}
                  onMouseMove={(e) => {
                    if (allMedia[selectedImage]?.type === 'video') return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    const y = ((e.clientY - rect.top) / rect.height) * 100;
                    setZoomPos({ x, y });
                  }}
                >
                  {/*
                    Nothing previously said the image could be opened, so on
                    desktop the full view was undiscoverable. Fades in on hover
                    beside the magnifier, and stays out of the way on phones,
                    where tapping the image already opens it.
                  */}
                  {allMedia[selectedImage]?.type !== 'video' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowImagePopup(true);
                      }}
                      className="absolute right-3 top-3 z-20 hidden h-9 w-9 place-items-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/65 group-hover:opacity-100 focus-visible:opacity-100 md:grid"
                      aria-label="View image full screen"
                      title="View full screen"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                  )}

                  {/* Live-drag + slide animation wrapper */}
                  <div
                    className="absolute inset-0"
                    style={{
                      transform: `translateX(${dragX}px)`,
                      transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
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
                        transition={{ type: 'tween', ease: [0.25, 0.46, 0.45, 0.94], duration: 0.28 }}
                        className="absolute inset-0"
                      >
                        {allMedia[selectedImage]?.type === 'video' ? (
                          <>
                            <iframe
                              src={allMedia[selectedImage].src}
                              title="Product video"
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
                              className="w-full h-full object-cover transition-transform duration-200 ease-out hidden md:block"
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
                  {/* Subtle gold ring on hover (desktop) */}
                  <div className="hidden md:block absolute inset-0 ring-1 ring-inset ring-primary/0 group-hover:ring-primary/30 rounded-2xl transition-all pointer-events-none" />
                  
                  {/* Wishlist & Share Icons */}
                  <div className="absolute top-3 right-3 flex flex-col gap-2 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (product) toggleWishlist(product.id, product.title);
                      }}
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg ${
                        product && isInWishlist(product.id)
                          ? "bg-red-500 text-white"
                          : "bg-background/90 dark:bg-card/90 text-foreground hover:bg-muted"
                      }`}
                    >
                      <Heart
                        className="w-5 h-5"
                        fill={product && isInWishlist(product.id) ? "currentColor" : "none"}
                      />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowShareMenu(!showShareMenu);
                      }}
                      className="w-10 h-10 rounded-full bg-background/90 dark:bg-card/90 text-foreground hover:bg-muted flex items-center justify-center transition-all shadow-lg"
                    >
                      <Share2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Thumbnail Gallery - images + videos */}
                {allMedia.length > 1 && (
                  <div className="grid grid-cols-4 gap-2 max-w-lg mx-auto">
                    {allMedia.map((item, index) => (
                      <button
                        key={index}
                        onClick={() => navigateMedia(index)}
                        className={`aspect-square bg-muted rounded-lg overflow-hidden border-2 transition-all relative ${
                          selectedImage === index
                            ? "border-primary"
                            : "border-transparent hover:border-primary/50"
                        }`}
                      >
                        <SmartImage
                          src={item.thumb}
                          alt={`${product.title} ${item.type === 'video' ? 'video' : 'view'} ${index + 1}`}
                          className="w-full h-full object-contain p-1"
                          preset="tile"
                        />
                        {item.type === 'video' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center">
                              <div className="w-0 h-0 border-t-[5px] border-t-transparent border-b-[5px] border-b-transparent border-l-[8px] border-l-white ml-0.5" />
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Product Info */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="flex flex-col"
                style={{ fontFamily: "'Poppins', sans-serif" }}
              >
                {/* Title */}
                <h1 
                  className="text-base md:text-2xl lg:text-3xl font-medium text-foreground mb-3"
                  style={{ fontFamily: "'Poppins', sans-serif" }}
                >
                  {product.title}
                </h1>

                {/* Price */}
                <div className="mb-1">
                  {(() => {
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
                        <span className="text-2xl md:text-3xl lg:text-4xl font-bold text-foreground">
                          ₹{livePriceDisplay.toLocaleString("en-IN")}
                        </span>
                        {liveMRP && liveMRP > product.price && (
                          <>
                            <span className="text-lg md:text-xl text-muted-foreground line-through">
                              ₹{liveMRP.toLocaleString("en-IN")}
                            </span>
                            {liveDiscount && liveDiscount > 0 && (
                              <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs md:text-sm font-semibold rounded">
                                ({liveDiscount}% off)
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                  <p className="text-xs md:text-sm text-muted-foreground mt-1">
                    (MRP Inclusive of all taxes)
                  </p>
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
                  <p className={`text-xs md:text-sm text-muted-foreground leading-relaxed ${
                    !showFullDescription ? 'line-clamp-2' : ''
                  }`}>
                    {product.description ||
                      `Traditional silver anklet with delicate bells creating a graceful and charming`}
                  </p>
                  {(product.description || 'Traditional silver anklet with delicate bells creating a graceful and charming').length > 100 && (
                    <button
                      onClick={() => setShowFullDescription(!showFullDescription)}
                      className="text-blue-600 text-xs md:text-sm font-medium mt-1 hover:underline"
                    >
                      {showFullDescription ? 'less' : 'more'}
                    </button>
                  )}
                </div>

                {/* Specifications */}
                {product.specifications && (product.specifications.material || product.specifications.purity || product.specifications.dimensions) && (
                  <div className="grid grid-cols-3 gap-2 md:gap-3 mb-6">
                    {product.specifications.dimensions && (
                      <div className="border-2 border-[#C4A962] dark:border-[#C4A962]/60 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Size</p>
                        <p className="text-sm md:text-base font-medium text-foreground">
                          {product.specifications.dimensions}
                        </p>
                      </div>
                    )}
                    {product.specifications.material && (
                      <div className="border-2 border-[#C4A962] dark:border-[#C4A962]/60 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Metal</p>
                        <p className="text-sm md:text-base font-medium text-foreground">
                          {product.specifications.material}
                        </p>
                      </div>
                    )}
                    {product.specifications.purity && (
                      <div className="border-2 border-[#C4A962] dark:border-[#C4A962]/60 rounded-lg p-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1">Purity</p>
                        <p className="text-sm md:text-base font-medium text-foreground">
                          {product.specifications.purity}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Divider */}
                <div className="border-t border-border my-4" />

                {/* Quantity & Actions - Hidden on mobile, shown on desktop */}
                <div className="hidden md:flex flex-wrap items-center gap-4 mb-6">
                  {/* Quantity Selector - pointless for a piece that cannot be bought */}
                  <div className={`${isUnavailable(product) ? 'hidden' : 'flex'} items-center border border-border rounded-full overflow-hidden`}>
                    <button
                      onClick={decrementQuantity}
                      className="w-12 h-12 flex items-center justify-center hover:bg-muted transition-colors"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-12 text-center font-medium">{quantity}</span>
                    <button
                      onClick={incrementQuantity}
                      className="w-12 h-12 flex items-center justify-center hover:bg-muted transition-colors"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {isUnavailable(product) ? (
                    <div className="flex-1 min-w-[160px] rounded-full border-2 border-orange-200 bg-orange-50 px-6 py-3.5 text-center text-sm font-semibold text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-200">
                      Sold out · Ask us about similar pieces below
                    </div>
                  ) : (<>
                  {/* Add to Cart Button */}
                  <motion.button
                    onClick={handleAddToCart}
                    whileTap={{ scale: 0.95 }}
                    className={`flex-1 min-w-[160px] px-6 py-3.5 font-medium text-sm rounded-full transition-all flex items-center justify-center gap-2 border-2 ${
                      addedToCart
                        ? "bg-green-500 text-white border-green-500"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {addedToCart ? (
                      <>
                        <Check className="w-5 h-5" />
                        Added to Cart
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-5 h-5" />
                        Add to Cart
                      </>
                    )}
                  </motion.button>

                  {/* Buy Now Button */}
                  <motion.button
                    onClick={handleBuyNow}
                    whileTap={{ scale: 0.95 }}
                    className="flex-1 min-w-[160px] px-6 py-3.5 font-semibold text-sm rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all flex items-center justify-center gap-2"
                  >
                    Buy Now
                  </motion.button>
                  </>)}
                </div>

                {/* Talk to us: video call demo and WhatsApp, side by side.
                    Labels shorten on narrow screens so both stay on one line. */}
                <div className="mt-2 flex items-stretch gap-2 sm:gap-3">
                  <motion.button
                    onClick={() => {
                      if (!user) {
                        navigate('/login', { state: { from: location } });
                        return;
                      }
                      setShowVideoCallModal(true);
                    }}
                    whileTap={{ scale: 0.97 }}
                    className="flex-1 min-w-0 px-3 sm:px-5 py-3 font-medium text-xs sm:text-sm rounded-full border-2 border-amber-500 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-all flex items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap"
                  >
                    <Video className="w-4 h-4 shrink-0" />
                    <span className="hidden sm:inline">Book a Demo Video Call</span>
                    <span className="sm:hidden">Video Call</span>
                  </motion.button>

                  <WhatsAppEnquiryButton product={product} className="flex-1 min-w-0" />
                </div>

                {/* Share Popup */}
                <AnimatePresence>
                  {showShareMenu && (
                    <>
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-40" 
                        onClick={() => setShowShareMenu(false)} 
                      />
                      <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                        className="fixed bottom-0 left-0 right-0 z-50 bg-background dark:bg-card rounded-t-3xl shadow-2xl p-6 max-w-screen-sm mx-auto"
                      >
                        <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-4" />
                        <p className="text-sm font-semibold text-foreground mb-4">Share this product</p>
                        <div className="grid grid-cols-4 gap-4">
                              {/* WhatsApp */}
                              <button onClick={() => handleShare('whatsapp')} className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-muted transition-colors">
                                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                </div>
                                <span className="text-[10px] text-muted-foreground">WhatsApp</span>
                              </button>

                              {/* Facebook */}
                              <button onClick={() => handleShare('facebook')} className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-muted transition-colors">
                                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                                </div>
                                <span className="text-[10px] text-muted-foreground">Facebook</span>
                              </button>

                              {/* Twitter/X */}
                              <button onClick={() => handleShare('twitter')} className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-muted transition-colors">
                                <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center">
                                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                                </div>
                                <span className="text-[10px] text-muted-foreground">X</span>
                              </button>

                              {/* Telegram */}
                              <button onClick={() => handleShare('telegram')} className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-muted transition-colors">
                                <div className="w-10 h-10 rounded-full bg-sky-500 flex items-center justify-center">
                                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                                </div>
                                <span className="text-[10px] text-muted-foreground">Telegram</span>
                              </button>

                              {/* Pinterest */}
                              <button onClick={() => handleShare('pinterest')} className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-muted transition-colors">
                                <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center">
                                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z"/></svg>
                                </div>
                                <span className="text-[10px] text-muted-foreground">Pinterest</span>
                              </button>

                              {/* Email */}
                              <button onClick={() => handleShare('email')} className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-muted transition-colors">
                                <div className="w-10 h-10 rounded-full bg-gray-600 dark:bg-gray-500 flex items-center justify-center">
                                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                                </div>
                                <span className="text-[10px] text-muted-foreground">Email</span>
                              </button>

                              {/* Copy Link */}
                              <button onClick={() => handleShare('copy')} className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-muted transition-colors">
                                <div className="w-10 h-10 rounded-full bg-gray-800 dark:bg-gray-600 flex items-center justify-center">
                                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                </div>
                                <span className="text-[10px] text-muted-foreground">Copy Link</span>
                              </button>

                              {/* Native Share (mobile) */}
                              {typeof navigator !== 'undefined' && navigator.share && (
                                <button onClick={() => handleShare('native')} className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-muted transition-colors">
                                  <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center">
                                    <Share2 className="w-5 h-5 text-white" />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">More</span>
                                </button>
                            )}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>

                {/* Features */}
                <div className="grid grid-cols-3 gap-2 md:gap-4 mt-4 md:mt-5 mb-6 md:mb-8">
                  <div className="flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 bg-secondary/50 rounded-lg md:rounded-xl text-center md:text-left">
                    <Truck className="w-4 h-4 md:w-5 md:h-5 text-primary flex-shrink-0" />
                    <span className="text-[10px] md:text-sm leading-tight">Free Shipping</span>
                  </div>
                  <div className="flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 bg-secondary/50 rounded-lg md:rounded-xl text-center md:text-left">
                    <Shield className="w-4 h-4 md:w-5 md:h-5 text-primary flex-shrink-0" />
                    <span className="text-[10px] md:text-sm leading-tight">2 Year Warranty</span>
                  </div>
                  <div className="flex flex-col md:flex-row items-center gap-1 md:gap-3 p-2 md:p-3 bg-secondary/50 rounded-lg md:rounded-xl text-center md:text-left">
                    <RotateCcw className="w-4 h-4 md:w-5 md:h-5 text-primary flex-shrink-0" />
                    <span className="text-[10px] md:text-sm leading-tight">Easy Returns</span>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border my-4" />

                {/* Customer Reviews */}
                <div className="mb-6" id="reviews">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base md:text-lg font-bold text-foreground">
                      Customer Reviews ({reviewStats.totalReviews > 0 ? reviewStats.totalReviews : (product.reviews || 0)})
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Reviews have been published* with verified customer's consent.
                  </p>
                  <p className="text-xs text-muted-foreground/70 mb-4">*T&C Applied</p>

                  {/* Write a Review Button / Already Reviewed state */}
                  {canWriteReview && (
                    <button
                      onClick={() => navigate('/write-review', {
                        state: {
                          productId: product.id,
                          productName: product.title,
                          productImage: product.image,
                        }
                      })}
                      className="w-full py-2 bg-transparent border-2 border-[#D4AF37] text-[#D4AF37] rounded-full font-medium hover:bg-[#D4AF37]/10 transition-colors flex items-center justify-center gap-2 mb-4 text-sm"
                    >
                      <PenLine size={16} />
                      Write a Review
                    </button>
                  )}
                  {userReview?.status === 'pending' && (
                    <div className="w-full py-2 border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700/40 rounded-full flex items-center justify-center gap-2 mb-4 text-sm text-emerald-700 dark:text-emerald-300 font-medium">
                      <CheckCircle size={16} />
                      You've reviewed this product — pending admin approval
                    </div>
                  )}
                  {userReview?.status === 'rejected' && (
                    <div className="w-full py-2 border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-700/40 rounded-full flex items-center justify-center gap-2 mb-4 text-sm text-red-600 dark:text-red-400 font-medium">
                      Your previous review was not approved — you may submit a new one
                    </div>
                  )}

                  {/* Individual Reviews */}
                  {reviews.length > 0 ? (
                    <div className="space-y-3">
                      {reviews.slice(0, 5).map((review) => {
                        const isExpanded = expandedReviews.has(review.id);
                        const dateStr = review.createdAt?.toDate
                          ? review.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '';
                        const isLong = review.reviewText.length > 150;
                        const votes = helpfulVotes[review.id] || { up: 0, down: 0, voted: null };
                        return (
                          <div key={review.id} className="border border-border rounded-xl py-4 px-4">
                            {/* Rating pill + date */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className="bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded flex items-center gap-0.5">
                                {review.rating}★
                              </span>
                              <span className="text-xs text-muted-foreground">{dateStr}</span>
                            </div>

                            {/* Review text */}
                            <p className={`text-sm text-foreground/80 mb-1 ${!isExpanded && isLong ? 'line-clamp-3' : ''}`}>
                              {review.reviewText}
                            </p>
                            {isLong && (
                              <button
                                onClick={() => setExpandedReviews(prev => {
                                  const next = new Set(prev);
                                  isExpanded ? next.delete(review.id) : next.add(review.id);
                                  return next;
                                })}
                                className="text-xs text-blue-600 mb-2"
                              >
                                {isExpanded ? 'read less' : '...read more'}
                              </button>
                            )}

                            {/* Review Images */}
                            {review.images?.length > 0 && (
                              <div className="flex gap-2 mb-3">
                                {review.images.map((img, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => setReviewLightbox({ images: review.images, index: i })}
                                    className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary"
                                  >
                                    <SmartImage src={img} alt={`Review ${i + 1}`} className="w-full h-full object-cover" preset="tile" />
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Footer: username + helpful */}
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-green-600 flex items-center gap-1">
                                <Check size={10} />{review.userName}
                              </span>
                              <span className="text-xs text-muted-foreground flex items-center gap-3">
                                Helpful?
                                <button
                                  onClick={() => handleHelpfulVote(review.id, 'up')}
                                  disabled={!!votes.voted}
                                  className={`flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded-md border ${
                                    votes.voted === 'up'
                                      ? 'border-yellow-400 text-yellow-500'
                                      : 'border-transparent hover:text-foreground'
                                  }`}
                                >
                                  <ThumbsUp size={13} strokeWidth={1.8} /> {votes.up}
                                </button>
                                <button
                                  onClick={() => handleHelpfulVote(review.id, 'down')}
                                  disabled={!!votes.voted}
                                  className={`flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded-md border ${
                                    votes.voted === 'down'
                                      ? 'border-red-400 text-red-500'
                                      : 'border-transparent hover:text-foreground'
                                  }`}
                                >
                                  <ThumbsDown size={13} strokeWidth={1.8} /> {votes.down}
                                </button>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-4">No reviews yet. Be the first to review!</p>
                  )}
                </div>

              </motion.div>
            </div>
          </div>
        </section>

        {/* Related Products */}
        <section className="py-8 md:py-12 bg-secondary/30">
          <div className="container-custom">
            <h2
              className="text-xl md:text-3xl font-semibold text-left mb-6 md:mb-8"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              You May Also Like
            </h2>
            {/* Mobile: Horizontal Scroll */}
            <div className="md:hidden flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
              {relatedProducts.map((relatedProduct, idx) => (
                <div key={relatedProduct.id} className="flex-shrink-0 w-40">
                  <ProductCard product={relatedProduct} index={idx} />
                </div>
              ))}
            </div>
            {/* Desktop: Grid */}
            <div className="hidden md:grid grid-cols-4 lg:grid-cols-5 gap-4">
              {relatedProducts.map((relatedProduct, idx) => (
                <ProductCard key={relatedProduct.id} product={relatedProduct} index={idx} />
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Fixed Bottom Bar for Mobile */}
      {!showShareMenu && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border px-4 py-3 z-50">
          {isUnavailable(product) ? (
            <div className="rounded-full border-2 border-orange-200 bg-orange-50 py-3.5 text-center text-sm font-semibold text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-200">
              Sold out
            </div>
          ) : (
          <div className="flex gap-3">
          <motion.button
            onClick={handleAddToCart}
            whileTap={{ scale: 0.95 }}
            className="flex-1 py-3.5 font-medium text-sm rounded-full border-2 border-border bg-background text-foreground flex items-center justify-center gap-2"
          >
            {addedToCart ? (
              <>
                <Check className="w-5 h-5" />
                Added
              </>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4" />
                Add to cart
              </>
            )}
          </motion.button>
          <motion.button
            onClick={handleBuyNow}
            whileTap={{ scale: 0.95 }}
            className="flex-1 py-3.5 font-semibold text-sm rounded-full bg-black text-white flex items-center justify-center"
          >
            Buy at ₹{product?.price.toLocaleString("en-IN")}
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

      {/* Full-screen image viewer (all screen sizes) */}
      {showImagePopup && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black z-[100] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-black/80">
            <span className="text-white text-sm">
              {selectedImage + 1} / {allMedia.length}
            </span>
            <button
              onClick={() => setShowImagePopup(false)}
              className="text-white p-2"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Image Container with Swipe */}
          <div
            className="flex-1 flex items-center justify-center relative"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {allMedia[selectedImage]?.type === 'video' ? (
              <iframe
                key={selectedImage}
                src={allMedia[selectedImage].src}
                title="Product video"
                className="w-full h-full max-w-full max-h-full p-4"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <motion.img
                key={selectedImage}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2 }}
                src={cldUrl(allMedia[selectedImage]?.src || product?.image, 'zoom')}
                alt={product?.alt}
                className="max-w-full max-h-full object-contain p-4"
              />
            )}

            {/* Navigation Arrows */}
            {allMedia.length > 1 && (
              <>
                {selectedImage > 0 && (
                  <button
                    onClick={() => setSelectedImage(selectedImage - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/20 rounded-full p-2"
                  >
                    <ChevronLeft className="w-6 h-6 text-white" />
                  </button>
                )}
                {selectedImage < allMedia.length - 1 && (
                  <button
                    onClick={() => setSelectedImage(selectedImage + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/20 rounded-full p-2"
                  >
                    <ChevronRight className="w-6 h-6 text-white" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* Thumbnail Dots */}
          {allMedia.length > 1 && (
            <div className="flex justify-center gap-2 p-4 bg-black/80">
              {allMedia.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setSelectedImage(index)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    selectedImage === index ? "bg-white w-4" : "bg-white/50"
                  }`}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Footer */}
      <Footer />

      {/* Bottom padding for mobile to account for fixed bar */}
      <div className="md:hidden h-20"></div>
      <MobileBottomNav />

      {/* Review Image Lightbox */}
      {reviewLightbox && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center"
          onClick={() => setReviewLightbox(null)}
        >
          {/* Close */}
          <button
            className="absolute top-4 right-4 text-white p-2 hover:bg-white/10 rounded-full"
            onClick={() => setReviewLightbox(null)}
          >
            <X className="w-6 h-6" />
          </button>
          {/* Prev */}
          {reviewLightbox.index > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white p-2 hover:bg-white/10 rounded-full"
              onClick={(e) => { e.stopPropagation(); setReviewLightbox(prev => prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev); }}
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}
          {/* Image */}
          <SmartImage
            src={reviewLightbox.images[reviewLightbox.index]}
            alt="Review image"
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            preset="zoom"
            onClick={(e) => e.stopPropagation()}
          />
          {/* Next */}
          {reviewLightbox.index < reviewLightbox.images.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white p-2 hover:bg-white/10 rounded-full"
              onClick={(e) => { e.stopPropagation(); setReviewLightbox(prev => prev && prev.index < prev.images.length - 1 ? { ...prev, index: prev.index + 1 } : prev); }}
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}
          {/* Counter */}
          {reviewLightbox.images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
              {reviewLightbox.index + 1} / {reviewLightbox.images.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductDetail;
