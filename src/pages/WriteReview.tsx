import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Star, X, Loader2, Camera, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  createReview,
  uploadReviewImages,
  hasUserPurchasedProduct
} from '@/services/reviewService';
import { IMAGE_ACCEPT, IMAGE_TYPES } from '@/services/mediaStorage';
import { toast } from 'sonner';
import { SmartImage } from "@/components/ui/smart-image";

interface LocationState {
  productId: string;
  productName: string;
  productImage: string;
}

const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];
const ratingColors = ['', 'text-red-500', 'text-orange-500', 'text-amber-500', 'text-lime-500', 'text-emerald-500'];
const ratingBg = ['', 'bg-red-50 border-red-200', 'bg-orange-50 border-orange-200', 'bg-amber-50 border-amber-200', 'bg-lime-50 border-lime-200', 'bg-emerald-50 border-emerald-200'];

const WriteReview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { productId, productName, productImage } = (location.state as LocationState) || {};
  
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

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
      
      navigate('/thank-you-review', { state: { productId, productName, productImage } });
    } catch (error) {
      console.error('Error submitting review:', error);
      toast.error('Failed to submit review. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (!productId || !user) return null;

  const activeRating = hoverRating || rating;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FFFBF5] to-white" style={{ fontFamily: "'Poppins', sans-serif" }}>
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border-b border-gray-100 dark:border-zinc-800 px-4 py-3.5 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 transition-colors text-gray-700 dark:text-zinc-300"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-base font-semibold text-gray-900 dark:text-zinc-100">Write a Review</h1>
          <p className="text-xs text-gray-400 dark:text-zinc-500">Your feedback matters</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6 pb-32">
        {/* Product Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-gray-100 dark:border-zinc-800 shadow-sm"
        >
          <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800">
            <SmartImage src={productImage} alt={productName} className="w-full h-full object-cover" preset="thumb" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-600 font-medium uppercase tracking-wide mb-0.5">Reviewing</p>
            <h2 className="font-semibold text-gray-900 dark:text-zinc-100 text-sm leading-tight line-clamp-2">{productName}</h2>
            <div className="flex items-center gap-1 mt-1">
              <CheckCircle2 size={12} className="text-emerald-500" />
              <p className="text-xs text-emerald-600 font-medium">Verified Purchase</p>
            </div>
          </div>
        </motion.div>

        {/* Rating Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-gray-100 dark:border-zinc-800 shadow-sm"
        >
          <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-4">Rate this product</p>
          <div className="flex justify-center gap-3 mb-4">
            {[1, 2, 3, 4, 5].map((star) => (
              <motion.button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                whileTap={{ scale: 0.85 }}
                className="transition-transform"
              >
                <Star
                  size={40}
                  strokeWidth={1.5}
                  className={`transition-all duration-150 ${
                    star <= activeRating
                      ? 'fill-amber-400 text-amber-400 drop-shadow-sm'
                      : 'fill-none text-gray-200'
                  }`}
                />
              </motion.button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeRating > 0 && (
              <motion.div
                key={activeRating}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium w-fit mx-auto ${ratingBg[activeRating]}`}
              >
                <span className={ratingColors[activeRating]}>{ratingLabels[activeRating]}!</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Review Text */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-gray-100 dark:border-zinc-800 shadow-sm"
        >
          <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-3">Your Experience</p>
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Share what you loved or didn't love about this product. Would you recommend it to others?"
            className="w-full h-36 p-4 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-transparent text-sm text-gray-800 dark:text-zinc-200 placeholder:text-gray-400 dark:placeholder:text-zinc-500 dark:text-zinc-500 transition-all"
            maxLength={1000}
          />
          <div className="flex justify-end mt-1.5">
            <span className="text-xs text-gray-400 dark:text-zinc-500">{reviewText.length}/1000</span>
          </div>
        </motion.div>

        {/* Photos & Video */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-gray-100 dark:border-zinc-800 shadow-sm"
        >
          <div className="mb-4">
            <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Photos</p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">Show others what you experienced</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* Add Photos */}
            <label className={`block cursor-pointer ${images.length >= 4 ? 'opacity-50 pointer-events-none' : ''}`}>
              <input type="file" accept={IMAGE_ACCEPT} multiple onChange={handleImageUpload} className="hidden" disabled={images.length >= 4} />
              <div className="border-2 border-dashed border-amber-200 bg-amber-50/50 rounded-xl p-4 flex flex-col items-center gap-2 hover:border-amber-400 hover:bg-amber-50 transition-all">
                <div className="w-11 h-11 bg-amber-100 rounded-full flex items-center justify-center">
                  <Camera size={20} className="text-amber-600" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-800 dark:text-zinc-200">Add Photos</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500">{images.length}/4 uploaded</p>
                </div>
              </div>
            </label>

          </div>

          {/* Image Previews */}
          {imagePreviews.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mt-3">
              {imagePreviews.map((preview, index) => (
                <div key={index} className="relative aspect-square">
                  <SmartImage src={preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover rounded-xl" preset="card" />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-900 text-white rounded-full flex items-center justify-center shadow"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}

        </motion.div>
      </div>

      {/* Fixed Bottom Submit Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 px-4 py-4 safe-area-inset-bottom shadow-lg">
        <motion.button
          onClick={handleSubmit}
          disabled={uploading || rating === 0 || !reviewText.trim()}
          whileTap={{ scale: 0.97 }}
          className={`w-full max-w-lg mx-auto flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm transition-all ${
            rating > 0 && reviewText.trim()
              ? 'bg-gray-900 text-white hover:bg-gray-800 shadow-lg'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Submitting Review...
            </>
          ) : (
            'Submit Review ?'
          )}
        </motion.button>
        <p className="text-[10px] text-center text-gray-400 dark:text-zinc-500 mt-2 leading-relaxed">
          By submitting, you agree to our{' '}
          <span className="text-gray-600 dark:text-zinc-400 underline">Terms of Use</span> and{' '}
          <span className="text-gray-600 dark:text-zinc-400 underline">Privacy Policy</span>
        </p>
      </div>
    </div>
  );
};

export default WriteReview;
