import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, Trash2, ShoppingBag, ArrowRight, Loader2, Shield, RotateCcw, Truck, ChevronDown, Tag, Heart, Search, ScanLine, Mic, Check } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import shoppingBags from '@/assets/shopping-bags.png';
import loginCartImage from '@/assets/login-cart.png';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCheckoutPricing } from '@/hooks/useCheckoutPricing';
import { SmartImage } from "@/components/ui/smart-image";

const ShoppingCart = () => {
  const { items, isCartOpen, closeCart, updateQuantity, removeFromCart, subtotal, totalItems, loading } = useCart();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const [isCouponExpanded, setIsCouponExpanded] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [currentStep] = useState(1); // 1: Cart, 2: Checkout, 3: Payment, 4: Confirmation

  // Shared pricing engine — same source of truth as Checkout. No address is
  // chosen yet, so delivery is quoted at the home-state rate and re-priced at
  // checkout once the shipping state is known.
  const pricing = useCheckoutPricing(subtotal, items.length === 0, 'Razorpay', {
    productIds: items.map((i) => i.id),
  });

  // On mobile, redirect to /checkout instead of opening the drawer
  useEffect(() => {
    if (isCartOpen && window.innerWidth <= 768) {
      closeCart();
      navigate('/checkout');
    }
  }, [isCartOpen]);

  // Dispatch events to hide/show bottom navbar when cart opens/closes
  useEffect(() => {
    if (isCartOpen) {
      window.dispatchEvent(new Event('mobile-modal-open'));
    } else {
      window.dispatchEvent(new Event('mobile-modal-close'));
    }
  }, [isCartOpen]);

  // Format price in Indian Rupees
  const formatPrice = useCallback((price: number) => {
    return `₹${price.toLocaleString('en-IN')}`;
  }, []);

  // Pricing values from the shared engine.
  const deliveryCharge = pricing.deliveryCharge;
  const freeDelivery = pricing.freeDelivery;
  const gstAmount = pricing.gstAmount;
  const gstAddOnTop = pricing.gstAddOnTop;
  const discount = pricing.discount;
  const total = pricing.total;

  const [couponLoading, setCouponLoading] = useState(false);

  const handleApplyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponLoading(true);
    const r = await pricing.applyCoupon(code);
    setCouponLoading(false);
    if (r.ok) setCouponInput('');
  };

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40"
            onClick={closeCart}
            aria-hidden="true"
          />

          {/* Slide-over drawer */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
            className="fixed top-0 right-0 h-full w-full sm:w-[420px] md:w-[440px] bg-background z-[51] flex flex-col shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Shopping Cart"
          >
            {/* ─── HEADER: NAVBAR & SEARCH ─── */}
            <div className="border-b border-border">
              {/* Top Navbar */}
              <div className="flex items-center justify-between px-4 py-3">
                {/* Left: Logo */}
                <div className="flex-1 flex justify-start">
                  <img 
                    src={resolvedTheme === 'dark' ? '/white_logo.png' : '/black_logo.png'}
                    alt="Sreerasthu Silvers" 
                    className="h-8 w-auto object-contain"
                  />
                </div>

                {/* Right: Icons */}
                <div className="flex items-center gap-3">
                  <button className="p-2 text-foreground/80 hover:text-foreground">
                    <Heart size={22} strokeWidth={1.5} />
                  </button>
                  <button className="p-2 text-foreground/80 hover:text-foreground relative">
                    <ShoppingBag size={22} strokeWidth={1.5} />
                    {user && totalItems > 0 && (
                      <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-primary rounded-full">
                        {totalItems}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={closeCart}
                    className="p-2 text-foreground/80 hover:text-foreground"
                    aria-label="Close cart"
                  >
                    <X size={22} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Search Bar & Step Timeline - only show when cart has items */}
              {user && items.length > 0 && !loading && (
              <>
              <div className="px-4 pb-3">
                <div className="relative flex items-center">
                  <Search className="absolute left-3 text-muted-foreground" size={20} strokeWidth={1.5} />
                  <input
                    type="text"
                    placeholder="Search for anklets"
                    className="w-full pl-10 pr-20 py-2.5 text-sm text-foreground placeholder-muted-foreground bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                  <div className="absolute right-3 flex items-center gap-2">
                    <button className="p-1.5 text-muted-foreground hover:text-foreground">
                      <ScanLine size={18} strokeWidth={1.5} />
                    </button>
                    <button className="p-1.5 text-muted-foreground hover:text-foreground">
                      <Mic size={18} strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              </div>

              {/* 4-Step Timeline */}
              <div className="px-4 pb-3">
                <div className="flex items-center justify-between">
                  {/* Step 1: Cart */}
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      currentStep >= 1 ? 'bg-foreground' : 'bg-muted'
                    }`}>
                      {currentStep > 1 ? (
                        <Check className="w-4 h-4 text-background" />
                      ) : (
                        <span className={`text-xs font-bold ${
                          currentStep === 1 ? 'text-background' : 'text-muted-foreground'
                        }`}>1</span>
                      )}
                    </div>
                    <span className={`text-xs mt-1 ${
                      currentStep >= 1 ? 'text-foreground font-semibold' : 'text-muted-foreground'
                    }`}>Cart</span>
                  </div>
                  <div className={`flex-1 h-0.5 -mt-5 ${
                    currentStep >= 2 ? 'bg-foreground' : 'bg-muted'
                  }`} />
                  
                  {/* Step 2: Checkout */}
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      currentStep >= 2 ? 'bg-foreground' : 'bg-muted'
                    }`}>
                      {currentStep > 2 ? (
                        <Check className="w-4 h-4 text-background" />
                      ) : (
                        <span className={`text-xs font-bold ${
                          currentStep === 2 ? 'text-background' : 'text-muted-foreground'
                        }`}>2</span>
                      )}
                    </div>
                    <span className={`text-xs mt-1 ${
                      currentStep >= 2 ? 'text-foreground font-semibold' : 'text-muted-foreground'
                    }`}>Checkout</span>
                  </div>
                  <div className={`flex-1 h-0.5 -mt-5 ${
                    currentStep >= 3 ? 'bg-foreground' : 'bg-muted'
                  }`} />
                  
                  {/* Step 3: Payment */}
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      currentStep >= 3 ? 'bg-foreground' : 'bg-muted'
                    }`}>
                      {currentStep > 3 ? (
                        <Check className="w-4 h-4 text-background" />
                      ) : (
                        <span className={`text-xs font-bold ${
                          currentStep === 3 ? 'text-background' : 'text-muted-foreground'
                        }`}>3</span>
                      )}
                    </div>
                    <span className={`text-xs mt-1 ${
                      currentStep >= 3 ? 'text-foreground font-semibold' : 'text-muted-foreground'
                    }`}>Payment</span>
                  </div>
                  <div className={`flex-1 h-0.5 -mt-5 ${
                    currentStep >= 4 ? 'bg-foreground' : 'bg-muted'
                  }`} />
                  
                  {/* Step 4: Confirm */}
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      currentStep >= 4 ? 'bg-foreground' : 'bg-muted'
                    }`}>
                      <span className={`text-xs font-bold ${
                        currentStep === 4 ? 'text-background' : 'text-muted-foreground'
                      }`}>4</span>
                    </div>
                    <span className={`text-xs mt-1 ${
                      currentStep >= 4 ? 'text-foreground font-semibold' : 'text-muted-foreground'
                    }`}>Confirm</span>
                  </div>
                </div>
              </div>
              </>
              )}
            </div>

            {/* ─── CART CONTENT (everything scrolls together) ─── */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {!user ? (
                /* Not Logged In State */
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="flex flex-col items-center justify-center h-full text-center px-8 py-16"
                >
                  <div className="relative mb-8">
                    <img 
                      src={loginCartImage} 
                      alt="Login to view cart" 
                      className="w-32 h-32 object-contain"
                    />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Please Login to View Cart
                  </h3>
                  <p className="text-sm text-muted-foreground mb-8 max-w-[260px] leading-relaxed" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Sign in to access your saved items and continue shopping.
                  </p>
                  <button
                    onClick={() => {
                      closeCart();
                      navigate('/login');
                    }}
                    className="group inline-flex items-center gap-2 px-8 py-3.5 bg-foreground text-background text-sm font-medium rounded-full hover:bg-foreground/90 active:scale-[0.97] transition-all duration-200 shadow-lg"
                  >
                    Login / Sign Up
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </motion.div>
              ) : loading ? (
                /* Loading State */
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-2 border-border" />
                    <Loader2 className="w-16 h-16 text-orange-500 animate-spin absolute inset-0" />
                  </div>
                  <p className="text-sm text-muted-foreground mt-5 font-medium tracking-wide">Loading your cart...</p>
                </div>
              ) : items.length === 0 ? (
                /* Empty State */
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="flex flex-col items-center justify-center h-full text-center px-8 py-16"
                >
                  <div className="relative mb-8">
                    <div className="w-28 h-28 bg-gradient-to-br from-orange-50 to-amber-50 rounded-full flex items-center justify-center">
                      <ShoppingBag className="w-12 h-12 text-orange-300" strokeWidth={1.5} />
                    </div>
                    <motion.div
                      className="absolute -top-1 -right-1 w-8 h-8 bg-orange-100 rounded-full"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
                    Your cart is empty
                  </h3>
                  <p className="text-sm text-muted-foreground mb-8 max-w-[260px] leading-relaxed">
                    Discover our exquisite collection of handcrafted silver jewelry.
                  </p>
                  <button
                    onClick={closeCart}
                    className="group inline-flex items-center gap-2 px-8 py-3.5 bg-foreground text-background text-sm font-medium rounded-full hover:bg-foreground/90 active:scale-[0.97] transition-all duration-200 shadow-lg"
                  >
                    Continue Shopping
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </motion.div>
              ) : (
                <>
                  {/* Cart Items */}
                  <div className="px-6 py-4 space-y-0 divide-y divide-border">
                    <AnimatePresence>
                      {items.map((item, index) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 80 }}
                          transition={{ duration: 0.25, delay: index * 0.04 }}
                          className="flex gap-4 py-5 group"
                        >
                          {/* Product Image */}
                          <div className="relative w-[88px] h-[88px] bg-muted rounded-xl overflow-hidden flex-shrink-0 ring-1 ring-border">
                            <SmartImage
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" preset="thumb" />
                          </div>

                          {/* Product Details */}
                          <div className="flex-1 min-w-0 flex flex-col justify-between">
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="text-sm font-semibold text-foreground leading-snug line-clamp-2 pr-1">
                                  {item.name}
                                </h4>
                                <button
                                  onClick={() => removeFromCart(item.id)}
                                  className="p-1 rounded-md opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 text-muted-foreground transition-all duration-200 flex-shrink-0 -mt-0.5"
                                  aria-label={`Remove ${item.name}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Category tag */}
                              {item.category && (
                                <span className="inline-block text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                                  {item.category}
                                </span>
                              )}
                            </div>

                            {/* Bottom row: Price + Quantity */}
                            <div className="flex items-end justify-between mt-2.5">
                              <div>
                                <motion.span
                                  key={item.price * item.quantity}
                                  initial={{ opacity: 0.6, y: -4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="text-base font-bold text-foreground block"
                                >
                                  {formatPrice(item.price * item.quantity)}
                                </motion.span>
                                {item.quantity > 1 && (
                                  <span className="text-[11px] text-muted-foreground">
                                    {formatPrice(item.price)} each
                                  </span>
                                )}
                              </div>

                              {/* Quantity Controls */}
                              <div className="flex items-center h-8 rounded-full border border-border bg-muted/50">
                                <button
                                  onClick={() => {
                                    if (item.quantity === 1) {
                                      removeFromCart(item.id);
                                    } else {
                                      updateQuantity(item.id, item.quantity - 1);
                                    }
                                  }}
                                  className="w-8 h-8 flex items-center justify-center rounded-l-full hover:bg-muted active:bg-muted/80 transition-colors"
                                  aria-label="Decrease quantity"
                                >
                                  <Minus className="w-3 h-3 text-muted-foreground" />
                                </button>
                                <motion.span
                                  key={item.quantity}
                                  initial={{ scale: 0.8, opacity: 0.5 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  className="w-8 text-center text-xs font-semibold text-foreground select-none"
                                >
                                  {item.quantity}
                                </motion.span>
                                <button
                                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                  className="w-8 h-8 flex items-center justify-center rounded-r-full hover:bg-muted active:bg-muted/80 transition-colors"
                                  aria-label="Increase quantity"
                                >
                                  <Plus className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* ─── ORDER SUMMARY (scrolls with items) ─── */}
                  <div className="bg-background px-6 py-6 space-y-5 pb-24 md:pb-6">
                    {/* Order Summary Heading */}
                    <h3 className="text-lg font-bold text-foreground" style={{ fontFamily: "'Poppins', sans-serif" }}>
                      Order Summary
                    </h3>

                    {/* Apply Coupon Section */}
                    <div className="bg-background rounded-xl border border-border overflow-hidden">
                      <button
                        onClick={() => setIsCouponExpanded(!isCouponExpanded)}
                        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted transition-colors"
                      >
                        <span className="text-sm font-medium text-foreground">Apply Coupon code / Promo Code</span>
                        <ChevronDown 
                          className={`w-4 h-4 text-muted-foreground transition-transform ${isCouponExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {isCouponExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="px-4 pb-4 border-t border-border"
                        >
                          {pricing.appliedCoupon ? (
                            <div className="flex items-center justify-between gap-2 pt-3">
                              <div className="text-sm text-foreground">
                                <span className="font-semibold text-green-600">{pricing.appliedCoupon.code}</span>{' '}
                                <span className="text-muted-foreground">applied</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => pricing.removeCoupon()}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex gap-2 pt-3">
                                <input
                                  type="text"
                                  value={couponInput}
                                  onChange={(e) => setCouponInput(e.target.value)}
                                  placeholder="Enter coupon code"
                                  className="flex-1 px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:border-primary bg-background text-foreground"
                                />
                                <button
                                  type="button"
                                  onClick={handleApplyCoupon}
                                  disabled={couponLoading}
                                  className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {couponLoading ? '...' : 'Apply'}
                                </button>
                              </div>
                              {pricing.couponError && (
                                <p className="mt-2 text-xs text-red-500">{pricing.couponError}</p>
                              )}
                            </>
                          )}
                        </motion.div>
                      )}
                    </div>

                    {/* Price breakdown */}
                    <div className="space-y-4 pt-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Sub Total</span>
                        <span className="text-foreground">₹ {subtotal.toLocaleString()}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Coupon Discount</span>
                          <span className="text-green-600 font-medium">− ₹ {discount.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Delivery</span>
                        <span className={freeDelivery ? 'text-green-600 font-medium' : 'text-foreground'}>
                          {freeDelivery ? 'FREE' : `₹ ${deliveryCharge.toLocaleString()}`}
                        </span>
                      </div>
                      {/* Only celebrate a threshold that actually saved money -
                          a catalogue with no delivery charge at all is not a
                          "free delivery offer". */}
                      {freeDelivery && pricing.deliveryBeforeFree > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 dark:bg-green-950/30 dark:text-green-400 px-3 py-1.5 rounded-md">
                          <span>🎉</span>
                          <span>Free delivery on orders above ₹{pricing.delivery?.freeDeliveryAbove?.toLocaleString() ?? '999'}!</span>
                        </div>
                      )}
                      {pricing.deliveryEstimated && (
                        <p className="text-[11px] text-muted-foreground">
                          Final delivery charge is calculated from your shipping address at checkout.
                        </p>
                      )}
                      {gstAddOnTop && gstAmount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">GST</span>
                          <span className="text-foreground">₹ {gstAmount.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="h-px bg-border" />
                      <div className="flex justify-between items-baseline">
                        <span className="text-sm font-bold text-foreground">TOTAL (Incl of all Taxes.)</span>
                        <span className="text-base font-bold text-foreground">₹ {total.toLocaleString()}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">You Save</span>
                          <span className="text-green-600 font-medium">+ ₹ {discount.toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    {/* Desktop Action Buttons (hidden on mobile) */}
                    <div className="hidden md:block space-y-2.5 pt-2">
                      <button
                        className="w-full flex items-center justify-center gap-2 py-3.5 bg-foreground text-background text-sm font-semibold rounded-lg hover:bg-foreground/90 active:scale-[0.98] transition-all duration-200"
                        onClick={() => {
                          closeCart();
                          if (!user) {
                            navigate('/login', { state: { from: { pathname: '/checkout' } } });
                            return;
                          }
                          navigate('/checkout');
                        }}
                      >
                        Proceed to Checkout
                        <ArrowRight className="w-4 h-4" />
                      </button>
                      <button
                        className="w-full py-3 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg border border-border hover:border-border hover:bg-muted active:scale-[0.98] transition-all duration-200"
                        onClick={closeCart}
                      >
                        Continue Shopping
                      </button>
                    </div>

                    {/* Trust badges - Desktop only */}
                    <div className="hidden md:flex items-center justify-center gap-5 pt-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Shield className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-medium tracking-wide uppercase">Secure</span>
                      </div>
                      <div className="w-px h-3 bg-border" />
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-medium tracking-wide uppercase">7-Day Returns</span>
                      </div>
                      <div className="w-px h-3 bg-border" />
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Truck className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-medium tracking-wide uppercase">Insured</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Mobile Bottom Bar - Fixed at bottom */}
            {user && items.length > 0 && !loading && (
              <div className="md:hidden border-t border-border bg-background p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.3)] flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-lg font-bold text-foreground">₹ {total.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">({totalItems} Item{totalItems !== 1 ? 's' : ''})</span>
                </div>
                <button
                  className="flex-1 py-3 bg-foreground text-background text-sm font-semibold rounded-full active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2"
                  onClick={() => {
                    closeCart();
                    navigate('/checkout');
                  }}
                >
                  Proceed to Checkout
                </button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default ShoppingCart;
