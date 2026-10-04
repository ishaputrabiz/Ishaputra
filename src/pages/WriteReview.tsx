import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Star, X, Camera, ArrowLeft, BadgeCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  createReview,
  uploadReviewImages,
  hasUserPurchasedProduct
} from '@/services/reviewService';
import { getProduct } from '@/services/productService';
import { IMAGE_ACCEPT, IMAGE_TYPES } from '@/services/mediaStorage';
import { toast } from 'sonner';
import { SmartImage } from "@/components/ui/smart-image";
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { usePageMeta } from '@/hooks/usePageMeta';
import { DUR, EASE_OUT, tap } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface LocationState {
  productId: string;
  productName: string;
  productImage: string;
}

const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** Sections enter together, 40ms apart, opacity and 8px only. */
const section = (i: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DUR.modal, ease: EASE_OUT, delay: i * 0.04 },
});

const WriteReview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const state = (location.state as LocationState) || ({} as Partial<LocationState>);
  // Router state carries the product when we arrive from a page; a refreshed
  // or shared /write-review?productId=... link only has the id, so the name
  // and photo are read from the product itself.
  const productId = state.productId || searchParams.get('productId') || '';
  const [productName, setProductName] = useState(state.productName || '');
  const [productImage, setProductImage] = useState(state.productImage || '');

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const starRefs = useRef<(HTMLButtonElement | null)[]>([]);

  usePageMeta({ title: 'Write a review', noindex: true });

  useEffect(() => {
    const verifyPurchase = async () => {
      if (!user || !productId) {
        navigate('/');
        return;
      }

      const hasPurchased = await hasUserPurchasedProduct(user.uid, productId);
      if (!hasPurchased) {
        toast.error('You need to purchase this product before writing a review');
        navigate(`/product/${productId}`);
      }
    };

    verifyPurchase();
  }, [user, productId, navigate]);

  // Name and photo for a link that arrived without router state.
  useEffect(() => {
    if (!productId || (productName && productImage)) return;
    let active = true;
    getProduct(productId)
      .then((p) => {
        if (!active || !p) return;
        if (!productName) setProductName(p.name);
        if (!productImage) setProductImage(p.media?.thumbnail || p.media?.images?.[0] || '');
      })
      .catch(() => {
        /* the form still works without the photo */
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (images.length + files.length > 4) {
      toast.error('You can upload up to 4 images only');
      return;
    }

    // Photos are shrunk to 500 KB on submit, so only reject files too big to
    // process comfortably on a phone.
    const validFiles = files.filter(file => {
      const isImage = IMAGE_TYPES.includes(file.type);
      const isUnder20MB = file.size <= 20 * 1024 * 1024;
      if (!isImage) toast.error(`${file.name} is not a JPG, PNG or WebP photo`);
      else if (!isUnder20MB) toast.error(`${file.name} is larger than 20MB`);
      return isImage && isUnder20MB;
    });

    setImages(prev => [...prev, ...validFiles]);
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };


  const handleSubmit = async () => {
    if (!user || !productId) { toast.error('Please login to submit a review'); return; }
    if (rating === 0) { toast.error('Please select a rating'); return; }
    if (!reviewText.trim()) { toast.error('Please write your review'); return; }

    try {
      setUploading(true);

      let imageUrls: string[] = [];
      if (images.length > 0) {
        try {
          imageUrls = await uploadReviewImages(images);
        } catch {
          toast.error('Images could not be uploaded, but your review will still be submitted.');
        }
      }

      await createReview({
        productId,
        productName: productName || 'Product',
        userId: user.uid,
        userName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
        userEmail: user.email || '',
        rating,
        reviewText: reviewText.trim(),
        images: imageUrls,
        isVerifiedPurchase: true,
        status: 'pending',
      });

      navigate(`/thank-you-review?productId=${encodeURIComponent(productId)}`, { state: { productId, productName, productImage } });
    } catch (error) {
      console.error('Error submitting review:', error);
      toast.error('Failed to submit review. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (!productId || !user) return null;

  const activeRating = hoverRating || rating;
  const canSubmit = rating > 0 && !!reviewText.trim() && !uploading;

  // Radio-group keys: arrows move and choose, as with native radio buttons.
  const onStarKey = (e: React.KeyboardEvent<HTMLButtonElement>, star: number) => {
    let next = star;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(5, star + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(1, star - 1);
    else if (e.key === 'Home') next = 1;
    else if (e.key === 'End') next = 5;
    else return;
    e.preventDefault();
    setRating(next);
    starRefs.current[next - 1]?.focus();
  };

  return (
    <div className="min-h-screen tx-paper" style={{ fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <header className="sticky top-0 z-header border-b border-foreground/[0.08] bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center gap-2 px-2 py-2 sm:px-4">
          <IconButton label="Go back" onClick={() => navigate(-1)}>
            <ArrowLeft aria-hidden="true" />
          </IconButton>
          <div className="min-w-0">
            <h1
              className="text-lg font-semibold leading-tight text-foreground"
              style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
            >
              Write a review
            </h1>
            <p className="text-xs text-muted-foreground">Shown on the product page after a quick check</p>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-lg space-y-4 px-4 py-6 pb-44">
        {/* Product */}
        <motion.section {...section(0)} aria-label="Product" className="panel tx-sheet flex items-center gap-4 p-4">
          <div className="tile-img size-16 shrink-0 overflow-hidden !rounded-control border border-foreground/[0.06]">
            {productImage ? (
              <SmartImage src={productImage} alt="" className="h-full w-full object-cover" preset="thumb" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Reviewing</p>
            <h2 className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">{productName || 'Loading product…'}</h2>
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-highlight">
              <BadgeCheck aria-hidden="true" className="size-3.5" />
              Verified purchase
            </p>
          </div>
        </motion.section>

        {/* Rating */}
        <motion.section {...section(1)} className="panel tx-sheet p-5">
          <h2 id="rating-label" className="mb-4 text-sm font-semibold text-foreground">Rate this product</h2>
          <div
            role="radiogroup"
            aria-labelledby="rating-label"
            className="mb-4 flex justify-center gap-1 sm:gap-2"
            onMouseLeave={() => setHoverRating(0)}
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <motion.button
                key={star}
                ref={(el) => (starRefs.current[star - 1] = el)}
                type="button"
                role="radio"
                aria-checked={rating === star}
                aria-label={`${star} star${star > 1 ? 's' : ''}`}
                tabIndex={rating === star || (rating === 0 && star === 1) ? 0 : -1}
                onClick={() => setRating(star)}
                onKeyDown={(e) => onStarKey(e, star)}
                onMouseEnter={() => setHoverRating(star)}
                whileTap={tap}
                className="grid size-12 place-items-center rounded-full"
              >
                <Star
                  aria-hidden="true"
                  className={cn(
                    'size-10 transition-[fill,color] duration-hover ease-out',
                    star <= activeRating ? 'fill-highlight-soft text-highlight-soft' : 'fill-transparent text-foreground/25',
                  )}
                />
              </motion.button>
            ))}
          </div>

          <div className="flex h-8 items-center justify-center" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              {activeRating > 0 ? (
                <motion.span
                  key={activeRating}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.15, ease: EASE_OUT }}
                  className="inline-flex h-7 items-center rounded-chip border border-primary/30 bg-primary/10 px-3 text-sm font-medium text-primary"
                >
                  {ratingLabels[activeRating]}
                </motion.span>
              ) : (
                <motion.span
                  key="hint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.15, ease: EASE_OUT }}
                  className="text-xs text-muted-foreground"
                >
                  Choose 1 to 5 stars
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </motion.section>

        {/* Review text */}
        <motion.section {...section(2)} className="panel tx-sheet p-5">
          <label htmlFor="review-text" className="mb-3 block text-sm font-semibold text-foreground">
            Your experience
          </label>
          <textarea
            id="review-text"
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="What did you like, and what could be better? Would you recommend it?"
            aria-describedby="review-text-count"
            className="h-36 w-full resize-none rounded-control border border-input bg-background p-3.5 text-base text-foreground transition-[border-color,box-shadow] duration-hover ease-out placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 md:text-sm"
            maxLength={1000}
          />
          <div className="mt-1.5 flex justify-end">
            <span id="review-text-count" className="text-xs tabular-nums text-muted-foreground">{reviewText.length}/1000</span>
          </div>
        </motion.section>

        {/* Photos */}
        <motion.section {...section(3)} className="panel tx-sheet p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground">Photos</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Optional. Up to 4 photos of the product in use.</p>
          </div>

          <label className={cn('group block', images.length >= 4 ? 'pointer-events-none opacity-60' : 'cursor-pointer')}>
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              onChange={handleImageUpload}
              className="peer sr-only"
              disabled={images.length >= 4}
            />
            <span className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-foreground/15 bg-muted/40 p-4 transition-[border-color,background-color] duration-hover ease-out group-hover:border-primary/50 peer-focus-visible:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring/30">
              <span className="grid size-11 place-items-center rounded-full bg-primary/10">
                <Camera aria-hidden="true" className="size-5 text-primary" />
              </span>
              <span className="text-center">
                <span className="block text-sm font-medium text-foreground">Add photos</span>
                <span className="block text-xs tabular-nums text-muted-foreground">{images.length}/4 added</span>
              </span>
            </span>
          </label>

          {/* Image previews */}
          {imagePreviews.length > 0 && (
            <ul className="mt-3 grid grid-cols-4 gap-2">
              {imagePreviews.map((preview, index) => (
                <li key={index} className="relative aspect-square">
                  <SmartImage src={preview} alt={`Photo ${index + 1}`} className="h-full w-full rounded-control object-cover" preset="card" />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    aria-label={`Remove photo ${index + 1}`}
                    className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-charcoal text-charcoal-foreground shadow-sm transition-transform duration-press ease-out after:absolute after:-inset-2 after:content-[''] active:scale-[0.97]"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      </main>

      {/* Fixed bottom submit bar: a named region so it sits in a landmark. The
          padding is on the inner box so its edges line up with the panels. */}
      <div
        role="region"
        aria-label="Submit your review"
        className="fixed inset-x-0 bottom-0 z-sticky border-t border-foreground/[0.08] bg-background/95 pt-3 backdrop-blur-sm pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto max-w-lg px-4">
          <motion.button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
            whileTap={canSubmit ? tap : undefined}
            className={cn(
              'w-full',
              canSubmit || uploading
                ? 'btn-copper !py-4'
                : 'flex h-12 items-center justify-center rounded-control bg-foreground/[0.06] text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground cursor-not-allowed',
              uploading && 'cursor-wait opacity-80',
            )}
          >
            {uploading ? (
              <>
                <Spinner />
                Sending your review
              </>
            ) : (
              'Submit review'
            )}
          </motion.button>
          {!canSubmit && !uploading && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {rating === 0 ? 'Choose a star rating to continue.' : 'Write a few words about your experience.'}
            </p>
          )}
          <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
            By submitting, you agree to our{' '}
            <Link to="/terms-conditions" className="underline underline-offset-2 hover:text-primary">Terms of use</Link> and{' '}
            <Link to="/privacy-policy" className="underline underline-offset-2 hover:text-primary">Privacy policy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default WriteReview;
