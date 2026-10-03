import { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import { SmartImage } from "@/components/ui/smart-image";
import { IconButton } from '@/components/ui/icon-button';
import { getProduct } from '@/services/productService';
import { usePageMeta } from '@/hooks/usePageMeta';
import { DUR, EASE_OUT } from '@/lib/motion';

interface LocationState {
  productId: string;
  productName: string;
  productImage: string;
}

/** Short, calm sequence: everything is in place within ~360ms. */
const step = (delay: number) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DUR.modal, ease: EASE_OUT, delay },
});

const ThankYouReview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const state = (location.state as LocationState) || ({} as Partial<LocationState>);
  // Router state when we come from the form; the ?productId= link after a refresh.
  const productId = state.productId || searchParams.get('productId') || '';
  const [productName, setProductName] = useState(state.productName || '');
  const [productImage, setProductImage] = useState(state.productImage || '');

  usePageMeta({ title: 'Thanks for your review', noindex: true });

  useEffect(() => {
    // Nothing to thank for without a product.
    if (!productId) {
      navigate('/');
    }
  }, [productId, navigate]);

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
        /* the page reads fine without the product row */
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const backToProduct = () => navigate(`/product/${productId}#reviews`);

  return (
    <div className="min-h-screen tx-paper px-4 pt-2">
      {/* Back arrow */}
      <div className="mx-auto max-w-md">
        <IconButton label="Back to product" onClick={backToProduct} className="-ml-2">
          <ArrowLeft aria-hidden="true" />
        </IconButton>
      </div>

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-md">
        <div className="pb-8 pt-4 text-center">
          {/* Success icon */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DUR.modal, ease: EASE_OUT }}
            className="mx-auto mb-6 grid size-20 place-items-center rounded-full bg-primary/10"
          >
            <CheckCircle aria-hidden="true" className="size-11 text-primary" />
          </motion.div>

          <motion.h1
            {...step(0.06)}
            className="mb-3 text-2xl font-semibold text-foreground [text-wrap:balance]"
            style={{ fontFamily: 'var(--font-heading)', fontStretch: 'var(--font-heading-stretch)' }}
          >
            Thanks for your review
          </motion.h1>

          <motion.p {...step(0.06)} className="mx-auto mb-8 max-w-xs text-muted-foreground [text-wrap:pretty]">
            It will appear on the product page once our team has checked it.
          </motion.p>

          {/* The product you reviewed */}
          {productName && (
            <motion.div
              {...step(0.12)}
              className="mb-8 flex items-center gap-3 border-t border-foreground/[0.08] pt-6 text-left"
            >
              <div className="tile-img size-16 shrink-0 overflow-hidden !rounded-control">
                {productImage && (
                  <SmartImage src={productImage} alt="" className="h-full w-full object-cover" preset="thumb" />
                )}
              </div>
              <div className="min-w-0">
                <p className="mb-0.5 text-xs text-muted-foreground">You reviewed</p>
                <p className="line-clamp-2 text-sm font-medium text-foreground">{productName}</p>
              </div>
            </motion.div>
          )}

          <motion.div {...step(0.12)}>
            <button
              type="button"
              onClick={backToProduct}
              className="btn-line text-foreground transition-[border-color,color,transform] duration-press ease-out hover:border-primary hover:text-primary active:scale-[0.97]"
            >
              Back to product
            </button>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default ThankYouReview;
