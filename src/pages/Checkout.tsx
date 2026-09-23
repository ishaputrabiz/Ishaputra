import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, animate, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileHeader from '@/components/MobileHeader';
import MobileSearchBar from '@/components/MobileSearchBar';
import { ArrowLeft, Tag, Gift, ChevronDown, Shield, ChevronRight, Plus, Minus, Zap, CreditCard, MapPin, MoreVertical, Sparkles, ShoppingBag, Truck, Home, Edit, X, Loader2, Trash2, Search, ScanLine, Mic, Check } from 'lucide-react';
import { getActiveProductsCached } from '@/services/productCache';
import { adaptFirebaseToUI, UIProduct } from '@/lib/productAdapter';
import { getUserAddresses, getDefaultAddress, Address, addAddress, AddressFormData } from '@/services/addressService';
import { createPaidOrder, preflightCart, generateOrderNumber, OrderFormData, OrderItem } from '@/services/orderService';
import { payWithRazorpay, PaymentCancelledError, type VerifiedPayment } from '@/services/razorpayService';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { useWishlist } from '@/hooks/useWishlist';
import { useCheckoutPricing } from '@/hooks/useCheckoutPricing';
import { SmartImage } from "@/components/ui/smart-image";

// ─── Slide to Pay Button Component ───
/**
 * Best-effort coordinates for a shipping address, used by the delivery map.
 *
 * Runs against OpenStreetMap's Nominatim, which is a third-party service that
 * can be slow or unavailable, so it is called BEFORE the payment is taken and
 * never allowed to fail an order: any error resolves to no coordinates.
 *
 * A candidate is only accepted when it lands within 20 km of the city centre,
 * so a stray match on a same-named locality elsewhere in India is discarded.
 */
async function geocodeShippingAddress(address: {
  city?: string; state?: string; locality?: string; pinCode?: string;
}): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const tryGeo = async (q: string) => {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=in`);
      const d = await r.json();
      return d?.length > 0 ? { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon) } : null;
    };
    const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const R = 6371, dLat = ((lat2-lat1)*Math.PI)/180, dLon = ((lon2-lon1)*Math.PI)/180;
      const a = Math.sin(dLat/2)**2 + Math.cos((lat1*Math.PI)/180)*Math.cos((lat2*Math.PI)/180)*Math.sin(dLon/2)**2;
      return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };

    const cityRef = await tryGeo(`${address.city}, ${address.state}, India`);
    if (!cityRef) return null;

    const geoQueries = [
      address.locality ? `${address.locality}, ${address.city}, ${address.state}, India` : '',
      address.locality && address.pinCode ? `${address.locality}, ${address.pinCode}, India` : '',
      address.pinCode ? `${address.pinCode}, ${address.city}, India` : '',
      address.pinCode ? `${address.pinCode}, India` : '',
    ].filter(Boolean);

    for (const q of geoQueries) {
      const result = await tryGeo(q);
      if (result && haversineKm(cityRef.lat, cityRef.lon, result.lat, result.lon) <= 20) {
        return { latitude: result.lat, longitude: result.lon };
      }
    }
    return { latitude: cityRef.lat, longitude: cityRef.lon };
  } catch (geoErr) {
    console.warn('Geocoding failed at checkout, order will still be placed:', geoErr);
    return null;
  }
}

/**
 * Warns about cart lines that can no longer be bought and removes them in one
 * tap. A sold-out or withdrawn product stays in any cart it was already in, and
 * the customer used to learn that only when the pre-payment check refused them.
 */
const UnavailableItemsNotice = ({
  items,
  unavailable,
  onRemove,
}: {
  items: { id: string; name: string }[];
  unavailable: Record<string, string>;
  onRemove: (id: string) => void;
}) => {
  const affected = items.filter((i) => unavailable[i.id]);
  if (affected.length === 0) return null;
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900 dark:border-orange-900/50 dark:bg-orange-950/40 dark:text-orange-200">
      <p className="font-semibold">
        {affected.length === 1 ? '1 item in your cart' : `${affected.length} items in your cart`} can no longer be ordered
      </p>
      <p className="mt-0.5 text-xs opacity-90">Remove {affected.length === 1 ? 'it' : 'them'} to continue to payment.</p>
      <button
        type="button"
        onClick={() => affected.forEach((i) => onRemove(i.id))}
        className="mt-2 rounded-full bg-orange-600 px-3 py-1 text-xs font-semibold text-white hover:bg-orange-700"
      >
        Remove {affected.length === 1 ? 'it' : `all ${affected.length}`}
      </button>
    </div>
  );
};

/** Small tag on a cart line that cannot be bought any more. */
const UnavailableTag = ({ reason }: { reason?: string }) =>
  reason ? (
    <span className="mt-1 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800 dark:bg-orange-900/40 dark:text-orange-200">
      {reason}
    </span>
  ) : null;

const SlideToPayButton = ({ amount, onComplete }: { amount: string; onComplete: () => void }) => {
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

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x > sliderWidth * 0.7) {
      setCompleted(true);
      onComplete();
    } else {
      animate(x, 0, { type: 'spring', stiffness: 400, damping: 30 });
    }
  };

  return (
    <motion.div
      ref={constraintsRef}
      className="relative h-14 rounded-full overflow-hidden bg-gradient-to-r from-green-500 to-green-600 shadow-lg shadow-green-500/30"
      style={{ opacity: backgroundOpacity }}
    >
      {/* Text */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center text-white font-semibold text-base pointer-events-none"
        style={{ opacity: textOpacity, fontFamily: "'Poppins', sans-serif" }}
      >
        {amount === 'Place Order' ? 'Slide to Place Order' : `Slide to Pay | ${amount}`}
      </motion.div>

      {/* Check mark on complete */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center text-white font-semibold text-base pointer-events-none"
        style={{ opacity: checkOpacity, fontFamily: "'Poppins', sans-serif" }}
      >
        {amount === 'Place Order' ? '✓ Placing Order...' : '✓ Processing...'}
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
          <ChevronRight className="w-5 h-5 text-green-600" />
          <ChevronRight className="w-5 h-5 text-green-600 -ml-3" />
        </motion.div>
      )}
    </motion.div>
  );
};

// ─── Mobile Checkout Component ───
const MobileCheckout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const handleBack = () => {
    if (currentStep > 1) { setCurrentStep(prev => prev - 1); return; }
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };
  const { user, userProfile } = useAuth();
  const { resolvedTheme } = useTheme();
  const { items, unavailable, subtotal, updateQuantity, updateCartPrice, removeFromCart, totalItems, addToCart, clearCart, openCart, loading: cartLoading } = useCart();
  const [currentStep, setCurrentStep] = useState(1); // 1: Cart, 2: Checkout, 3: Payment, 4: Confirmation
  const { toast } = useToast();
  const [suggestedProducts, setSuggestedProducts] = useState<UIProduct[]>([]);
  const [activeTab, setActiveTab] = useState('Did you forget?');
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [showAddressSelector, setShowAddressSelector] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [tempSelectedAddress, setTempSelectedAddress] = useState<Address | null>(null);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('Razorpay');
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  const [showOrderAnimation, setShowOrderAnimation] = useState(false);
  const [orderId] = useState(() => generateOrderNumber());
  const [firestoreOrderId, setFirestoreOrderId] = useState<string | null>(null);
  const [lastOrderedProductId, setLastOrderedProductId] = useState<string | null>(null);
  const [orderedItems, setOrderedItems] = useState<typeof items>([]);
  const [showAllItems, setShowAllItems] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [slideResetKey, setSlideResetKey] = useState(0);
  const [couponInput, setCouponInput] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [showOffers, setShowOffers] = useState(false);
  const [showAllOffers, setShowAllOffers] = useState(false);
  // Ref-based flag so the navigation guard sees it synchronously before any re-render
  const orderPlacedRef = useRef(false);
  // Track if cart ever had items so we don't redirect when user taps cart icon with empty cart
  const cartWasPopulatedRef = useRef(false);
  
  // Form state
  const [formData, setFormData] = useState<AddressFormData>({
    fullName: '',
    phoneNumber: '',
    pinCode: '',
    locality: '',
    address: '',
    city: '',
    state: '',
    isDefault: false,
  });

  // Track when cart has items so we know if it was emptied during this session
  useEffect(() => {
    if (items.length > 0) cartWasPopulatedRef.current = true;
  }, [items]);

  // Redirect to home when cart is emptied DURING checkout (not on first arrival with empty cart)
  // Uses orderPlacedRef (synchronous) in addition to showOrderSuccess state to prevent
  // a race where clearCart's onSnapshot fires before the state batch commits.
  useEffect(() => {
    if (!cartLoading && items.length === 0 && cartWasPopulatedRef.current && !showOrderSuccess && !orderPlacedRef.current && currentStep > 1) {
      navigate('/', { replace: true });
    }
  }, [items, cartLoading, showOrderSuccess, currentStep]);

  // Fetch addresses and suggested products
  const loadAddresses = async () => {
    if (user) {
      try {
        // Load user addresses
        const userAddresses = await getUserAddresses(user.uid);
        setAddresses(userAddresses);
        
        // Set default address or first address
        const defaultAddr = userAddresses.find(addr => addr.isDefault) || userAddresses[0];
        setSelectedAddress(defaultAddr || null);
        setTempSelectedAddress(defaultAddr || null);
      } catch (error) {
        console.error('Error loading addresses:', error);
      }
    }
  };
  
  useEffect(() => {
    const fetchData = async () => {
      await loadAddresses();
      
      // Fetch suggested products
      try {
        const products = await getActiveProductsCached();
        const uiProducts = products.slice(0, 8).map(adaptFirebaseToUI);
        setSuggestedProducts(uiProducts);
      } catch (e) {
        console.error('Error fetching suggestions:', e);
      }
    };
    
    fetchData();
  }, [user]);
  
  // Handle form input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  
  // Handle form submission
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validation
    if (!formData.fullName || !formData.phoneNumber || !formData.pinCode || 
        !formData.address || !formData.city || !formData.state) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      setFormLoading(true);

      // Add new address
      await addAddress(user.uid, formData);
      toast({
        title: 'Success',
        description: '\u2713 Address added successfully',
      });

      // Reset form and reload addresses
      setFormData({
        fullName: '',
        phoneNumber: '',
        pinCode: '',
        locality: '',
        address: '',
        city: '',
        state: '',
        isDefault: false,
      });
      setShowAddressForm(false);
      await loadAddresses();
    } catch (error) {
      console.error('Error saving address:', error);
      toast({
        title: 'Error',
        description: 'Failed to save address',
        variant: 'destructive',
      });
    } finally {
      setFormLoading(false);
    }
  };
  
  // Handle opening address selector
  const handleOpenAddressSelector = () => {
    setTempSelectedAddress(selectedAddress);
    if (addresses.length === 0) {
      setShowAddressForm(true);
    }
    setShowAddressSelector(true);
  };
  
  // Handle closing address selector
  const handleCloseAddressSelector = () => {
    setShowAddressSelector(false);
    setShowAddressForm(false);
    setTempSelectedAddress(null);
  };
  
  // Handle delivering to selected address
  const handleDeliverHere = () => {
    if (tempSelectedAddress) {
      setSelectedAddress(tempSelectedAddress);
    }
    handleCloseAddressSelector();
  };

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    const result = await pricing.applyCoupon(couponInput.trim());
    if (result.ok) setCouponInput('');
    setCouponLoading(false);
  };

  const formatPrice = (price: number) => {
    return `₹ ${price.toFixed(2)}`;
  };

  // Admin-driven pricing (coupons / delivery / GST all live in /admin/commerce-settings).
  // Product ids let per-product delivery overrides apply; the address state
  // selects the within-state / outside-state / per-state rate.
  const pricing = useCheckoutPricing(subtotal, items.length === 0, selectedPaymentMethod, {
    productIds: items.map((i) => i.id),
    destinationState: selectedAddress?.state,
    // Needed for category-restricted coupons and for `perUserLimit` /
    // `firstOrderOnly`, which the admin panel stores but nothing used to check.
    cartCategories: items.map((i) => i.category || '').filter(Boolean),
    userId: user?.uid,
    // Apply the code the customer tapped in the offer ribbon.
    applyRememberedCode: true,
  });
  const deliveryCharge = pricing.deliveryCharge;
  const taxAmount = pricing.gstAmount;
  const gstLabel = `GST (${pricing.gst.rate}%${pricing.gst.inclusive ? ' included' : ''})`;
  const savings = items.reduce((acc, item) => {
    // Only count a saving when the product genuinely has a higher MRP.
    const originalPrice = item.originalPrice && item.originalPrice > item.price ? item.originalPrice : 0;
    return originalPrice ? acc + (originalPrice - item.price) * item.quantity : acc;
  }, 0);
  const discount = pricing.discount;
  const total = pricing.total;

  // Defensive guard — must come AFTER all hooks (Rules of Hooks)
  if (!user) return <Navigate to="/login" state={{ from: { pathname: '/checkout' } }} replace />;

  const addOnTabs = ['Did you forget?', 'Best Sellers', 'New Arrivals'];

  // Handle order placement
  const handlePlaceOrder = async () => {
    if (!user || !selectedAddress) {
      toast({
        title: 'Error',
        description: 'Please add a delivery address',
        variant: 'destructive',
      });
      return;
    }

    if (items.length === 0) {
      toast({
        title: 'Error',
        description: 'Your cart is empty',
        variant: 'destructive',
      });
      return;
    }

    setIsPlacingOrder(true);

    try {
      // Convert cart items to order items
      const orderItems: OrderItem[] = items.map(item => ({
        productId: item.id,
        name: item.name,
        image: item.image,
        price: item.price,
        quantity: item.quantity,
      }));

      // ── Re-check the cart against live data BEFORE charging anyone ──
      // Stock used to be validated only inside createOrder, which runs *after*
      // Razorpay has captured the money - so buying the last piece of something
      // could charge the customer and then leave them with no order at all.
      // Price drift had the same shape: it surfaced as a bare
      // "Order total mismatch" at the payment step. Both are now caught here,
      // before the modal opens, and explained in plain words.
      const preflight = await preflightCart(
        items.map((i) => ({ productId: i.id, name: i.name, quantity: i.quantity, price: i.price })),
      );
      if (preflight.blockers.length > 0) {
        toast({
          title: 'Please update your cart',
          description: preflight.blockers.map((b) => b.blocker).join(' '),
          variant: 'destructive',
        });
        setIsPlacingOrder(false);
        return;
      }
      if (preflight.repriced.length > 0) {
        // Bring the cart in line with the live catalogue and let the customer
        // look at the new total before we take payment.
        for (const line of preflight.repriced) updateCartPrice(line.productId, line.livePrice);
        toast({
          title: 'Prices have changed',
          description: `${preflight.repriced.map((l) => l.name).join(', ')} ${preflight.repriced.length === 1 ? 'is' : 'are'} now priced differently. Your total has been updated - please review it and pay again.`,
        });
        setIsPlacingOrder(false);
        return;
      }

      // ── Geocode the address BEFORE payment ──
      // This calls a third-party service that can be slow or down. Running it
      // after the charge would leave a captured payment waiting on it; running
      // it here costs nothing if the customer then abandons the modal.
      const geo = await geocodeShippingAddress(selectedAddress);

      // ── Collect online payment ──
      // Opens Razorpay Standard Checkout and waits for a server-verified payment.
      // The order is only written to Firestore AFTER the signature is verified,
      // so cancelled/failed payments never create an order. Throws
      // PaymentCancelledError on dismiss (handled in catch below).
      let verifiedPayment: VerifiedPayment | null = null;
      {
        verifiedPayment = await payWithRazorpay({
          // `amount` is a cross-check only; /api/create-order re-prices these
          // line items from Firestore and refuses to charge a mismatched total.
          amount: total,
          lineItems: items.map((i) => ({ productId: i.id, quantity: i.quantity })),
          paymentMethod: selectedPaymentMethod,
          shippingState: selectedAddress.state,
          couponCode: pricing.appliedCoupon?.code,
          receipt: orderId,
          name: 'Sreerasthu Silvers',
          description: `Order ${orderId}`,
          prefill: {
            name: userProfile?.username || user.displayName || selectedAddress.fullName,
            email: user.email || '',
            contact:
              userProfile?.whatsappNumber ||
              userProfile?.phone ||
              selectedAddress.phoneNumber ||
              '',
          },
          notes: { orderNumber: orderId, userId: user.uid },
        });
      }


      // Prepare order data
      const orderData: OrderFormData = {
        orderId: orderId,
        userId: user.uid,
        userEmail: user.email || '',
        userName: userProfile?.username || user.displayName || 'Guest',
        userPhone: userProfile?.whatsappNumber || userProfile?.phone || '',
        items: orderItems,
        subtotal: subtotal,
        deliveryCharge: deliveryCharge,
        taxAmount: taxAmount,
        discount: discount,
        total: total,
        ...(pricing.appliedCoupon ? {
          couponCode: pricing.appliedCoupon.code,
          couponId: pricing.appliedCoupon.id,
          couponDescription: pricing.appliedCoupon.description || '',
          couponType: pricing.appliedCoupon.type,
          couponValue: pricing.appliedCoupon.value,
          couponDiscount: pricing.discount,
        } : {}),
        gstRate: pricing.gst.rate,
        gstInclusive: !!pricing.gst.inclusive,
        shippingAddress: {
          fullName: selectedAddress.fullName,
          mobile: selectedAddress.phoneNumber,
          pincode: selectedAddress.pinCode,
          address: selectedAddress.address,
          locality: selectedAddress.locality || '',
          city: selectedAddress.city,
          state: selectedAddress.state,
          landmark: '',
          alternativePhone: '',
          addressType: 'home',
          ...(geo ? { latitude: geo.latitude, longitude: geo.longitude } : {}),
        },
        paymentMethod: selectedPaymentMethod,
        ...(verifiedPayment ? {
          razorpayPaymentId: verifiedPayment.razorpayPaymentId,
          razorpayOrderId: verifiedPayment.razorpayOrderId,
          razorpaySignature: verifiedPayment.razorpaySignature,
        } : {}),
        status: 'pending',
      };

      // Create order in Firestore.
      // The payment is already captured at this point, so createPaidOrder falls
      // back to a flagged order rather than throwing - a customer must never be
      // charged and left without a record of it.
      const created = await createPaidOrder(orderData);
      const docId = created.id;
      setFirestoreOrderId(docId);
      if (created.needsReview) {
        toast({
          title: 'Order received - needs a quick check',
          description: 'Your payment went through and we have your order. Our team will confirm it shortly.',
        });
      }

      // Snapshot items BEFORE clearing the cart
      const snapshotItems = [...items];
      setOrderedItems(snapshotItems);
      setLastOrderedProductId(snapshotItems[0]?.id || null);

      // Mark order placed via ref FIRST so the navigation guard never fires
      orderPlacedRef.current = true;

      // Show success page immediately (before clearCart so state is committed)
      setShowOrderSuccess(true);
      setShowOrderAnimation(true);
      setTimeout(() => setShowOrderAnimation(false), 2800);

      // Close payment modal and clear cart AFTER success flag is set
      setShowPaymentDetails(false);
      clearCart();
    } catch (error) {
      console.error('Error placing order:', error);
      setSlideResetKey(k => k + 1);
      if (error instanceof PaymentCancelledError) {
        toast({
          title: 'Payment cancelled',
          description: 'You closed the payment window. Your order was not placed.',
        });
      } else {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to place order. Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsPlacingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 flex flex-col pb-24" style={{ fontFamily: "'Poppins', sans-serif" }}>
      {/* ─── Header with gradient ─── */}
      <div className="bg-white dark:bg-zinc-900 sticky top-0 z-50 shadow-sm">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={handleBack} className="p-1">
            <ArrowLeft className="w-6 h-6 text-gray-800 dark:text-zinc-200" />
          </button>
          <img
            src={resolvedTheme === 'dark' ? '/white_logo.png' : '/black_logo.png'}
            alt="Sreerasthu Silvers"
            className="h-9 w-auto object-contain"
          />
          <div className="w-8" />
        </div>
        <MobileSearchBar />
      </div>

      {/* ─── Address Selector Modal ─── */}
      <AnimatePresence>
        {showAddressSelector && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseAddressSelector}
              className="fixed inset-0 bg-black/50 z-[60]"
            />
            
            {/* Address List Modal */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[70] bg-white dark:bg-zinc-900 rounded-t-3xl max-h-[85vh] overflow-hidden"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              <div className="p-4 border-b border-gray-200 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Select Delivery Address
                  </h3>
                  <div className="flex items-center gap-2">
                    {!showAddressForm && addresses.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAddressForm(true)}
                        className="flex items-center gap-1 px-3 py-1.5 text-blue-600 hover:bg-blue-50 rounded-lg font-semibold text-sm transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Add
                      </button>
                    )}
                    <button
                      onClick={handleCloseAddressSelector}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-600 dark:text-zinc-400" />
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="overflow-y-auto max-h-[calc(85vh-150px)] p-4">
                {showAddressForm || addresses.length === 0 ? (
                  /* Address Form */
                  <form onSubmit={handleFormSubmit} className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                      <p className="text-xs text-blue-900 font-medium">
                        Add a new delivery address for your order
                      </p>
                    </div>
                    
                    {/* Full Name */}
                    <div>
                      <Label htmlFor="mobile-fullName" className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                        Full Name *
                      </Label>
                      <Input
                        id="mobile-fullName"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleInputChange}
                        placeholder="Enter your full name"
                        className="h-11 border-gray-300 dark:border-zinc-700 focus:border-blue-500"
                        required
                      />
                    </div>

                    {/* Phone Number */}
                    <div>
                      <Label htmlFor="mobile-phoneNumber" className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                        Phone Number *
                      </Label>
                      <Input
                        id="mobile-phoneNumber"
                        name="phoneNumber"
                        type="tel"
                        value={formData.phoneNumber}
                        onChange={handleInputChange}
                        placeholder="10-digit mobile number"
                        className="h-11 border-gray-300 dark:border-zinc-700 focus:border-blue-500"
                        maxLength={10}
                        required
                      />
                    </div>

                    {/* Pin Code & Locality */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="mobile-pinCode" className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                          Pin Code *
                        </Label>
                        <Input
                          id="mobile-pinCode"
                          name="pinCode"
                          value={formData.pinCode}
                          onChange={handleInputChange}
                          placeholder="6-digit"
                          maxLength={6}
                          className="h-11 border-gray-300 dark:border-zinc-700 focus:border-blue-500"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="mobile-locality" className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                          Locality
                        </Label>
                        <Input
                          id="mobile-locality"
                          name="locality"
                          value={formData.locality}
                          onChange={handleInputChange}
                          placeholder="Area"
                          className="h-11 border-gray-300 dark:border-zinc-700 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* Address */}
                    <div>
                      <Label htmlFor="mobile-address" className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                        Address (Area and Street) *
                      </Label>
                      <Input
                        id="mobile-address"
                        name="address"
                        value={formData.address}
                        onChange={handleInputChange}
                        placeholder="House No., Building, Street"
                        className="h-11 border-gray-300 dark:border-zinc-700 focus:border-blue-500"
                        required
                      />
                    </div>

                    {/* City & State */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="mobile-city" className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                          City *
                        </Label>
                        <Input
                          id="mobile-city"
                          name="city"
                          value={formData.city}
                          onChange={handleInputChange}
                          placeholder="City"
                          className="h-11 border-gray-300 dark:border-zinc-700 focus:border-blue-500"
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="mobile-state" className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-1.5 block">
                          State *
                        </Label>
                        <Input
                          id="mobile-state"
                          name="state"
                          value={formData.state}
                          onChange={handleInputChange}
                          placeholder="State"
                          className="h-11 border-gray-300 dark:border-zinc-700 focus:border-blue-500"
                          required
                        />
                      </div>
                    </div>

                    {/* Set as Default */}
                    <div className="flex items-center space-x-3 pt-1">
                      <input
                        type="checkbox"
                        id="mobile-isDefault"
                        checked={formData.isDefault}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, isDefault: e.target.checked }))
                        }
                        className="w-4 h-4 text-blue-600 border-gray-300 dark:border-zinc-700 rounded focus:ring-blue-500"
                      />
                      <Label htmlFor="mobile-isDefault" className="text-sm font-medium text-gray-700 dark:text-zinc-300 cursor-pointer">
                        Set as default shipping address
                      </Label>
                    </div>
                    
                    {addresses.length > 0 && (
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => setShowAddressForm(false)}
                        className="text-blue-600 p-0 h-auto text-sm"
                      >
                        ← Back to saved addresses
                      </Button>
                    )}
                  </form>
                ) : (
                  /* Saved Addresses List */
                  <div className="space-y-3">
                    {addresses.map((address) => (
                      <label
                        key={address.id}
                        className={`block p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          tempSelectedAddress?.id === address.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Radio Button */}
                          <input
                            type="radio"
                            name="mobileSelectedAddress"
                            checked={tempSelectedAddress?.id === address.id}
                            onChange={() => setTempSelectedAddress(address)}
                            className="mt-1 w-4 h-4 text-blue-600 border-gray-300 dark:border-zinc-700 focus:ring-blue-500"
                          />
                          
                          {/* Address Details */}
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-gray-900 dark:text-zinc-100 uppercase text-sm">
                                {address.fullName}
                              </span>
                              {address.isDefault && (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded uppercase">
                                  Home
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 dark:text-zinc-400 mb-1">{address.phoneNumber}</p>
                            <p className="text-xs text-gray-700 dark:text-zinc-300 leading-relaxed">
                              {address.address}
                              {address.locality && `, ${address.locality}`}, {address.city}, {address.state} - {address.pinCode}
                            </p>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Footer Buttons */}
              <div className="p-4 border-t border-gray-200 dark:border-zinc-800 flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseAddressSelector}
                  className="flex-1 h-11 text-sm font-semibold border-gray-300 dark:border-zinc-700"
                >
                  Cancel
                </Button>
                {showAddressForm || addresses.length === 0 ? (
                  <Button
                    type="button"
                    onClick={handleFormSubmit}
                    disabled={formLoading}
                    className="flex-1 h-11 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    {formLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Deliver Here'
                    )}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={handleDeliverHere}
                    disabled={!tempSelectedAddress}
                    className="flex-1 h-11 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                  >
                    Deliver Here
                  </Button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Main Content ─── */}
      <div className="flex-1 overflow-y-auto">
        {/* Stepper - scrolls with content (hidden when cart is empty on step 1) */}
        {!(currentStep === 1 && items.length === 0 && !cartLoading) && (
        <div className="px-4 pt-4 pb-3">
          <div className="relative flex justify-between">
            {/* Gray background rail: from center of step 1 to center of step 4 */}
            <div className="absolute top-4 h-0.5 bg-gray-200" style={{ left: '12.5%', right: '12.5%' }} />
            {/* Green active rail: grows from step 1 center toward step 4 center */}
            <div
              className="absolute top-4 h-0.5 bg-green-500 transition-all duration-300"
              style={{ left: '12.5%', width: `calc((100% - 25%) * ${(currentStep - 1) / 3})` }}
            />

            {/* Step 1: Cart */}
            <div className="relative z-10 flex flex-col items-center w-1/4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 1 ? 'bg-green-500' : 'bg-gray-200'
              }`}>
                {currentStep > 1 ? (
                  <Check className="w-4 h-4 text-white" />
                ) : (
                  <span className={`text-xs font-bold ${
                    currentStep === 1 ? 'text-white' : 'text-gray-500'
                  }`}>1</span>
                )}
              </div>
              <span className={`text-xs mt-1 ${
                currentStep >= 1 ? 'text-green-600 font-semibold' : 'text-gray-400'
              }`}>Cart</span>
            </div>

            {/* Step 2: Checkout */}
            <div className="relative z-10 flex flex-col items-center w-1/4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 2 ? 'bg-green-500' : 'bg-gray-200'
              }`}>
                {currentStep > 2 ? (
                  <Check className="w-4 h-4 text-white" />
                ) : (
                  <span className={`text-xs font-bold ${
                    currentStep === 2 ? 'text-white' : 'text-gray-500'
                  }`}>2</span>
                )}
              </div>
              <span className={`text-xs mt-1 ${
                currentStep >= 2 ? 'text-green-600 font-semibold' : 'text-gray-400'
              }`}>Checkout</span>
            </div>

            {/* Step 3: Payment */}
            <div className="relative z-10 flex flex-col items-center w-1/4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 3 ? 'bg-green-500' : 'bg-gray-200'
              }`}>
                {currentStep > 3 ? (
                  <Check className="w-4 h-4 text-white" />
                ) : (
                  <span className={`text-xs font-bold ${
                    currentStep === 3 ? 'text-white' : 'text-gray-500'
                  }`}>3</span>
                )}
              </div>
              <span className={`text-xs mt-1 ${
                currentStep >= 3 ? 'text-green-600 font-semibold' : 'text-gray-400'
              }`}>Payment</span>
            </div>

            {/* Step 4: Confirm */}
            <div className="relative z-10 flex flex-col items-center w-1/4">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 4 ? 'bg-green-500' : 'bg-gray-200'
              }`}>
                {currentStep > 4 ? (
                  <Check className="w-4 h-4 text-white" />
                ) : (
                  <span className={`text-xs font-bold ${
                    currentStep === 4 ? 'text-white' : 'text-gray-500'
                  }`}>4</span>
                )}
              </div>
              <span className={`text-xs mt-1 ${
                currentStep >= 4 ? 'text-green-600 font-semibold' : 'text-gray-400'
              }`}>Confirm</span>
            </div>
          </div>
        </div>
        )}

        {/* ─── STEP 1: Cart Review ─── */}
        {currentStep === 1 && (
          <div className="pb-32">
            {/* Empty Cart State */}
            {items.length === 0 && !cartLoading && (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center mb-5">
                  <ShoppingBag className="w-10 h-10 text-gray-400 dark:text-zinc-500" strokeWidth={1.5} />
                </div>
                <h2 className="text-xl font-semibold text-gray-800 dark:text-zinc-100 mb-2" style={{ fontFamily: "'Poppins', sans-serif" }}>Your cart is empty</h2>
                <p className="text-sm text-gray-500 dark:text-zinc-400 mb-6">Add some beautiful silver jewellery to get started</p>
                <button
                  onClick={() => navigate('/')}
                  className="px-6 py-3 bg-[#832729] text-white text-sm font-semibold rounded-full shadow-sm active:scale-95 transition-transform"
                  style={{ fontFamily: "'Poppins', sans-serif" }}
                >
                  Shop Now
                </button>
              </div>
            )}
            {/* Cart Items */}
            {items.length > 0 && (<>
            <div className="px-4 pt-4 pb-2 space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>Your Cart</h2>
              <UnavailableItemsNotice items={items} unavailable={unavailable} onRemove={removeFromCart} />
            </div>
            <div className="mx-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden mb-4">
              <div className="divide-y divide-gray-50 dark:divide-zinc-800">
                <AnimatePresence>
                  {items.map((item) => {
                    // Show the strike-through MRP only when the product genuinely has one.
                    const origPrice = item.originalPrice && item.originalPrice > item.price ? item.originalPrice : null;
                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-3 px-4 py-4"
                      >
                        <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-zinc-800 ring-1 ring-gray-100 dark:ring-zinc-700">
                          <SmartImage src={item.image} alt={item.name} className="w-full h-full object-cover" preset="thumb" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-base font-semibold text-gray-900 dark:text-zinc-100 line-clamp-2 leading-snug" style={{ fontFamily: "'Poppins', sans-serif" }}>{item.name}</h4>
                          <UnavailableTag reason={unavailable[item.id]} />
                          <div className="mt-1.5">
                            <span className="text-base font-bold text-gray-900 dark:text-zinc-100 whitespace-nowrap" style={{ fontFamily: "'Poppins', sans-serif" }}>{formatPrice(item.price)}</span>
                            {origPrice && (
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="text-xs text-gray-400 dark:text-zinc-500 line-through whitespace-nowrap" style={{ fontFamily: "'Poppins', sans-serif" }}>{formatPrice(origPrice)}</span>
                                <span className="text-[10px] font-bold text-green-600 bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded-full whitespace-nowrap">{Math.round((1 - item.price / origPrice) * 100)}% OFF</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex items-center gap-1.5">
                            <button
                              onClick={() => item.quantity === 1 ? removeFromCart(item.id) : updateQuantity(item.id, item.quantity - 1)}
                              className="w-7 h-7 flex items-center justify-center bg-transparent border border-gray-900/20 dark:border-zinc-100/20 hover:bg-gray-900/5 rounded-full transition-colors"
                            >
                              <Minus className="w-3 h-3 text-gray-900 dark:text-zinc-100" strokeWidth={2.5} />
                            </button>
                            <div className="w-7 h-7 flex items-center justify-center bg-gray-900 dark:bg-zinc-100 rounded-full">
                              <span className="text-xs font-bold text-white dark:text-zinc-900" style={{ fontFamily: "'Poppins', sans-serif" }}>{item.quantity}</span>
                            </div>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="w-7 h-7 flex items-center justify-center bg-transparent border border-gray-900/20 dark:border-zinc-100/20 hover:bg-gray-900/5 rounded-full transition-colors"
                            >
                              <Plus className="w-3 h-3 text-gray-900 dark:text-zinc-100" strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-col items-end justify-between self-stretch flex-shrink-0">
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="w-7 h-7 flex items-center justify-center text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                          </button>
                          <div className="text-right">
                            <p className="text-sm font-bold text-gray-900 dark:text-zinc-100 whitespace-nowrap" style={{ fontFamily: "'Poppins', sans-serif" }}>{formatPrice(item.price * item.quantity)}</p>
                            {item.quantity > 1 && (
                              <p className="text-[10px] text-gray-400 dark:text-zinc-500 whitespace-nowrap" style={{ fontFamily: "'Poppins', sans-serif" }}>{item.quantity} × {formatPrice(item.price)}</p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>

            {/* Add more items */}
            <div className="mx-4 mb-4">
              <button
                onClick={() => navigate('/')}
                className="w-full flex items-center justify-center gap-2 py-3 bg-white dark:bg-zinc-900 border border-dashed border-gray-200 dark:border-zinc-700 rounded-2xl hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <span className="text-sm text-gray-500 dark:text-zinc-400" style={{ fontFamily: "'Poppins', sans-serif" }}>Missed something?</span>
                <span className="text-sm font-semibold text-green-600" style={{ fontFamily: "'Poppins', sans-serif" }}>Add more items</span>
              </button>
            </div>

            {/* Available Offers */}
            {pricing.redeemableCoupons.length > 0 && (() => {
              const activeOffers = pricing.redeemableCoupons;
              const visibleMobileOffers = showAllOffers ? activeOffers : activeOffers.slice(0, 2);
              return (
                <div className="mx-4 mb-4">
                  <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-4">
                    <button
                      onClick={() => setShowOffers((prev) => !prev)}
                      className="flex items-center justify-between w-full"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                          <Tag className="w-3.5 h-3.5 text-gray-700 dark:text-zinc-300" />
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>
                          Available Offers ({activeOffers.length})
                        </h3>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-gray-500 dark:text-zinc-400 transition-transform ${showOffers ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {showOffers && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-3 space-y-2.5"
                      >
                        {visibleMobileOffers.map((c) => {
                          const value = c.type === 'percent' ? `${c.value}% OFF` : `₹${c.value} OFF`;
                          const min = c.minOrderValue ? ` on orders above ₹${c.minOrderValue.toLocaleString('en-IN')}` : '';
                          const isApplied = pricing.appliedCoupon?.code === c.code;
                          return (
                            <div key={c.id} className="rounded-xl border border-dashed border-green-300 dark:border-green-800 bg-green-50/60 dark:bg-green-900/15 p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-green-700 dark:text-green-400 tracking-wide" style={{ fontFamily: "'Poppins', sans-serif" }}>{c.code}</span>
                                    <span className="text-[10px] font-bold text-green-600 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded-full">{value}</span>
                                  </div>
                                  <p className="text-[11px] text-gray-600 dark:text-zinc-400 mt-0.5 leading-relaxed" style={{ fontFamily: "'Poppins', sans-serif" }}>
                                    {c.description || `Save ${value.toLowerCase()}`}{min}
                                  </p>
                                </div>
                                <button
                                  onClick={() => { if (!isApplied) pricing.applyCoupon(c.code); }}
                                  disabled={isApplied || pricing.couponLoading}
                                  className={`flex-shrink-0 h-8 px-3 rounded-lg text-xs font-bold transition-colors ${isApplied ? 'bg-green-600 text-white' : 'bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-gray-800 dark:hover:bg-white'}`}
                                  style={{ fontFamily: "'Poppins', sans-serif" }}
                                >
                                  {isApplied ? '✓ Applied' : pricing.couponLoading ? 'Checking…' : 'APPLY'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {activeOffers.length > 2 && (
                          <button
                            onClick={() => setShowAllOffers((prev) => !prev)}
                            className="text-xs font-semibold text-green-600 hover:text-green-700 mt-1"
                            style={{ fontFamily: "'Poppins', sans-serif" }}
                          >
                            {showAllOffers ? 'Show Less' : `Show ${activeOffers.length - 2} More`}
                          </button>
                        )}
                      </motion.div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Coupon Section */}
            <div className="mx-4 mb-4">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-3" style={{ fontFamily: "'Poppins', sans-serif" }}>Apply Coupon</h3>
                {pricing.appliedCoupon ? (
                  <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-green-600" />
                      <div>
                        <span className="text-sm font-bold text-green-700 dark:text-green-400" style={{ fontFamily: "'Poppins', sans-serif" }}>{pricing.appliedCoupon.code}</span>
                        <p className="text-xs text-green-600 dark:text-green-500" style={{ fontFamily: "'Poppins', sans-serif" }}>− {formatPrice(discount)} saved</p>
                      </div>
                    </div>
                    <button
                      onClick={() => pricing.removeCoupon()}
                      className="text-xs text-red-500 font-medium hover:text-red-700 transition-colors"
                      style={{ fontFamily: "'Poppins', sans-serif" }}
                    >Remove</button>
                  </div>
                ) : (
                  <div className="flex gap-2 min-w-0">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={e => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="Enter coupon code"
                      className="flex-1 min-w-0 h-10 px-3 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/20 dark:focus:ring-zinc-100/20 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500"
                      style={{ fontFamily: "'Poppins', sans-serif" }}
                      onKeyDown={e => { if (e.key === 'Enter' && couponInput.trim()) handleApplyCoupon(); }}
                    />
                    <button
                      onClick={handleApplyCoupon}
                      disabled={pricing.couponLoading || !couponInput.trim()}
                      className="h-10 px-4 text-sm font-semibold text-white bg-gray-900 dark:bg-zinc-100 dark:text-zinc-900 rounded-xl disabled:opacity-50 transition-colors flex-shrink-0 whitespace-nowrap"
                      style={{ fontFamily: "'Poppins', sans-serif" }}
                    >
                      {pricing.couponLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                    </button>
                  </div>
                )}
                {pricing.couponError && !pricing.appliedCoupon && (
                  <p className="text-xs text-red-500 mt-2" style={{ fontFamily: "'Poppins', sans-serif" }}>{pricing.couponError}</p>
                )}
              </div>
            </div>

            {/* Bill Summary */}
            <div className="mx-4 mb-4">
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-4">
                <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-3" style={{ fontFamily: "'Poppins', sans-serif" }}>Bill Summary</h3>
                <div className="space-y-2.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-zinc-400" style={{ fontFamily: "'Poppins', sans-serif" }}>Item Total</span>
                    <span className="text-gray-900 dark:text-zinc-100 font-medium" style={{ fontFamily: "'Poppins', sans-serif" }}>{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-zinc-400" style={{ fontFamily: "'Poppins', sans-serif" }}>Delivery Fee</span>
                    <span className={`font-medium ${deliveryCharge === 0 ? 'text-green-600' : 'text-gray-900 dark:text-zinc-100'}`} style={{ fontFamily: "'Poppins', sans-serif" }}>
                      {deliveryCharge === 0 ? 'FREE' : formatPrice(deliveryCharge)}
                    </span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-green-600" style={{ fontFamily: "'Poppins', sans-serif" }}>Coupon Discount</span>
                      <span className="text-green-600 font-medium" style={{ fontFamily: "'Poppins', sans-serif" }}>− {formatPrice(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-zinc-400" style={{ fontFamily: "'Poppins', sans-serif" }}>{gstLabel}</span>
                    <span className="text-gray-900 dark:text-zinc-100 font-medium" style={{ fontFamily: "'Poppins', sans-serif" }}>{formatPrice(taxAmount)}</span>
                  </div>
                  <div className="h-px bg-gray-200 dark:bg-zinc-800 my-2" />
                  <div className="flex justify-between items-center">
                    <span className="text-base font-bold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>To Pay</span>
                    <span className="text-lg font-bold text-green-600" style={{ fontFamily: "'Poppins', sans-serif" }}>{formatPrice(total)}</span>
                  </div>
                </div>
              </div>
            </div>
            </>)}
          </div>
        )}

        {/* ─── STEP 2+: Checkout ─── */}
        {currentStep >= 2 && (<>

        {/* Address bar - scrolls with content */}
        <div className="px-4 pt-4 pb-2">
          <button
            onClick={handleOpenAddressSelector}
            className="w-full flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 rounded-lg transition-colors"
          >
            <MapPin className="w-4 h-4 text-gray-600 dark:text-zinc-400 flex-shrink-0" />
            <div className="flex-1 min-w-0 text-left">
              {selectedAddress ? (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-900 dark:text-zinc-100 font-semibold text-sm" style={{ fontFamily: "'Poppins', sans-serif" }}>
                      {selectedAddress.fullName.toUpperCase()}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-600 dark:text-zinc-400" />
                  </div>
                  <p className="text-gray-600 dark:text-zinc-400 text-xs truncate" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    {selectedAddress.address}, {selectedAddress.city}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-900 dark:text-zinc-100 font-semibold text-sm" style={{ fontFamily: "'Poppins', sans-serif" }}>ADD ADDRESS</span>
                    <Plus className="w-3.5 h-3.5 text-gray-600 dark:text-zinc-400" />
                  </div>
                  <p className="text-gray-600 dark:text-zinc-400 text-xs" style={{ fontFamily: "'Poppins', sans-serif" }}>Tap to add your delivery address</p>
                </>
              )}
            </div>
          </button>
        </div>

        {/* Compact Order Summary (step 2 — no duplicate full items list) */}
        <div className="mx-4 mt-3 mb-3">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm px-4 py-3 flex items-center gap-3">
            {/* Item thumbnails */}
            <div className="flex -space-x-2">
              {items.slice(0, 3).map((item, idx) => (
                <div key={item.id} className="w-14 h-14 rounded-full overflow-hidden border-2 border-white dark:border-zinc-900 flex-shrink-0" style={{ zIndex: 3 - idx }}>
                  <SmartImage src={item.image} alt={item.name} className="w-full h-full object-cover" preset="thumb" />
                </div>
              ))}
              {items.length > 3 && (
                <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-zinc-800 border-2 border-white dark:border-zinc-900 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-gray-600 dark:text-zinc-400">+{items.length - 3}</span>
                </div>
              )}
            </div>
            {/* Count + total */}
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>
                {totalItems} item{totalItems !== 1 ? 's' : ''}
              </p>
              <p className="text-sm text-gray-500 dark:text-zinc-400" style={{ fontFamily: "'Poppins', sans-serif" }}>Total: {formatPrice(total)}</p>
            </div>
            {/* Edit cart link */}
            <button
              onClick={() => setCurrentStep(1)}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex-shrink-0"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              Edit
            </button>
          </div>
        </div>

        {/* Bill Summary */}
        <div className="mx-4 mb-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 overflow-hidden p-4">
            <h3 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-3" style={{ fontFamily: "'Poppins', sans-serif" }}>Bill Summary</h3>
            
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-zinc-400" style={{ fontFamily: "'Poppins', sans-serif" }}>Item Total</span>
                <span className="text-gray-900 dark:text-zinc-100 font-medium" style={{ fontFamily: "'Poppins', sans-serif" }}>{formatPrice(subtotal)}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-zinc-400" style={{ fontFamily: "'Poppins', sans-serif" }}>Delivery Fee</span>
                <span className={`font-medium ${deliveryCharge === 0 ? 'text-green-600' : 'text-gray-900'}`} style={{ fontFamily: "'Poppins', sans-serif" }}>
                  {deliveryCharge === 0 ? 'FREE' : formatPrice(deliveryCharge)}
                </span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-zinc-400" style={{ fontFamily: "'Poppins', sans-serif" }}>{gstLabel}</span>
                <span className="text-gray-900 dark:text-zinc-100 font-medium" style={{ fontFamily: "'Poppins', sans-serif" }}>{formatPrice(taxAmount)}</span>
              </div>

              <div className="h-px bg-gray-200 dark:bg-zinc-800 my-2" />

              <div className="flex justify-between items-center">
                <span className="text-base font-bold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>To Pay</span>
                <span className="text-lg font-bold text-green-600" style={{ fontFamily: "'Poppins', sans-serif" }}>{formatPrice(total)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Last Minute Add-ons ─── */}
        {suggestedProducts.length > 0 && (
          <div className="mb-4">
            <div className="px-4 flex items-center gap-2 mb-3">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>Your last minute add-ons</h3>
            </div>

            {/* Horizontal scroll products */}
            <div className="flex gap-3 overflow-x-auto px-4 pb-2 no-scrollbar">
              {suggestedProducts.map((product) => (
                <motion.div
                  key={product.id}
                  className="flex-shrink-0 w-[130px] bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden border border-gray-100 dark:border-zinc-800 shadow-sm"
                  whileTap={{ scale: 0.97 }}
                >
                  {/* Image with discount badge */}
                  <div className="relative w-full h-[110px] bg-gray-50 dark:bg-zinc-900">
                    <SmartImage
                      src={product.image}
                      alt={product.title}
                      className="w-full h-full object-cover" preset="card" />
                    {product.discount && (
                      <div className="absolute top-2 left-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ fontFamily: "'Poppins', sans-serif" }}>
                        {product.discount}%<br />OFF
                      </div>
                    )}
                    {/* Add button */}
                    <button
                      onClick={async () => {
                        addToCart({
                          id: product.id,
                          name: product.title,
                          price: product.price,
                          image: product.image,
                          category: product.category,
                          stock: product.stock,
                        });
                      }}
                      className="absolute top-2 right-2 w-7 h-7 bg-white dark:bg-zinc-900 rounded-full shadow-md flex items-center justify-center border border-gray-100 dark:border-zinc-800 hover:bg-green-50 transition-colors"
                    >
                      <Plus className="w-4 h-4 text-green-600" strokeWidth={2.5} />
                    </button>
                  </div>

                  {/* Info */}
                  <div className="p-2.5">
                    <h4 className="text-xs font-semibold text-gray-900 dark:text-zinc-100 line-clamp-2 leading-tight min-h-[28px]" style={{ fontFamily: "'Poppins', sans-serif" }}>
                      {product.title}
                    </h4>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-xs font-bold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>{formatPrice(product.price)}</span>
                      {product.oldPrice && (
                        <span className="text-[10px] text-gray-400 dark:text-zinc-500 line-through" style={{ fontFamily: "'Poppins', sans-serif" }}>{formatPrice(product.oldPrice)}</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
        </>)}
      </div>

      {/* ─── Bottom Fixed Section ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="px-4 py-3">
          {currentStep === 1 ? (
            items.length > 0 && <button
              onClick={() => setCurrentStep(2)}
              className="w-full h-14 bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold text-sm rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              Proceed to Checkout
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <SlideToPayButton
              key={slideResetKey}
              amount={formatPrice(total)}
              onComplete={() => {
                if (!selectedAddress) {
                  setSlideResetKey(k => k + 1);
                  setShowAddressSelector(true);
                  return;
                }
                setShowPaymentDetails(true);
              }}
            />
          )}
        </div>
      </div>

      {/* ─── Payment Details Modal ─── */}
      <AnimatePresence>
        {showPaymentDetails && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[80] bg-[linear-gradient(180deg,rgba(212,175,55,0.08)_0%,rgba(255,255,255,1)_18%),linear-gradient(135deg,rgba(131,39,41,0.04)_0%,rgba(255,255,255,1)_52%)] dark:bg-zinc-950"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white/85 dark:bg-zinc-900/85 backdrop-blur border-b border-[#d4af37]/15 px-4 py-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setShowPaymentDetails(false); setSlideResetKey(k => k + 1); }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-zinc-300" />
                </button>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100">Payment Details</h2>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto pb-24" style={{ height: 'calc(100vh - 60px)' }}>
              {/* Stepper - scrolls with content */}
              <div className="px-4 pt-4 pb-3">
                <div className="relative flex justify-between">
                  {/* Gray background rail */}
                  <div className="absolute top-4 h-0.5 bg-gray-200 dark:bg-zinc-700" style={{ left: '12.5%', right: '12.5%' }} />
                  {/* Green active rail (steps 1-3 done, step 4 pending) */}
                  <div className="absolute top-4 h-0.5 bg-green-500" style={{ left: '12.5%', width: '50%' }} />

                  {/* Step 1: Cart */}
                  <div className="relative z-10 flex flex-col items-center w-1/4">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-500">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-xs mt-1 text-green-600 font-semibold">Cart</span>
                  </div>

                  {/* Step 2: Checkout */}
                  <div className="relative z-10 flex flex-col items-center w-1/4">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-500">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-xs mt-1 text-green-600 font-semibold">Checkout</span>
                  </div>

                  {/* Step 3: Payment */}
                  <div className="relative z-10 flex flex-col items-center w-1/4">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-green-500">
                      <span className="text-xs font-bold text-white">3</span>
                    </div>
                    <span className="text-xs mt-1 text-green-600 font-semibold">Payment</span>
                  </div>

                  {/* Step 4: Confirm */}
                  <div className="relative z-10 flex flex-col items-center w-1/4">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-200 dark:bg-zinc-800">
                      <span className="text-xs font-bold text-gray-500 dark:text-zinc-500">4</span>
                    </div>
                    <span className="text-xs mt-1 text-gray-400 dark:text-zinc-500">Confirm</span>
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div className="px-4 py-4">
                <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-100 mb-4">Payment Method</h3>
                <div className="space-y-3">
                  {/* Razorpay — Cards, UPI, Wallets & Net Banking */}
                  <label className="flex items-center justify-between p-3 border border-gray-200 dark:border-zinc-800 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
                        <CreditCard className="w-4 h-4 text-gray-600 dark:text-zinc-400" />
                      </div>
                      <div>
                        <span className="block text-sm font-medium text-gray-900 dark:text-zinc-100">Pay Online (Razorpay)</span>
                        <span className="text-xs text-gray-500 dark:text-zinc-400">Cards, UPI, Wallets & Net Banking</span>
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="Razorpay"
                      checked={selectedPaymentMethod === 'Razorpay'}
                      onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                      className="w-4 h-4 text-blue-600 border-gray-300 dark:border-zinc-700 focus:ring-blue-500"
                    />
                  </label>
                </div>
              </div>

              {/* Order Details */}
              <div className="px-4 py-4 border-t border-gray-100 dark:border-zinc-800">
                <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-100 mb-4">Order Details</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600 dark:text-zinc-400">Sub Total (include vat and tax)</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{formatPrice(subtotal)}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-900 dark:text-zinc-100">Total (include vat and tax)</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-zinc-100">{formatPrice(total)}</span>
                  </div>
                </div>
              </div>

              {/* Selected Items */}
              <div className="px-4 py-4 border-t border-gray-100 dark:border-zinc-800">
                <h3 className="text-sm font-bold text-gray-900 dark:text-zinc-100 mb-4">Selected item</h3>
                <div className="space-y-3">
                  {items.slice(0, 1).map((item) => (
                    <div key={item.id} className="flex items-center gap-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-3">
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-zinc-900">
                        <SmartImage src={item.image} alt={item.name} className="w-full h-full object-cover" preset="thumb" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-semibold text-gray-900 dark:text-zinc-100 line-clamp-1">{item.name}</h4>
                      </div>
                    </div>
                  ))}
                  {items.length > 1 && (
                    <p className="text-xs text-gray-500 dark:text-zinc-500">+ {items.length - 1} more item{items.length > 2 ? 's' : ''}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Place Order Slide Button */}
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 bg-white/88 dark:bg-zinc-900/88 backdrop-blur border-t border-[#d4af37]/15 p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]"
            >
              {isPlacingOrder ? (
                <div className="h-14 rounded-full flex items-center justify-center bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Placing Order...
                </div>
              ) : (
                <SlideToPayButton
                  amount="Place Order"
                  onComplete={handlePlaceOrder}
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Premium Order Animation Overlay ─── */}
      <AnimatePresence>
        {showOrderAnimation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-[200] bg-black/85 flex flex-col items-center justify-center pointer-events-none overflow-hidden"
          >
            {/* Sparkle particles */}
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full"
                style={{ backgroundColor: i % 2 === 0 ? '#d4af37' : '#f5f5f5' }}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  x: (Math.cos((i / 12) * 2 * Math.PI) * (80 + Math.random() * 80)),
                  y: (Math.sin((i / 12) * 2 * Math.PI) * (80 + Math.random() * 80)),
                  scale: [0, 1.5, 0],
                }}
                transition={{ delay: 0.3 + i * 0.06, duration: 1.2 }}
              />
            ))}
            {/* Gold ring */}
            <motion.div
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
              className="w-36 h-36 rounded-full border-[6px] border-amber-400 flex items-center justify-center"
              style={{ boxShadow: '0 0 40px 8px rgba(212,175,55,0.5)' }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 250, damping: 15 }}
                className="w-24 h-24 rounded-full bg-amber-400 flex items-center justify-center"
              >
                <svg className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <motion.path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.7, duration: 0.5 }}
                  />
                </svg>
              </motion.div>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="text-white text-2xl font-bold mt-6 text-center px-6"
              style={{ fontFamily: "'Poppins', sans-serif", textShadow: '0 2px 12px rgba(212,175,55,0.6)' }}
            >
              Order Placed Successfully!
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
              className="text-amber-300 text-sm mt-2 text-center px-8"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              Thank you for your purchase 🎉
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Order Success Page ─── */}
      <AnimatePresence>
        {showOrderSuccess && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[90] bg-white dark:bg-zinc-900 overflow-y-auto"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
              <MobileHeader />
              <div className="flex items-center gap-3 px-4 py-2">
                <button
                  onClick={() => navigate('/', { replace: true })}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-zinc-300" />
                </button>
                <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>Order Placed</h2>
              </div>
            </div>

            <div className="px-4 py-8">
              {/* Success Icon */}
              <div className="flex justify-center mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
                  className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ 
                      delay: 0.3,
                      duration: 0.6,
                      ease: 'easeInOut',
                      repeat: Infinity,
                      repeatDelay: 0.5,
                      repeatType: 'loop'
                    }}
                    className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center"
                  >
                    <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <motion.path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ delay: 0.5, duration: 0.5, ease: 'easeInOut' }}
                      />
                    </svg>
                  </motion.div>
                </motion.div>
              </div>

              {/* Success Message */}
              <motion.h3
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="text-xl font-bold text-teal-600 text-center mb-3"
                style={{ fontFamily: "'Poppins', sans-serif" }}
              >
                Order Placed Successfully!
              </motion.h3>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="text-sm text-gray-600 dark:text-zinc-400 text-center mb-6"
                style={{ fontFamily: "'Poppins', sans-serif" }}
              >
                Payment is successfully processed and your Order is on the way.
              </motion.p>

              {/* Order Details */}
              <div className="mb-6">
                <h4 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-3" style={{ fontFamily: "'Poppins', sans-serif" }}>Order Placed</h4>
                <div className="bg-gray-50 dark:bg-zinc-900 rounded-lg p-4 space-y-2">
                  <p className="text-sm text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Your order # is: <span className="font-bold">{orderId}</span>
                  </p>
                  <p className="text-xs text-gray-600 dark:text-zinc-400" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    Payment is successfully processed and your Order is on the way.
                  </p>
                </div>
              </div>

              {/* Shipping Address */}
              {selectedAddress && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2" style={{ fontFamily: "'Poppins', sans-serif" }}>This order will be shipped to:</h4>
                  <p className="text-xs text-gray-600 dark:text-zinc-400 leading-relaxed" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    {selectedAddress.address}
                    {selectedAddress.locality && `, ${selectedAddress.locality}`},<br />
                    {selectedAddress.city}, {selectedAddress.state} {selectedAddress.pinCode}
                  </p>
                </div>
              )}

              {/* Payment Method */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2" style={{ fontFamily: "'Poppins', sans-serif" }}>Payment Method</h4>
                <p className="text-xs text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>{selectedPaymentMethod}</p>
              </div>

              {/* Order Summary */}
              <div className="mb-6">
                <h4 className="text-base font-bold text-gray-900 dark:text-zinc-100 mb-3" style={{ fontFamily: "'Poppins', sans-serif" }}>Order Summary</h4>
                <div className="space-y-3">
                  {/* First Item */}
                  {orderedItems.length > 0 && (
                    <div className="flex gap-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-3">
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-zinc-900">
                        <SmartImage src={orderedItems[0].image} alt={orderedItems[0].name} className="w-full h-full object-cover" preset="thumb" />
                      </div>
                      <div className="flex-1">
                        <h5 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 line-clamp-2 mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>{orderedItems[0].name}</h5>
                        <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium" style={{ fontFamily: "'Poppins', sans-serif" }}>Qty: {orderedItems[0].quantity}</p>
                      </div>
                    </div>
                  )}

                  {/* Toggle for More Items */}
                  {orderedItems.length > 1 && (
                    <>
                      <AnimatePresence>
                        {showAllItems && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="space-y-3 overflow-hidden"
                          >
                            {orderedItems.slice(1).map((item) => (
                              <div key={item.id} className="flex gap-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-3">
                                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-zinc-900">
                                  <SmartImage src={item.image} alt={item.name} className="w-full h-full object-cover" preset="thumb" />
                                </div>
                                <div className="flex-1">
                                  <h5 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 line-clamp-2 mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>{item.name}</h5>
                                  <p className="text-xs text-gray-500 dark:text-zinc-400 font-medium" style={{ fontFamily: "'Poppins', sans-serif" }}>Qty: {item.quantity}</p>
                                </div>
                              </div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Dropdown Toggle Button */}
                      <button
                        onClick={() => setShowAllItems(!showAllItems)}
                        className="w-full flex items-center justify-center gap-2 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <span className="text-sm font-medium" style={{ fontFamily: "'Poppins', sans-serif" }}>
                          {showAllItems ? 'Show Less' : `+ ${orderedItems.length - 1} more item${orderedItems.length > 2 ? 's' : ''}`}
                        </span>
                        <ChevronDown className={`w-4 h-4 transition-transform ${showAllItems ? 'rotate-180' : ''}`} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Buttons */}
            <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 p-4 flex gap-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
              <Button
                onClick={() => {
                  navigate(`/account/orders/${firestoreOrderId ?? orderId}`);
                }}
                variant="outline"
                className="flex-1 h-12 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-zinc-100 font-semibold text-sm rounded-lg"
                style={{ fontFamily: "'Poppins', sans-serif" }}
              >
                TRACK ORDER
              </Button>
              <Button
                onClick={() => {
                  if (lastOrderedProductId) {
                    navigate(`/product/${lastOrderedProductId}`);
                  } else {
                    navigate('/');
                  }
                }}
                className="flex-1 h-12 bg-transparent hover:bg-green-50 active:bg-green-100 text-green-600 font-semibold text-sm rounded-lg border-2 border-green-500 transition-all hover:scale-105 active:scale-95"
                style={{ fontFamily: "'Poppins', sans-serif" }}
              >
                DONE
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Checkout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  void location; // location kept for future use
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  };
  const { user, userProfile } = useAuth();
  const { items, unavailable, subtotal, clearCart, updateCartPrice, updateQuantity, removeFromCart, closeCart, loading: cartLoading } = useCart();
  const { toast } = useToast();
  const { toggleWishlist } = useWishlist();
  const [couponCode, setCouponCode] = useState('');
  const [showOffers, setShowOffers] = useState(false);
  const [showAllOffers, setShowAllOffers] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [showAddressSelector, setShowAddressSelector] = useState(false);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [tempSelectedAddress, setTempSelectedAddress] = useState<Address | null>(null);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('Razorpay');
  const [showOrderSuccess, setShowOrderSuccess] = useState(false);
  const [showOrderAnimation, setShowOrderAnimation] = useState(false);
  const [orderId] = useState(() => generateOrderNumber());
  const [firestoreOrderId, setFirestoreOrderId] = useState<string | null>(null);
  const [lastOrderedProductId, setLastOrderedProductId] = useState<string | null>(null);
  const [showAllItems, setShowAllItems] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const cartWasPopulatedRef = useRef(false);
  
  // Form state
  const [formData, setFormData] = useState<AddressFormData>({
    fullName: '',
    phoneNumber: '',
    pinCode: '',
    locality: '',
    address: '',
    city: '',
    state: '',
    isDefault: false,
  });

  // Track if cart was ever populated (to distinguish empty-on-arrival vs emptied-after-order)
  useEffect(() => {
    if (items.length > 0) cartWasPopulatedRef.current = true;
  }, [items]);

  // Redirect to home only when cart was populated then emptied (e.g. after order placed)
  // Skip when isMobile — MobileCheckout has its own nav guard with step-awareness
  useEffect(() => {
    if (!isMobile && !cartLoading && items.length === 0 && cartWasPopulatedRef.current && !showOrderSuccess) {
      navigate('/', { replace: true });
    }
  }, [items, cartLoading, showOrderSuccess, isMobile]);

  // Load addresses
  const loadAddresses = async () => {
    if (user) {
      try {
        const userAddresses = await getUserAddresses(user.uid);
        setAddresses(userAddresses);
        
        // Set default address or first address
        const defaultAddr = userAddresses.find(addr => addr.isDefault) || userAddresses[0];
        setSelectedAddress(defaultAddr || null);
        setTempSelectedAddress(defaultAddr || null);
      } catch (error) {
        console.error('Error loading addresses:', error);
      }
    }
  };
  
  useEffect(() => {
    loadAddresses();
  }, [user]);
  
  // Handle form input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  
  // Handle form submission
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validation
    if (!formData.fullName || !formData.phoneNumber || !formData.pinCode || 
        !formData.address || !formData.city || !formData.state) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      setFormLoading(true);

      // Add new address
      await addAddress(user.uid, formData);
      toast({
        title: 'Success',
        description: '✓ Address added successfully',
      });

      // Reset form and reload addresses
      setFormData({
        fullName: '',
        phoneNumber: '',
        pinCode: '',
        locality: '',
        address: '',
        city: '',
        state: '',
        isDefault: false,
      });
      setShowAddressForm(false);
      await loadAddresses();
    } catch (error) {
      console.error('Error saving address:', error);
      toast({
        title: 'Error',
        description: 'Failed to save address',
        variant: 'destructive',
      });
    } finally {
      setFormLoading(false);
    }
  };
  
  // Handle opening address selector
  const handleOpenAddressSelector = () => {
    setTempSelectedAddress(selectedAddress);
    if (addresses.length === 0) {
      setShowAddressForm(true);
    }
    setShowAddressSelector(true);
  };
  
  // Handle closing address selector
  const handleCloseAddressSelector = () => {
    setShowAddressSelector(false);
    setShowAddressForm(false);
    setTempSelectedAddress(null);
  };
  
  // Handle delivering to selected address
  const handleDeliverHere = () => {
    if (tempSelectedAddress) {
      setSelectedAddress(tempSelectedAddress);
    }
    handleCloseAddressSelector();
  };

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Format price in Indian Rupees
  const formatPrice = (price: number) => {
    return `₹ ${price.toFixed(2)}`;
  };

  // Admin-driven pricing (must be called before any conditional returns — Rules of Hooks)
  const pricing = useCheckoutPricing(subtotal, items.length === 0, selectedPaymentMethod, {
    productIds: items.map((i) => i.id),
    destinationState: selectedAddress?.state,
    // Needed for category-restricted coupons and for `perUserLimit` /
    // `firstOrderOnly`, which the admin panel stores but nothing used to check.
    cartCategories: items.map((i) => i.category || '').filter(Boolean),
    userId: user?.uid,
    // Apply the code the customer tapped in the offer ribbon.
    applyRememberedCode: true,
  });
  const deliveryCharge = pricing.deliveryCharge;
  const taxAmount = pricing.gstAmount;
  const gstLabel = `GST (${pricing.gst.rate}%${pricing.gst.inclusive ? ' included' : ''})`;
  const discount = pricing.discount;
  const desktopTotal = pricing.total;

  // Defensive guard — must come AFTER all hooks (Rules of Hooks)
  if (!user) return <Navigate to="/login" state={{ from: { pathname: '/checkout' } }} replace />;

  // Render mobile checkout if on small screen
  if (isMobile) {
    return <MobileCheckout />;
  }

  // Handle order placement
  const handlePlaceOrder = async () => {
    if (!user || !selectedAddress) {
      toast({
        title: 'Error',
        description: 'Please add a delivery address',
        variant: 'destructive',
      });
      return;
    }

    if (items.length === 0) {
      toast({
        title: 'Error',
        description: 'Your cart is empty',
        variant: 'destructive',
      });
      return;
    }

    setIsPlacingOrder(true);

    try {
      // Convert cart items to order items
      const orderItems: OrderItem[] = items.map(item => ({
        productId: item.id,
        name: item.name,
        image: item.image,
        price: item.price,
        quantity: item.quantity,
      }));

      // ── Re-check the cart against live data BEFORE charging anyone ──
      // Stock used to be validated only inside createOrder, which runs *after*
      // Razorpay has captured the money - so buying the last piece of something
      // could charge the customer and then leave them with no order at all.
      // Price drift had the same shape: it surfaced as a bare
      // "Order total mismatch" at the payment step. Both are now caught here,
      // before the modal opens, and explained in plain words.
      const preflight = await preflightCart(
        items.map((i) => ({ productId: i.id, name: i.name, quantity: i.quantity, price: i.price })),
      );
      if (preflight.blockers.length > 0) {
        toast({
          title: 'Please update your cart',
          description: preflight.blockers.map((b) => b.blocker).join(' '),
          variant: 'destructive',
        });
        setIsPlacingOrder(false);
        return;
      }
      if (preflight.repriced.length > 0) {
        // Bring the cart in line with the live catalogue and let the customer
        // look at the new total before we take payment.
        for (const line of preflight.repriced) updateCartPrice(line.productId, line.livePrice);
        toast({
          title: 'Prices have changed',
          description: `${preflight.repriced.map((l) => l.name).join(', ')} ${preflight.repriced.length === 1 ? 'is' : 'are'} now priced differently. Your total has been updated - please review it and pay again.`,
        });
        setIsPlacingOrder(false);
        return;
      }

      // ── Geocode the address BEFORE payment ──
      // This calls a third-party service that can be slow or down. Running it
      // after the charge would leave a captured payment waiting on it; running
      // it here costs nothing if the customer then abandons the modal.
      const geo = await geocodeShippingAddress(selectedAddress);

      // ── Collect online payment ──
      // Opens Razorpay Standard Checkout and waits for a server-verified payment.
      // The order is only written to Firestore AFTER the signature is verified,
      // so cancelled/failed payments never create an order. Throws
      // PaymentCancelledError on dismiss (handled in catch below).
      let verifiedPayment: VerifiedPayment | null = null;
      {
        verifiedPayment = await payWithRazorpay({
          // `amount` is a cross-check only; /api/create-order re-prices these
          // line items from Firestore and refuses to charge a mismatched total.
          amount: total,
          lineItems: items.map((i) => ({ productId: i.id, quantity: i.quantity })),
          paymentMethod: selectedPaymentMethod,
          shippingState: selectedAddress.state,
          couponCode: pricing.appliedCoupon?.code,
          receipt: orderId,
          name: 'Sreerasthu Silvers',
          description: `Order ${orderId}`,
          prefill: {
            name: userProfile?.username || user.displayName || selectedAddress.fullName,
            email: user.email || '',
            contact:
              userProfile?.whatsappNumber ||
              userProfile?.phone ||
              selectedAddress.phoneNumber ||
              '',
          },
          notes: { orderNumber: orderId, userId: user.uid },
        });
      }


      // Prepare order data
      const orderData: OrderFormData = {
        orderId: orderId,
        userId: user.uid,
        userEmail: user.email || '',
        userName: userProfile?.username || user.displayName || 'Guest',
        userPhone: userProfile?.whatsappNumber || userProfile?.phone || '',
        items: orderItems,
        subtotal: subtotal,
        deliveryCharge: deliveryCharge,
        taxAmount: taxAmount,
        discount: discount,
        total: total,
        ...(pricing.appliedCoupon ? {
          couponCode: pricing.appliedCoupon.code,
          couponId: pricing.appliedCoupon.id,
          couponDescription: pricing.appliedCoupon.description || '',
          couponType: pricing.appliedCoupon.type,
          couponValue: pricing.appliedCoupon.value,
          couponDiscount: pricing.discount,
        } : {}),
        gstRate: pricing.gst.rate,
        gstInclusive: !!pricing.gst.inclusive,
        shippingAddress: {
          fullName: selectedAddress.fullName,
          mobile: selectedAddress.phoneNumber,
          pincode: selectedAddress.pinCode,
          address: selectedAddress.address,
          locality: selectedAddress.locality || '',
          city: selectedAddress.city,
          state: selectedAddress.state,
          landmark: '',
          alternativePhone: '',
          addressType: 'home',
          ...(geo ? { latitude: geo.latitude, longitude: geo.longitude } : {}),
        },
        paymentMethod: selectedPaymentMethod,
        ...(verifiedPayment ? {
          razorpayPaymentId: verifiedPayment.razorpayPaymentId,
          razorpayOrderId: verifiedPayment.razorpayOrderId,
          razorpaySignature: verifiedPayment.razorpaySignature,
        } : {}),
        status: 'pending',
      };

      // Create order in Firestore.
      // The payment is already captured at this point, so createPaidOrder falls
      // back to a flagged order rather than throwing - a customer must never be
      // charged and left without a record of it.
      const created = await createPaidOrder(orderData);
      const docId = created.id;
      setFirestoreOrderId(docId);
      if (created.needsReview) {
        toast({
          title: 'Order received - needs a quick check',
          description: 'Your payment went through and we have your order. Our team will confirm it shortly.',
        });
      }

      // Capture first product id BEFORE clearing the cart so DONE can return to it
      setLastOrderedProductId(items[0]?.id || null);

      // Clear cart
      clearCart();

      // Close payment modal and show success
      setShowPaymentDetails(false);
      setShowOrderSuccess(true);
      setShowOrderAnimation(true);
      setTimeout(() => setShowOrderAnimation(false), 2800);
    } catch (error) {
      console.error('Error placing order:', error);
      if (error instanceof PaymentCancelledError) {
        toast({
          title: 'Payment cancelled',
          description: 'You closed the payment window. Your order was not placed.',
        });
      } else {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to place order. Please try again.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsPlacingOrder(false);
    }
  };
  const total = pricing.total;

  const offers = pricing.redeemableCoupons;
  const visibleOffers = showAllOffers ? offers : offers.slice(0, 2);

  const donationAmounts: number[] = [];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 py-8 max-w-6xl" style={{ fontFamily: "'Poppins', sans-serif" }}>
        {/* Back Button */}
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
          style={{ fontFamily: "'Poppins', sans-serif" }}
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Cart</span>
        </button>

        {/* Secure badge */}
        <div className="flex items-center justify-end mb-8" style={{ fontFamily: "'Poppins', sans-serif" }}>
          <div className="flex items-center gap-2 text-sm">
            <Shield className="w-4 h-4 text-green-600" />
            <span className="font-medium text-green-600">100% SECURE</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column - Address & Offers */}
          <div className="lg:col-span-2 space-y-6">
            {/* Delivery Address */}
            <div className="bg-card border border-border rounded-lg p-6">
              {selectedAddress ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold" style={{ fontFamily: "'Poppins', sans-serif" }}>
                      Deliver to: {selectedAddress.fullName}, {selectedAddress.pinCode}
                    </h2>
                    <Button
                      variant="outline"
                      onClick={handleOpenAddressSelector}
                      className="text-yellow-600 border-yellow-600 hover:bg-yellow-50 font-semibold uppercase"
                      style={{ fontFamily: "'Poppins', sans-serif" }}
                    >
                      CHANGE ADDRESS
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1" style={{ fontFamily: "'Poppins', sans-serif" }}>
                    {selectedAddress.address}
                    {selectedAddress.locality && `, ${selectedAddress.locality}`}
                    <br />
                    {selectedAddress.city}, {selectedAddress.state}
                    <br />
                    Phone: {selectedAddress.phoneNumber}
                  </p>
                </>
              ) : (
                <div className="text-center py-8">
                  <MapPin className="w-12 h-12 text-gray-400 dark:text-zinc-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-zinc-100 mb-2">No Address Saved</h3>
                  <p className="text-gray-600 dark:text-zinc-400 mb-4">Add a delivery address to continue</p>
                  <Button
                    onClick={handleOpenAddressSelector}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    Add New Address
                  </Button>
                </div>
              )}
            </div>

            {/* Address Selector Modal for Desktop */}
            <AnimatePresence>
              {showAddressSelector && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={handleCloseAddressSelector}
                    className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center"
                  >
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden mx-4"
                      style={{ fontFamily: "'Poppins', sans-serif" }}
                    >
                    {/* Header */}
                    <div className="p-6 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between">
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">Select Delivery Address</h3>
                      <button
                        onClick={handleCloseAddressSelector}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
                      >
                        <X className="w-6 h-6 text-gray-600 dark:text-zinc-400" />
                      </button>
                    </div>
                    
                    {/* Content */}
                    <div className="overflow-y-auto max-h-[calc(85vh-180px)] p-6">
                      {showAddressForm || addresses.length === 0 ? (
                        /* Address Form */
                        <form onSubmit={handleFormSubmit} className="space-y-5">
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                            <p className="text-sm text-blue-900 font-medium">
                              ℹ️ Add a new delivery address for your order
                            </p>
                          </div>
                          
                          {/* Full Name */}
                          <div>
                            <Label htmlFor="fullName" className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2 block">
                              Full Name *
                            </Label>
                            <Input
                              id="fullName"
                              name="fullName"
                              value={formData.fullName}
                              onChange={handleInputChange}
                              placeholder="Enter your full name"
                              className="h-11 border-gray-300 dark:border-zinc-700 focus:border-blue-500 focus:ring-blue-500"
                              required
                            />
                          </div>

                          {/* Phone Number */}
                          <div>
                            <Label htmlFor="phoneNumber" className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2 block">
                              Phone Number *
                            </Label>
                            <Input
                              id="phoneNumber"
                              name="phoneNumber"
                              type="tel"
                              value={formData.phoneNumber}
                              onChange={handleInputChange}
                              placeholder="10-digit mobile number"
                              className="h-11 border-gray-300 dark:border-zinc-700 focus:border-blue-500 focus:ring-blue-500"
                              maxLength={10}
                              required
                            />
                          </div>

                          {/* Pin Code & Locality */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="pinCode" className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2 block">
                                Pin Code *
                              </Label>
                              <Input
                                id="pinCode"
                                name="pinCode"
                                value={formData.pinCode}
                                onChange={handleInputChange}
                                placeholder="6-digit PIN"
                                maxLength={6}
                                className="h-11 border-gray-300 dark:border-zinc-700 focus:border-blue-500 focus:ring-blue-500"
                                required
                              />
                            </div>
                            <div>
                              <Label htmlFor="locality" className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2 block">
                                Locality
                              </Label>
                              <Input
                                id="locality"
                                name="locality"
                                value={formData.locality}
                                onChange={handleInputChange}
                                placeholder="Area/Locality"
                                className="h-11 border-gray-300 dark:border-zinc-700 focus:border-blue-500 focus:ring-blue-500"
                              />
                            </div>
                          </div>

                          {/* Address */}
                          <div>
                            <Label htmlFor="address" className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2 block">
                              Address (Area and Street) *
                            </Label>
                            <Input
                              id="address"
                              name="address"
                              value={formData.address}
                              onChange={handleInputChange}
                              placeholder="House No., Building, Street"
                              className="h-11 border-gray-300 dark:border-zinc-700 focus:border-blue-500 focus:ring-blue-500"
                              required
                            />
                          </div>

                          {/* City & State */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label htmlFor="city" className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2 block">
                                City *
                              </Label>
                              <Input
                                id="city"
                                name="city"
                                value={formData.city}
                                onChange={handleInputChange}
                                placeholder="City"
                                className="h-11 border-gray-300 dark:border-zinc-700 focus:border-blue-500 focus:ring-blue-500"
                                required
                              />
                            </div>
                            <div>
                              <Label htmlFor="state" className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2 block">
                                State *
                              </Label>
                              <Input
                                id="state"
                                name="state"
                                value={formData.state}
                                onChange={handleInputChange}
                                placeholder="State"
                                className="h-11 border-gray-300 dark:border-zinc-700 focus:border-blue-500 focus:ring-blue-500"
                                required
                              />
                            </div>
                          </div>

                          {/* Set as Default */}
                          <div className="flex items-center space-x-3 pt-2">
                            <input
                              type="checkbox"
                              id="isDefault"
                              checked={formData.isDefault}
                              onChange={(e) =>
                                setFormData((prev) => ({ ...prev, isDefault: e.target.checked }))
                              }
                              className="w-5 h-5 text-blue-600 border-gray-300 dark:border-zinc-700 rounded focus:ring-blue-500"
                            />
                            <Label htmlFor="isDefault" className="text-sm font-medium text-gray-700 dark:text-zinc-300 cursor-pointer">
                              Set as default shipping address
                            </Label>
                          </div>
                          
                          {addresses.length > 0 && (
                            <Button
                              type="button"
                              variant="link"
                              onClick={() => setShowAddressForm(false)}
                              className="text-blue-600 p-0 h-auto"
                            >
                              ← Back to saved addresses
                            </Button>
                          )}
                        </form>
                      ) : (
                        /* Saved Addresses List */
                        <div className="space-y-1">
                          <div className="mb-4">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-3">Saved Addresses</h4>
                          </div>
                          
                          {addresses.map((address) => (
                            <label
                              key={address.id}
                              className={`block p-4 rounded-xl border-2 cursor-pointer transition-all mb-3 ${
                                tempSelectedAddress?.id === address.id
                                  ? 'border-blue-500 bg-blue-50'
                                  : 'border-gray-200 hover:border-gray-300 bg-white'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                {/* Radio Button */}
                                <input
                                  type="radio"
                                  name="selectedAddress"
                                  checked={tempSelectedAddress?.id === address.id}
                                  onChange={() => setTempSelectedAddress(address)}
                                  className="mt-1 w-5 h-5 text-blue-600 border-gray-300 dark:border-zinc-700 focus:ring-blue-500"
                                />
                                
                                {/* Address Details */}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-bold text-gray-900 dark:text-zinc-100 uppercase text-sm">
                                      {address.fullName}
                                    </span>
                                    {address.isDefault && (
                                      <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded uppercase">
                                        Home
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-600 dark:text-zinc-400 mb-1">{address.phoneNumber}</p>
                                  <p className="text-sm text-gray-700 dark:text-zinc-300 leading-relaxed">
                                    {address.address}
                                    {address.locality && `, ${address.locality}`}, {address.city}, {address.state} - {address.pinCode}
                                  </p>
                                </div>
                              </div>
                            </label>
                          ))}
                          
                          {/* Add New Address Button */}
                          <button
                            type="button"
                            onClick={() => setShowAddressForm(true)}
                            className="w-full mt-4 p-4 border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-xl text-blue-600 font-semibold hover:border-blue-400 hover:bg-blue-50 transition-colors"
                          >
                            + Add New Address
                          </button>
                        </div>
                      )}
                    </div>
                    
                    {/* Footer Buttons */}
                    <div className="p-6 border-t border-gray-200 dark:border-zinc-800 flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCloseAddressSelector}
                        className="flex-1 h-12 text-base font-semibold border-gray-300 dark:border-zinc-700"
                      >
                        Cancel
                      </Button>
                      {showAddressForm || addresses.length === 0 ? (
                        <Button
                          type="button"
                          onClick={handleFormSubmit}
                          disabled={formLoading}
                          className="flex-1 h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {formLoading ? (
                            <>
                              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            'Save & Deliver Here'
                          )}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={handleDeliverHere}
                          disabled={!tempSelectedAddress}
                          className="flex-1 h-12 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Deliver Here
                        </Button>
                      )}
                    </div>
                    </motion.div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {/* Available Offers */}
            {pricing.redeemableCoupons.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-6">
              <button
                onClick={() => setShowOffers(!showOffers)}
                className="flex items-center justify-between w-full mb-4"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                    <Tag className="w-4 h-4" />
                  </div>
                  <h2 className="text-lg font-semibold" style={{ fontFamily: "'Poppins', sans-serif" }}>Available Offers</h2>
                </div>
                <ChevronDown
                  className={`w-5 h-5 transition-transform ${showOffers ? 'rotate-180' : ''}`}
                />
              </button>

              {showOffers && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-3"
                >
                  {visibleOffers.map((c) => {
                    const value = c.type === 'percent' ? `${c.value}% OFF` : `₹${c.value} OFF`;
                    const min = c.minOrderValue ? ` on orders above ₹${c.minOrderValue.toLocaleString('en-IN')}` : '';
                    const isApplied = pricing.appliedCoupon?.code === c.code;
                    return (
                      <div key={c.id} className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-green-300 dark:border-green-800 bg-green-50/60 dark:bg-green-900/15 p-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-green-700 dark:text-green-400 tracking-wide">{c.code}</span>
                            <span className="text-xs font-bold text-green-600 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-full">{value}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{c.description || `Save ${value.toLowerCase()}`}{min}</p>
                        </div>
                        <button
                          onClick={() => { if (!isApplied) pricing.applyCoupon(c.code); }}
                          disabled={isApplied || pricing.couponLoading}
                          className={`flex-shrink-0 h-9 px-4 rounded-lg text-sm font-bold transition-colors ${isApplied ? 'bg-green-600 text-white' : 'bg-foreground text-background hover:opacity-90'}`}
                        >
                          {isApplied ? '✓ Applied' : pricing.couponLoading ? 'Checking…' : 'APPLY'}
                        </button>
                      </div>
                    );
                  })}
                  {offers.length > 2 && (
                    <Button
                      variant="link"
                      className="text-primary p-0 h-auto font-semibold"
                      style={{ fontFamily: "'Poppins', sans-serif" }}
                      onClick={() => setShowAllOffers((prev) => !prev)}
                    >
                      {showAllOffers ? 'Show Less' : `Show ${offers.length - 2} More`}
                    </Button>
                  )}
                </motion.div>
              )}
            </div>
            )}

            {/* Cart Items */}
            <div className="bg-card border border-border rounded-lg p-6">
              {items.some((i) => unavailable[i.id]) && (
                <div className="mb-4">
                  <UnavailableItemsNotice items={items} unavailable={unavailable} onRemove={removeFromCart} />
                </div>
              )}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  {items.length}/{items.length} ITEMS SELECTED
                </h2>
                <div className="flex gap-4" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  {/*
                    Both of these empty the WHOLE cart. They used to do it on a
                    single click with no confirmation, so one mis-click on the
                    way to paying wiped everything the customer had chosen.
                  */}
                  <button
                    onClick={() => {
                      if (!window.confirm(`Remove all ${items.length} item${items.length === 1 ? '' : 's'} from your cart?`)) return;
                      items.forEach(item => removeFromCart(item.id));
                    }}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    REMOVE
                  </button>
                  <button
                    onClick={() => {
                      if (!window.confirm(`Move all ${items.length} item${items.length === 1 ? '' : 's'} to your wishlist and empty the cart?`)) return;
                      items.forEach(item => {
                        toggleWishlist(item.id, item.name);
                        removeFromCart(item.id);
                      });
                    }}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    MOVE TO WISHLIST
                  </button>
                </div>
              </div>

              <div className="space-y-6">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-4">
                    <div className="w-24 h-24 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                      <SmartImage
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover" preset="thumb" />
                    </div>
                    <div className="flex-1" style={{ fontFamily: "'Poppins', sans-serif" }}>
                      <h3 className="font-medium mb-1">{item.name}</h3>
                      <UnavailableTag reason={unavailable[item.id]} />
                      {item.category && (
                        <p className="text-sm text-muted-foreground mb-2">
                          Sold by: Sreerasthu Silvers
                        </p>
                      )}
                      <div className="flex items-center gap-3">
                        <span className="font-semibold">{formatPrice(item.price)}</span>
                        {item.originalPrice && item.originalPrice > item.price && (
                          <>
                            <span className="text-sm text-muted-foreground line-through">
                              {formatPrice(item.originalPrice)}
                            </span>
                            <span className="text-sm text-green-600 font-medium">
                              {Math.round((1 - item.price / item.originalPrice) * 100)}% OFF
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {/*
                          Real controls, matching the cart drawer.
                          
                          This was a <select> with a single option and no remove
                          button, so the only way to change your mind at checkout
                          was to navigate back to the cart - and the one visible
                          "REMOVE" control emptied the entire basket. Changing a
                          quantity to zero removes just that line, as it does
                          everywhere else in the app.
                        */}
                        <div className="flex items-center h-8 rounded-full border border-border bg-muted/50">
                          <button
                            type="button"
                            onClick={() => {
                              if (item.quantity === 1) removeFromCart(item.id);
                              else updateQuantity(item.id, item.quantity - 1);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-l-full hover:bg-muted transition-colors"
                            aria-label={item.quantity === 1 ? `Remove ${item.name}` : `Decrease quantity of ${item.name}`}
                          >
                            <Minus className="w-3 h-3 text-muted-foreground" />
                          </button>
                          <span className="w-8 text-center text-xs font-semibold select-none">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            disabled={typeof item.stock === 'number' && item.quantity >= item.stock}
                            className="w-8 h-8 flex items-center justify-center rounded-r-full hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label={`Increase quantity of ${item.name}`}
                          >
                            <Plus className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive transition-colors"
                          aria-label={`Remove ${item.name} from cart`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                        {/*
                          Real stock, and only when it is genuinely low. This
                          used to be the literal string "1 left" on every line,
                          so a product with 40 in stock still told the customer
                          it was the last one.
                        */}
                        {typeof item.stock === 'number' && item.stock > 0 && item.stock <= 5 && (
                          <span className="text-sm text-amber-600">
                            {item.stock === 1 ? 'Last one left' : `Only ${item.stock} left`}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-sm">
                        <div className="flex items-center gap-1">
                          <svg className="w-4 h-4 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                          </svg>
                          <span className="text-muted-foreground">7 days</span>
                        </div>
                        <span className="text-muted-foreground">return available</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Coupons & Price Details */}
          <div className="space-y-6">
            {/* Coupons */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <Tag className="w-5 h-5" />
                <h3 className="font-semibold" style={{ fontFamily: "'Poppins', sans-serif" }}>Apply Coupons</h3>
              </div>
              {pricing.appliedCoupon ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
                  <div>
                    <div className="font-mono font-semibold text-green-700">{pricing.appliedCoupon.code}</div>
                    <div className="text-xs text-green-700">You saved {formatPrice(pricing.discount)}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { pricing.removeCoupon(); setCouponCode(''); }}>Remove</Button>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter coupon code"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      className="flex-1 font-mono"
                      style={{ fontFamily: "'Poppins', sans-serif" }}
                    />
                    <Button
                      variant="outline"
                      className="text-primary border-primary min-w-[104px]"
                      style={{ fontFamily: "'Poppins', sans-serif" }}
                      disabled={pricing.couponLoading || !couponCode.trim()}
                      onClick={async () => {
                        const r = await pricing.applyCoupon(couponCode);
                        if (r.ok) {
                          toast({ title: 'Coupon applied', description: `Saved ${formatPrice(pricing.discount)}` });
                        } else {
                          toast({ title: 'Coupon failed', description: r.reason || 'Invalid coupon', variant: 'destructive' });
                        }
                      }}
                    >
                      {pricing.couponLoading ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Checking…
                        </>
                      ) : (
                        'APPLY'
                      )}
                    </Button>
                  </div>
                  {pricing.couponError && (
                    <p className="mt-2 text-xs text-red-600">{pricing.couponError}</p>
                  )}
                </>
              )}
            </div>

            {/* Price Details */}
            <div className="bg-card border border-border rounded-lg p-6 sticky top-4">
              <h3 className="font-semibold mb-4" style={{ fontFamily: "'Poppins', sans-serif" }}>PRICE DETAILS ({items.length} Item{items.length > 1 ? 's' : ''})</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total MRP</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span className={deliveryCharge === 0 ? 'text-green-600' : ''}>
                    {deliveryCharge === 0 ? (
                      <span className="flex items-center gap-1">
                        {/* Strike through the real configured charge, not a
                            hardcoded figure - delivery is admin-managed now. */}
                        {pricing.deliveryBeforeFree > 0 && (
                          <span className="line-through text-muted-foreground">
                            {formatPrice(pricing.deliveryBeforeFree)}
                          </span>
                        )}
                        <span className="font-medium">FREE</span>
                      </span>
                    ) : (
                      formatPrice(deliveryCharge)
                    )}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{gstLabel}</span>
                  <span>{formatPrice(taxAmount)}</span>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Coupon Discount</span>
                    <span className="text-green-600">- {formatPrice(discount)}</span>
                  </div>
                )}

                {pricing.freeDelivery && pricing.deliveryBeforeFree > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                    🎉 You're saving {formatPrice(pricing.deliveryBeforeFree)} on delivery!
                  </div>
                )}

                <Separator />

                <div className="flex justify-between text-base font-semibold">
                  <span>Total Amount</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>

              <Button
                className="w-full mt-6 bg-foreground text-background hover:bg-foreground/90 py-6 text-base font-semibold rounded-md"
                style={{ fontFamily: "'Poppins', sans-serif" }}
                onClick={() => {
                  if (!selectedAddress) {
                    toast({
                      title: 'Address Required',
                      description: 'Please add a delivery address to continue',
                      variant: 'destructive',
                    });
                    return;
                  }
                  setShowPaymentDetails(true);
                }}
              >
                PLACE ORDER
              </Button>

              {/* Trust Badges */}
              <div className="mt-4 pt-4 border-t border-border" style={{ fontFamily: "'Poppins', sans-serif" }}>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Shield className="w-4 h-4 text-green-600" />
                  <span>100% Secure Checkout</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>7-Day Easy Returns</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Payment Details Modal (Desktop) ─── */}
      <AnimatePresence>
        {showPaymentDetails && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPaymentDetails(false)}
              className="fixed inset-0 bg-black/55 backdrop-blur-[4px] z-[80]"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-0 z-[90] flex items-center justify-center p-8"
            >
              <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-zinc-950 shadow-[0_40px_120px_-50px_rgba(0,0,0,0.8)] ring-1 ring-black/5 dark:ring-white/10" style={{ fontFamily: "'Poppins', sans-serif" }}>
                {/* Header */}
                <div className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-950/95 backdrop-blur border-b border-gray-100 dark:border-zinc-800 px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100">Complete your order</h2>
                      <p className="text-xs text-gray-500 dark:text-zinc-400 flex items-center gap-1 mt-0.5">
                        <Shield className="w-3 h-3 text-green-600" /> 100% secure & encrypted
                      </p>
                    </div>
                    <button
                      onClick={() => setShowPaymentDetails(false)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-500 dark:text-zinc-400" />
                    </button>
                  </div>
                </div>

                <div className="px-6 py-5 space-y-5">
                  {/* Items */}
                  <div className="space-y-2.5">
                    {items.slice(0, showAllItems ? items.length : 2).map((item) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-zinc-900 ring-1 ring-gray-100 dark:ring-zinc-800">
                          <SmartImage src={item.image} alt={item.name} className="w-full h-full object-cover" preset="thumb" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">{item.name}</h4>
                          <p className="text-xs text-gray-500 dark:text-zinc-400">Qty: {item.quantity}</p>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100 whitespace-nowrap">{formatPrice(item.price * item.quantity)}</span>
                      </div>
                    ))}
                    {items.length > 2 && (
                      <button
                        onClick={() => setShowAllItems((v) => !v)}
                        className="text-xs font-semibold text-[#832729] dark:text-amber-400 hover:underline"
                      >
                        {showAllItems ? 'Show less' : `+ ${items.length - 2} more item${items.length > 3 ? 's' : ''}`}
                      </button>
                    )}
                  </div>

                  <Separator />

                  {/* Payment Method */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-zinc-400 mb-2.5">Payment Method</h3>
                    <div className="space-y-2.5">
                      {/* Razorpay */}
                      <label className={`flex items-center gap-3 p-3.5 rounded-2xl cursor-pointer transition-all ${selectedPaymentMethod === 'Razorpay' ? 'border-2 border-[#832729] bg-[#832729]/5 dark:bg-amber-400/5 dark:border-amber-400' : 'border border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700'}`}>
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${selectedPaymentMethod === 'Razorpay' ? 'bg-[#832729] dark:bg-amber-400' : 'bg-gray-100 dark:bg-zinc-800'}`}>
                          <CreditCard className={`w-5 h-5 ${selectedPaymentMethod === 'Razorpay' ? 'text-white dark:text-zinc-900' : 'text-gray-600 dark:text-zinc-400'}`} />
                        </div>
                        <div className="flex-1">
                          <span className="block text-sm font-semibold text-gray-900 dark:text-zinc-100">Pay Online</span>
                          <span className="text-xs text-gray-500 dark:text-zinc-400">Cards, UPI, Wallets & Net Banking</span>
                        </div>
                        <input
                          type="radio"
                          name="desktopPaymentMethod"
                          value="Razorpay"
                          checked={selectedPaymentMethod === 'Razorpay'}
                          onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                          className="w-5 h-5 accent-[#832729] dark:accent-amber-400"
                        />
                      </label>
                    </div>
                  </div>

                  <Separator />

                  {/* Price Breakdown */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-zinc-400">Item Total</span>
                      <span className="font-medium text-gray-900 dark:text-zinc-100">{formatPrice(subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-zinc-400">Delivery Fee</span>
                      <span className={`font-medium ${deliveryCharge === 0 ? 'text-green-600' : 'text-gray-900 dark:text-zinc-100'}`}>
                        {deliveryCharge === 0 ? 'FREE' : formatPrice(deliveryCharge)}
                      </span>
                    </div>
                    {discount > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-green-600">Coupon Discount</span>
                        <span className="font-medium text-green-600">− {formatPrice(discount)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-zinc-400">{gstLabel}</span>
                      <span className="font-medium text-gray-900 dark:text-zinc-100">{formatPrice(taxAmount)}</span>
                    </div>
                    <Separator className="my-1" />
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold text-gray-900 dark:text-zinc-100">Total</span>
                      <span className="text-xl font-bold text-gray-900 dark:text-zinc-100">{formatPrice(desktopTotal)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer with CTA */}
                <div className="sticky bottom-0 bg-white/95 dark:bg-zinc-950/95 backdrop-blur border-t border-gray-100 dark:border-zinc-800 px-6 py-4 space-y-2">
                  <Button
                    onClick={handlePlaceOrder}
                    disabled={isPlacingOrder}
                    className="w-full h-12 bg-[#832729] hover:bg-[#6f2123] text-white font-semibold text-sm rounded-xl shadow-lg shadow-[#832729]/25"
                  >
                    {isPlacingOrder ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Processing…
                      </>
                    ) : (
                      <>
                        <Shield className="w-4 h-4 mr-2" />
                        Pay {formatPrice(desktopTotal)} securely
                      </>
                    )}
                  </Button>
                  <button
                    onClick={() => setShowPaymentDetails(false)}
                    disabled={isPlacingOrder}
                    className="w-full text-center text-xs font-medium text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200 disabled:opacity-50 py-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Premium Order Animation Overlay (Desktop) ─── */}
      <AnimatePresence>
        {showOrderAnimation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-[200] bg-black/85 flex flex-col items-center justify-center pointer-events-none overflow-hidden"
          >
            {[...Array(16)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: i % 2 === 0 ? '#d4af37' : '#f5f5f5' }}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  x: (Math.cos((i / 16) * 2 * Math.PI) * (100 + Math.random() * 120)),
                  y: (Math.sin((i / 16) * 2 * Math.PI) * (100 + Math.random() * 120)),
                  scale: [0, 1.8, 0],
                }}
                transition={{ delay: 0.3 + i * 0.05, duration: 1.4 }}
              />
            ))}
            <motion.div
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
              className="w-44 h-44 rounded-full border-[7px] border-amber-400 flex items-center justify-center"
              style={{ boxShadow: '0 0 60px 12px rgba(212,175,55,0.5)' }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring', stiffness: 250, damping: 15 }}
                className="w-32 h-32 rounded-full bg-amber-400 flex items-center justify-center"
              >
                <svg className="w-18 h-18 text-white" style={{ width: 72, height: 72 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <motion.path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.7, duration: 0.5 }}
                  />
                </svg>
              </motion.div>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="text-white text-3xl font-bold mt-8 text-center px-8"
              style={{ fontFamily: "'Poppins', sans-serif", textShadow: '0 2px 16px rgba(212,175,55,0.7)' }}
            >
              Order Placed Successfully!
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
              className="text-amber-300 text-base mt-2 text-center"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              Thank you for your purchase 🎉
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Order Success Modal (Desktop) ─── */}
      <AnimatePresence>
        {showOrderSuccess && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowOrderSuccess(false)}
              className="fixed inset-0 bg-black/50 z-[80]"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-0 z-[90] flex items-center justify-center p-8"
            >
              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ fontFamily: "'Poppins', sans-serif" }}>
                {/* Header */}
                <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-6 py-4 rounded-t-2xl">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-zinc-100">Order Placed</h2>
                    <button
                      onClick={() => setShowOrderSuccess(false)}
                      className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-600 dark:text-zinc-400" />
                    </button>
                  </div>
                </div>

                <div className="px-6 py-8">
                  {/* Success Icon */}
                  <div className="flex justify-center mb-6">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
                      className="w-28 h-28 rounded-full bg-green-100 flex items-center justify-center"
                    >
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ 
                          delay: 0.3,
                          duration: 0.6,
                          ease: 'easeInOut',
                          repeat: Infinity,
                          repeatDelay: 0.5,
                          repeatType: 'loop'
                        }}
                        className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center"
                      >
                        <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <motion.path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={3}
                            d="M5 13l4 4L19 7"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 1 }}
                            transition={{ delay: 0.5, duration: 0.5, ease: 'easeInOut' }}
                          />
                        </svg>
                      </motion.div>
                    </motion.div>
                  </div>

                  {/* Success Message */}
                  <motion.h3
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="text-2xl font-bold text-teal-600 text-center mb-3"
                  >
                    Order Placed Successfully!
                  </motion.h3>
                  <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                    className="text-sm text-gray-600 dark:text-zinc-400 text-center mb-8"
                  >
                    Payment is successfully processed and your Order is on the way.
                  </motion.p>

                  {/* Order Details */}
                  <div className="mb-6">
                    <h4 className="text-lg font-bold text-gray-900 dark:text-zinc-100 mb-3">Order Placed</h4>
                    <div className="bg-gray-50 dark:bg-zinc-900 rounded-lg p-4 space-y-2">
                      <p className="text-sm text-gray-900 dark:text-zinc-100">
                        Your order # is: <span className="font-bold">{orderId}</span>
                      </p>
                      <p className="text-xs text-gray-600 dark:text-zinc-400">
                        Payment is successfully processed and your Order is on the way and this been sent your email ID.
                      </p>
                    </div>
                  </div>

                  {/* Shipping Address */}
                  {selectedAddress && (
                    <div className="mb-6">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2">This order will be shipped to:</h4>
                      <p className="text-sm text-gray-600 dark:text-zinc-400 leading-relaxed">
                        {selectedAddress.address}
                        {selectedAddress.locality && `, ${selectedAddress.locality}`},<br />
                        {selectedAddress.city}, {selectedAddress.state} {selectedAddress.pinCode}
                      </p>
                    </div>
                  )}

                  {/* Payment Method */}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-zinc-300 mb-2">Payment Method</h4>
                    <p className="text-sm text-gray-900 dark:text-zinc-100">{selectedPaymentMethod}</p>
                  </div>

                  {/* Order Summary */}
                  <div className="mb-6">
                    <h4 className="text-lg font-bold text-gray-900 dark:text-zinc-100 mb-3">Order Summary</h4>
                    <div className="space-y-3">
                      {/* First Item */}
                      {items.length > 0 && (
                        <div className="flex gap-4 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
                          <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-zinc-900">
                            <SmartImage src={items[0].image} alt={items[0].name} className="w-full h-full object-cover" preset="thumb" />
                          </div>
                          <div className="flex-1">
                            <h5 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-1">{items[0].name}</h5>
                            <p className="text-xs text-red-600 font-medium">Delivery by: 10 July, 2024</p>
                          </div>
                        </div>
                      )}

                      {/* Toggle for More Items */}
                      {items.length > 1 && (
                        <>
                          <AnimatePresence>
                            {showAllItems && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.3 }}
                                className="space-y-3 overflow-hidden"
                              >
                                {items.slice(1).map((item) => (
                                  <div key={item.id} className="flex gap-4 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
                                    <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-zinc-900">
                                      <SmartImage src={item.image} alt={item.name} className="w-full h-full object-cover" preset="thumb" />
                                    </div>
                                    <div className="flex-1">
                                      <h5 className="text-sm font-semibold text-gray-900 dark:text-zinc-100 mb-1">{item.name}</h5>
                                      <p className="text-xs text-red-600 font-medium">Delivery by: 10 July, 2024</p>
                                    </div>
                                  </div>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Dropdown Toggle Button */}
                          <button
                            onClick={() => setShowAllItems(!showAllItems)}
                            className="w-full flex items-center justify-center gap-2 py-3 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <span className="text-sm font-medium">
                              {showAllItems ? 'Show Less' : `+ ${items.length - 1} more item${items.length > 2 ? 's' : ''}`}
                            </span>
                            <ChevronDown className={`w-4 h-4 transition-transform ${showAllItems ? 'rotate-180' : ''}`} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer with Buttons */}
                <div className="sticky bottom-0 bg-white dark:bg-zinc-900 border-t border-gray-200 dark:border-zinc-800 px-6 py-4 rounded-b-2xl">
                  <div className="flex gap-4">
                    <Button
                      onClick={() => {
                        navigate(`/account/orders/${firestoreOrderId ?? orderId}`);
                      }}
                      variant="outline"
                      className="flex-1 h-12 border-gray-300 dark:border-zinc-700 text-gray-900 dark:text-zinc-100 font-semibold text-sm"
                    >
                      TRACK ORDER
                    </Button>
                    <Button
                      onClick={() => {
                        if (lastOrderedProductId) {
                          navigate(`/product/${lastOrderedProductId}`);
                        } else {
                          navigate('/');
                        }
                      }}
                      className="flex-1 h-12 bg-transparent hover:bg-green-50 active:bg-green-100 text-green-600 font-semibold text-sm border-2 border-green-500 transition-all hover:scale-105 active:scale-95"
                    >
                      DONE
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
};

export default Checkout;
