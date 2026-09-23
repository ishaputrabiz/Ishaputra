import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  ChevronLeft,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Truck,
  User,
  Package,
  Calendar,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  isCashOnDeliveryOrder,
  isPaymentSettled,
  markCODPaymentCollected,
  Order,
  subscribeToOrder,
  updateOrderStatus,
  verifyDeliveryOTP,
  verifyReturnPickupOTP,
  verifyReturnToStoreOTP,
  setDeliveryWindow,
  setReturnPickupWindow,
  startFailedDeliveryReturn,
  FULFILLMENT_WINDOW_TEMPLATES,
  resolveFulfillmentWindowTemplate,
  type FulfillmentWindowTemplateId,
} from '@/services/orderService';
import { toast } from 'sonner';

// ── constants ─────────────────────────────────────────────────────────────────

const CHAT_TEMPLATES = [
  "Hi, I'm your delivery partner from Sreerasthu Silvers. I'm on my way!",
  'Hello, I have arrived. Please share your OTP to confirm delivery.',
  "I'm at your location. Could you come down to collect the order?",
  "I'm running a few minutes late. Will reach soon, thank you for your patience!",
];

// ── helpers ───────────────────────────────────────────────────────────────────

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0);

type DeliveryWindowMeta = Order & {
  returnScheduledAt?: unknown;
  delivery_window_date?: string;
  delivery_window_from?: string;
  delivery_window_to?: string;
  delivery_window_note?: string;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

// ── SlideToDeliver ─────────────────────────────────────────────────────────────
/**
 * Drag-the-knob control. Fires onConfirm() when the knob reaches the end.
 */
const SlideToDeliver = ({
  onConfirm,
  disabled,
  label = 'Slide to Deliver →',
  trackClassName = 'bg-gradient-to-r from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/30',
  fillClassName = 'bg-emerald-700/35',
  knobIconClassName = 'text-emerald-600',
  KnobIcon = Truck,
}: {
  onConfirm: () => void;
  disabled?: boolean;
  label?: string;
  trackClassName?: string;
  fillClassName?: string;
  knobIconClassName?: string;
  KnobIcon?: React.ElementType;
}) => {
  const trackRef  = useRef<HTMLDivElement>(null);
  const x         = useMotionValue(0);
  const [width, setWidth] = useState(0);
  const knob  = 56;
  const maxX  = Math.max(width - knob - 8, 0);

  useEffect(() => {
    const sync = () => setWidth(trackRef.current?.offsetWidth ?? 0);
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  const progress   = useTransform(x, [0, Math.max(maxX, 1)], [0, 1]);
  const fillWidth  = useTransform(progress, (v) => `${Math.min(v * 100, 100)}%`);
  const labelOpacity = useTransform(progress, [0, 0.55], [1, 0]);

  return (
    <div
      ref={trackRef}
      className={`relative h-16 w-full overflow-hidden rounded-2xl ${trackClassName}`}
    >
      {/* fill */}
      <motion.div
        style={{ width: fillWidth }}
        className={`absolute inset-y-0 left-0 ${fillClassName}`}
      />

      {/* label */}
      <motion.span
        style={{ opacity: labelOpacity }}
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-base font-bold uppercase tracking-widest text-white"
      >
        {label}
      </motion.span>

      {/* knob */}
      <motion.div
        drag={disabled ? false : 'x'}
        dragConstraints={{ left: 0, right: maxX }}
        dragElastic={0}
        dragMomentum={false}
        style={{ x, width: knob, height: knob }}
        onDragEnd={() => {
          if (x.get() >= maxX - 4) {
            onConfirm();
            animate(x, 0, { duration: 0.3 });
          } else {
            animate(x, 0, { type: 'spring', stiffness: 400, damping: 30 });
          }
        }}
        className={`absolute left-1 top-1 flex cursor-grab items-center justify-center rounded-xl bg-white ${knobIconClassName} shadow-md active:cursor-grabbing`}
      >
        <KnobIcon className="h-6 w-6" />
      </motion.div>
    </div>
  );
};

// ── Page ──────────────────────────────────────────────────────────────────────

const DeliveryOrderDetails = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate    = useNavigate();
  const { user, isDelivery } = useAuth();

  const [order, setOrder]           = useState<Order | null>(null);
  const [loading, setLoading]       = useState(true);
  const [otpOpen, setOtpOpen]       = useState(false);
  const [otpInput, setOtpInput]     = useState('');
  const [otpError, setOtpError]     = useState('');
  const [verifying, setVerifying]   = useState(false);
  const [chatOpen, setChatOpen]     = useState(false);

  // Return pickup OTP states
  const [returnOtpOpen, setReturnOtpOpen]         = useState(false);
  const [markingReturned, setMarkingReturned]       = useState(false);
  const [returnStoreOtpOpen, setReturnStoreOtpOpen] = useState(false);
  const [returnStoreOtpInput, setReturnStoreOtpInput] = useState('');
  const [returnStoreOtpError, setReturnStoreOtpError] = useState('');
  const [returnStoreVerifying, setReturnStoreVerifying] = useState(false);
  const [returnOtpInput, setReturnOtpInput]   = useState('');
  const [returnOtpError, setReturnOtpError]   = useState('');
  const [returnVerifying, setReturnVerifying] = useState(false);

  // Delivery window states
  const [windowOpen, setWindowOpen]     = useState(false);
  const [windowKind, setWindowKind]     = useState<'delivery' | 'return'>('delivery');
  const [windowDate, setWindowDate]     = useState('');
  const [windowFrom, setWindowFrom]     = useState('');
  const [windowTo, setWindowTo]         = useState('');
  const [windowNote, setWindowNote]     = useState('');
  const [savingWindow, setSavingWindow] = useState(false);
  const [collectingPayment, setCollectingPayment] = useState(false);

  // Customer unavailable / failed delivery states
  const [unavailableOpen, setUnavailableOpen]           = useState(false);
  const [unavailableReason, setUnavailableReason]       = useState('');
  const [unavailableConfirming, setUnavailableConfirming] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!user || !isDelivery) navigate('/deliverypartner');
  }, [user, isDelivery, navigate]);

  // Real-time order
  useEffect(() => {
    if (!orderId) { navigate('/delivery/dashboard'); return; }
    setLoading(true);

    const unsub = subscribeToOrder(
      orderId,
      (data) => {
        if (!data) {
          toast.error('Order not found');
          navigate('/delivery/dashboard');
          return;
        }
        const assigned = data.delivery_partner_id || data.delivery_boy_id;
        if (assigned && user?.uid && assigned !== user.uid) {
          toast.error('You are not assigned to this order');
          navigate('/delivery/dashboard');
          return;
        }
        setOrder(data);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error('Failed to load order');
        setLoading(false);
      },
    );

    return () => unsub();
  }, [orderId, user, navigate]);

  // Map embed
  const mapSrc = useMemo(() => {
    if (!order) return null;
    const a = order.shippingAddress;
    if (a.latitude && a.longitude) {
      return `https://maps.google.com/maps?q=${a.latitude},${a.longitude}&z=16&output=embed`;
    }
    const q = encodeURIComponent(
      [a.address, a.locality, a.city, a.state, a.pincode].filter(Boolean).join(', '),
    );
    return `https://maps.google.com/maps?q=${q}&z=15&output=embed`;
  }, [order]);

  // OTP handlers
  const openOtp = () => {
    if (paymentPending) {
      toast.error('Mark the COD payment as collected before entering the OTP.');
      return;
    }
    setOtpInput('');
    setOtpError('');
    setOtpOpen(true);
  };

  const handleVerify = async () => {
    if (!order || !user) return;
    if (paymentPending) {
      const message = 'Mark the COD payment as collected before entering the OTP.';
      setOtpError(message);
      toast.error(message);
      return;
    }
    if (otpInput.length !== 4) { setOtpError('Enter the 4-digit OTP'); return; }
    setVerifying(true);
    try {
      const result = await verifyDeliveryOTP(order.id, otpInput, user.uid);
      if (result && result.success === false) {
        setOtpError(result.message || 'Invalid OTP');
        toast.error(result.message || 'Invalid OTP');
        return;
      }
      toast.success('Delivery completed!', { description: 'Order marked as delivered.' });
      setOtpOpen(false);
    } catch (err: unknown) {
      setOtpError(getErrorMessage(err, 'Failed to verify'));
      toast.error(getErrorMessage(err, 'Failed to verify OTP'));
    } finally {
      setVerifying(false);
    }
  };

  // Return pickup OTP handlers
  const openReturnOtp = () => {
    setReturnOtpInput('');
    setReturnOtpError('');
    setReturnOtpOpen(true);
  };

  const handleVerifyReturn = async () => {
    if (!order || !user) return;
    if (returnOtpInput.length !== 4) { setReturnOtpError('Enter the 4-digit OTP'); return; }
    setReturnVerifying(true);
    try {
      const result = await verifyReturnPickupOTP(order.id, returnOtpInput, user.uid);
      if (!result.success) {
        setReturnOtpError(result.message || 'Invalid OTP');
        toast.error(result.message || 'Invalid OTP');
        return;
      }
      toast.success('Return pickup confirmed!', { description: 'Item collected from customer.' });
      setReturnOtpOpen(false);
    } catch (err: unknown) {
      setReturnOtpError(getErrorMessage(err, 'Failed to verify'));
      toast.error(getErrorMessage(err, 'Failed to verify OTP'));
    } finally {
      setReturnVerifying(false);
    }
  };

  // WhatsApp sender
  const sendWhatsApp = (text: string) => {
    if (!order) return;
    const raw = (order.shippingAddress.mobile || '').replace(/\D/g, '');
    if (!raw) { toast.error('No customer phone number'); return; }
    const intl = raw.length === 10 ? `91${raw}` : raw;
    window.open(`https://wa.me/${intl}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    setChatOpen(false);
  };

  const canDeliver = !!order && (order.status === 'outForDelivery' || order.status === 'picked');
  const isDelivered = order?.status === 'delivered';
  const canPickupReturn = order?.status === 'returnScheduled';
  const orderWindowMeta = order as DeliveryWindowMeta | null;
  const isReturnPickedUp = order?.status === 'picked' && !!orderWindowMeta?.returnScheduledAt;
  const isReturnedToStore = order?.status === 'returned' && !!orderWindowMeta?.returnScheduledAt;
  const isDeliveryFailed = order?.status === 'deliveryFailed';

  // Window-gating: OTP verification cannot proceed until a fulfillment window is saved.
  const hasDeliveryWindow = !!(order?.delivery_window_date && order?.delivery_window_from && order?.delivery_window_to);
  const hasReturnWindow = !!(order?.return_window_date && order?.return_window_from && order?.return_window_to);

  useEffect(() => {
    if (!order || windowOpen) return;
    if (canDeliver && !hasDeliveryWindow && !isReturnPickedUp && !isDeliveryFailed) {
      setWindowKind('delivery');
      setWindowDate(order.delivery_window_date || '');
      setWindowFrom(order.delivery_window_from || '');
      setWindowTo(order.delivery_window_to || '');
      setWindowNote(order.delivery_window_note || '');
      setWindowOpen(true);
      return;
    }
    if (canPickupReturn && !hasReturnWindow) {
      setWindowKind('return');
      setWindowDate(order.return_window_date || '');
      setWindowFrom(order.return_window_from || '');
      setWindowTo(order.return_window_to || '');
      setWindowNote(order.return_window_note || '');
      setWindowOpen(true);
    }
  }, [
    order,
    windowOpen,
    canDeliver,
    hasDeliveryWindow,
    isReturnPickedUp,
    isDeliveryFailed,
    canPickupReturn,
    hasReturnWindow,
  ]);

  // ── loading ──
  if (loading || !order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  const isCod = isCashOnDeliveryOrder(order);
  const isPaid = isPaymentSettled(order);
  const paymentPending = isCod && !isPaid;
  const collectorName =
    user?.displayName || order.delivery_partner_name || order.delivery_boy_name || 'Delivery partner';

  const handleMarkPaymentCollected = async () => {
    if (!order || !user || collectingPayment || !paymentPending) return;
    setCollectingPayment(true);
    try {
      await markCODPaymentCollected(order.id, user.uid, collectorName);
      toast.success('COD payment marked as collected. You can now complete the delivery.');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to mark payment collected'));
    } finally {
      setCollectingPayment(false);
    }
  };

  const handleMarkReturned = async () => {
    if (markingReturned) return;
    setMarkingReturned(true);
    try {
      await updateOrderStatus(order.id, 'returned');
      toast.success('Return confirmed! Item marked as returned to store.');
    } catch (err) {
      console.error('Error marking returned:', err);
      toast.error('Failed to confirm return. Please try again.');
    } finally {
      setMarkingReturned(false);
    }
  };

  const handleVerifyReturnStore = async () => {
    if (returnStoreVerifying || returnStoreOtpInput.length !== 4) return;
    setReturnStoreVerifying(true);
    setReturnStoreOtpError('');
    try {
      const result = await verifyReturnToStoreOTP(order.id, returnStoreOtpInput, user!.uid);
      if (result.success) {
        setReturnStoreOtpOpen(false);
        setReturnStoreOtpInput('');
        toast.success('Return confirmed! Item marked as returned to store.');
      } else {
        setReturnStoreOtpError(result.message);
      }
    } catch (err) {
      console.error('Error verifying return store OTP:', err);
      setReturnStoreOtpError('Failed to verify. Please try again.');
    } finally {
      setReturnStoreVerifying(false);
    }
  };

  const handleSetWindow = async () => {
    if (!order) return;
    if (!windowDate || !windowFrom || !windowTo) {
      toast.error('Please fill in date and time range.');
      return;
    }
    setSavingWindow(true);
    try {
      const payload = { date: windowDate, from: windowFrom, to: windowTo, note: windowNote || undefined };
      if (windowKind === 'return') {
        await setReturnPickupWindow(order.id, payload);
        toast.success('Return pickup window saved!');
      } else {
        await setDeliveryWindow(order.id, payload);
        toast.success('Delivery window saved!');
      }
      setWindowOpen(false);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to save window.'));
    } finally {
      setSavingWindow(false);
    }
  };

  const applyWindowTemplate = (id: FulfillmentWindowTemplateId) => {
    const tpl = FULFILLMENT_WINDOW_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    const resolved = resolveFulfillmentWindowTemplate(tpl);
    setWindowDate(resolved.date);
    setWindowFrom(resolved.from);
    setWindowTo(resolved.to);
  };

  const openDeliveryWindow = () => {
    setWindowKind('delivery');
    setWindowDate(order.delivery_window_date || '');
    setWindowFrom(order.delivery_window_from || '');
    setWindowTo(order.delivery_window_to || '');
    setWindowNote(order.delivery_window_note || '');
    setWindowOpen(true);
  };

  const openReturnWindow = () => {
    setWindowKind('return');
    setWindowDate(order.return_window_date || '');
    setWindowFrom(order.return_window_from || '');
    setWindowTo(order.return_window_to || '');
    setWindowNote(order.return_window_note || '');
    setWindowOpen(true);
  };

  const handleCustomerUnavailable = async () => {
    if (unavailableConfirming) return;
    setUnavailableConfirming(true);
    try {
      await startFailedDeliveryReturn(order.id, user!.uid, unavailableReason || undefined);
      toast.success('Delivery marked as failed. Return process started.');
      setUnavailableOpen(false);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to start return process.'));
    } finally {
      setUnavailableConfirming(false);
    }
  };

  const { fullName, mobile, address, locality, city, state, pincode, landmark } =
    order.shippingAddress;

  // ── render ──
  return (
    <div className="min-h-screen bg-stone-50 pb-36">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-10 border-b border-stone-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate('/delivery/dashboard')}
            className="rounded-xl bg-stone-100 p-2 text-stone-500 hover:bg-stone-200 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">
              Delivery Order
            </p>
            <p className="font-mono text-base font-bold text-stone-800">#{order.orderId}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold shrink-0 ${
              isPaid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {isPaid ? (isCod ? 'COD Collected' : 'Prepaid') : 'COD Due'} · {formatCurrency(order.total)}
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-4 px-4 py-5">

        {/* ── Customer card ── */}
        <div className="rounded-2xl border border-stone-100 bg-white p-5 shadow-sm">
          {/* Name + avatar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50">
              <User className="h-6 w-6 text-amber-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-stone-900 text-base">{fullName}</p>
              {mobile && (
                <a
                  href={`tel:${mobile}`}
                  className="text-sm text-stone-500 hover:text-emerald-600 transition-colors"
                >
                  {mobile}
                </a>
              )}
            </div>
          </div>

          {/* Address */}
          <div className="flex items-start gap-2 mb-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
            <div>
              <p className="text-sm text-stone-700 leading-relaxed">
                {address}{locality && `, ${locality}`}, {city} — {pincode}
              </p>
              <p className="text-xs text-stone-500">{state}</p>
              {landmark && (
                <p className="mt-0.5 text-xs italic text-stone-400">Near: {landmark}</p>
              )}
            </div>
          </div>

          {/* Map */}
          {mapSrc && (
            <div className="mt-4 overflow-hidden rounded-xl border border-stone-200">
              <iframe
                title="Delivery location"
                src={mapSrc}
                className="h-48 w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}

          {/* Call + Chat */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <a
              href={`tel:${mobile}`}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-50 py-3.5 font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              <Phone className="h-4 w-4" />
              Call Customer
            </a>
            <button
              onClick={() => setChatOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-50 py-3.5 font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </button>
          </div>
        </div>

        {/* ── Order summary (no items list) ── */}
        <div className="rounded-2xl border border-stone-100 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-50">
              <Package className="h-5 w-5 text-stone-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-stone-400 uppercase tracking-wider mb-0.5">
                {order.items.length} {order.items.length === 1 ? 'item' : 'items'}
              </p>
              <p className="text-sm font-medium text-stone-700 truncate">
                {order.items.map(i => i.name).join(', ')}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-stone-400 uppercase tracking-wider mb-0.5">
                    {isPaid ? 'Paid' : 'Collect'}
              </p>
              <p className="text-lg font-bold text-stone-900">
                {isPaid ? '—' : formatCurrency(order.total)}
              </p>
            </div>
          </div>
        </div>

        {/* ── Delivered confirmation ── */}
        {isDelivered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center justify-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-700"
          >
            <ShieldCheck className="h-6 w-6" />
            <div>
              <p className="font-bold text-base">Delivered!</p>
              <p className="text-sm text-emerald-600">OTP verified · Order complete</p>
            </div>
          </motion.div>
        )}

        {/* ── Return Picked Up confirmation ── */}
        {isReturnPickedUp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
          >
            <div className="flex items-center gap-3 mb-3">
              <ShieldCheck className="h-6 w-6 text-amber-600 shrink-0" />
              <div>
                <p className="font-bold text-base text-amber-700">Return Picked Up!</p>
                <p className="text-sm text-amber-600">OTP verified · Item collected from customer</p>
              </div>
            </div>
            <p className="text-sm text-amber-700 leading-relaxed">
              Please bring the item back to the store and slide below to confirm.
            </p>
          </motion.div>
        )}

        {/* ── Returned to Store confirmation ── */}
        {isReturnedToStore && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center justify-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-700"
          >
            <ShieldCheck className="h-6 w-6" />
            <div>
              <p className="font-bold text-base">Returned to Store!</p>
              <p className="text-sm text-emerald-600">Item delivered back to store · Return complete</p>
            </div>
          </motion.div>
        )}

        {/* ── Saved Delivery Window display ── */}
        {orderWindowMeta?.delivery_window_date && (
          <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50 px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-purple-700">Delivery Window</p>
              <Calendar className="h-4 w-4 text-purple-500" />
            </div>
            <p className="text-sm font-semibold text-purple-900">
              {(() => {
                const d = new Date(orderWindowMeta.delivery_window_date + 'T00:00:00');
                const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                const fmt = (t: string) => { const [h, m] = t.split(':').map(Number); const p = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${p}`; };
                return `${dateStr} · ${fmt(orderWindowMeta.delivery_window_from || '')} – ${fmt(orderWindowMeta.delivery_window_to || '')}`;
              })()}
            </p>
            {orderWindowMeta.delivery_window_note && (
              <p className="mt-1 text-xs text-purple-600">{orderWindowMeta.delivery_window_note}</p>
            )}
          </div>
        )}

        {/* ── Delivery Failed notice ── */}
        {isDeliveryFailed && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-700">Delivery Attempted</p>
            <p className="mt-1 text-sm font-semibold text-red-900">Customer was unavailable.</p>
            <p className="mt-0.5 text-xs text-red-600">Head back to the store and enter the Store OTP below to complete the return.</p>
          </div>
        )}

        {paymentPending && canDeliver && !isReturnPickedUp && !isDeliveryFailed && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">Cash On Delivery</p>
            <p className="mt-1 text-sm font-semibold text-amber-900">
              Collect {formatCurrency(order.total)} from the customer before asking for the OTP.
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Once cash is received, mark it collected below. Delivery completion is blocked until you do that.
            </p>
          </div>
        )}
      </div>

      {/* ── Sticky Slide-to-Deliver bar ── */}
      {canDeliver && !isReturnPickedUp && !isDeliveryFailed && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-stone-200 bg-white/95 px-4 pb-safe py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.07)] backdrop-blur">
          <div className="mx-auto max-w-xl">
            {hasDeliveryWindow ? (
              paymentPending ? (
                <>
                  <button
                    onClick={handleMarkPaymentCollected}
                    disabled={collectingPayment}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 py-4 text-base font-bold text-white shadow-lg shadow-amber-500/30 hover:from-amber-600 hover:to-orange-600 disabled:opacity-60"
                  >
                    {collectingPayment ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                    {collectingPayment ? 'Saving Payment…' : `Mark ${formatCurrency(order.total)} as Collected`}
                  </button>
                  <p className="mt-2 text-center text-xs text-stone-400">
                    Take the COD cash from the customer, then tap here before completing delivery.
                  </p>
                  <p className="mt-1 text-center text-[11px] font-medium text-purple-700">
                    Window: {order.delivery_window_date} · {order.delivery_window_from}–{order.delivery_window_to}
                  </p>
                </>
              ) : (
                <>
                  <SlideToDeliver onConfirm={openOtp} />
                  <p className="mt-2 text-center text-xs text-stone-400">
                    Slide to verify the customer’s 4-digit OTP and complete delivery.
                  </p>
                  <p className="mt-1 text-center text-[11px] font-medium text-purple-700">
                    Window: {order.delivery_window_date} · {order.delivery_window_from}–{order.delivery_window_to}
                  </p>
                </>
              )
            ) : (
              <button
                onClick={openDeliveryWindow}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-purple-300 bg-purple-50 py-4 text-base font-bold text-purple-700 hover:bg-purple-100 transition-all"
              >
                <Calendar className="h-5 w-5" />
                Schedule a delivery window first
              </button>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={openDeliveryWindow}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 py-2.5 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition-colors"
              >
                <Calendar className="h-4 w-4" />
                {hasDeliveryWindow ? 'Edit Delivery Window' : 'Set Delivery Window'}
              </button>
              <button
                onClick={() => setUnavailableOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
              >
                <AlertTriangle className="h-4 w-4" />
                Customer Unavailable
              </button>
            </div>          </div>
        </div>
      )}

      {/* ── Sticky Slide-to-Pickup (return) bar ── */}
      {canPickupReturn && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-amber-200 bg-white/95 px-4 pb-safe py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.07)] backdrop-blur">
          <div className="mx-auto max-w-xl">
            {hasReturnWindow ? (
              <>
                <SlideToDeliver
                  onConfirm={openReturnOtp}
                  label="Slide to Confirm Pickup →"
                  trackClassName="bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg shadow-amber-500/30"
                  fillClassName="bg-amber-700/35"
                  knobIconClassName="text-amber-600"
                  KnobIcon={Package}
                />
                <p className="mt-2 text-center text-xs text-stone-400">
                  Slide to verify the customer’s 4-digit Return OTP and confirm pickup.
                </p>
                <p className="mt-1 text-center text-[11px] font-medium text-amber-700">
                  Window: {order.return_window_date} · {order.return_window_from}–{order.return_window_to}
                </p>
              </>
            ) : (
              <button
                onClick={openReturnWindow}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 py-4 text-base font-bold text-amber-800 hover:bg-amber-100 transition-all"
              >
                <Calendar className="h-5 w-5" />
                Schedule a return pickup window first
              </button>
            )}
            <div className="mt-3">
              <button
                onClick={openReturnWindow}
                className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 py-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
              >
                <Calendar className="h-4 w-4" />
                {hasReturnWindow ? 'Edit Return Pickup Window' : 'Set Return Pickup Window'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky Return to Store OTP bar ── */}
      {(isReturnPickedUp || isDeliveryFailed) && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-amber-200 bg-white/95 px-4 pb-safe py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.07)] backdrop-blur">
          <div className="mx-auto max-w-xl">
            <button
              onClick={() => setReturnStoreOtpOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 py-4 text-base font-bold text-white shadow-lg shadow-amber-600/30 hover:from-amber-700 hover:to-orange-700 active:scale-[0.98] transition-all"
            >
              <ShieldCheck className="h-5 w-5" />
              Enter Store OTP to Confirm Return
            </button>
            <p className="mt-2 text-center text-xs text-stone-400">
              Ask the store admin for the 4-digit OTP to confirm you've returned the item.
            </p>
          </div>
        </div>
      )}

      {/* ── OTP modal ── */}
      <Dialog open={otpOpen} onOpenChange={setOtpOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Enter Delivery OTP
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <p className="text-sm text-stone-500">
              Ask the customer for the 4-digit OTP shown on their order page.
            </p>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={otpInput}
              onChange={(e) => {
                setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                setOtpError('');
              }}
              placeholder="••••"
              autoFocus
              className={`w-full rounded-xl border-2 bg-white dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 px-4 py-4 text-center text-3xl font-bold tracking-[0.6em] focus:outline-none transition-colors ${
                otpError
                  ? 'border-rose-300 focus:border-rose-400'
                  : 'border-amber-300 focus:border-amber-500'
              }`}
            />

            {otpError && (
              <p className="text-center text-sm font-medium text-rose-600">{otpError}</p>
            )}

            <Button
              onClick={handleVerify}
              disabled={verifying || otpInput.length !== 4}
              className="h-12 w-full bg-emerald-600 text-base font-bold hover:bg-emerald-700"
            >
              {verifying ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-5 w-5" />
              )}
              Verify & Mark Delivered
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Return Pickup OTP modal ── */}
      <Dialog open={returnOtpOpen} onOpenChange={setReturnOtpOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
              Enter Return Pickup OTP
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <p className="text-sm text-stone-500">
              Ask the customer to show their 4-digit Return Pickup OTP on their order page.
            </p>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={returnOtpInput}
              onChange={(e) => {
                setReturnOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                setReturnOtpError('');
              }}
              placeholder="••••"
              autoFocus
              className={`w-full rounded-xl border-2 bg-white dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 px-4 py-4 text-center text-3xl font-bold tracking-[0.6em] focus:outline-none transition-colors ${
                returnOtpError
                  ? 'border-rose-300 focus:border-rose-400'
                  : 'border-amber-300 focus:border-amber-500'
              }`}
            />

            {returnOtpError && (
              <p className="text-center text-sm font-medium text-rose-600">{returnOtpError}</p>
            )}

            <Button
              onClick={handleVerifyReturn}
              disabled={returnVerifying || returnOtpInput.length !== 4}
              className="h-12 w-full bg-amber-600 text-base font-bold hover:bg-amber-700"
            >
              {returnVerifying ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-5 w-5" />
              )}
              Verify & Confirm Pickup
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Return Store OTP modal ── */}
      <Dialog open={returnStoreOtpOpen} onOpenChange={(open) => { setReturnStoreOtpOpen(open); if (!open) { setReturnStoreOtpInput(''); setReturnStoreOtpError(''); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
              Enter Store OTP
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <p className="text-sm text-stone-500">
              Ask the store admin for the 4-digit OTP to confirm you have returned the item.
            </p>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              value={returnStoreOtpInput}
              onChange={(e) => {
                setReturnStoreOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                setReturnStoreOtpError('');
              }}
              placeholder="••••"
              autoFocus
              className={`w-full rounded-xl border-2 bg-white dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500 px-4 py-4 text-center text-3xl font-bold tracking-[0.6em] focus:outline-none transition-colors ${
                returnStoreOtpError
                  ? 'border-rose-300 focus:border-rose-400'
                  : 'border-amber-300 focus:border-amber-500'
              }`}
            />

            {returnStoreOtpError && (
              <p className="text-center text-sm font-medium text-rose-600">{returnStoreOtpError}</p>
            )}

            <Button
              onClick={handleVerifyReturnStore}
              disabled={returnStoreVerifying || returnStoreOtpInput.length !== 4}
              className="h-12 w-full bg-amber-600 text-base font-bold hover:bg-amber-700"
            >
              {returnStoreVerifying ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-5 w-5" />
              )}
              Verify & Confirm Return
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Chat templates modal ── */}
      <Dialog open={chatOpen} onOpenChange={setChatOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-5 w-5 text-blue-600" />
              Send Quick Message
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-1">
            <p className="text-sm text-stone-500">
              Pick a template to pre-fill a WhatsApp message for the customer.
            </p>
            {CHAT_TEMPLATES.map((t, i) => (
              <button
                key={i}
                onClick={() => sendWhatsApp(t)}
                className="w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-left text-sm text-stone-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
              >
                {t}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Delivery / Return window dialog ── */}
      <Dialog open={windowOpen} onOpenChange={setWindowOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Calendar className={`h-5 w-5 ${windowKind === 'return' ? 'text-amber-600' : 'text-purple-600'}`} />
              {windowKind === 'return' ? 'Set Return Pickup Window' : 'Set Delivery Window'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-stone-500">
              {windowKind === 'return'
                ? 'Tell the customer when to expect the return pickup.'
                : 'Let the customer know when to expect delivery.'}
            </p>
            <div>
              <label className="text-xs font-semibold text-stone-600 mb-1 block">Quick templates</label>
              <div className="grid grid-cols-3 gap-1.5">
                {FULFILLMENT_WINDOW_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyWindowTemplate(tpl.id)}
                    className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-[11px] font-semibold text-stone-700 hover:border-purple-300 hover:bg-purple-50 transition-colors"
                  >
                    {tpl.shortLabel}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-600 mb-1 block">Date</label>
              <input
                type="date"
                value={windowDate}
                onChange={(e) => setWindowDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-stone-600 mb-1 block">From</label>
                <input
                  type="time"
                  value={windowFrom}
                  onChange={(e) => setWindowFrom(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-600 mb-1 block">To</label>
                <input
                  type="time"
                  value={windowTo}
                  onChange={(e) => setWindowTo(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-600 mb-1 block">Note (optional)</label>
              <textarea
                value={windowNote}
                onChange={(e) => setWindowNote(e.target.value)}
                placeholder={windowKind === 'return' ? 'e.g. Item ready in original packaging' : 'e.g. Please be available at the gate'}
                rows={2}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none resize-none"
              />
            </div>
            <Button
              onClick={handleSetWindow}
              disabled={savingWindow || !windowDate || !windowFrom || !windowTo}
              className={`h-11 w-full text-sm font-bold ${
                windowKind === 'return'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              {savingWindow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
              Save Window
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Customer Unavailable confirmation dialog ── */}
      <Dialog open={unavailableOpen} onOpenChange={setUnavailableOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-red-700">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Customer Unavailable
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <p className="text-sm text-stone-600">
              Marking the customer as unavailable will start the return process. A return OTP will be generated for you to complete the return at the store.
            </p>
            <div>
              <label className="text-xs font-semibold text-stone-600 mb-1 block">Reason (optional)</label>
              <textarea
                value={unavailableReason}
                onChange={(e) => setUnavailableReason(e.target.value)}
                placeholder="e.g. No response after 3 attempts, door locked..."
                rows={2}
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setUnavailableOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCustomerUnavailable}
                disabled={unavailableConfirming}
                className="flex-1 bg-red-600 hover:bg-red-700 text-sm font-bold"
              >
                {unavailableConfirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                Confirm Return
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DeliveryOrderDetails;
