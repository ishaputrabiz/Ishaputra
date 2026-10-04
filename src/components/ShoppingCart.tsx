import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Minus, Trash2, ShoppingBag, ArrowRight, ShieldCheck, RotateCcw, Truck, ChevronDown, Heart, Search, Check, Tag } from 'lucide-react';
import { useCart, type CartItem } from '@/contexts/CartContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCheckoutPricing } from '@/hooks/useCheckoutPricing';
import { SmartImage } from "@/components/ui/smart-image";
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { ListSkeleton } from '@/components/skeletons';
import { EmptyState } from '@/components/EmptyState';
import { formatINR, plural } from '@/lib/format';
import { DUR, EASE_OUT } from '@/lib/motion';

const STEPS = ['Cart', 'Checkout', 'Payment', 'Confirm'] as const;

/** The checkout progress row, same look as the mobile checkout stepper. The drawer is always step 1. */
const DrawerStepper = ({ step }: { step: number }) => (
  <ol aria-label="Checkout progress" className="relative flex justify-between">
    <span aria-hidden="true" className="absolute top-4 h-0.5 bg-foreground/10" style={{ left: '12.5%', right: '12.5%' }} />
    {STEPS.map((label, i) => {
      const n = i + 1;
      const done = n < step;
      const current = n === step;
      return (
        <li key={label} aria-current={current ? 'step' : undefined} className="relative z-raised flex w-1/4 flex-col items-center">
          <span
            className={`flex size-8 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
              done || current ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            {done ? <Check aria-hidden="true" className="size-4" /> : n}
          </span>
          <span
            className={`mt-1.5 text-[10px] uppercase tracking-[0.14em] ${
              done || current ? 'font-semibold text-primary' : 'text-muted-foreground'
            }`}
          >
            {label}
          </span>
        </li>
      );
    })}
  </ol>
);

const ShoppingCart = () => {
  const { items, isCartOpen, closeCart, updateQuantity, removeFromCart, addToCart, subtotal, totalItems, loading } = useCart();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const [isCouponExpanded, setIsCouponExpanded] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  // The last coupon error stays hidden once the customer edits the code (display only).
  const [couponErrorHidden, setCouponErrorHidden] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const currentStep = 1; // The drawer is always the Cart step; Checkout, Payment and Confirm happen on /checkout.
  const couponId = useId();
  // Whatever opened the drawer (usually the header Cart button) gets focus back on close.
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const remember = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && !el.closest('[data-cart-drawer]')) returnFocusRef.current = el;
    };
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, []);

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

  // Pricing values from the shared engine.
  const deliveryCharge = pricing.deliveryCharge;
  const freeDelivery = pricing.freeDelivery;
  const gstAmount = pricing.gstAmount;
  const gstAddOnTop = pricing.gstAddOnTop;
  const discount = pricing.discount;
  const total = pricing.total;
  const freeDeliveryAbove = pricing.delivery?.freeDeliveryAbove;

  const [couponLoading, setCouponLoading] = useState(false);

  const handleApplyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponErrorHidden(false);
    const r = await pricing.applyCoupon(code);
    setCouponLoading(false);
    if (r.ok) setCouponInput('');
  };

  // Undo for a removed line. It lives inside the drawer, not in a toast: the
  // drawer is a modal, so a toast outside it could not be clicked or tabbed to.
  const [lastRemoved, setLastRemoved] = useState<CartItem | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!lastRemoved) return;
    undoRef.current?.focus();
    const t = window.setTimeout(() => setLastRemoved(null), 8000);
    return () => window.clearTimeout(t);
  }, [lastRemoved]);
  useEffect(() => {
    if (!isCartOpen) setLastRemoved(null);
  }, [isCartOpen]);

  /** Remove a line and offer to put it back at the same quantity. */
  const removeWithUndo = (item: CartItem) => {
    void removeFromCart(item.id);
    setLastRemoved(item);
  };

  const undoRemove = () => {
    if (!lastRemoved) return;
    const { quantity, ...line } = lastRemoved;
    addToCart(line, quantity);
    setLastRemoved(null);
  };

  const runSearch = () => {
    const q = searchQuery.trim();
    if (!q) return;
    closeCart();
    navigate(`/search-results?q=${encodeURIComponent(q)}`);
  };

  const showCouponError = !!pricing.couponError && !couponErrorHidden && !pricing.appliedCoupon;

  return (
    <Sheet open={isCartOpen} onOpenChange={(open) => { if (!open) closeCart(); }}>
      <SheetContent
        side="right"
        hideClose
        aria-describedby={undefined}
        data-cart-drawer=""
        onCloseAutoFocus={(e) => {
          const el = returnFocusRef.current;
          if (el && document.contains(el)) {
            e.preventDefault();
            el.focus();
          }
        }}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[420px] md:max-w-[440px]"
      >
        <SheetTitle className="sr-only">Your bag</SheetTitle>

        {/* ─── HEADER: NAVBAR & SEARCH ─── */}
        <div className="border-b border-border">
          <div className="flex items-center justify-between gap-2 py-3 pl-6 pr-4">
            <img
              src={resolvedTheme === 'dark' ? '/white_logo.png' : '/black_logo.png'}
              alt="Ishaputra Botanicals"
              className="h-8 w-auto object-contain"
            />
            <div className="flex items-center gap-1">
              <IconButton
                label="Wishlist"
                onClick={() => {
                  closeCart();
                  navigate('/wishlist');
                }}
              >
                <Heart aria-hidden="true" />
              </IconButton>
              <span
                role="img"
                aria-label={`Cart, ${plural(user ? totalItems : 0, 'item')}`}
                className="relative inline-flex size-10 items-center justify-center text-foreground/80"
              >
                <ShoppingBag aria-hidden="true" className="size-5" />
                {user && totalItems > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute right-0.5 top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground"
                  >
                    {totalItems}
                  </span>
                )}
              </span>
              <IconButton label="Close" onClick={closeCart}>
                <X aria-hidden="true" />
              </IconButton>
            </div>
          </div>

          {/* Search Bar & Step Timeline - only show when cart has items */}
          {user && items.length > 0 && !loading && (
            <>
              <form
                role="search"
                className="px-6 pb-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  runSearch();
                }}
              >
                <label htmlFor="cart-search" className="sr-only">Search products</label>
                <div className="relative flex items-center">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 size-[18px] text-muted-foreground" />
                  <input
                    id="cart-search"
                    type="search"
                    enterKeyHint="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search shilajit, hair oil, face wash"
                    className="h-11 w-full rounded-control border border-input bg-muted pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-hover ease-out focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </div>
              </form>

              <div className="px-6 pb-3">
                <DrawerStepper step={currentStep} />
              </div>
            </>
          )}
        </div>

        {/* ─── CART CONTENT (everything scrolls together) ─── */}
        <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain">
          {lastRemoved && (
            <div
              role="status"
              className="mx-6 mt-4 flex items-center justify-between gap-3 rounded-control border border-foreground/10 bg-muted/60 py-1.5 pl-3 pr-1.5 text-sm text-foreground"
            >
              <span className="min-w-0 truncate">Removed {lastRemoved.name}</span>
              <button
                ref={undoRef}
                type="button"
                onClick={undoRemove}
                className="min-h-9 flex-shrink-0 rounded-control px-3 text-[11px] font-bold uppercase tracking-[0.16em] text-primary transition-[background-color,transform] duration-press ease-out hover:bg-primary/10 active:scale-[0.97]"
              >
                Undo
              </button>
            </div>
          )}
          {!user ? (
            <EmptyState
              icon={ShoppingBag}
              as="h3"
              title="Sign in to see your bag"
              description="Sign in to see your saved items and check out."
              className="flex-1 justify-center"
              action={{
                label: 'Sign in',
                onClick: () => {
                  closeCart();
                  navigate('/login', { state: { from: { pathname: '/checkout' }, reason: 'cart' } });
                },
              }}
            />
          ) : loading ? (
            <ListSkeleton rows={3} thumb label="Loading your bag" className="px-6 py-6" />
          ) : items.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              as="h3"
              title="Your bag is empty"
              description="Discover classical Ayurveda, made for the modern man."
              className="flex-1 justify-center"
              action={{ label: 'Continue shopping', onClick: closeCart }}
            />
          ) : (
            <>
              {/* Cart Items */}
              <ul className="divide-y divide-border px-6 py-2">
                <AnimatePresence initial={false}>
                  {/* Fixed order: the cart is a Firestore map, which keeps none (display only). */}
                  {[...items]
                    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
                    .map((item) => (
                    <motion.li
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: DUR.exit } }}
                      transition={{ duration: DUR.dropdown, ease: EASE_OUT }}
                      className="group flex gap-4 py-5"
                    >
                      {/* Product Image */}
                      <div className="relative size-[88px] flex-shrink-0 overflow-hidden rounded-card bg-muted ring-1 ring-border">
                        <SmartImage src={item.image} alt="" className="h-full w-full object-cover" preset="thumb" />
                      </div>

                      {/* Product Details */}
                      <div className="flex min-w-0 flex-1 flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="line-clamp-2 pr-1 text-sm font-semibold leading-snug text-foreground">
                              {item.name}
                            </h4>
                            <IconButton
                              label={`Remove ${item.name}`}
                              size="sm"
                              onClick={() => removeWithUndo(item)}
                              className="-mr-2 -mt-1.5 text-muted-foreground hover:bg-muted hover:text-destructive [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-focus-within:opacity-100"
                            >
                              <Trash2 aria-hidden="true" />
                            </IconButton>
                          </div>

                          {item.category && (
                            <span className="mt-1 inline-block text-[10px] uppercase tracking-widest text-muted-foreground">
                              {item.category}
                            </span>
                          )}
                        </div>

                        {/* Bottom row: Price + Quantity */}
                        <div className="mt-2.5 flex items-end justify-between">
                          <div>
                            <span className="block text-base font-bold tabular-nums text-foreground">
                              {formatINR(item.price * item.quantity)}
                            </span>
                            {item.quantity > 1 && (
                              <span className="text-[11px] tabular-nums text-muted-foreground">
                                {formatINR(item.price)} each
                              </span>
                            )}
                          </div>

                          {/* Quantity Controls */}
                          <div className="flex h-9 items-center rounded-full border border-border bg-muted/50">
                            <button
                              type="button"
                              onClick={() => {
                                if (item.quantity === 1) {
                                  removeWithUndo(item);
                                } else {
                                  updateQuantity(item.id, item.quantity - 1);
                                }
                              }}
                              className="relative flex size-9 items-center justify-center rounded-l-full text-muted-foreground transition-[background-color,color,transform] duration-press ease-out after:absolute after:-inset-1 after:content-[''] hover:bg-muted hover:text-foreground active:scale-[0.97]"
                              aria-label={item.quantity === 1 ? `Remove ${item.name}` : `Decrease quantity of ${item.name}`}
                            >
                              <Minus aria-hidden="true" className="size-3.5" />
                            </button>
                            <span aria-live="polite" className="w-7 select-none text-center text-xs font-semibold tabular-nums text-foreground">
                              <span className="sr-only">Quantity </span>
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="relative flex size-9 items-center justify-center rounded-r-full text-muted-foreground transition-[background-color,color,transform] duration-press ease-out after:absolute after:-inset-1 after:content-[''] hover:bg-muted hover:text-foreground active:scale-[0.97]"
                              aria-label={`Increase quantity of ${item.name}`}
                            >
                              <Plus aria-hidden="true" className="size-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>

              {/* ─── ORDER SUMMARY (scrolls with items) ─── */}
              <div className="space-y-5 bg-background px-6 py-6 pb-24 md:pb-6">
                <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                  Order summary
                </h3>

                {/* Apply Coupon Section */}
                <div className="overflow-hidden rounded-card border border-border bg-background">
                  <button
                    type="button"
                    onClick={() => setIsCouponExpanded(!isCouponExpanded)}
                    aria-expanded={isCouponExpanded}
                    aria-controls={`${couponId}-panel`}
                    className="focus-inset flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-hover ease-out hover:bg-muted/60"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Tag aria-hidden="true" className="size-4 text-muted-foreground" />
                      {pricing.appliedCoupon ? 'Coupon applied' : 'Have a coupon?'}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className={`size-4 text-muted-foreground transition-transform duration-dropdown ease-out ${isCouponExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isCouponExpanded && (
                      <motion.div
                        id={`${couponId}-panel`}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, transition: { duration: DUR.exit } }}
                        transition={{ duration: DUR.dropdown, ease: EASE_OUT }}
                        className="border-t border-border px-4 pb-4"
                      >
                        {pricing.appliedCoupon ? (
                          <div className="flex items-center justify-between gap-2 pt-3">
                            <p className="text-sm text-foreground">
                              <span className="font-semibold text-primary">{pricing.appliedCoupon.code}</span>{' '}
                              <span className="text-muted-foreground">applied</span>
                            </p>
                            <button
                              type="button"
                              onClick={() => pricing.removeCoupon()}
                              className="min-h-9 px-1 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <form
                            className="pt-3"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void handleApplyCoupon();
                            }}
                          >
                            <label htmlFor={`${couponId}-input`} className="sr-only">Coupon code</label>
                            <div className="grid grid-cols-[1fr_auto] gap-2">
                              <input
                                id={`${couponId}-input`}
                                type="text"
                                value={couponInput}
                                onChange={(e) => {
                                  setCouponInput(e.target.value);
                                  setCouponErrorHidden(true);
                                }}
                                placeholder="Enter coupon code"
                                autoCapitalize="characters"
                                autoComplete="off"
                                spellCheck={false}
                                aria-invalid={showCouponError || undefined}
                                aria-describedby={showCouponError ? `${couponId}-error` : undefined}
                                className="h-10 min-w-0 rounded-control border border-input bg-background px-3 text-sm uppercase text-foreground placeholder:normal-case placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-hover ease-out focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 aria-[invalid=true]:border-destructive"
                              />
                              <button
                                type="submit"
                                disabled={couponLoading || !couponInput.trim()}
                                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-control bg-primary px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-primary-foreground transition-[background-color,transform] duration-press ease-out hover:bg-primary/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {couponLoading && <Spinner size={14} />}
                                Apply
                              </button>
                            </div>
                            {showCouponError && (
                              <p id={`${couponId}-error`} role="alert" className="mt-2 text-xs text-destructive">
                                {pricing.couponError}
                              </p>
                            )}
                          </form>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Price breakdown */}
                <dl className="space-y-3.5 pt-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Item total</dt>
                    <dd className="tabular-nums text-foreground">{formatINR(subtotal)}</dd>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Coupon discount</dt>
                      <dd className="font-medium tabular-nums text-primary">−{formatINR(discount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Delivery</dt>
                    <dd className={freeDelivery ? 'font-medium text-primary' : 'tabular-nums text-foreground'}>
                      {freeDelivery ? 'Free' : formatINR(deliveryCharge)}
                    </dd>
                  </div>
                  {/* Only celebrate a threshold that actually saved money, and only
                      when the store has set one: a catalogue with no delivery
                      charge at all is not a "free delivery offer". */}
                  {freeDelivery && pricing.deliveryBeforeFree > 0 && typeof freeDeliveryAbove === 'number' && freeDeliveryAbove > 0 && (
                    <p className="flex items-center gap-2 rounded-control bg-primary/[0.06] px-3 py-2 text-xs text-foreground">
                      <Truck aria-hidden="true" className="size-4 flex-shrink-0 text-primary" />
                      Free delivery on orders above {formatINR(freeDeliveryAbove)}
                    </p>
                  )}
                  {pricing.deliveryEstimated && (
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      Final delivery charge is calculated from your shipping address at checkout.
                    </p>
                  )}
                  {gstAddOnTop && gstAmount > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">GST</dt>
                      <dd className="tabular-nums text-foreground">{formatINR(gstAmount)}</dd>
                    </div>
                  )}
                  <div className="h-px bg-border" aria-hidden="true" />
                  <div className="flex items-baseline justify-between">
                    <dt className="font-bold text-foreground">
                      To pay
                      <span className="ml-1 text-xs font-medium text-muted-foreground">(incl. all taxes)</span>
                    </dt>
                    <dd className="text-base font-bold tabular-nums text-foreground">{formatINR(total)}</dd>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">You save</dt>
                      <dd className="font-medium tabular-nums text-primary">{formatINR(discount)}</dd>
                    </div>
                  )}
                </dl>

                {/* Desktop Action Buttons (hidden on mobile) */}
                <div className="hidden space-y-2.5 pt-2 md:block">
                  <button
                    type="button"
                    className="btn-copper h-12 w-full !text-[12px]"
                    onClick={() => {
                      closeCart();
                      if (!user) {
                        navigate('/login', { state: { from: { pathname: '/checkout' }, reason: 'checkout' } });
                        return;
                      }
                      navigate('/checkout');
                    }}
                  >
                    Proceed to checkout
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </button>
                  <button type="button" className="btn-line h-11 w-full text-foreground" onClick={closeCart}>
                    Continue shopping
                  </button>
                </div>

                {/* Trust badges - Desktop only */}
                <ul className="hidden items-center justify-center gap-4 pt-2 text-muted-foreground md:flex">
                  <li className="flex items-center gap-1.5">
                    <ShieldCheck aria-hidden="true" className="size-3.5" />
                    <span className="text-[10px] font-medium uppercase tracking-wide">Secure payment</span>
                  </li>
                  <li aria-hidden="true" className="h-3 w-px bg-border" />
                  <li className="flex items-center gap-1.5">
                    <RotateCcw aria-hidden="true" className="size-3.5" />
                    <span className="text-[10px] font-medium uppercase tracking-wide">7-day returns</span>
                  </li>
                  <li aria-hidden="true" className="h-3 w-px bg-border" />
                  <li className="flex items-center gap-1.5">
                    <Truck aria-hidden="true" className="size-3.5" />
                    {/* Client placeholder: confirm shipments are insured before launch. */}
                    <span className="text-[10px] font-medium uppercase tracking-wide">Insured</span>
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Mobile Bottom Bar - Fixed at bottom */}
        {user && items.length > 0 && !loading && (
          <div className="flex items-center gap-3 border-t border-border bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-panel md:hidden">
            <div className="flex flex-col">
              <span className="text-lg font-bold tabular-nums text-foreground">{formatINR(total)}</span>
              <span className="text-xs text-muted-foreground">{plural(totalItems, 'item')}</span>
            </div>
            <button
              type="button"
              className="btn-copper h-12 flex-1"
              onClick={() => {
                closeCart();
                navigate('/checkout');
              }}
            >
              Proceed to checkout
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default ShoppingCart;
