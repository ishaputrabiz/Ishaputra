import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { ArrowLeft, MoreVertical, Star, Plus, Minus, Trash2, ChevronRight } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCheckoutPricing } from '@/hooks/useCheckoutPricing';
import { SmartImage } from "@/components/ui/smart-image";

// ─── Slide to Proceed Button Component ───
const SlideToProceedButton = ({ amount, onComplete }: { amount: string; onComplete: () => void }) => {
  const constraintsRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [sliderWidth, setSliderWidth] = useState(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (constraintsRef.current) {
      setSliderWidth(constraintsRef.current.offsetWidth - 56);
    }
  }, []);

  const backgroundOpacity = useTransform(x, [0, sliderWidth * 0.8], [1, 0.6]);
  const textOpacity = useTransform(x, [0, sliderWidth * 0.3], [1, 0]);
  const checkOpacity = useTransform(x, [sliderWidth * 0.7, sliderWidth], [0, 1]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x > sliderWidth * 0.7) {
      setCompleted(true);
      onComplete();
    }
  };

  return (
    <motion.div
      ref={constraintsRef}
      className="relative h-14 rounded-full overflow-hidden bg-gradient-to-r from-gray-800 to-gray-900 shadow-lg shadow-gray-900/30"
      style={{ opacity: backgroundOpacity }}
    >
      {/* Text */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center text-white font-semibold text-base pointer-events-none"
        style={{ opacity: textOpacity }}
      >
        Slide to Proceed | {amount}
      </motion.div>

      {/* Check mark on complete */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center text-white font-semibold text-base pointer-events-none"
        style={{ opacity: checkOpacity }}
      >
        ✓ Processing...
      </motion.div>

      {/* Draggable thumb */}
      {!completed && (
        <motion.div
          drag="x"
          dragConstraints={constraintsRef}
          dragElastic={0}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          style={{ x }}
          className="absolute left-1 top-1 w-12 h-12 rounded-full bg-white dark:bg-zinc-900 shadow-md flex items-center justify-center cursor-grab active:cursor-grabbing z-10"
          whileTap={{ scale: 0.95 }}
        >
          <ChevronRight className="w-5 h-5 text-gray-900 dark:text-zinc-100" />
          <ChevronRight className="w-5 h-5 text-gray-900 dark:text-zinc-100 -ml-3" />
        </motion.div>
      )}
    </motion.div>
  );
};

const MobileCart = () => {
  const { items, updateQuantity, removeFromCart, subtotal, totalItems, openCart } = useCart();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const [promoCode, setPromoCode] = useState('');

  // Shared pricing engine — same source of truth as Checkout & ShoppingCart.
  // Delivery is quoted at the home-state rate until an address is picked.
  const pricing = useCheckoutPricing(subtotal, items.length === 0, 'Razorpay', {
    productIds: items.map((i) => i.id),
  });

  // Desktop users hitting /cart should see the slide-over drawer instead of
  // the mobile page. We pushed /cart in their history before /checkout, so
  // we open the drawer and silently replace the route back to home; that way
  // their browser back from /checkout reopens the drawer on home.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(min-width: 768px)').matches) {
      openCart();
      navigate('/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyPromo = async () => {
    const code = promoCode.trim();
    if (!code) return;
    const r = await pricing.applyCoupon(code);
    if (r.ok) setPromoCode('');
  };

  const handleRemovePromo = () => {
    pricing.removeCoupon();
  };

  // Calculations from shared engine
  const promoApplied = !!pricing.appliedCoupon;
  const appliedCode = pricing.appliedCoupon?.code || '';
  const promoDiscount = pricing.discount;
  const deliveryFee = pricing.deliveryCharge;
  const freeDelivery = pricing.freeDelivery;
  const taxAmount = pricing.gstAddOnTop ? pricing.gstAmount : 0;
  const totalAmount = pricing.total;

  const formatPrice = (price: number) => {
    return `₹ ${price.toFixed(2)}`;
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-zinc-900 z-50 px-4 py-4 flex items-center justify-between shadow-sm">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-gray-800 dark:text-zinc-200" />
        </button>
        <img
          src={resolvedTheme === 'dark' ? '/white_logo.png' : '/black_logo.png'}
          alt="Sreerasthu Silvers"
          className="h-9 w-auto object-contain"
        />
        <button className="p-2 -mr-2 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors">
          <MoreVertical className="w-6 h-6 text-gray-800 dark:text-zinc-200" />
        </button>
      </div>

      {/* Cart Items - Scrollable */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">{/* Add padding for fixed button */}
        <AnimatePresence mode="popLayout">
          {items.map((item, index) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100, height: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="flex gap-4 py-4 border-b border-gray-100 dark:border-zinc-800 last:border-0 relative"
            >
              {/* Delete Icon - Positioned Absolutely */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFromCart(item.id);
                }}
                className="absolute top-2 right-2 p-1 z-50 cursor-pointer"
                style={{ touchAction: 'manipulation' }}
                aria-label="Remove from cart"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </button>

              {/* Product Image */}
              <div className="relative w-20 h-20 bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden flex-shrink-0 shadow-md">
                <SmartImage
                  src={item.image}
                  alt={item.name}
                  className="w-full h-full object-cover" preset="thumb" />
              </div>

              {/* Product Details */}
              <div className="flex-1 min-w-0 pr-8">{/* Added padding-right for delete button space */}
                <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100 line-clamp-1 mb-2" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  {item.name}
                </h3>

                {/* Rating Info */}
                <div className="flex items-center gap-1 mb-3 text-gray-500 dark:text-zinc-500">
                  <Star className="w-3.5 h-3.5 fill-orange-400 text-orange-400" />
                  <span className="text-xs font-medium">4.9</span>
                  <span className="text-xs text-gray-400 dark:text-zinc-500">(125)</span>
                </div>

                {/* Price */}
                <div className="text-base font-bold text-gray-900 dark:text-zinc-100">
                  {formatPrice(item.price * item.quantity)}
                </div>
              </div>

              {/* Quantity Controls */}
              <div className="flex items-center gap-2">
                {/* Minus button - transparent */}
                <button
                  onClick={() => {
                    if (item.quantity > 1) {
                      updateQuantity(item.id, item.quantity - 1);
                    } else {
                      removeFromCart(item.id);
                    }
                  }}
                  className="w-7 h-7 rounded-full bg-transparent border border-gray-300 dark:border-zinc-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 active:scale-95 transition-all"
                >
                  <Minus className="w-3.5 h-3.5 text-gray-700 dark:text-zinc-300" />
                </button>

                {/* Quantity display - transparent and small */}
                <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100 min-w-[20px] text-center">{item.quantity}</span>

                {/* Plus button - transparent */}
                <button
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="w-7 h-7 rounded-full bg-transparent border border-gray-300 dark:border-zinc-700 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 active:scale-95 transition-all"
                >
                  <Plus className="w-3.5 h-3.5 text-gray-700 dark:text-zinc-300" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Empty State */}
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
              <div className="text-4xl">🛒</div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-zinc-100 mb-2">Your cart is empty</h3>
            <p className="text-sm text-gray-500 dark:text-zinc-500 mb-6">Add some items to get started</p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-gray-900 text-white rounded-full font-medium hover:bg-gray-800"
            >
              Continue Shopping
            </button>
          </div>
        )}

        {/* Promo Code & Order Summary - Scrollable */}
        {items.length > 0 && (
          <div className="mt-4">
            {/* Promo Code Section */}
            {!promoApplied ? (
              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="Enter promo code"
                    className="flex-1 px-4 py-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    onClick={handleApplyPromo}
                    disabled={!promoCode}
                    className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all ${
                      promoCode
                        ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-md'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    Apply
                  </button>
                </div>
                {pricing.couponError && (
                  <p className="text-xs text-red-500 mt-2 ml-1">{pricing.couponError}</p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">✓</span>
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-green-800 block">{appliedCode}</span>
                    <span className="text-xs text-green-600">Promo code confirmed</span>
                  </div>
                </div>
                <button
                  onClick={handleRemovePromo}
                  className="text-xs font-medium text-green-700 hover:text-green-900 underline"
                >
                  Remove
                </button>
              </div>
            )}

            {/* Order Summary */}
            <div className="bg-gray-50 dark:bg-zinc-900 rounded-2xl p-4">
              <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-3">Order Summary</h3>
              
              <div className="space-y-2.5">
                {/* Individual Product Prices */}
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-zinc-400 flex-1 truncate pr-2">{item.name} (x{item.quantity})</span>
                    <span className="text-gray-900 dark:text-zinc-100 font-medium">{formatPrice(item.price * item.quantity)}</span>
                  </div>
                ))}
                
                <div className="h-px bg-gray-200 dark:bg-zinc-800 my-2" />
                
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-zinc-400">Order Amount</span>
                  <span className="text-gray-900 dark:text-zinc-100 font-medium">{formatPrice(subtotal)}</span>
                </div>
                
                {promoApplied && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-zinc-400">Promo-code</span>
                    <span className="text-green-600 font-medium">-{formatPrice(promoDiscount)}</span>
                  </div>
                )}
                
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-zinc-400">Delivery</span>
                  <span className="text-gray-900 dark:text-zinc-100 font-medium">
                    {freeDelivery ? 'FREE' : formatPrice(deliveryFee)}
                  </span>
                </div>
                {pricing.deliveryEstimated && (
                  <p className="text-[11px] text-gray-500 dark:text-zinc-500 -mt-1">
                    Final delivery charge is calculated from your shipping address at checkout.
                  </p>
                )}
                
                {taxAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-zinc-400">GST</span>
                    <span className="text-gray-900 dark:text-zinc-100 font-medium">{formatPrice(taxAmount)}</span>
                  </div>
                )}

                <div className="h-px bg-gray-200 dark:bg-zinc-800 my-2" />

                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-700 dark:text-zinc-300">Total Amount</span>
                  <span className="text-xl font-bold text-gray-900 dark:text-zinc-100">{formatPrice(totalAmount)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fixed Button at Bottom */}
      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-800 px-4 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] z-40">
          <SlideToProceedButton
            amount={formatPrice(totalAmount)}
            onComplete={() => {
              if (!user) {
                navigate('/login', { state: { from: { pathname: '/checkout' } } });
                return;
              }
              navigate('/checkout');
            }}
          />
        </div>
      )}
    </div>
  );
};

export default MobileCart;
