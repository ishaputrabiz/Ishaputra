import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import { SmartImage } from "@/components/ui/smart-image";

interface LocationState {
  productId: string;
  productName: string;
  productImage: string;
}

const ThankYouReview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { productId, productName, productImage } = (location.state as LocationState) || {};

  useEffect(() => {
    // Redirect if no state provided
    if (!productId) {
      navigate('/');
    }
  }, [productId, navigate]);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900 px-4 pt-4">
      {/* Back arrow */}
      <button
        onClick={() => navigate(`/product/${productId}#reviews`)}
        className="p-2 rounded-full hover:bg-black/10 transition-colors"
        aria-label="Back to product"
      >
        <ArrowLeft size={22} className="text-gray-700 dark:text-zinc-300" />
      </button>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full mx-auto"
      >
        {/* Success Card */}
        <div className="pt-4 pb-8 text-center">
          {/* Success Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ 
              type: 'spring',
              stiffness: 200,
              damping: 15,
              delay: 0.2 
            }}
            className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle className="text-green-600" size={48} />
          </motion.div>

          {/* Thank You Message */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-3xl font-bold text-gray-900 dark:text-zinc-100 mb-3"
          >
            Thank you for sharing
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-gray-600 dark:text-zinc-400 mb-8"
          >
            Your review was submitted successfully
          </motion.p>

          {/* Product Info — below thank you */}
          {productImage && productName && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="flex items-center gap-3 mb-8 text-left border-t pt-6"
            >
              <SmartImage
                src={productImage}
                alt={productName}
                className="w-16 h-16 object-cover rounded-lg flex-shrink-0" preset="thumb" />
              <div>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mb-0.5">You reviewed</p>
                <p className="text-sm font-medium text-gray-800 dark:text-zinc-200">{productName}</p>
              </div>
            </motion.div>
          )}

          {/* Back to Product pill button */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0 }}
          >
            <button
              onClick={() => navigate(`/product/${productId}#reviews`)}
              className="px-10 py-3 rounded-full border border-gray-400 text-base text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 transition-colors"
            >
              Back to Product
            </button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default ThankYouReview;
