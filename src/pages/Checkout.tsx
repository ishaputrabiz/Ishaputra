import { useState, useEffect, useRef } from 'react';
import { useNavigate, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, animate, useMotionValue, useTransform, useReducedMotion, PanInfo } from 'framer-motion';
import { toast as sonnerToast } from 'sonner';
import { useCart, type CartItem } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { IconButton } from '@/components/ui/icon-button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileHeader from '@/components/MobileHeader';
import MobileSearchBar from '@/components/MobileSearchBar';
import { ArrowLeft, Tag, ChevronDown, ChevronRight, Plus, Minus, CreditCard, MapPin, Sparkles, ShoppingBag, Truck, X, Trash2, Check, ShieldCheck, RotateCcw } from 'lucide-react';
import { getActiveProductsCached } from '@/services/productCache';
import { adaptFirebaseToUI, UIProduct } from '@/lib/productAdapter';
import { getUserAddresses, getDefaultAddress, Address, addAddress, AddressFormData } from '@/services/addressService';
import { createPaidOrder, preflightCart, generateOrderNumber, OrderFormData, OrderItem } from '@/services/orderService';
import {
  payWithRazorpay,
  PaymentCancelledError,
  RewardsChangedError,
  RewardsUnavailableError,
  type VerifiedPayment,
} from '@/services/razorpayService';
import { useRewards } from '@/hooks/useRewards';
import { reconcileOrderRewards } from '@/services/rewardsService';
import { RewardsRedeemCard, RewardsBillLines } from '@/components/checkout/RewardsRedeemCard';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { useWishlist } from '@/hooks/useWishlist';
import { useCheckoutPricing } from '@/hooks/useCheckoutPricing';
import { SmartImage } from "@/components/ui/smart-image";
import { formatINR, plural } from '@/lib/format';
import { DUR, EASE_DRAWER, EASE_OUT } from '@/lib/motion';

const HEADING_FONT = { fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" } as const;

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
    <Notice
      tone="warning"
      title={`${plural(affected.length, 'item')} in your cart can no longer be ordered`}
      action={
        <button
          type="button"
          onClick={() => affected.forEach((i) => onRemove(i.id))}
          className="btn-copper h-9 !px-4 !text-[10px]"
        >
          Remove {affected.length === 1 ? 'it' : `all ${affected.length}`}
        </button>
      }
    >
      <span className="text-xs">Remove {affected.length === 1 ? 'it' : 'them'} to continue to payment.</span>
    </Notice>
  );
};

/** Small tag on a cart line that cannot be bought any more. */
const UnavailableTag = ({ reason }: { reason?: string }) =>
  reason ? (
    <span className="mt-1 inline-flex items-center rounded-chip border border-status-warning-line bg-status-warning-bg px-2 py-0.5 text-[11px] font-semibold text-status-warning-fg">
      {reason}
    </span>
  ) : null;

/**
 * Slide the copper thumb to confirm. The thumb is a real button: Enter or Space
 * confirms exactly like a completed drag. Under reduced motion it becomes a
 * plain copper button that calls the same onComplete.
 */
const SlideToPayButton = ({ amount, onComplete }: { amount: string; onComplete: () => void }) => {
  const constraintsRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [sliderWidth, setSliderWidth] = useState(0);
  const [completed, setCompleted] = useState(false);
  const doneRef = useRef(false);
  const reduceMotion = useReducedMotion();
  const isPlaceOrder = amount === 'Place Order';
  const busyLabel = isPlaceOrder ? 'Placing order' : 'Processing';

  useEffect(() => {
    if (constraintsRef.current) {
      setSliderWidth(constraintsRef.current.offsetWidth - 56);
    }
  }, []);

  const textOpacity = useTransform(x, [0, sliderWidth * 0.3], [1, 0]);
  const checkOpacity = useTransform(x, [sliderWidth * 0.7, sliderWidth], [0, 1]);

  const complete = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setCompleted(true);
    onComplete();
  };

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x > sliderWidth * 0.7) {
      complete();
    } else {
      animate(x, 0, { duration: DUR.modal, ease: EASE_OUT });
    }
  };

  if (reduceMotion) {
    return (
      <button type="button" onClick={complete} disabled={completed} className="btn-copper h-14 w-full !text-[12px]">
        {completed ? (
          <>
            <Spinner size={16} />
            {busyLabel}
          </>
        ) : isPlaceOrder ? (
          'Place order'
        ) : (
          `Pay ${amount}`
        )}
      </button>
    );
  }

  return (
    <div
      ref={constraintsRef}
      className="tx-slate relative h-14 overflow-hidden rounded-[8px] border border-highlight-soft/25 shadow-panel"
    >
      {/* Text */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center pl-10 text-[11px] font-bold uppercase tracking-[0.2em] text-charcoal-foreground tabular-nums"
        style={{ opacity: completed ? 0 : textOpacity }}
      >
        {isPlaceOrder ? 'Slide to place order' : `Slide to pay · ${amount}`}
      </motion.div>

      {/* Shown once confirmed */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 pl-10 text-[11px] font-bold uppercase tracking-[0.2em] text-charcoal-foreground"
        style={{ opacity: completed ? 1 : checkOpacity }}
      >
        <Check className="size-4" />
        {busyLabel}
      </motion.div>
      <span className="sr-only" aria-live="polite">{completed ? busyLabel : ''}</span>

      {/* Draggable thumb, also a keyboard control */}
      {!completed && (
        <motion.button
          type="button"
          aria-label={isPlaceOrder ? 'Place order. Press Enter or slide to confirm' : `Pay ${amount}. Press Enter or slide to confirm`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              complete();
            }
          }}
          drag="x"
          dragConstraints={constraintsRef}
          dragElastic={0}
          dragMomentum={false}
          onDragEnd={handleDragEnd}
          style={{ x }}
          className="absolute left-1 top-1 z-raised flex size-12 cursor-grab items-center justify-center rounded-chip bg-primary text-primary-foreground shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-charcoal-foreground active:cursor-grabbing"
          whileTap={{ scale: 0.97 }}
        >
          <ChevronRight aria-hidden="true" className="size-5" />
          <ChevronRight aria-hidden="true" className="-ml-3 size-5" />
        </motion.button>
      )}
    </div>
  );
};

/** Checkout progress: an ordered list with the current step marked. The rail grows with scaleX. */
const CHECKOUT_STEPS = ['Cart', 'Checkout', 'Payment', 'Confirm'] as const;
const CheckoutStepper = ({ step }: { step: number }) => (
  <ol aria-label="Checkout progress" className="relative flex justify-between">
    <span aria-hidden="true" className="absolute top-4 h-0.5 bg-foreground/10" style={{ left: '12.5%', right: '12.5%' }} />
    <span
      aria-hidden="true"
      className="absolute top-4 h-0.5 origin-left bg-primary transition-transform duration-drawer ease-in-out"
      style={{ left: '12.5%', right: '12.5%', transform: `scaleX(${Math.min(Math.max(step - 1, 0), 3) / 3})` }}
    />
    {CHECKOUT_STEPS.map((label, i) => {
      const n = i + 1;
      const done = n < step;
      const current = n === step;
      return (
        <li key={label} aria-current={current ? 'step' : undefined} className="relative z-raised flex w-1/4 flex-col items-center">
          <span
            className={`flex size-8 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
              done || current ? 'bg-primary text-primary-foreground' : 'bg-foreground/10 text-muted-foreground'
            }`}
          >
            {done ? <Check aria-hidden="true" className="size-4" /> : n}
          </span>
          <span className={`mt-1.5 text-[10px] uppercase tracking-[0.14em] ${done || current ? 'font-semibold text-primary' : 'text-muted-foreground'}`}>
            {label}
            {done && <span className="sr-only">, done</span>}
          </span>
        </li>
      );
    })}
  </ol>
);

/**
 * One bill block, the same rows everywhere (owner decision): item total,
 * delivery, coupon, rewards, GST, then the amount to pay. Display only: every
 * number comes straight from useCheckoutPricing.
 */
const BillRows = ({
  subtotal,
  deliveryCharge,
  deliveryBeforeFree = 0,
  discount,
  pointsApplied,
  pointsValue,
  cashbackApplied,
  showGstLine,
  gstLabel,
  taxAmount,
  gstInclusive,
  total,
  note,
  amountClassName = 'text-lg',
}: {
  subtotal: number;
  deliveryCharge: number;
  deliveryBeforeFree?: number;
  discount: number;
  pointsApplied: number;
  pointsValue: number;
  cashbackApplied: number;
  showGstLine: boolean;
  gstLabel: string;
  taxAmount: number;
  gstInclusive: boolean;
  total: number;
  note?: React.ReactNode;
  amountClassName?: string;
}) => (
  <div className="space-y-2.5 text-sm">
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">Item total</span>
      <span className="font-medium tabular-nums text-foreground">{formatINR(subtotal)}</span>
    </div>
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">Delivery</span>
      {deliveryCharge === 0 ? (
        <span className="flex items-center gap-1.5">
          {deliveryBeforeFree > 0 && (
            <s className="tabular-nums text-muted-foreground">
              <span className="sr-only">Was </span>
              {formatINR(deliveryBeforeFree)}
            </s>
          )}
          <span className="font-medium text-primary">Free</span>
        </span>
      ) : (
        <span className="font-medium tabular-nums text-foreground">{formatINR(deliveryCharge)}</span>
      )}
    </div>
    {discount > 0 && (
      <div className="flex justify-between gap-3">
        <span className="text-primary">Coupon discount</span>
        <span className="font-medium tabular-nums text-primary">−{formatINR(discount)}</span>
      </div>
    )}
    <RewardsBillLines
      pointsApplied={pointsApplied}
      pointsValue={pointsValue}
      cashbackApplied={cashbackApplied}
      className="flex justify-between gap-3"
    />
    {showGstLine && (
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">{gstLabel}</span>
        <span className="font-medium tabular-nums text-foreground">{formatINR(taxAmount)}</span>
      </div>
    )}
    {note}
    <div aria-hidden="true" className="!my-3 h-px bg-foreground/10" />
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-base font-bold text-foreground">
        To pay
        {showGstLine && gstInclusive && <span className="ml-1 text-xs font-medium text-muted-foreground">(incl. GST)</span>}
      </span>
      <span className={`font-bold tabular-nums text-foreground ${amountClassName}`}>{formatINR(total)}</span>
    </div>
  </div>
);

type AddressField = 'fullName' | 'phoneNumber' | 'pinCode' | 'address' | 'city' | 'state';
type AddressErrors = Partial<Record<AddressField, string>>;
const ADDRESS_FIELD_ORDER: AddressField[] = ['fullName', 'phoneNumber', 'pinCode', 'address', 'city', 'state'];

/** Inline checks for a new address. Returns one message per field that needs fixing. */
const validateAddress = (f: AddressFormData): AddressErrors => {
  const e: AddressErrors = {};
  if (!f.fullName.trim()) e.fullName = 'Enter the name of the person receiving the order';
  if (!/^[6-9]\d{9}$/.test(f.phoneNumber.trim())) e.phoneNumber = 'Enter a 10-digit mobile number';
  if (!/^\d{6}$/.test(f.pinCode.trim())) e.pinCode = 'Enter a 6-digit PIN code';
  if (!f.address.trim()) e.address = 'Enter the house number and street';
  if (!f.city.trim()) e.city = 'Enter the city';
  if (!f.state.trim()) e.state = 'Enter the state';
  return e;
};

/** Move focus to the first field with an error. */
const focusFirstError = (prefix: string, errors: AddressErrors) => {
  const first = ADDRESS_FIELD_ORDER.find((k) => errors[k]);
  if (first) document.getElementById(`${prefix}-${first}`)?.focus();
};

/** The new-address fields, shared by the mobile sheet and the desktop dialog. */
const AddressFields = ({
  prefix,
  formData,
  errors,
  onChange,
  onDefaultChange,
  roomy = false,
}: {
  prefix: string;
  formData: AddressFormData;
  errors: AddressErrors;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDefaultChange: (checked: boolean) => void;
  roomy?: boolean;
}) => {
  const field = (
    name: AddressField | 'locality',
    label: string,
    props: React.ComponentProps<typeof Input>,
  ) => {
    const id = `${prefix}-${name}`;
    const error = name !== 'locality' ? errors[name] : undefined;
    return (
      <div>
        <Label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-foreground/80">
          {label}
        </Label>
        <Input
          id={id}
          name={name}
          value={formData[name] ?? ''}
          onChange={onChange}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-required={name !== 'locality' ? true : undefined}
          {...props}
        />
        {error && (
          <p id={`${id}-error`} className="mt-1.5 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  };
  const gap = roomy ? 'gap-4' : 'gap-3';
  return (
    <div className={roomy ? 'space-y-5' : 'space-y-4'}>
      {field('fullName', 'Full name', { autoComplete: 'name', placeholder: 'Name of the person receiving the order' })}
      {field('phoneNumber', 'Mobile number', {
        type: 'tel',
        inputMode: 'numeric',
        autoComplete: 'tel-national',
        pattern: '[6-9][0-9]{9}',
        maxLength: 10,
        placeholder: '10-digit mobile number',
      })}
      <div className={`grid grid-cols-2 ${gap}`}>
        {field('pinCode', 'PIN code', {
          inputMode: 'numeric',
          autoComplete: 'postal-code',
          pattern: '[0-9]{6}',
          maxLength: 6,
          placeholder: '6 digits',
        })}
        {field('locality', 'Locality (optional)', { autoComplete: 'address-level3', placeholder: 'Area' })}
      </div>
      {field('address', 'Address (house number and street)', {
        autoComplete: 'street-address',
        placeholder: 'House number, building, street',
      })}
      <div className={`grid grid-cols-2 ${gap}`}>
        {field('city', 'City', { autoComplete: 'address-level2', placeholder: 'City' })}
        {field('state', 'State', { autoComplete: 'address-level1', placeholder: 'State' })}
      </div>
      <div className="flex min-h-11 items-center gap-3 pt-1">
        <Checkbox
          id={`${prefix}-isDefault`}
          checked={formData.isDefault}
          onCheckedChange={(v) => onDefaultChange(v === true)}
        />
        <Label htmlFor={`${prefix}-isDefault`} className="cursor-pointer text-sm font-medium text-foreground/80">
          Set as default shipping address
        </Label>
      </div>
    </div>
  );
};

/** A saved address as a selectable card (radio), shared by mobile and desktop. */
const AddressOption = ({
  address,
  name,
  checked,
  onSelect,
}: {
  address: Address;
  name: string;
  checked: boolean;
  onSelect: () => void;
}) => (
  <label
    className={`block cursor-pointer rounded-card border-2 p-4 transition-[border-color,background-color] duration-hover ease-out ${
      checked ? 'border-primary bg-primary/5' : 'border-foreground/[0.08] bg-card hover:border-foreground/25'
    }`}
  >
    <span className="flex items-start gap-3">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="mt-1 size-4 flex-shrink-0 accent-primary"
      />
      <span className="flex-1">
        <span className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{address.fullName}</span>
          {address.isDefault && (
            <span className="rounded-chip bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
              Default
            </span>
          )}
        </span>
        <span className="mb-1 block text-xs text-muted-foreground tabular-nums">{address.phoneNumber}</span>
        <span className="block text-xs leading-relaxed text-foreground/80">
          {address.address}
          {address.locality && `, ${address.locality}`}, {address.city}, {address.state} {address.pinCode}
        </span>
      </span>
    </span>
  </label>
);

/**
 * Radix hands focus to <body> when these controlled dialogs close, so remember
 * the last control focused outside any dialog and return focus to it.
 */
const useReturnFocus = () => {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const remember = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el !== document.body && !el.closest('[role="dialog"],[role="alertdialog"]')) ref.current = el;
    };
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, []);
  return (e: Event) => {
    const el = ref.current;
    if (el && el.isConnected) {
      e.preventDefault();
      el.focus();
    }
  };
};

/** Fixed offsets for the confirmation sparkle: no randomness in render. */
const SPARKS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * 2 * Math.PI;
  const r = i % 2 ? 124 : 96;
  return { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r) };
});

/** The short full-screen "Order confirmed" moment shown right after payment. */
const OrderCelebration = () => (
  <motion.div
    role="status"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0, transition: { duration: DUR.exit } }}
    transition={{ duration: DUR.modal, ease: EASE_OUT }}
    className="pointer-events-none fixed inset-0 z-loader flex flex-col items-center justify-center overflow-hidden bg-charcoal/90 text-charcoal-foreground"
  >
    {SPARKS.map((p, i) => (
      <motion.span
        key={i}
        aria-hidden="true"
        className={`absolute size-2 rounded-full ${i % 2 ? 'bg-charcoal-foreground/80' : 'bg-highlight-soft'}`}
        initial={{ opacity: 0, x: 0, y: 0, scale: 0.9 }}
        animate={{ opacity: [0, 1, 0], x: p.x, y: p.y, scale: 1 }}
        transition={{ delay: 0.12 + i * 0.04, duration: 0.9, ease: EASE_OUT }}
      />
    ))}
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DUR.modal, ease: EASE_OUT }}
      className="grid size-28 place-items-center rounded-full border-2 border-highlight-soft/60 sm:size-32"
    >
      <span className="grid size-20 place-items-center rounded-full bg-primary text-primary-foreground">
        <Check aria-hidden="true" className="size-10 [stroke-width:2]" />
      </span>
    </motion.div>
    <motion.p
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.16, duration: DUR.modal, ease: EASE_OUT }}
      className="mt-6 px-6 text-center text-2xl font-semibold sm:text-3xl"
      style={HEADING_FONT}
    >
      Order confirmed
    </motion.p>
    <motion.p
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.24, duration: DUR.modal, ease: EASE_OUT }}
      className="mt-2 px-8 text-center text-sm text-charcoal-foreground/80"
    >
      Thank you for your order.
    </motion.p>
  </motion.div>
);

/** One ordered line on the success screens (from the snapshot taken before the cart was cleared). */
const OrderedLine = ({ item }: { item: CartItem }) => (
  <li className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
    <div className="size-16 flex-shrink-0 overflow-hidden rounded-card bg-foreground/[0.03] ring-1 ring-foreground/[0.06]">
      <SmartImage src={item.image} alt="" className="h-full w-full object-cover" preset="thumb" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="line-clamp-2 text-sm font-semibold text-foreground">{item.name}</p>
      <p className="text-xs text-muted-foreground tabular-nums">Qty {item.quantity}</p>
    </div>
    <span className="text-sm font-semibold tabular-nums text-foreground">{formatINR(item.price * item.quantity)}</span>
  </li>
);

/** Coupon input with a hidden label, inline error and spinner. Display only: applying stays with the caller. */
const CouponForm = ({
  id,
  value,
  onChange,
  onApply,
  loading,
  error,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
  loading: boolean;
  error: string | null;
}) => {
  // Hide the last error as soon as the code is edited.
  const [errorHidden, setErrorHidden] = useState(false);
  const showError = !!error && !errorHidden;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        setErrorHidden(false);
        onApply();
      }}
    >
      <label htmlFor={id} className="sr-only">Coupon code</label>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => {
            onChange(e.target.value.toUpperCase());
            setErrorHidden(true);
          }}
          placeholder="Enter coupon code"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? `${id}-error` : undefined}
          className="h-10 min-w-0 placeholder:normal-case"
        />
        <button
          type="submit"
          disabled={loading || !value.trim()}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-control bg-primary px-4 text-[11px] font-bold uppercase tracking-[0.16em] text-primary-foreground transition-[background-color,transform] duration-press ease-out hover:bg-primary/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && <Spinner size={14} />}
          Apply
        </button>
      </div>
      {showError && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </form>
  );
};

/** An offer card (a code the customer can apply), shared by mobile and desktop. */
const OfferCard = ({
  code,
  label,
  description,
  isApplied,
  loading,
  onApply,
}: {
  code: string;
  label: string;
  description: string;
  isApplied: boolean;
  loading: boolean;
  onApply: () => void;
}) => (
  <div className="flex items-start justify-between gap-3 rounded-card border border-dashed border-primary/35 bg-primary/[0.05] p-3">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold tracking-wide text-primary">{code}</span>
        <span className="rounded-chip bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary tabular-nums">{label}</span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
    <button
      type="button"
      onClick={() => { if (!isApplied) onApply(); }}
      disabled={isApplied || loading}
      aria-label={isApplied ? `${code} applied` : `Apply ${code}`}
      className={`inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-control px-3 text-[11px] font-bold uppercase tracking-[0.14em] transition-[background-color,transform] duration-press ease-out active:scale-[0.97] disabled:cursor-not-allowed ${
        isApplied ? 'bg-primary/15 text-primary' : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60'
      }`}
    >
      {isApplied ? <Check aria-hidden="true" className="size-3.5" /> : loading ? <Spinner size={14} /> : null}
      {isApplied ? 'Applied' : 'Apply'}
    </button>
  </div>
);

/** "20% off" / "₹100 off" and the minimum-order line for an offer card. */
const offerText = (c: { type: string; value: number; minOrderValue?: number | null; description?: string | null }) => {
  const label = c.type === 'percent' ? `${c.value}% off` : `${formatINR(c.value)} off`;
  const min = c.minOrderValue ? ` on orders above ${formatINR(c.minOrderValue)}` : '';
  return { label, description: `${c.description || `Save ${label}`}${min}` };
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
  const [formErrors, setFormErrors] = useState<AddressErrors>({});
  const [addressesLoading, setAddressesLoading] = useState(true);
  // The add-on that was just added keeps showing a check for a moment.
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const paymentHeadingRef = useRef<HTMLHeadingElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const returnFocus = useReturnFocus();
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

  // Payment details: move focus in, Escape goes back (never while paying).
  useEffect(() => {
    if (showPaymentDetails) paymentHeadingRef.current?.focus();
  }, [showPaymentDetails]);
  useEffect(() => {
    if (!showPaymentDetails || isPlacingOrder) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPaymentDetails(false);
        setSlideResetKey((k) => k + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPaymentDetails, isPlacingOrder]);
  useEffect(() => {
    if (showOrderSuccess) successHeadingRef.current?.focus();
  }, [showOrderSuccess]);

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
      } finally {
        setAddressesLoading(false);
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
    // Clear that field's message once the customer edits it.
    setFormErrors((prev) => (prev[name as AddressField] ? { ...prev, [name]: undefined } : prev));
  };
  
  // Handle form submission
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validation: inline messages under each field, focus the first one.
    const errors = validateAddress(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstError('mobile', errors);
      return;
    }

    try {
      setFormLoading(true);

      // Add new address
      await addAddress(user.uid, formData);
      toast({ title: 'Address saved' });

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
        title: 'Could not save the address',
        description: 'Check your connection and try again.',
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
    setFormErrors({});
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

  // Display only: Indian grouping, paise only when there are paise.
  const formatPrice = (price: number) => formatINR(price);

  // Admin-driven pricing (coupons / delivery / GST all live in /admin/commerce-settings).
  // Product ids let per-product delivery overrides apply; the address state
  // selects the within-state / outside-state / per-state rate.
  // Loyalty points / wallet cashback the customer opts to spend (src/lib/rewards.ts).
  const rewardsState = useRewards(user?.uid);
  const [usePoints, setUsePoints] = useState(false);
  const [useCashback, setUseCashback] = useState(false);
  const pricing = useCheckoutPricing(subtotal, items.length === 0, selectedPaymentMethod, {
    productIds: items.map((i) => i.id),
    destinationState: selectedAddress?.state,
    // Needed for category-restricted coupons and for `perUserLimit` /
    // `firstOrderOnly`, which the admin panel stores but nothing used to check.
    cartCategories: items.map((i) => i.category || '').filter(Boolean),
    userId: user?.uid,
    // Apply the code the customer tapped in the offer ribbon.
    applyRememberedCode: true,
    rewards: { balances: rewardsState.balances, settings: rewardsState.settings, usePoints, useCashback },
  });
  const deliveryCharge = pricing.deliveryCharge;
  const taxAmount = pricing.gstAmount;
  const gstLabel = `GST (${pricing.gst.rate}%${pricing.gst.inclusive ? ' included' : ''})`;
  // Admin > Commerce settings: GST on, and "show GST line in cart/checkout" on.
  const showGstLine = pricing.gst.enabled && pricing.gst.displayInline;
  const savings = items.reduce((acc, item) => {
    // Only count a saving when the product genuinely has a higher MRP.
    const originalPrice = item.originalPrice && item.originalPrice > item.price ? item.originalPrice : 0;
    return originalPrice ? acc + (originalPrice - item.price) * item.quantity : acc;
  }, 0);
  const discount = pricing.discount;
  const total = pricing.total;

  // Defensive guard — must come AFTER all hooks (Rules of Hooks)
  if (!user) return <Navigate to="/login" state={{ from: { pathname: '/checkout' }, reason: 'checkout' }} replace />;

  const addOnTabs = ['Did you forget?', 'Best Sellers', 'New Arrivals'];

  // Handle order placement
  const handlePlaceOrder = async () => {
    if (!user || !selectedAddress) {
      toast({ title: 'Add a delivery address to continue', variant: 'destructive' });
      return;
    }

    if (items.length === 0) {
      toast({ title: 'Your bag is empty', description: 'Add a product to place an order.', variant: 'destructive' });
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
          title: 'Update your bag to continue',
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
          description: `${preflight.repriced.map((l) => l.name).join(', ')} ${preflight.repriced.length === 1 ? 'is' : 'are'} now priced differently. Your total has been updated. Review it and pay again.`,
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
          amountBeforeRewards: pricing.totalBeforeRewards,
          lineItems: items.map((i) => ({ productId: i.id, quantity: i.quantity })),
          paymentMethod: selectedPaymentMethod,
          shippingState: selectedAddress.state,
          couponCode: pricing.appliedCoupon?.code,
          usePoints: pricing.pointsApplied > 0,
          useCashback: pricing.cashbackApplied > 0,
          receipt: orderId,
          name: 'Ishaputra Botanicals',
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
        ...(verifiedPayment?.pointsApplied
          ? { pointsUsed: verifiedPayment.pointsApplied, pointsValue: verifiedPayment.pointsValue }
          : {}),
        ...(verifiedPayment?.cashbackApplied ? { cashbackUsed: verifiedPayment.cashbackApplied } : {}),
        status: 'pending',
      };

      // Create order in Firestore.
      // The payment is already captured at this point, so createPaidOrder falls
      // back to a flagged order rather than throwing - a customer must never be
      // charged and left without a record of it.
      const created = await createPaidOrder(orderData);
      const docId = created.id;
      // Confirms the payment record and any points/cashback with the server
      // (and repairs them if verify-payment could not write them in time).
      void reconcileOrderRewards(docId);
      setFirestoreOrderId(docId);
      if (created.needsReview) {
        toast({
          title: 'Order received. It needs a quick check',
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
      if (error instanceof RewardsUnavailableError) {
        setUsePoints(false);
        setUseCashback(false);
        toast({ title: 'Rewards unavailable right now', description: error.message });
        return;
      }
      if (error instanceof RewardsChangedError) {
        // The live ledger has already updated the total on this page.
        toast({ title: 'Your rewards balance changed', description: error.message });
        return;
      }
      if (error instanceof PaymentCancelledError) {
        toast({
          title: 'Payment cancelled',
          description: 'You closed the payment window. Your order was not placed.',
        });
      } else {
        toast({
          title: 'Could not place your order',
          description: error instanceof Error ? error.message : 'Try again in a moment.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsPlacingOrder(false);
    }
  };

  /** Remove a line and offer to put it back at the same quantity. */
  const removeWithUndo = (item: CartItem) => {
    const { quantity, ...line } = item;
    void removeFromCart(item.id);
    sonnerToast(`Removed ${item.name}`, {
      action: { label: 'Undo', onClick: () => addToCart(line, quantity) },
    });
  };

  const closePaymentDetails = () => {
    setShowPaymentDetails(false);
    setSlideResetKey((k) => k + 1);
  };

  // Same rows in every bill block (display only).
  const billProps = {
    subtotal,
    deliveryCharge,
    deliveryBeforeFree: pricing.deliveryBeforeFree,
    discount,
    pointsApplied: pricing.pointsApplied,
    pointsValue: pricing.pointsValue,
    cashbackApplied: pricing.cashbackApplied,
    showGstLine,
    gstLabel,
    taxAmount,
    gstInclusive: !!pricing.gst.inclusive,
    total,
  };

  // Add-on suggestions skip what is already in the bag (display only); the one
  // just added stays for a moment so its check mark can show.
  const addOns = suggestedProducts.filter((p) => p.id === justAddedId || !items.some((i) => i.id === p.id));
  const showForm = showAddressForm || addresses.length === 0;

  return (
    <div className="min-h-screen tx-paper flex flex-col pb-24" style={{ fontFamily: "var(--font-body)" }}>
      {/* ─── Header ─── */}
      <header className="sticky top-0 z-header border-b border-foreground/[0.08] bg-background/95 backdrop-blur">
        <div className="flex items-center justify-between px-2 py-2">
          <IconButton label="Go back" onClick={handleBack}>
            <ArrowLeft aria-hidden="true" />
          </IconButton>
          <img
            src={resolvedTheme === 'dark' ? '/white_logo.png' : '/black_logo.png'}
            alt="Ishaputra Botanicals"
            className="h-9 w-auto object-contain"
          />
          <span aria-hidden="true" className="size-11" />
        </div>
        <MobileSearchBar />
      </header>

      {/* ─── Address Selector Sheet ─── */}
      <Sheet open={showAddressSelector} onOpenChange={(open) => { if (!open) handleCloseAddressSelector(); }}>
        <SheetContent
          side="bottom"
          hideClose
          aria-describedby={undefined}
          onCloseAutoFocus={returnFocus}
          className="flex max-h-[85dvh] flex-col gap-0 overflow-y-hidden bg-card p-0 pb-0"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-foreground/[0.08] py-2 pl-4 pr-2">
            <SheetTitle className="text-lg" style={HEADING_FONT}>
              Select delivery address
            </SheetTitle>
            <div className="flex items-center gap-1">
              {!showForm && (
                <button
                  type="button"
                  onClick={() => setShowAddressForm(true)}
                  className="inline-flex h-10 items-center gap-1 rounded-control px-3 text-sm font-semibold text-primary transition-[background-color,transform] duration-press ease-out hover:bg-primary/10 active:scale-[0.97]"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add address
                </button>
              )}
              <IconButton label="Close" onClick={handleCloseAddressSelector}>
                <X aria-hidden="true" />
              </IconButton>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {showForm ? (
              <form id="mobile-address-form" onSubmit={handleFormSubmit} noValidate className="space-y-4">
                <p className="text-xs text-muted-foreground">Add a new delivery address for your order.</p>
                <AddressFields
                  prefix="mobile"
                  formData={formData}
                  errors={formErrors}
                  onChange={handleInputChange}
                  onDefaultChange={(checked) => setFormData((prev) => ({ ...prev, isDefault: checked }))}
                />
                {addresses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAddressForm(false)}
                    className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    Back to saved addresses
                  </button>
                )}
              </form>
            ) : (
              <div role="radiogroup" aria-label="Saved addresses" className="space-y-3">
                {addresses.map((address) => (
                  <AddressOption
                    key={address.id}
                    address={address}
                    name="mobileSelectedAddress"
                    checked={tempSelectedAddress?.id === address.id}
                    onSelect={() => setTempSelectedAddress(address)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex gap-3 border-t border-foreground/[0.08] bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" onClick={handleCloseAddressSelector} className="h-11 flex-none px-5">
              Cancel
            </Button>
            {showForm ? (
              <Button
                type="submit"
                form="mobile-address-form"
                disabled={formLoading}
                className="h-11 flex-1 !px-4 !tracking-[0.14em]"
              >
                {formLoading && <Spinner size={16} />}
                {formLoading ? 'Saving' : 'Save and deliver here'}
              </Button>
            ) : (
              <Button type="button" onClick={handleDeliverHere} disabled={!tempSelectedAddress} className="h-11 flex-1">
                Deliver here
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Main Content ─── */}
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {/* Stepper - scrolls with content (hidden when cart is empty on step 1) */}
        {!(currentStep === 1 && items.length === 0 && !cartLoading) && (
          <div className="px-4 pb-3 pt-4">
            <CheckoutStepper step={currentStep} />
          </div>
        )}

        {/* ─── STEP 1: Cart Review ─── */}
        {currentStep === 1 && (
          <div className="pb-32">
            {/* Empty Cart State */}
            {items.length === 0 && !cartLoading && (
              <EmptyState
                icon={ShoppingBag}
                as="h1"
                title="Your cart is empty"
                description="Add a daily ritual to get started."
                action={{ label: 'Start shopping', to: '/' }}
                className="px-6"
              />
            )}
            {/* Cart Items */}
            {items.length > 0 && (<>
            <div className="space-y-3 px-4 pb-2 pt-4">
              <h1 className="text-lg font-semibold text-foreground" style={HEADING_FONT}>Your cart</h1>
              <UnavailableItemsNotice items={items} unavailable={unavailable} onRemove={removeFromCart} />
            </div>
            <ul className="tx-sheet mx-4 mb-4 divide-y divide-foreground/[0.08] overflow-hidden rounded-card border border-foreground/[0.08] shadow-panel">
              <AnimatePresence initial={false}>
                {items.map((item) => {
                  // Show the strike-through MRP only when the product genuinely has one.
                  const origPrice = item.originalPrice && item.originalPrice > item.price ? item.originalPrice : null;
                  return (
                    <motion.li
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: { duration: DUR.exit } }}
                      transition={{ duration: DUR.dropdown, ease: EASE_OUT }}
                      className="flex items-center gap-3 px-4 py-4"
                    >
                      <div className="size-20 flex-shrink-0 overflow-hidden rounded-card bg-foreground/[0.03] ring-1 ring-foreground/[0.06]">
                        <SmartImage src={item.image} alt="" className="h-full w-full object-cover" preset="thumb" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="line-clamp-2 text-base font-semibold leading-snug text-foreground">{item.name}</h2>
                        <UnavailableTag reason={unavailable[item.id]} />
                        <div className="mt-1.5">
                          <span className="whitespace-nowrap text-base font-bold tabular-nums text-foreground">{formatPrice(item.price)}</span>
                          {origPrice && (
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span className="price-was whitespace-nowrap text-xs">
                                <span className="sr-only">Was </span>
                                {formatPrice(origPrice)}
                              </span>
                              <span className="chip-off">{Math.round((1 - item.price / origPrice) * 100)}% off</span>
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => (item.quantity === 1 ? removeWithUndo(item) : updateQuantity(item.id, item.quantity - 1))}
                            aria-label={item.quantity === 1 ? `Remove ${item.name}` : `Decrease quantity of ${item.name}`}
                            className="relative flex size-8 items-center justify-center rounded-full border border-foreground/20 text-foreground transition-[background-color,transform] duration-press ease-out after:absolute after:-inset-1.5 after:content-[''] hover:bg-foreground/5 active:scale-[0.97]"
                          >
                            <Minus aria-hidden="true" className="size-3.5" />
                          </button>
                          <span
                            aria-live="polite"
                            className="flex h-8 min-w-8 items-center justify-center rounded-full bg-foreground/[0.06] px-2 text-xs font-bold tabular-nums text-foreground"
                          >
                            <span className="sr-only">Quantity </span>
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            aria-label={`Increase quantity of ${item.name}`}
                            className="relative flex size-8 items-center justify-center rounded-full border border-foreground/20 text-foreground transition-[background-color,transform] duration-press ease-out after:absolute after:-inset-1.5 after:content-[''] hover:bg-foreground/5 active:scale-[0.97]"
                          >
                            <Plus aria-hidden="true" className="size-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end justify-between self-stretch">
                        <IconButton
                          label={`Remove ${item.name}`}
                          size="sm"
                          onClick={() => removeWithUndo(item)}
                          className="-mr-1.5 -mt-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 aria-hidden="true" />
                        </IconButton>
                        <div className="text-right">
                          <p className="whitespace-nowrap text-sm font-bold tabular-nums text-foreground">{formatPrice(item.price * item.quantity)}</p>
                          {item.quantity > 1 && (
                            <p className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">{item.quantity} × {formatPrice(item.price)}</p>
                          )}
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>

            {/* Add more items */}
            <div className="mx-4 mb-4">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-card border border-dashed border-foreground/15 bg-card py-3 transition-[background-color,transform] duration-press ease-out hover:bg-foreground/[0.04] active:scale-[0.97]"
              >
                <span className="text-sm text-muted-foreground">Missed something?</span>
                <span className="text-sm font-semibold text-primary">Add more items</span>
              </button>
            </div>

            {/* Available Offers */}
            {pricing.redeemableCoupons.length > 0 && (() => {
              const activeOffers = pricing.redeemableCoupons;
              const visibleMobileOffers = showAllOffers ? activeOffers : activeOffers.slice(0, 2);
              return (
                <div className="mx-4 mb-4">
                  <div className="tx-sheet rounded-card border border-foreground/[0.08] p-4 shadow-panel">
                    <button
                      type="button"
                      onClick={() => setShowOffers((prev) => !prev)}
                      aria-expanded={showOffers}
                      aria-controls="mobile-offers"
                      className="flex min-h-10 w-full items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-full bg-foreground/[0.06]">
                          <Tag aria-hidden="true" className="size-3.5 text-foreground/80" />
                        </span>
                        <h2 className="text-sm font-semibold text-foreground" style={HEADING_FONT}>
                          Available offers ({activeOffers.length})
                        </h2>
                      </span>
                      <ChevronDown
                        aria-hidden="true"
                        className={`size-4 text-muted-foreground transition-transform duration-dropdown ease-out ${showOffers ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {showOffers && (
                      <motion.div
                        id="mobile-offers"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: DUR.dropdown, ease: EASE_OUT }}
                        className="mt-3 space-y-2.5"
                      >
                        {visibleMobileOffers.map((c) => {
                          const { label, description } = offerText(c);
                          return (
                            <OfferCard
                              key={c.id}
                              code={c.code}
                              label={label}
                              description={description}
                              isApplied={pricing.appliedCoupon?.code === c.code}
                              loading={pricing.couponLoading}
                              onApply={() => pricing.applyCoupon(c.code)}
                            />
                          );
                        })}
                        {activeOffers.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setShowAllOffers((prev) => !prev)}
                            className="min-h-10 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                          >
                            {showAllOffers ? 'Show less' : `Show ${activeOffers.length - 2} more`}
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
              <div className="tx-sheet rounded-card border border-foreground/[0.08] p-4 shadow-panel">
                <h2 className="mb-3 text-sm font-semibold text-foreground" style={HEADING_FONT}>Have a coupon?</h2>
                {pricing.appliedCoupon ? (
                  <div className="flex items-center justify-between rounded-control border border-primary/25 bg-primary/[0.06] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <Tag aria-hidden="true" className="size-4 text-primary" />
                      <div>
                        <span className="text-sm font-bold text-primary">{pricing.appliedCoupon.code}</span>
                        <p className="text-xs tabular-nums text-primary">{formatPrice(discount)} saved</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => pricing.removeCoupon()}
                      className="min-h-10 px-1 text-xs font-semibold text-muted-foreground transition-colors duration-hover hover:text-destructive"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <CouponForm
                    id="mobile-coupon"
                    value={couponInput}
                    onChange={setCouponInput}
                    onApply={handleApplyCoupon}
                    loading={pricing.couponLoading}
                    error={pricing.couponError}
                  />
                )}
              </div>
            </div>

            {/* Loyalty points / wallet cashback */}
            <div className="mx-4 mb-4">
              <RewardsRedeemCard
                balances={rewardsState.balances}
                settings={rewardsState.settings}
                usePoints={usePoints}
                useCashback={useCashback}
                onUsePoints={setUsePoints}
                onUseCashback={setUseCashback}
                pointsApplied={pricing.pointsApplied}
                pointsValue={pricing.pointsValue}
                cashbackApplied={pricing.cashbackApplied}
              />
            </div>

            {/* Bill Summary */}
            <div className="mx-4 mb-4">
              <section aria-labelledby="bill-summary-1" className="tx-sheet rounded-card border border-foreground/[0.08] p-4 shadow-panel">
                <h2 id="bill-summary-1" className="mb-3 text-base font-bold text-foreground" style={HEADING_FONT}>Bill summary</h2>
                <BillRows {...billProps} />
              </section>
            </div>
            </>)}
          </div>
        )}

        {/* ─── STEP 2+: Checkout ─── */}
        {currentStep >= 2 && (<>
        <h1 className="sr-only">Checkout</h1>

        {/* Address bar - scrolls with content */}
        <div className="px-4 pb-2 pt-4">
          {addressesLoading ? (
            <div aria-busy="true" className="flex min-h-11 items-center gap-2">
              <MapPin aria-hidden="true" className="size-4 flex-shrink-0 text-muted-foreground" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <span className="sr-only">Loading your addresses</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleOpenAddressSelector}
              className="-mx-1 flex min-h-11 w-[calc(100%+0.5rem)] items-center gap-2 rounded-control px-1 transition-colors duration-hover hover:bg-foreground/[0.04]"
            >
              <MapPin aria-hidden="true" className="size-4 flex-shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 text-left">
                {selectedAddress ? (
                  <>
                    <span className="flex items-center gap-1">
                      <span className="sr-only">Deliver to </span>
                      <span className="text-sm font-semibold text-foreground">{selectedAddress.fullName}</span>
                      <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {selectedAddress.address}, {selectedAddress.city}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1">
                      <span className="text-sm font-semibold text-foreground">Add address</span>
                      <Plus aria-hidden="true" className="size-3.5 text-muted-foreground" />
                    </span>
                    <span className="block text-xs text-muted-foreground">Tap to add your delivery address</span>
                  </>
                )}
              </span>
            </button>
          )}
        </div>

        {/* Compact Order Summary (step 2 — no duplicate full items list) */}
        <div className="mx-4 mb-3 mt-3">
          <div className="tx-sheet flex items-center gap-3 rounded-card border border-foreground/[0.08] px-4 py-3 shadow-panel">
            <div className="flex -space-x-2">
              {items.slice(0, 3).map((item, idx) => (
                <div key={item.id} className="size-14 flex-shrink-0 overflow-hidden rounded-full border-2 border-card" style={{ zIndex: 3 - idx }}>
                  <SmartImage src={item.image} alt="" className="h-full w-full object-cover" preset="thumb" />
                </div>
              ))}
              {items.length > 3 && (
                <div className="flex size-14 flex-shrink-0 items-center justify-center rounded-full border-2 border-card bg-foreground/[0.06]">
                  <span className="text-xs font-bold tabular-nums text-muted-foreground">+{items.length - 3}</span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-foreground tabular-nums">{plural(totalItems, 'item')}</p>
              <p className="text-sm text-muted-foreground tabular-nums">Total {formatPrice(total)}</p>
            </div>
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              aria-label="Edit cart"
              className="min-h-10 flex-shrink-0 px-2 text-xs font-semibold text-primary underline-offset-4 hover:underline"
            >
              Edit
            </button>
          </div>
        </div>

        {/* Bill Summary */}
        <div className="mx-4 mb-4">
          <section aria-labelledby="bill-summary-2" className="tx-sheet overflow-hidden rounded-card border border-foreground/[0.08] p-4 shadow-panel">
            <h2 id="bill-summary-2" className="mb-3 text-base font-bold text-foreground" style={HEADING_FONT}>Bill summary</h2>
            <BillRows {...billProps} />
          </section>
        </div>

        {/* ─── Last Minute Add-ons ─── */}
        {addOns.length > 0 && (
          <section aria-labelledby="addons-title" className="mb-4">
            <div className="mb-3 flex items-center gap-2 px-4">
              <Sparkles aria-hidden="true" className="size-5 text-highlight" />
              <h2 id="addons-title" className="text-base font-semibold text-foreground" style={HEADING_FONT}>Your last minute add-ons</h2>
            </div>

            {/* Horizontal scroll products */}
            <ul className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-2">
              {addOns.map((product) => {
                const added = justAddedId === product.id;
                return (
                  <li
                    key={product.id}
                    className="w-[132px] flex-shrink-0 overflow-hidden rounded-card border border-foreground/[0.06] bg-card shadow-sm"
                  >
                    <div className="relative h-[110px] w-full bg-foreground/[0.03]">
                      <SmartImage src={product.image} alt="" className="h-full w-full object-cover" preset="card" />
                      {!!product.discount && (
                        <span className="tag-dark absolute left-2 top-2 !px-1.5 !py-0.5 !text-[9px] !tracking-[0.12em] text-highlight-soft">
                          {product.discount}% off
                        </span>
                      )}
                      <IconButton
                        label={added ? `${product.title} added to bag` : `Add ${product.title} to bag`}
                        size="sm"
                        variant="solid"
                        disabled={added}
                        onClick={() => {
                          const ok = addToCart({
                            id: product.id,
                            name: product.title,
                            price: product.price,
                            image: product.image,
                            category: product.category,
                            stock: product.stock,
                          });
                          if (ok) {
                            setJustAddedId(product.id);
                            window.setTimeout(() => setJustAddedId((id) => (id === product.id ? null : id)), 1200);
                            sonnerToast('Added to bag', { description: product.title });
                          }
                        }}
                        className="absolute right-1.5 top-1.5 text-primary disabled:opacity-100"
                      >
                        {added ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                      </IconButton>
                    </div>

                    <div className="p-2.5">
                      <h3 className="line-clamp-2 min-h-[28px] text-xs font-semibold leading-tight text-foreground">
                        {product.title}
                      </h3>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5">
                        <span className="text-xs font-bold tabular-nums text-foreground">{formatPrice(product.price)}</span>
                        {product.oldPrice && (
                          <span className="price-was text-[10px]">
                            <span className="sr-only">Was </span>
                            {formatPrice(product.oldPrice)}
                          </span>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        </>)}
      </main>

      {/* ─── Bottom Fixed Section ─── */}
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-foreground/[0.08] bg-background/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-panel backdrop-blur">
        {currentStep === 1 ? (
          items.length > 0 && (
            <button type="button" onClick={() => setCurrentStep(2)} className="btn-copper h-14 w-full !text-[12px]">
              Proceed to checkout
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          )
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

      {/* ─── Payment Details (full-screen panel) ─── */}
      {/* Not a Radix dialog on purpose: Razorpay opens its own window on top of
          this panel, and a modal focus trap would block it. */}
      <AnimatePresence>
        {showPaymentDetails && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-details-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%', transition: { duration: DUR.exit, ease: EASE_OUT } }}
            transition={{ duration: DUR.drawer, ease: EASE_DRAWER }}
            className="tx-paper fixed inset-0 z-drawer flex flex-col"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {/* Header */}
            <div className="border-b border-foreground/[0.08] bg-background/90 px-2 py-2 backdrop-blur">
              <div className="flex items-center gap-1">
                <IconButton label="Back to checkout" onClick={closePaymentDetails} disabled={isPlacingOrder}>
                  <ArrowLeft aria-hidden="true" />
                </IconButton>
                <h2
                  id="payment-details-title"
                  ref={paymentHeadingRef}
                  tabIndex={-1}
                  className="text-lg font-semibold text-foreground outline-none"
                  style={HEADING_FONT}
                >
                  Payment details
                </h2>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
              <div className="px-4 pb-3 pt-4">
                <CheckoutStepper step={3} />
              </div>

              {/* Payment Method */}
              <section className="px-4 py-4">
                <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Payment method</h3>
                <label className="flex cursor-pointer items-center justify-between rounded-card border-2 border-primary bg-primary/5 p-3.5">
                  <span className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-control bg-primary">
                      <CreditCard aria-hidden="true" className="size-4 text-primary-foreground" />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-foreground">Pay online (Razorpay)</span>
                      <span className="text-xs text-muted-foreground">Cards, UPI, wallets and net banking</span>
                    </span>
                  </span>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="Razorpay"
                    checked={selectedPaymentMethod === 'Razorpay'}
                    onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                    className="size-4 accent-primary"
                  />
                </label>
              </section>

              {/* Order Details */}
              <section className="border-t border-foreground/[0.08] px-4 py-4">
                <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Order details</h3>
                <BillRows {...billProps} />
              </section>

              {/* Selected Items */}
              <section className="border-t border-foreground/[0.08] px-4 py-4">
                <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">In this order</h3>
                <div className="space-y-3">
                  {items.slice(0, 1).map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-card border border-foreground/[0.08] bg-card p-3">
                      <div className="size-16 flex-shrink-0 overflow-hidden rounded-control bg-foreground/[0.03]">
                        <SmartImage src={item.image} alt="" className="h-full w-full object-cover" preset="thumb" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-xs font-semibold text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">Qty {item.quantity}</p>
                      </div>
                    </div>
                  ))}
                  {items.length > 1 && (
                    <p className="text-xs text-muted-foreground">And {plural(items.length - 1, 'more item')}</p>
                  )}
                </div>
              </section>
            </div>

            {/* Place Order Slide Button */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DUR.modal, ease: EASE_OUT }}
              className="border-t border-foreground/[0.08] bg-background/90 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-panel backdrop-blur"
            >
              {isPlacingOrder ? (
                <div role="status" className="tx-slate flex h-14 items-center justify-center gap-2 rounded-[8px] text-[11px] font-bold uppercase tracking-[0.2em] text-charcoal-foreground">
                  <Spinner size={18} />
                  Placing order
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

      {/* ─── Order confirmed moment ─── */}
      <AnimatePresence>{showOrderAnimation && <OrderCelebration />}</AnimatePresence>

      {/* ─── Order Success Page ─── */}
      <AnimatePresence>
        {showOrderSuccess && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-success-title"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%', transition: { duration: DUR.exit, ease: EASE_OUT } }}
            transition={{ duration: DUR.drawer, ease: EASE_DRAWER }}
            className="tx-paper fixed inset-0 z-drawer flex flex-col"
            style={{ fontFamily: "var(--font-body)" }}
          >
            {/* Header */}
            <div className="border-b border-foreground/[0.08] bg-background">
              <MobileHeader />
              <div className="flex items-center gap-1 px-2 py-1.5">
                <IconButton label="Back to home" onClick={() => navigate('/', { replace: true })}>
                  <ArrowLeft aria-hidden="true" />
                </IconButton>
                <p className="text-base font-semibold text-foreground">Your order</p>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-8">
              {/* Success Icon */}
              <div className="mb-6 flex justify-center">
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: DUR.modal, ease: EASE_OUT }}
                  className="grid size-24 place-items-center rounded-full bg-primary/10"
                >
                  <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check aria-hidden="true" className="size-8 [stroke-width:2]" />
                  </span>
                </motion.div>
              </div>

              <h2
                id="order-success-title"
                ref={successHeadingRef}
                tabIndex={-1}
                className="mb-2 text-center text-2xl font-semibold text-foreground outline-none"
                style={HEADING_FONT}
              >
                Order confirmed
              </h2>
              <p className="mx-auto mb-6 max-w-xs text-center text-sm leading-relaxed text-muted-foreground">
                We have your payment and your order. We will email you when it ships.
              </p>

              <div className="space-y-4">
                {/* Order number, address, payment */}
                <dl className="tx-sheet divide-y divide-foreground/[0.08] rounded-card border border-foreground/[0.08] px-4 shadow-panel">
                  <div className="py-3.5">
                    <dt className="text-xs text-muted-foreground">Order number</dt>
                    <dd className="mt-0.5 text-sm font-bold tabular-nums text-foreground">{orderId}</dd>
                  </div>
                  {selectedAddress && (
                    <div className="py-3.5">
                      <dt className="text-xs text-muted-foreground">Shipping to</dt>
                      <dd className="mt-0.5 text-sm leading-relaxed text-foreground">
                        {selectedAddress.address}
                        {selectedAddress.locality && `, ${selectedAddress.locality}`}, {selectedAddress.city}, {selectedAddress.state} {selectedAddress.pinCode}
                      </dd>
                    </div>
                  )}
                  <div className="py-3.5">
                    <dt className="text-xs text-muted-foreground">Payment</dt>
                    <dd className="mt-0.5 text-sm text-foreground">
                      {selectedPaymentMethod === 'Razorpay' ? 'Paid online (Razorpay)' : selectedPaymentMethod}
                    </dd>
                  </div>
                </dl>

                {/* Order Summary */}
                {orderedItems.length > 0 && (
                  <section aria-labelledby="ordered-items-title" className="tx-sheet rounded-card border border-foreground/[0.08] p-4 shadow-panel">
                    <h3 id="ordered-items-title" className="mb-3 text-base font-semibold text-foreground" style={HEADING_FONT}>Order summary</h3>
                    <ul className="divide-y divide-foreground/[0.08]">
                      <OrderedLine item={orderedItems[0]} />
                      {showAllItems && orderedItems.slice(1).map((item) => <OrderedLine key={item.id} item={item} />)}
                    </ul>
                    {orderedItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setShowAllItems(!showAllItems)}
                        aria-expanded={showAllItems}
                        className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-control text-sm font-medium text-primary transition-colors duration-hover hover:bg-primary/10"
                      >
                        {showAllItems ? 'Show less' : `Show ${plural(orderedItems.length - 1, 'more item')}`}
                        <ChevronDown aria-hidden="true" className={`size-4 transition-transform duration-dropdown ease-out ${showAllItems ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </section>
                )}
              </div>
            </div>

            {/* Bottom Buttons */}
            <div className="flex gap-3 border-t border-foreground/[0.08] bg-background p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-panel">
              <button
                type="button"
                onClick={() => {
                  navigate(`/account/orders/${firestoreOrderId ?? orderId}`);
                }}
                className="btn-copper h-12 flex-1"
              >
                Track order
              </button>
              <button
                type="button"
                onClick={() => {
                  if (lastOrderedProductId) {
                    navigate(`/product/${lastOrderedProductId}`);
                  } else {
                    navigate('/');
                  }
                }}
                className="btn-line h-12 flex-1 text-foreground"
              >
                Done
              </button>
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
  const { items, unavailable, subtotal, clearCart, updateCartPrice, updateQuantity, removeFromCart, addToCart, closeCart, loading: cartLoading } = useCart();
  const { toast } = useToast();
  const { addToWishlist } = useWishlist();
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
  const [formErrors, setFormErrors] = useState<AddressErrors>({});
  const [addressesLoading, setAddressesLoading] = useState(true);
  // Snapshot of the order taken just before the cart is cleared, for the success dialog.
  const [orderedItems, setOrderedItems] = useState<CartItem[]>([]);
  const [confirmAction, setConfirmAction] = useState<{ kind: 'remove' | 'move'; count: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const paymentDialogRef = useRef<HTMLDivElement>(null);
  const paymentReturnFocusRef = useRef<HTMLElement | null>(null);
  const returnFocus = useReturnFocus();
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
      } finally {
        setAddressesLoading(false);
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
    // Clear that field's message once the customer edits it.
    setFormErrors((prev) => (prev[name as AddressField] ? { ...prev, [name]: undefined } : prev));
  };
  
  // Handle form submission
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validation: inline messages under each field, focus the first one.
    const errors = validateAddress(formData);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstError('desktop', errors);
      return;
    }

    try {
      setFormLoading(true);

      // Add new address
      await addAddress(user.uid, formData);
      toast({ title: 'Address saved' });

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
        title: 'Could not save the address',
        description: 'Check your connection and try again.',
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
    setFormErrors({});
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

  // Payment dialog: focus moves in and back out; Escape closes it (never while paying).
  useEffect(() => {
    if (!showPaymentDetails) return;
    paymentReturnFocusRef.current = document.activeElement as HTMLElement | null;
    paymentDialogRef.current?.focus();
    return () => {
      paymentReturnFocusRef.current?.focus?.();
    };
  }, [showPaymentDetails]);
  useEffect(() => {
    if (!showPaymentDetails || isPlacingOrder) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPaymentDetails(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPaymentDetails, isPlacingOrder]);

  // Format price in Indian Rupees
  // Display only: Indian grouping, paise only when there are paise.
  const formatPrice = (price: number) => formatINR(price);

  // Admin-driven pricing (must be called before any conditional returns — Rules of Hooks)
  // Loyalty points / wallet cashback the customer opts to spend (src/lib/rewards.ts).
  const rewardsState = useRewards(user?.uid);
  const [usePoints, setUsePoints] = useState(false);
  const [useCashback, setUseCashback] = useState(false);
  const pricing = useCheckoutPricing(subtotal, items.length === 0, selectedPaymentMethod, {
    productIds: items.map((i) => i.id),
    destinationState: selectedAddress?.state,
    // Needed for category-restricted coupons and for `perUserLimit` /
    // `firstOrderOnly`, which the admin panel stores but nothing used to check.
    cartCategories: items.map((i) => i.category || '').filter(Boolean),
    userId: user?.uid,
    // Apply the code the customer tapped in the offer ribbon.
    applyRememberedCode: true,
    rewards: { balances: rewardsState.balances, settings: rewardsState.settings, usePoints, useCashback },
  });
  const deliveryCharge = pricing.deliveryCharge;
  const taxAmount = pricing.gstAmount;
  const gstLabel = `GST (${pricing.gst.rate}%${pricing.gst.inclusive ? ' included' : ''})`;
  // Admin > Commerce settings: GST on, and "show GST line in cart/checkout" on.
  const showGstLine = pricing.gst.enabled && pricing.gst.displayInline;
  const discount = pricing.discount;
  const desktopTotal = pricing.total;

  // Defensive guard — must come AFTER all hooks (Rules of Hooks)
  if (!user) return <Navigate to="/login" state={{ from: { pathname: '/checkout' }, reason: 'checkout' }} replace />;

  // Render mobile checkout if on small screen
  if (isMobile) {
    return <MobileCheckout />;
  }

  // Handle order placement
  const handlePlaceOrder = async () => {
    if (!user || !selectedAddress) {
      toast({ title: 'Add a delivery address to continue', variant: 'destructive' });
      return;
    }

    if (items.length === 0) {
      toast({ title: 'Your bag is empty', description: 'Add a product to place an order.', variant: 'destructive' });
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
          title: 'Update your bag to continue',
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
          description: `${preflight.repriced.map((l) => l.name).join(', ')} ${preflight.repriced.length === 1 ? 'is' : 'are'} now priced differently. Your total has been updated. Review it and pay again.`,
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
          amountBeforeRewards: pricing.totalBeforeRewards,
          lineItems: items.map((i) => ({ productId: i.id, quantity: i.quantity })),
          paymentMethod: selectedPaymentMethod,
          shippingState: selectedAddress.state,
          couponCode: pricing.appliedCoupon?.code,
          usePoints: pricing.pointsApplied > 0,
          useCashback: pricing.cashbackApplied > 0,
          receipt: orderId,
          name: 'Ishaputra Botanicals',
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
        ...(verifiedPayment?.pointsApplied
          ? { pointsUsed: verifiedPayment.pointsApplied, pointsValue: verifiedPayment.pointsValue }
          : {}),
        ...(verifiedPayment?.cashbackApplied ? { cashbackUsed: verifiedPayment.cashbackApplied } : {}),
        status: 'pending',
      };

      // Create order in Firestore.
      // The payment is already captured at this point, so createPaidOrder falls
      // back to a flagged order rather than throwing - a customer must never be
      // charged and left without a record of it.
      const created = await createPaidOrder(orderData);
      const docId = created.id;
      // Confirms the payment record and any points/cashback with the server
      // (and repairs them if verify-payment could not write them in time).
      void reconcileOrderRewards(docId);
      setFirestoreOrderId(docId);
      if (created.needsReview) {
        toast({
          title: 'Order received. It needs a quick check',
          description: 'Your payment went through and we have your order. Our team will confirm it shortly.',
        });
      }

      // Capture first product id BEFORE clearing the cart so DONE can return to it,
      // and snapshot the lines so the success dialog can list what was ordered.
      setLastOrderedProductId(items[0]?.id || null);
      setOrderedItems([...items]);

      // Clear cart
      clearCart();

      // Close payment modal and show success
      setShowPaymentDetails(false);
      setShowOrderSuccess(true);
      setShowOrderAnimation(true);
      setTimeout(() => setShowOrderAnimation(false), 2800);
    } catch (error) {
      console.error('Error placing order:', error);
      if (error instanceof RewardsUnavailableError) {
        setUsePoints(false);
        setUseCashback(false);
        toast({ title: 'Rewards unavailable right now', description: error.message });
        return;
      }
      if (error instanceof RewardsChangedError) {
        // The live ledger has already updated the total on this page.
        toast({ title: 'Your rewards balance changed', description: error.message });
        return;
      }
      if (error instanceof PaymentCancelledError) {
        toast({
          title: 'Payment cancelled',
          description: 'You closed the payment window. Your order was not placed.',
        });
      } else {
        toast({
          title: 'Could not place your order',
          description: error instanceof Error ? error.message : 'Try again in a moment.',
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
  const showForm = showAddressForm || addresses.length === 0;

  /** Remove a line and offer to put it back at the same quantity. */
  const removeWithUndo = (item: CartItem) => {
    const { quantity, ...line } = item;
    void removeFromCart(item.id);
    sonnerToast(`Removed ${item.name}`, {
      action: { label: 'Undo', onClick: () => addToCart(line, quantity) },
    });
  };

  const openConfirm = (kind: 'remove' | 'move') => {
    setConfirmAction({ kind, count: items.length });
    setConfirmOpen(true);
  };

  // Both of these empty the WHOLE cart, so they sit behind a confirmation.
  const handleConfirmed = () => {
    if (confirmAction?.kind === 'move') {
      const count = items.length;
      // addToWishlist is a no-op for products already saved, so nothing that
      // was already in the wishlist is ever removed from it (toggle used to).
      items.forEach((item) => {
        addToWishlist(item.id, item.name);
        removeFromCart(item.id);
      });
      // One summary toast instead of one per item.
      sonnerToast.dismiss();
      sonnerToast(`Moved ${plural(count, 'item')} to your wishlist`);
      return;
    }
    items.forEach((item) => removeFromCart(item.id));
  };

  const closePayment = () => {
    if (!isPlacingOrder) setShowPaymentDetails(false);
  };

  // Same rows in every bill block (display only).
  const billProps = {
    subtotal,
    deliveryCharge,
    deliveryBeforeFree: pricing.deliveryBeforeFree,
    discount,
    pointsApplied: pricing.pointsApplied,
    pointsValue: pricing.pointsValue,
    cashbackApplied: pricing.cashbackApplied,
    showGstLine,
    gstLabel,
    taxAmount,
    gstInclusive: !!pricing.gst.inclusive,
    total,
  };

  const panel = 'tx-sheet rounded-panel border border-foreground/[0.08] p-6 shadow-panel';

  return (
    <div className="min-h-screen tx-paper">
      <Header />

      <main id="main" tabIndex={-1} className="container mx-auto max-w-6xl px-4 py-8 outline-none" style={{ fontFamily: "var(--font-body)" }}>
        <h1 className="sr-only">Checkout</h1>

        {/* Back row, with the payment note on the right */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleBack}
            className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-control px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground transition-colors duration-hover hover:text-primary"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back
          </button>
          <p className="flex items-center gap-2 text-sm font-medium text-primary">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Secure payment via Razorpay
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Left Column - Address & Offers */}
          <div className="space-y-6 lg:col-span-2">
            {/* Delivery Address */}
            <section aria-labelledby="deliver-title" className={panel}>
              {addressesLoading ? (
                <div aria-busy="true" className="space-y-3">
                  <h2 id="deliver-title" className="sr-only">Delivery address</h2>
                  <Skeleton className="h-6 w-2/3" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                  <span className="sr-only">Loading your addresses</span>
                </div>
              ) : selectedAddress ? (
                <>
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <h2 id="deliver-title" className="text-lg font-semibold" style={HEADING_FONT}>
                      Deliver to: {selectedAddress.fullName}, {selectedAddress.pinCode}
                    </h2>
                    <Button
                      variant="outline"
                      onClick={handleOpenAddressSelector}
                      className="flex-shrink-0 border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
                    >
                      Change address
                    </Button>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {selectedAddress.address}
                    {selectedAddress.locality && `, ${selectedAddress.locality}`}
                    <br />
                    {selectedAddress.city}, {selectedAddress.state}
                    <br />
                    <span className="tabular-nums">Phone {selectedAddress.phoneNumber}</span>
                  </p>
                </>
              ) : (
                <div className="py-8 text-center">
                  <span className="tx-slate mx-auto mb-4 grid size-14 place-items-center rounded-card">
                    <MapPin aria-hidden="true" className="size-6 text-highlight-soft" />
                  </span>
                  <h2 id="deliver-title" className="mb-2 text-xl font-semibold text-foreground" style={HEADING_FONT}>No address saved yet</h2>
                  <p className="mb-5 text-sm text-muted-foreground">Add a delivery address to continue.</p>
                  <button type="button" onClick={handleOpenAddressSelector} className="btn-copper">
                    Add address
                  </button>
                </div>
              )}
            </section>

            {/* Address Selector Dialog */}
            <Dialog open={showAddressSelector} onOpenChange={(open) => { if (!open) handleCloseAddressSelector(); }}>
              <DialogContent
                hideClose
                aria-describedby={undefined}
                onCloseAutoFocus={returnFocus}
                className="flex max-h-[85dvh] max-w-2xl flex-col gap-0 overflow-y-hidden p-0"
                style={{ fontFamily: "var(--font-body)" }}
              >
                <div className="flex items-center justify-between gap-4 border-b border-foreground/[0.08] py-4 pl-6 pr-4">
                  <DialogTitle className="text-2xl font-semibold text-foreground" style={HEADING_FONT}>
                    Select delivery address
                  </DialogTitle>
                  <IconButton label="Close" onClick={handleCloseAddressSelector}>
                    <X aria-hidden="true" />
                  </IconButton>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
                  {showForm ? (
                    <form id="desktop-address-form" onSubmit={handleFormSubmit} noValidate className="space-y-5">
                      <Notice tone="info" role="note" compact>
                        Add a new delivery address for your order.
                      </Notice>
                      <AddressFields
                        prefix="desktop"
                        roomy
                        formData={formData}
                        errors={formErrors}
                        onChange={handleInputChange}
                        onDefaultChange={(checked) => setFormData((prev) => ({ ...prev, isDefault: checked }))}
                      />
                      {addresses.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowAddressForm(false)}
                          className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                        >
                          <ArrowLeft aria-hidden="true" className="size-4" />
                          Back to saved addresses
                        </button>
                      )}
                    </form>
                  ) : (
                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-foreground/80">Saved addresses</h3>
                      <div role="radiogroup" aria-label="Saved addresses" className="space-y-3">
                        {addresses.map((address) => (
                          <AddressOption
                            key={address.id}
                            address={address}
                            name="selectedAddress"
                            checked={tempSelectedAddress?.id === address.id}
                            onSelect={() => setTempSelectedAddress(address)}
                          />
                        ))}
                      </div>

                      {/* Add New Address Button */}
                      <button
                        type="button"
                        onClick={() => setShowAddressForm(true)}
                        className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-card border-2 border-dashed border-foreground/15 p-4 font-semibold text-primary transition-[border-color,background-color] duration-hover ease-out hover:border-primary/60 hover:bg-primary/10"
                      >
                        <Plus aria-hidden="true" className="size-4" />
                        Add address
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 border-t border-foreground/[0.08] px-6 py-4">
                  <Button type="button" variant="outline" onClick={handleCloseAddressSelector} className="h-12 flex-1">
                    Cancel
                  </Button>
                  {showForm ? (
                    <Button type="submit" form="desktop-address-form" disabled={formLoading} className="h-12 flex-1">
                      {formLoading && <Spinner size={16} />}
                      {formLoading ? 'Saving' : 'Save and deliver here'}
                    </Button>
                  ) : (
                    <Button type="button" onClick={handleDeliverHere} disabled={!tempSelectedAddress} className="h-12 flex-1">
                      Deliver here
                    </Button>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Available Offers */}
            {pricing.redeemableCoupons.length > 0 && (
              <section className={panel}>
                <button
                  type="button"
                  onClick={() => setShowOffers(!showOffers)}
                  aria-expanded={showOffers}
                  aria-controls="desktop-offers"
                  className="flex min-h-10 w-full items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-full bg-muted">
                      <Tag aria-hidden="true" className="size-4" />
                    </span>
                    <h2 className="text-lg font-semibold" style={HEADING_FONT}>Available offers</h2>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-5 transition-transform duration-dropdown ease-out ${showOffers ? 'rotate-180' : ''}`}
                  />
                </button>

                {showOffers && (
                  <motion.div
                    id="desktop-offers"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: DUR.dropdown, ease: EASE_OUT }}
                    className="mt-4 space-y-3"
                  >
                    {visibleOffers.map((c) => {
                      const { label, description } = offerText(c);
                      return (
                        <OfferCard
                          key={c.id}
                          code={c.code}
                          label={label}
                          description={description}
                          isApplied={pricing.appliedCoupon?.code === c.code}
                          loading={pricing.couponLoading}
                          onApply={() => pricing.applyCoupon(c.code)}
                        />
                      );
                    })}
                    {offers.length > 2 && (
                      <button
                        type="button"
                        className="min-h-10 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                        onClick={() => setShowAllOffers((prev) => !prev)}
                      >
                        {showAllOffers ? 'Show less' : `Show ${offers.length - 2} more`}
                      </button>
                    )}
                  </motion.div>
                )}
              </section>
            )}

            {/* Cart Items */}
            <section aria-labelledby="bag-title" className={panel}>
              {items.some((i) => unavailable[i.id]) && (
                <div className="mb-4">
                  <UnavailableItemsNotice items={items} unavailable={unavailable} onRemove={removeFromCart} />
                </div>
              )}
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h2 id="bag-title" className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground tabular-nums">
                  {plural(items.length, 'item')} in your bag
                </h2>
                <div className="flex gap-5">
                  <button
                    type="button"
                    onClick={() => openConfirm('remove')}
                    className="min-h-10 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground transition-colors duration-hover hover:text-primary"
                  >
                    Remove all
                  </button>
                  <button
                    type="button"
                    onClick={() => openConfirm('move')}
                    className="min-h-10 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground transition-colors duration-hover hover:text-primary"
                  >
                    Move all to wishlist
                  </button>
                </div>
              </div>

              <ul className="space-y-6">
                {items.map((item) => (
                  <li key={item.id} className="flex gap-4">
                    <div className="size-24 flex-shrink-0 overflow-hidden rounded-card bg-muted">
                      <SmartImage src={item.image} alt="" className="h-full w-full object-cover" preset="thumb" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="mb-1 font-medium text-foreground">{item.name}</h3>
                      <UnavailableTag reason={unavailable[item.id]} />
                      {item.category && (
                        <p className="mb-2 text-sm text-muted-foreground">Sold by Ishaputra Botanicals</p>
                      )}
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="price-now">{formatPrice(item.price)}</span>
                        {item.originalPrice && item.originalPrice > item.price && (
                          <>
                            <span className="price-was text-sm">
                              <span className="sr-only">Was </span>
                              {formatPrice(item.originalPrice)}
                            </span>
                            <span className="chip-off">{Math.round((1 - item.price / item.originalPrice) * 100)}% off</span>
                          </>
                        )}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {/*
                          Real controls, matching the cart drawer. Changing a
                          quantity to zero removes just that line, as it does
                          everywhere else in the app.
                        */}
                        <div className="flex h-9 items-center rounded-full border border-border bg-muted/50">
                          <button
                            type="button"
                            onClick={() => {
                              if (item.quantity === 1) removeWithUndo(item);
                              else updateQuantity(item.id, item.quantity - 1);
                            }}
                            className="flex size-9 items-center justify-center rounded-l-full text-muted-foreground transition-[background-color,color,transform] duration-press ease-out hover:bg-muted hover:text-foreground active:scale-[0.97]"
                            aria-label={item.quantity === 1 ? `Remove ${item.name}` : `Decrease quantity of ${item.name}`}
                          >
                            <Minus aria-hidden="true" className="size-3.5" />
                          </button>
                          <span aria-live="polite" className="w-8 select-none text-center text-xs font-semibold tabular-nums">
                            <span className="sr-only">Quantity </span>
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            disabled={typeof item.stock === 'number' && item.quantity >= item.stock}
                            className="flex size-9 items-center justify-center rounded-r-full text-muted-foreground transition-[background-color,color,transform] duration-press ease-out hover:bg-muted hover:text-foreground active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                            aria-label={`Increase quantity of ${item.name}`}
                          >
                            <Plus aria-hidden="true" className="size-3.5" />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeWithUndo(item)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-control px-1 text-sm text-muted-foreground transition-colors duration-hover hover:text-destructive"
                          aria-label={`Remove ${item.name} from cart`}
                        >
                          <Trash2 aria-hidden="true" className="size-3.5" />
                          Remove
                        </button>
                        {/* Real stock, and only when it is genuinely low. */}
                        {typeof item.stock === 'number' && item.stock > 0 && item.stock <= 5 && (
                          <span className="text-sm text-highlight">
                            {item.stock === 1 ? 'Last one left' : `Only ${item.stock} left`}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <RotateCcw aria-hidden="true" className="size-4 text-primary" />
                        7-day returns
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Right Column - Coupons & Price Details */}
          <div className="space-y-6">
            {/* Coupons */}
            <section className={panel}>
              <div className="mb-4 flex items-center gap-2">
                <Tag aria-hidden="true" className="size-5" />
                <h2 className="font-semibold" style={HEADING_FONT}>Have a coupon?</h2>
              </div>
              {pricing.appliedCoupon ? (
                <div className="flex items-center justify-between rounded-control border border-primary/25 bg-primary/[0.06] p-3">
                  <div>
                    <div className="font-semibold text-primary">{pricing.appliedCoupon.code}</div>
                    <div className="text-xs tabular-nums text-primary">You saved {formatPrice(pricing.discount)}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { pricing.removeCoupon(); setCouponCode(''); }}>Remove</Button>
                </div>
              ) : (
                <CouponForm
                  id="desktop-coupon"
                  value={couponCode}
                  onChange={setCouponCode}
                  loading={pricing.couponLoading}
                  error={pricing.couponError}
                  onApply={async () => {
                    const code = couponCode.trim().toUpperCase();
                    const r = await pricing.applyCoupon(couponCode);
                    // The inline message reports a failure; success gets one toast.
                    if (r.ok) toast({ title: `Coupon ${code} applied` });
                  }}
                />
              )}
            </section>

            {/* Loyalty points / wallet cashback */}
            <RewardsRedeemCard
              balances={rewardsState.balances}
              settings={rewardsState.settings}
              usePoints={usePoints}
              useCashback={useCashback}
              onUsePoints={setUsePoints}
              onUseCashback={setUseCashback}
              pointsApplied={pricing.pointsApplied}
              pointsValue={pricing.pointsValue}
              cashbackApplied={pricing.cashbackApplied}
            />

            {/* Price Details */}
            <section aria-labelledby="price-title" className={`${panel} lg:sticky lg:top-[var(--sticky-top)]`}>
              <h2 id="price-title" className="mb-5 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground tabular-nums">
                Price details · {plural(items.length, 'item')}
              </h2>

              <BillRows
                {...billProps}
                note={
                  pricing.freeDelivery && pricing.deliveryBeforeFree > 0 ? (
                    <p className="flex items-center gap-2 rounded-control border border-primary/25 bg-primary/[0.06] p-3 text-sm text-foreground">
                      <Truck aria-hidden="true" className="size-4 flex-shrink-0 text-primary" />
                      <span className="tabular-nums">Free delivery on this order. You save {formatPrice(pricing.deliveryBeforeFree)}.</span>
                    </p>
                  ) : null
                }
              />

              <button
                type="button"
                className="btn-copper mt-6 h-12 w-full !text-[12px]"
                onClick={() => {
                  if (!selectedAddress) {
                    toast({
                      title: 'Add a delivery address to continue',
                      variant: 'destructive',
                    });
                    return;
                  }
                  setShowPaymentDetails(true);
                }}
              >
                Place order
              </button>

              {/* Trust Badges */}
              <ul className="mt-4 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
                  Secure payment via Razorpay
                </li>
                <li className="flex items-center gap-2">
                  <RotateCcw aria-hidden="true" className="size-4 text-primary" />
                  7-day returns
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone={confirmAction?.kind === 'move' ? 'default' : 'danger'}
        title={
          confirmAction?.kind === 'move'
            ? `Move ${confirmAction.count === 1 ? 'this item' : `all ${plural(confirmAction.count, 'item')}`} to your wishlist?`
            : confirmAction?.count === 1
              ? 'Remove this item?'
              : `Remove all ${plural(confirmAction?.count ?? 0, 'item')}?`
        }
        description={
          confirmAction?.kind === 'move'
            ? 'They will be saved in your wishlist and your bag will be empty.'
            : 'Your bag will be empty. You can add products again from the shop.'
        }
        confirmLabel={confirmAction?.kind === 'move' ? 'Move all' : 'Remove all'}
        cancelLabel="Keep items"
        onConfirm={handleConfirmed}
      />

      {/* ─── Payment Details (Desktop) ─── */}
      {/* Hand-built rather than a Radix dialog on purpose: Razorpay opens its
          own window on top of this one, and a modal focus trap would block it. */}
      <AnimatePresence>
        {showPaymentDetails && (
          <>
            <motion.div
              key="payment-scrim"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: DUR.exit } }}
              transition={{ duration: DUR.modal, ease: EASE_OUT }}
              onClick={closePayment}
              className="fixed inset-0 z-overlay bg-charcoal/60 backdrop-blur-[2px]"
            />
            <motion.div
              key="payment-dialog"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: DUR.exit } }}
              transition={{ duration: DUR.modal, ease: EASE_OUT }}
              className="pointer-events-none fixed inset-0 z-overlay flex items-center justify-center p-8"
            >
              <div
                ref={paymentDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="payment-title"
                tabIndex={-1}
                className="pointer-events-auto flex max-h-[min(92dvh,800px)] w-full max-w-md flex-col overflow-hidden rounded-panel border border-foreground/10 bg-card shadow-panel outline-none"
                style={{ fontFamily: "var(--font-body)" }}
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 border-b border-foreground/[0.08] py-3 pl-6 pr-3">
                  <div>
                    <h2 id="payment-title" className="text-xl font-semibold text-foreground" style={HEADING_FONT}>Complete your order</h2>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ShieldCheck aria-hidden="true" className="size-3.5 text-primary" />
                      Secure payment via Razorpay
                    </p>
                  </div>
                  <IconButton label="Close" onClick={closePayment} disabled={isPlacingOrder}>
                    <X aria-hidden="true" />
                  </IconButton>
                </div>

                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5">
                  {/* Items */}
                  <ul className="space-y-2.5">
                    {items.slice(0, showAllItems ? items.length : 2).map((item) => (
                      <li key={item.id} className="flex items-center gap-3">
                        <div className="size-12 flex-shrink-0 overflow-hidden rounded-control bg-foreground/[0.03] ring-1 ring-foreground/[0.06]">
                          <SmartImage src={item.image} alt="" className="h-full w-full object-cover" preset="thumb" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">Qty {item.quantity}</p>
                        </div>
                        <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">{formatPrice(item.price * item.quantity)}</span>
                      </li>
                    ))}
                    {items.length > 2 && (
                      <li>
                        <button
                          type="button"
                          onClick={() => setShowAllItems((v) => !v)}
                          aria-expanded={showAllItems}
                          className="min-h-9 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                        >
                          {showAllItems ? 'Show less' : `Show ${plural(items.length - 2, 'more item')}`}
                        </button>
                      </li>
                    )}
                  </ul>

                  <Separator />

                  {/* Payment Method */}
                  <div>
                    <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Payment method</h3>
                    <label className={`flex cursor-pointer items-center gap-3 rounded-card p-3.5 transition-[border-color,background-color] duration-hover ease-out ${selectedPaymentMethod === 'Razorpay' ? 'border-2 border-primary bg-primary/5' : 'border border-foreground/[0.08] hover:border-foreground/25'}`}>
                      <span className={`flex size-9 flex-shrink-0 items-center justify-center rounded-control ${selectedPaymentMethod === 'Razorpay' ? 'bg-primary' : 'bg-foreground/[0.06]'}`}>
                        <CreditCard aria-hidden="true" className={`size-5 ${selectedPaymentMethod === 'Razorpay' ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-foreground">Pay online</span>
                        <span className="text-xs text-muted-foreground">Cards, UPI, wallets and net banking</span>
                      </span>
                      <input
                        type="radio"
                        name="desktopPaymentMethod"
                        value="Razorpay"
                        checked={selectedPaymentMethod === 'Razorpay'}
                        onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                        className="size-5 accent-primary"
                      />
                    </label>
                  </div>

                  <Separator />

                  {/* Price Breakdown */}
                  <BillRows {...billProps} amountClassName="text-xl" />
                </div>

                {/* Footer with CTA */}
                <div className="space-y-1 border-t border-foreground/[0.08] px-6 py-4">
                  <button
                    type="button"
                    onClick={handlePlaceOrder}
                    disabled={isPlacingOrder}
                    className="btn-copper h-12 w-full !text-[12px]"
                  >
                    {isPlacingOrder ? (
                      <>
                        <Spinner size={16} />
                        Processing
                      </>
                    ) : (
                      <span className="tabular-nums">Pay {formatPrice(total)}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={closePayment}
                    disabled={isPlacingOrder}
                    className="min-h-10 w-full text-center text-xs font-medium text-muted-foreground transition-colors duration-hover hover:text-foreground disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── Order confirmed moment (Desktop) ─── */}
      <AnimatePresence>{showOrderAnimation && <OrderCelebration />}</AnimatePresence>

      {/* ─── Order Success Dialog (Desktop) ─── */}
      <Dialog open={showOrderSuccess} onOpenChange={(open) => { if (!open) setShowOrderSuccess(false); }}>
        <DialogContent
          hideClose
          onCloseAutoFocus={returnFocus}
          className="flex max-h-[90dvh] max-w-2xl flex-col gap-0 overflow-y-hidden p-0"
          style={{ fontFamily: "var(--font-body)" }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-foreground/[0.08] py-3 pl-6 pr-3">
            <p className="text-base font-semibold text-foreground">Your order</p>
            <IconButton label="Close" onClick={() => setShowOrderSuccess(false)}>
              <X aria-hidden="true" />
            </IconButton>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-8">
            {/* Success Icon */}
            <div className="mb-6 flex justify-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: DUR.modal, ease: EASE_OUT }}
                className="grid size-24 place-items-center rounded-full bg-primary/10"
              >
                <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check aria-hidden="true" className="size-8 [stroke-width:2]" />
                </span>
              </motion.div>
            </div>

            <DialogTitle className="mb-2 text-center text-2xl font-semibold text-foreground" style={HEADING_FONT}>
              Order confirmed
            </DialogTitle>
            <DialogDescription className="mx-auto mb-8 max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
              We have your payment and your order. We will email you when it ships.
            </DialogDescription>

            <div className="space-y-4">
              <dl className="divide-y divide-foreground/[0.08] rounded-card border border-foreground/[0.08] px-4">
                <div className="flex items-baseline justify-between gap-4 py-3.5">
                  <dt className="text-sm text-muted-foreground">Order number</dt>
                  <dd className="text-sm font-bold tabular-nums text-foreground">{orderId}</dd>
                </div>
                {selectedAddress && (
                  <div className="flex items-baseline justify-between gap-4 py-3.5">
                    <dt className="flex-shrink-0 text-sm text-muted-foreground">Shipping to</dt>
                    <dd className="text-right text-sm leading-relaxed text-foreground">
                      {selectedAddress.address}
                      {selectedAddress.locality && `, ${selectedAddress.locality}`}, {selectedAddress.city}, {selectedAddress.state} {selectedAddress.pinCode}
                    </dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between gap-4 py-3.5">
                  <dt className="text-sm text-muted-foreground">Payment</dt>
                  <dd className="text-sm text-foreground">
                    {selectedPaymentMethod === 'Razorpay' ? 'Paid online (Razorpay)' : selectedPaymentMethod}
                  </dd>
                </div>
              </dl>

              {/* Order Summary: the snapshot taken before the cart was cleared */}
              {orderedItems.length > 0 && (
                <section aria-labelledby="desktop-ordered-title" className="rounded-card border border-foreground/[0.08] p-4">
                  <h3 id="desktop-ordered-title" className="mb-3 text-base font-semibold text-foreground" style={HEADING_FONT}>Order summary</h3>
                  <ul className="divide-y divide-foreground/[0.08]">
                    <OrderedLine item={orderedItems[0]} />
                    {showAllItems && orderedItems.slice(1).map((item) => <OrderedLine key={item.id} item={item} />)}
                  </ul>
                  {orderedItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setShowAllItems(!showAllItems)}
                      aria-expanded={showAllItems}
                      className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-control text-sm font-medium text-primary transition-colors duration-hover hover:bg-primary/10"
                    >
                      {showAllItems ? 'Show less' : `Show ${plural(orderedItems.length - 1, 'more item')}`}
                      <ChevronDown aria-hidden="true" className={`size-4 transition-transform duration-dropdown ease-out ${showAllItems ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </section>
              )}
            </div>
          </div>

          {/* Footer with Buttons */}
          <div className="flex gap-4 border-t border-foreground/[0.08] px-6 py-4">
            <button
              type="button"
              onClick={() => {
                navigate(`/account/orders/${firestoreOrderId ?? orderId}`);
              }}
              className="btn-copper h-12 flex-1"
            >
              Track order
            </button>
            <button
              type="button"
              onClick={() => {
                if (lastOrderedProductId) {
                  navigate(`/product/${lastOrderedProductId}`);
                } else {
                  navigate('/');
                }
              }}
              className="btn-line h-12 flex-1 text-foreground"
            >
              Done
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default Checkout;
