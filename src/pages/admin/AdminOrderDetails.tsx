import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  MapPin,
  MessageSquare,
  Package,
  Phone,
  Send,
  ShieldCheck,
  Truck,
  UserPlus,
  Calendar,
  Clock,
  Receipt,
  ExternalLink,
  Coins,
  ShieldAlert,
  TriangleAlert,
  Ticket,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ui/icon-button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { DetailSkeleton } from '@/components/skeletons';
import ConfirmDialog from '@/components/ConfirmDialog';
import { getOrderStatus, orderLabel, type OrderStatusContext } from '@/lib/orderStatus';
import { formatDate as fmtDate, formatDateTime as fmtDateTime, formatINR, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { reconcileOrderRewards, type ReconcileResult } from '@/services/rewardsService';
import { cartKey } from '@/lib/rewards';
import { scratchCardView, voidReasonText } from '@/lib/scratchWin';
import { getScratchCard, type ScratchCard } from '@/services/scratchWinService';
import { RETURN_WINDOW_DAYS, returnRequestTiming, returnWindowEnd } from '@/lib/returnWindow';
import { subscribeToDeliveryBoys, DeliveryBoy } from '@/services/deliveryBoyService';
import { DELIVERY_PARTNERS_ENABLED } from '@/config/features';
import {
  assignDeliveryPartner,
  assignReturnPickupPartner,
  approveReturn,
  getNextStatus,
  isCashOnDeliveryOrder,
  isPaymentSettled,
  isValidStatusTransition,
  normalizeOrderStatus,
  Order,
  rejectReturn,
  subscribeToOrder,
  updateOrderStatus,
  setDeliveryWindow,
  setReturnPickupWindow,
  FULFILLMENT_WINDOW_TEMPLATES,
  resolveFulfillmentWindowTemplate,
  type FulfillmentWindowTemplateId,
} from '@/services/orderService';
import ImageUploader from '@/components/ImageUploader';
import { db } from '@/config/firebase';
import { uploadDocument, describeUploadError } from '@/services/mediaStorage';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { notifyOrder } from '@/services/pushNotificationService';
import {
  createOrderMessage,
  OrderMessage,
  subscribeToOrderMessages,
} from '@/services/orderMessagingService';
import { SmartImage } from "@/components/ui/smart-image";

/**
 * Canonical, simplified status options for the admin dropdown. Legacy values
 * (shipped/assigned/picked) are intentionally excluded: they are normalised
 * to `packed` / `outForDelivery` for display.
 */
const STATUS_OPTIONS: Array<{ value: Order['status']; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'packed', label: 'Packed' },
  { value: 'outForDelivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  // Exception flow
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'returnRequested', label: 'Return requested' },
  { value: 'returnScheduled', label: 'Return scheduled' },
  { value: 'picked', label: 'Return picked up' },
  { value: 'returned', label: 'Returned' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'deliveryFailed', label: getOrderStatus('deliveryFailed').label },
];

/** The dropdown's label for a status (sentence case). */
const statusLabel = (status: string) => STATUS_OPTIONS.find((o) => o.value === status)?.label || status;

/** Panel surface for every section of this page. */
const PANEL = 'panel bg-card p-5 text-card-foreground sm:p-6';
/** Section heading inside a panel. */
const SECTION_TITLE = 'mb-3 flex items-center gap-2 text-sm font-semibold text-foreground';
/** Small label above a field in the window setters. */
const FIELD_LABEL = 'mb-1.5 block text-xs font-medium text-muted-foreground';

const NEXT_STEP_HINT: Record<string, string> = {
  pending: 'Confirm the order to start processing.',
  processing: 'Pack the items and mark as Packed when ready.',
  packed: 'Assign a delivery partner. This marks the order as Out for delivery.',
  outForDelivery: 'Awaiting OTP verification by the delivery partner at the customer\'s door.',
  delivered: 'Order completed.',
  cancelled: 'Order cancelled.',
  returnRequested: 'Approve and schedule the return pickup.',
  returnScheduled: 'Awaiting return pickup.',
  picked: 'Item collected from customer. Share the Return Store OTP below with the delivery partner to confirm receipt at store.',
  returned: 'Return completed.',
  refunded: 'Refund has been processed and sent to the customer.',
  deliveryFailed: 'Delivery failed. Share the Return Store OTP with the delivery partner when they arrive at the store.',
};

const formatPrice = (price: number) => formatINR(price ?? 0);

type TimestampLike = { seconds?: number; toDate?: () => Date } | Date | string | number | null | undefined;
type OrderReturnMeta = Order & {
  returnScheduledAt?: unknown;
  return_otp?: string;
  return_store_otp?: string;
  returnStatus?: string;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/** '3 Oct 2026, 8:01 pm', or 'N/A' when the time is missing. */
const formatDateTime = (value: TimestampLike) => (value ? fmtDateTime(value) || 'N/A' : 'N/A');

const millisOf = (value: TimestampLike): number => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    return typeof value.seconds === 'number' ? value.seconds * 1000 : 0;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const formatDay = (ms: number) => fmtDate(ms);

/** Rupees to the paisa: comparing a payment with the order must not round a difference away. */
const formatAmount = (value: number) => {
  const n = Number(value) || 0;
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

const toNumber = (value: unknown) => Number(value) || 0;

/** SHA-256 hex, as api/create-order.ts hashes the cart. Null where the browser cannot hash (no HTTPS). */
const sha256Hex = async (text: string): Promise<string | null> => {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * payments/<razorpay order id>: the server's record of an online payment,
 * written by api/verify-payment.ts (or by the reconcile action once Razorpay
 * says it is paid). Nothing in the browser can write it, so the order document
 * is checked against it.
 */
interface PaymentRecord {
  uid?: string;
  razorpayPaymentId?: string;
  amountPaise?: number;
  points?: number;
  pointsValue?: number;
  cashback?: number;
  cartHash?: string;
}

type PaymentLookup =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'error'; message: string }
  | { state: 'found'; record: PaymentRecord };

/** Admins may read any payment record (firestore.rules). Never throws. */
const readPaymentRecord = async (razorpayOrderId: string): Promise<PaymentLookup> => {
  try {
    const snap = await getDoc(doc(db, 'payments', razorpayOrderId));
    return snap.exists() ? { state: 'found', record: snap.data() as PaymentRecord } : { state: 'missing' };
  } catch (err: unknown) {
    console.error('payment record read failed', err);
    return { state: 'error', message: getErrorMessage(err, 'unknown error') };
  }
};

/** Why the reconcile action left an order alone (see api/notify-order.ts), in plain words. */
const RECONCILE_SKIPPED: Record<string, string> = {
  no_customer: 'This order has no customer account, so there is nothing to check.',
  not_paid_online: 'No Razorpay payment is linked to this order, so there is nothing to check.',
  order_not_bound_to_payment:
    'This order was placed before orders were tied to their payment, so it cannot be checked here. Check it in the Razorpay dashboard.',
  payment_not_verified: 'Razorpay shows no completed payment for this order. Do not pack it until it is paid.',
  payment_belongs_to_another_customer:
    'This payment was made from a different customer account. Check it before packing.',
};

const EARN_STEPS: Record<string, string> = {
  void: 'earned points voided',
  restore: 'earned points restored',
  hold: 'earned points put on hold',
  release: 'earned points released',
};

/** Plain words for one id the reconcile action reports as changed (ids from api/notify-order.ts). */
const describeRewardChange = (id: string, earnListed: boolean): string[] => {
  const [key, step = ''] = id.split(':');
  if (key === 'order') {
    const fields = step.split(',');
    const words: string[] = [];
    if (fields.includes('paymentStatus')) words.push('payment confirmed');
    if (fields.includes('needsManualReview')) words.push('flagged for review');
    // The order's points fields follow the earn entry; only worth a mention on their own.
    if (!earnListed && fields.some((f) => f.startsWith('points'))) words.push('points on the order corrected');
    return words;
  }
  const what = key.endsWith('_cashback') ? 'cashback' : 'points';
  if (key.startsWith('spend_')) return [step === 'late' ? `${what} spent again after release` : `${what} spend confirmed`];
  if (key.startsWith('refund_')) return [step === 'void' ? `${what} refund taken back` : `${what} refunded`];
  if (key.startsWith('earn_')) return [EARN_STEPS[step] || 'points earned'];
  return [];
};

const summariseRewardChanges = (changed: string[]) => {
  const earnListed = changed.some((id) => id.startsWith('earn_'));
  const words = [...new Set(changed.flatMap((id) => describeRewardChange(id, earnListed)))];
  return words.length ? words.join(', ') : `${changed.length} change${changed.length === 1 ? '' : 's'}`;
};

/**
 * What to tell the admin after "Check payment & rewards". Reconcile keeps the
 * reward ledger in line with the payment; it does not compare the order
 * document with the payment, so "in line" is only said when that matches too.
 */
const describeReconcile = (
  r: ReconcileResult,
  orderMatchesPayment: boolean,
): { tone: 'ok' | 'warn' | 'error'; text: string } => {
  if (!r.ok) {
    // The server's own message already says it could not check; do not repeat it.
    const why = r.detail && !/^could not check/i.test(r.detail) ? `: ${r.detail}` : '. Try again in a minute.';
    return { tone: 'error', text: `Could not check right now${why}` };
  }
  if (r.skipped) return { tone: 'warn', text: RECONCILE_SKIPPED[r.skipped] || `Not checked (${r.skipped}).` };
  const changed = r.changed || [];
  if (changed.length) return { tone: 'ok', text: `Updated: ${summariseRewardChanges(changed)}.` };
  if (!orderMatchesPayment) {
    return { tone: 'error', text: 'Rewards follow the payment, but this order does not match it: see the payment check above.' };
  }
  return { tone: 'ok', text: 'Payment and rewards are in line with this order.' };
};

const NOTE_TONE: Record<'ok' | 'warn' | 'error', string> = {
  ok: 'text-status-success-fg',
  warn: 'text-status-warning-fg',
  error: 'text-status-danger-fg',
};

const ENDED_STATUSES: Order['status'][] = ['cancelled', 'returned', 'refunded'];
const RETURN_OPEN_STATUSES: Order['status'][] = ['returnRequested', 'returnScheduled', 'picked'];

const AdminOrderDetails = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingStatus, setSavingStatus] = useState(false);
  const [deliveryPartners, setDeliveryPartners] = useState<DeliveryBoy[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [assigningReturn, setAssigningReturn] = useState(false);
  const [returnReviewing, setReturnReviewing] = useState<'approve' | 'reject' | null>(null);
  // A status change or a return decision waiting for the admin to confirm it.
  const [confirmAction, setConfirmAction] = useState<
    { kind: 'status'; next: Order['status'] } | { kind: 'approve' } | { kind: 'reject' } | null
  >(null);
  const statusTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Delivery window state
  const [windowDate, setWindowDate] = useState('');
  const [windowFrom, setWindowFrom] = useState('');
  const [windowTo, setWindowTo]     = useState('');
  const [windowNote, setWindowNote] = useState('');
  const [savingWindow, setSavingWindow] = useState(false);

  // Return pickup window state (separate from delivery window)
  const [returnWindowDate, setReturnWindowDate] = useState('');
  const [returnWindowFrom, setReturnWindowFrom] = useState('');
  const [returnWindowTo, setReturnWindowTo]     = useState('');
  const [returnWindowNote, setReturnWindowNote] = useState('');
  const [savingReturnWindow, setSavingReturnWindow] = useState(false);

  // Order conversation (admin <-> customer) state. Mirrors the customer-side
  // chat in `OrderDetailsPage` so admins can reply inside the same thread
  // without leaving this page.
  const [chatMessages, setChatMessages] = useState<OrderMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // The server's record of the online payment, and this order's cart hashed the
  // way the payment's was, so an order edited in the browser stands out.
  const [paymentLookup, setPaymentLookup] = useState<{ rzp: string; result: PaymentLookup } | null>(null);
  const [cartHash, setCartHash] = useState<{ key: string; hash: string | null } | null>(null);

  // "Check payment & rewards": which button ran it, and what the server said.
  const [reconcile, setReconcile] = useState<{
    orderId: string;
    from: 'payment' | 'rewards';
    running: boolean;
    result?: ReconcileResult;
  } | null>(null);
  const reconcileSeq = useRef(0);

  // Real-time subscription to the order document.
  useEffect(() => {
    if (!orderId) {
      navigate('/admin/orders');
      return;
    }
    setLoading(true);
    const unsub = subscribeToOrder(
      orderId,
      (data) => {
        if (!data) {
          toast.error('Order not found');
          navigate('/admin/orders');
          return;
        }
        setOrder(data);
        setLoading(false);
      },
      (err) => {
        console.error('order subscription error', err);
        toast.error('Failed to load order');
        setLoading(false);
      },
    );
    return () => unsub();
  }, [orderId, navigate]);

  // Load active delivery partners.
  useEffect(() => {
    const unsub = subscribeToDeliveryBoys(
      (boys) => setDeliveryPartners(boys.filter((b) => b.isActive !== false)),
      (err) => console.error('partners subscription error', err),
    );
    return () => unsub();
  }, []);

  // Prefill window form fields from the saved order so editing shows existing values.
  useEffect(() => {
    if (!order) return;
    setWindowDate(order.delivery_window_date || '');
    setWindowFrom(order.delivery_window_from || '');
    setWindowTo(order.delivery_window_to || '');
    setWindowNote(order.delivery_window_note || '');
    setReturnWindowDate(order.return_window_date || '');
    setReturnWindowFrom(order.return_window_from || '');
    setReturnWindowTo(order.return_window_to || '');
    setReturnWindowNote(order.return_window_note || '');
    // Only resync when the order document id changes — avoid clobbering edits-in-progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id]);

  // Subscribe to the order conversation thread (admin sees ALL messages,
  // including internal/system entries) so admins can review and reply inside
  // the same thread the customer uses.
  useEffect(() => {
    if (!orderId) return;
    const unsub = subscribeToOrderMessages(
      orderId,
      (msgs) => {
        setChatMessages(msgs);
        // Pin scroll to the latest message after data changes.
        window.requestAnimationFrame(() => {
          const el = chatScrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        });
      },
      (err) => console.error('order messages subscription error', err),
    );
    return () => unsub();
  }, [orderId]);

  // Read payments/<razorpay order id>, and again when the server marks the
  // order paid (the reconcile action records the payment as it does).
  const razorpayOrderId = order?.razorpayOrderId || '';
  const orderPaymentStatus = order?.paymentStatus;
  useEffect(() => {
    if (!razorpayOrderId) return;
    let cancelled = false;
    void readPaymentRecord(razorpayOrderId).then((result) => {
      if (!cancelled) setPaymentLookup({ rzp: razorpayOrderId, result });
    });
    return () => {
      cancelled = true;
    };
  }, [razorpayOrderId, orderPaymentStatus]);

  const rereadPayment = async () => {
    if (!razorpayOrderId) return;
    const rzp = razorpayOrderId;
    setPaymentLookup({ rzp, result: { state: 'loading' } });
    setPaymentLookup({ rzp, result: await readPaymentRecord(rzp) });
  };

  // The order's items in the form api/create-order.ts hashed into the payment.
  const orderCartKey = useMemo(() => (order ? cartKey(order.items || []) : ''), [order]);
  useEffect(() => {
    let cancelled = false;
    sha256Hex(orderCartKey)
      .catch(() => null)
      .then((hash) => {
        if (!cancelled) setCartHash({ key: orderCartKey, hash });
      });
    return () => {
      cancelled = true;
    };
  }, [orderCartKey]);

  const sendAdminChatMessage = async () => {
    if (!order || !user || !chatDraft.trim() || sendingChat) return;
    const text = chatDraft.trim();
    setSendingChat(true);
    try {
      await createOrderMessage(order.id, {
        authorType: 'admin',
        authorId: user.uid,
        authorName: userProfile?.username || user.displayName || 'Support team',
        channel: 'chat',
        // visibility 'customer' makes the message appear on the customer
        // order detail page; admins can see all visibility levels.
        visibility: 'customer',
        message: text,
      });
      // Fire-and-forget push to the customer so they see the reply even when
      // the order detail page is closed. Failure is logged inside notifyOrder.
      void notifyOrder({
        orderId: order.id,
        audience: 'customer',
        title: 'New reply from Ishaputra support',
        body: text.length > 140 ? `${text.slice(0, 137)}…` : text,
        url: `/account/orders/${order.id}`,
        data: { kind: 'order-chat', orderId: order.id },
      });
      setChatDraft('');
    } catch (err: unknown) {
      console.error('admin chat send failed', err);
      toast.error(getErrorMessage(err, 'Failed to send message'));
    } finally {
      setSendingChat(false);
    }
  };

  const normalizedStatus = useMemo(() => {
    if (!order) return 'pending';
    // In return context, 'picked' means item collected from customer — do not normalize to outForDelivery
    if (order.status === 'picked' && (order as OrderReturnMeta).returnScheduledAt) return 'picked';
    return normalizeOrderStatus(order.status);
  }, [order]);

  const handleStatusChange = async (next: Order['status']) => {
    if (!order || next === normalizedStatus) return;
    // Checked from the status the dropdown shows, like its options: a legacy
    // forward `picked` is Out for Delivery here, not a return pickup.
    if (!isValidStatusTransition(normalizedStatus, next)) {
      toast.error('Status can only move forward in the workflow.');
      return;
    }
    // When the in-house delivery system is enabled, these statuses are driven by
    // the assign-partner / OTP panels rather than the dropdown. With it disabled,
    // the admin moves the order through every status directly.
    if (DELIVERY_PARTNERS_ENABLED && next === 'outForDelivery' && !order.delivery_boy_id && !order.delivery_partner_id) {
      toast.error('Assign a delivery partner first. That marks the order as Out for delivery.');
      return;
    }
    if (DELIVERY_PARTNERS_ENABLED && next === 'returnScheduled') {
      toast.error('Use the “Assign pickup partner” panel below to schedule a return. Direct status change is disabled.');
      return;
    }
    setSavingStatus(true);
    try {
      await updateOrderStatus(order.id, next);
      toast.success(`Status updated to ${statusLabel(next)}`);
    } catch (err: unknown) {
      console.error(err);
      toast.error(getErrorMessage(err, 'Failed to update status'));
    } finally {
      setSavingStatus(false);
    }
  };

  // Asks the server to confirm the payment with Razorpay and bring points and
  // cashback in line with the order. Never throws; the result is shown as is.
  const checkPaymentAndRewards = async (from: 'payment' | 'rewards') => {
    if (!order || (reconcile?.running && reconcile.orderId === order.id)) return;
    const id = order.id;
    const rzp = order.razorpayOrderId || '';
    const seq = ++reconcileSeq.current;
    setReconcile({ orderId: id, from, running: true });
    const result = await reconcileOrderRewards(id);
    // The server may have just recorded the payment: read it again before
    // answering, so the answer and the payment check agree.
    const lookupNow = rzp ? await readPaymentRecord(rzp) : null;
    if (seq !== reconcileSeq.current) return;
    if (lookupNow) setPaymentLookup({ rzp, result: lookupNow });
    setReconcile({ orderId: id, from, running: false, result });
  };

  // The order's scratch card (Scratch & Win), read again after a status change
  // or a "Check payment & rewards", which are when the server changes it.
  const [scratchCard, setScratchCard] = useState<ScratchCard | null>(null);
  const scratchUid = order?.userId || '';
  const scratchOrderId = order?.razorpayOrderId && order.razorpayOrderId === order.id ? order.id : '';
  const scratchStatus = order?.status;
  const reconcileDone = reconcile?.running === false;
  useEffect(() => {
    setScratchCard(null);
    if (!scratchUid || !scratchOrderId) return;
    let live = true;
    getScratchCard(scratchUid, scratchOrderId).then((card) => {
      if (live) setScratchCard(card);
    });
    return () => {
      live = false;
    };
  }, [scratchUid, scratchOrderId, scratchStatus, reconcileDone]);

  const handleAssignReturnPartner = async (partnerId: string) => {
    if (!order || !partnerId) return;
    const partner = deliveryPartners.find((p) => p.id === partnerId);
    if (!partner) return;
    setAssigningReturn(true);
    try {
      const { otp: pickupOtp } = await assignReturnPickupPartner(
        order.id,
        partner.id,
        partner.name,
        partner.phone,
      );
      toast.success(`Return pickup assigned to ${partner.name}`, {
        description: `Pickup OTP ${pickupOtp} has been shared with the customer.`,
      });
    } catch (err: unknown) {
      console.error(err);
      toast.error(getErrorMessage(err, 'Failed to assign return pickup partner'));
    } finally {
      setAssigningReturn(false);
    }
  };

  const handleAssignPartner = async (partnerId: string) => {
    if (!order || !partnerId) return;
    const partner = deliveryPartners.find((p) => p.id === partnerId);
    if (!partner) return;
    setAssigning(true);
    try {
      const { otp } = await assignDeliveryPartner(
        order.id,
        partner.id,
        partner.name,
        partner.phone,
      );
      toast.success(`Assigned to ${partner.name}`, {
        description: `OTP ${otp} shared with the customer.`,
      });
    } catch (err: unknown) {
      console.error(err);
      toast.error(getErrorMessage(err, 'Failed to assign delivery partner'));
    } finally {
      setAssigning(false);
    }
  };

  const handleSetWindow = async () => {
    if (!order || !windowDate || !windowFrom || !windowTo) {
      toast.error('Please fill in date and time range.');
      return;
    }
    setSavingWindow(true);
    try {
      await setDeliveryWindow(order.id, { date: windowDate, from: windowFrom, to: windowTo, note: windowNote || undefined });
      toast.success('Delivery window saved');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to save delivery window.'));
    } finally {
      setSavingWindow(false);
    }
  };

  const handleSetReturnWindow = async () => {
    if (!order || !returnWindowDate || !returnWindowFrom || !returnWindowTo) {
      toast.error('Please fill in date and time range.');
      return;
    }
    setSavingReturnWindow(true);
    try {
      await setReturnPickupWindow(order.id, {
        date: returnWindowDate,
        from: returnWindowFrom,
        to: returnWindowTo,
        note: returnWindowNote || undefined,
      });
      toast.success('Return pickup window saved');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to save return pickup window.'));
    } finally {
      setSavingReturnWindow(false);
    }
  };

  const applyDeliveryTemplate = (id: FulfillmentWindowTemplateId) => {
    const tpl = FULFILLMENT_WINDOW_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    const r = resolveFulfillmentWindowTemplate(tpl);
    setWindowDate(r.date);
    setWindowFrom(r.from);
    setWindowTo(r.to);
  };

  const applyReturnTemplate = (id: FulfillmentWindowTemplateId) => {
    const tpl = FULFILLMENT_WINDOW_TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    const r = resolveFulfillmentWindowTemplate(tpl);
    setReturnWindowDate(r.date);
    setReturnWindowFrom(r.from);
    setReturnWindowTo(r.to);
  };

  const handleApproveReturn = async () => {
    if (!order) return;
    setReturnReviewing('approve');
    try {
      await approveReturn(order.id);
      toast.success('Return approved. You can now assign a pickup partner below.');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to approve return'));
    } finally {
      setReturnReviewing(null);
    }
  };

  const handleRejectReturn = async () => {
    if (!order) return;
    setReturnReviewing('reject');
    try {
      await rejectReturn(order.id);
      toast.info('Return request rejected. Order reverted to delivered.');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to reject return'));
    } finally {
      setReturnReviewing(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <DetailSkeleton label="Loading order" />
      </div>
    );
  }

  if (!order) return null;

  // Same map as the orders list, so both show the same chip. 'Needs review'
  // gets its own chip (and the notice below), the status chip stays the status.
  const badge = getOrderStatus(normalizedStatus, {
    ...(order as unknown as OrderStatusContext),
    needsManualReview: false,
  });
  const nextStatus = normalizedStatus === 'picked' ? ('returned' as Order['status']) : getNextStatus(normalizedStatus);

  // In admin-managed fulfilment mode (delivery system off), the admin advances
  // the order through every step directly, so the hints reference the dropdown
  // rather than a delivery partner / OTP.
  const ADMIN_DRIVEN_HINTS: Record<string, string> = {
    packed: 'Mark the order as Out for Delivery once it leaves the store.',
    outForDelivery: 'Mark as Delivered once the customer has received the order.',
    returnRequested: 'Approve the return, then set the status to Returned once the item is back.',
    returnScheduled: 'Set the status to Returned once the item is back with you.',
    picked: 'Item collected. Mark as Returned once it reaches you.',
    deliveryFailed: 'Contact the customer and reschedule, or cancel the order.',
  };
  const statusHint =
    (!DELIVERY_PARTNERS_ENABLED && ADMIN_DRIVEN_HINTS[normalizedStatus]) ||
    NEXT_STEP_HINT[normalizedStatus];
  const isCod = isCashOnDeliveryOrder(order);
  const isPaid = isPaymentSettled(order);
  const partnerName = order.delivery_partner_name || order.delivery_boy_name;
  const partnerPhone = order.delivery_partner_phone;
  const otp = order.delivery_otp;
  const returnMeta = order as OrderReturnMeta;
  const returnOtp = returnMeta.return_otp;
  const returnStoreOtp = returnMeta.return_store_otp;
  // The rules only let customers ask inside the window; anything else (an
  // older request, or one entered by hand) is flagged before it is approved.
  const returnTiming = returnRequestTiming(order.deliveredAt, order.returnRequestedAt);
  const returnWindowClosed = returnWindowEnd(order.deliveredAt);

  // ── Payment check: this order against the server's record of its payment ──
  const rzpId = order.razorpayOrderId || '';
  const lookup: PaymentLookup | null = !rzpId
    ? null
    : paymentLookup?.rzp === rzpId
      ? paymentLookup.result
      : { state: 'loading' };
  const record = lookup?.state === 'found' ? lookup.record : null;
  const amountPaid = record ? toNumber(record.amountPaise) / 100 : 0;
  // undefined while hashing; null when this browser cannot hash.
  const orderHash = cartHash?.key === orderCartKey ? cartHash.hash : undefined;
  const paymentIssues: string[] = [];
  if (record) {
    const total = toNumber(order.total);
    // ₹1 of tolerance, counted in paise like api/create-order.ts does.
    if (Math.abs(toNumber(record.amountPaise) - Math.round(total * 100)) > 100) {
      paymentIssues.push(`Amount paid ${formatAmount(amountPaid)} but order total ${formatAmount(total)}`);
    }
    if (record.cartHash && orderHash && record.cartHash !== orderHash) {
      paymentIssues.push('Items differ from what was paid for');
    }
    if (toNumber(record.points) !== toNumber(order.pointsUsed)) {
      paymentIssues.push(
        `Points used: ${toNumber(record.points)} on the payment but ${toNumber(order.pointsUsed)} on the order`,
      );
    }
    if (order.pointsValue != null && Math.abs(toNumber(record.pointsValue) - toNumber(order.pointsValue)) > 0.01) {
      paymentIssues.push(
        `Points value: ${formatAmount(toNumber(record.pointsValue))} on the payment but ${formatAmount(toNumber(order.pointsValue))} on the order`,
      );
    }
    if (toNumber(record.cashback) !== toNumber(order.cashbackUsed)) {
      paymentIssues.push(
        `Cashback used: ${formatAmount(toNumber(record.cashback))} on the payment but ${formatAmount(toNumber(order.cashbackUsed))} on the order`,
      );
    }
    if ((record.uid || '') !== (order.userId || '')) {
      paymentIssues.push("Paid from a different customer account than this order's");
    }
  }
  const itemsUnchecked = !!record?.cartHash && orderHash === null;
  let paymentCheck: 'none' | 'loading' | 'error' | 'verified' | 'mismatch' | 'missing' | 'legacy' | 'unlinked';
  if (!rzpId) {
    paymentCheck = isCod ? 'none' : 'unlinked';
  } else if (lookup.state === 'found') {
    // Wait for the item hash, so a mismatch never shows as verified first.
    paymentCheck = record.cartHash && orderHash === undefined ? 'loading' : paymentIssues.length ? 'mismatch' : 'verified';
  } else if (lookup.state === 'missing') {
    // Orders saved before they were stored under their payment never got a record.
    paymentCheck = order.id === rzpId ? 'missing' : 'legacy';
  } else {
    paymentCheck = lookup.state;
  }
  // The summary's payment line follows the server's record where it has one.
  const paymentLabel =
    paymentCheck === 'verified'
      ? { text: 'Paid', className: 'text-status-success-fg' }
      : paymentCheck === 'mismatch'
        ? { text: 'Order does not match payment', className: 'text-status-danger-fg' }
        : paymentCheck === 'missing'
          ? { text: 'Not confirmed', className: 'text-status-warning-fg' }
          : paymentCheck === 'unlinked'
            ? { text: 'No payment linked', className: 'text-status-warning-fg' }
            : {
                text: isPaid ? (isCod ? 'COD collected' : 'Paid') : isCod ? 'COD pending' : 'Payment pending',
                className: isPaid ? 'text-status-success-fg' : 'text-status-warning-fg',
              };

  // ── Points earned, as the reconcile action last wrote them on the order ──
  const earned = toNumber(order.pointsEarned);
  const earnedLabel = `${earned} point${earned === 1 ? '' : 's'}`;
  const unlockMs = millisOf(order.pointsUnlockAt);
  const orderEnded = ENDED_STATUSES.includes(normalizedStatus);
  let pointsText = 'Points are earned when the order is delivered';
  if (earned > 0 && order.pointsEarnedState === 'held') {
    pointsText = `${earnedLabel} on hold while the return is open`;
  } else if (earned > 0 && order.pointsEarnedState === 'void') {
    pointsText = `${earnedLabel} voided${orderEnded ? ` (order ${badge.label.toLowerCase()})` : ''}`;
  } else if (earned > 0 && order.pointsEarnedState === 'active') {
    pointsText = !unlockMs
      ? `${earnedLabel} earned`
      : unlockMs > Date.now()
        ? `${earnedLabel} earned · unlocks on ${formatDay(unlockMs)}`
        : `${earnedLabel} earned · available`;
  } else if (earned > 0) {
    pointsText = `${earnedLabel} earned on delivery`;
  } else if (!rzpId) {
    pointsText = 'No points: not paid online';
  } else if (orderEnded) {
    pointsText = 'No points earned on this order';
  } else if (normalizedStatus === 'delivered' || RETURN_OPEN_STATUSES.includes(normalizedStatus)) {
    pointsText = 'No points recorded for this order';
  }

  // ── Scratch card, as the server last wrote it ──
  let scratchText = '';
  if (scratchCard) {
    const won = `won ${plural(scratchCard.points, 'point')}`;
    const view = scratchCardView(scratchCard, Date.now());
    scratchText = `Scratch card: ${
      view === 'new'
        ? `not scratched yet, expires ${fmtDate(scratchCard.expiresAtMs)}`
        : view === 'expired'
          ? 'expired, not scratched'
          : view === 'void'
            ? `cancelled (${voidReasonText(scratchCard.voidReason)})`
            : view === 'nowin'
              ? 'no prize'
              : view === 'won-held'
                ? `${won} (on hold)`
                : view === 'won-void'
                  ? `${won} (voided)`
                  : won
    }`;
  }

  const reconcileRunning = !!reconcile?.running && reconcile.orderId === order.id;
  /** The last "Check payment & rewards" answer, shown beside the button that asked. */
  const reconcileNote = (from: 'payment' | 'rewards') => {
    if (!reconcile || reconcile.orderId !== order.id || reconcile.from !== from || !reconcile.result) return null;
    const note = describeReconcile(reconcile.result, paymentCheck !== 'mismatch');
    return (
      <p role="status" className={`w-full text-xs font-medium ${NOTE_TONE[note.tone]}`}>
        {note.text}
      </p>
    );
  };

  const headingFont = { fontFamily: 'var(--font-heading)', fontStretch: 'var(--font-heading-stretch)' } as const;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* Header */}
      <AdminPageHeader
        title={<span className="tabular-nums">Order {orderLabel(order.orderId)}</span>}
        className="items-center pb-0"
        leading={
          <IconButton label="Back to orders" onClick={() => navigate('/admin/orders')} className="-ml-2">
            <ChevronLeft />
          </IconButton>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {order.needsManualReview && (
              <StatusBadge tone="danger" label="Needs review" icon={TriangleAlert} />
            )}
            <StatusBadge tone={badge.tone} label={badge.label} icon={badge.icon} className="h-7 px-2.5 text-sm" />
          </div>
        }
      />

      {/* Flagged for a human: a paid order that could not be completed
           automatically, or a reward spend that may need a correction. */}
      {order.needsManualReview && (
        <Notice tone="danger" title="Needs manual review" className="shadow-sm">
          <span className="break-words">
            {order.manualReviewReason || 'This order was flagged for a manual check.'}
          </span>
        </Notice>
      )}

      {/* Top summary card */}
      <section aria-label="Order summary" className={PANEL}>
        <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Customer</dt>
            <dd className="mt-1 truncate font-semibold text-foreground">
              {order.shippingAddress?.fullName || order.userName}
            </dd>
            <dd className="text-xs tabular-nums text-muted-foreground">{order.shippingAddress?.mobile}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-foreground" style={headingFont}>
              {formatPrice(order.total)}
            </dd>
            <dd className="text-xs text-muted-foreground">{plural(order.items?.length || 0, 'item')}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">Payment</dt>
            <dd className="mt-1 font-semibold text-foreground">
              {order.paymentMethod || 'Online'}
            </dd>
            {/* Cash on Delivery was retired, but historic orders still carry it,
                so the label follows the order rather than assuming COD. An
                online payment's label follows the server's record (below). */}
            <dd className={cn('text-xs font-medium', paymentLabel.className)}>{paymentLabel.text}</dd>
            {order.paymentCollectedAt && (
              <dd className="mt-1 text-xs text-muted-foreground">
                Collected {formatDateTime(order.paymentCollectedAt)}
                {order.paymentCollectedByName ? ` by ${order.paymentCollectedByName}` : ''}
              </dd>
            )}
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Placed</dt>
            <dd className="mt-1 text-sm tabular-nums text-foreground/80">
              {formatDateTime(order.createdAt)}
            </dd>
          </div>
        </dl>

        {/* Payment check: the order against payments/<razorpay order id>, which
             only the server writes. An order edited in the browser shows here. */}
        {paymentCheck === 'loading' && (
          <p role="status" className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner size={14} /> Checking the payment record
          </p>
        )}
        {paymentCheck === 'verified' && (
          <Notice tone="success" icon={ShieldCheck} compact className="mt-4 text-xs font-medium">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="tabular-nums">Payment verified · {formatAmount(amountPaid)}</span>
              {record.razorpayPaymentId && <span className="break-all font-mono">{record.razorpayPaymentId}</span>}
            </span>
          </Notice>
        )}
        {paymentCheck === 'mismatch' && (
          <Notice tone="danger" icon={ShieldAlert} title="This order does not match its payment" className="mt-4">
            <ul className="list-disc space-y-1 pl-5">
              {paymentIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
            <p className="mt-2 break-words text-xs">
              Verified payment: {formatAmount(amountPaid)}
              {record.razorpayPaymentId ? ` · ${record.razorpayPaymentId}` : ''}. The order may have been
              edited: check it in Razorpay before packing.
            </p>
          </Notice>
        )}
        {paymentCheck === 'missing' && (
          <Notice
            tone="warning"
            title="Payment not confirmed by the server"
            className="mt-4"
            action={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reconcileRunning}
                  onClick={() => checkPaymentAndRewards('payment')}
                >
                  {reconcileRunning && reconcile?.from === 'payment' ? <Spinner /> : null}
                  Check payment & rewards
                </Button>
                {reconcileNote('payment')}
              </>
            }
          >
            Press Check payment & rewards before packing. It asks Razorpay and records the payment if it went
            through.
          </Notice>
        )}
        {paymentCheck === 'legacy' && (
          <Notice tone="warning" compact className="mt-4 text-xs">
            <span className="min-w-0 break-words">
              No server record of this payment: the order was placed before payments were recorded. Check{' '}
              {order.razorpayPaymentId || 'it'} in the Razorpay dashboard.
            </span>
          </Notice>
        )}
        {paymentCheck === 'unlinked' && (
          <Notice tone="warning" compact className="mt-4 text-xs">
            No Razorpay payment is linked to this order. Make sure it was paid before packing.
          </Notice>
        )}
        {paymentCheck === 'error' && lookup?.state === 'error' && (
          <Notice
            tone="danger"
            compact
            className="mt-4 text-xs"
            action={
              <Button variant="outline" size="sm" onClick={() => void rereadPayment()}>
                Try again
              </Button>
            }
          >
            <span className="min-w-0 break-words">Could not read the payment record: {lookup.message}</span>
          </Notice>
        )}
        {itemsUnchecked && (paymentCheck === 'verified' || paymentCheck === 'mismatch') && (
          <p className="mt-2 text-xs text-muted-foreground">
            Items were not compared: this browser cannot hash them (it needs HTTPS).
          </p>
        )}

        {statusHint && (
          <p className="mt-4 rounded-control bg-muted px-3 py-2 text-xs text-foreground">
            <span className="font-semibold">Next:</span> {statusHint}
          </p>
        )}
        {isCod && !isPaid && normalizedStatus === 'outForDelivery' && (
          <Notice tone="warning" compact className="mt-3 text-xs">
            {DELIVERY_PARTNERS_ENABLED
              ? 'COD payment is still pending. The delivery partner must collect cash and mark it received before the order can be completed.'
              : 'This is a Cash on Delivery order. The payment will be recorded as collected when you mark the order Delivered.'}
          </Notice>
        )}
      </section>

      {/* Items */}
      <section aria-labelledby="order-items-title" className={PANEL}>
        <h2 id="order-items-title" className={SECTION_TITLE}>
          <Package aria-hidden="true" className="size-4 text-muted-foreground" /> Items
        </h2>
        <ul className="divide-y divide-foreground/[0.08]">
          {order.items?.map((item, idx) => (
            <li key={idx} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              {item.image && (
                <SmartImage
                  src={item.image}
                  alt=""
                  className="size-12 shrink-0 rounded-control bg-muted object-cover"
                  preset="thumb"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
                <p className="text-xs tabular-nums text-muted-foreground">Qty {item.quantity}</p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-foreground">
                {formatPrice(item.price * item.quantity)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Pricing breakdown: sourced from the saved order so admins see exactly
           what the customer paid (subtotal, delivery, GST, COD, coupon, total). */}
      <section aria-labelledby="order-pricing-title" className={PANEL}>
        <h2 id="order-pricing-title" className={SECTION_TITLE}>
          Pricing breakdown
        </h2>
        <div className="space-y-1.5 text-sm tabular-nums">
          <div className="flex justify-between text-foreground/80">
            <span>Subtotal</span>
            <span>{formatPrice(order.subtotal || 0)}</span>
          </div>
          <div className="flex justify-between text-foreground/80">
            <span>Delivery</span>
            <span>{(order.deliveryCharge || 0) === 0 ? 'Free' : formatPrice(order.deliveryCharge || 0)}</span>
          </div>
          {(order.taxAmount || 0) > 0 && (
            <div className="flex justify-between text-foreground/80">
              <span>
                GST{order.gstRate ? ` (${order.gstRate}%${order.gstInclusive ? ' incl.' : ''})` : ''}
              </span>
              <span>{formatPrice(order.taxAmount || 0)}</span>
            </div>
          )}
          {(order.codCharge || 0) > 0 && (
            <div className="flex justify-between text-foreground/80">
              <span>COD charge</span>
              <span>{formatPrice(order.codCharge || 0)}</span>
            </div>
          )}
          {(order.discount || order.couponDiscount || 0) > 0 && (
            <div className="flex justify-between text-status-success-fg">
              <span>
                Discount{order.couponCode ? ` (${order.couponCode})` : ''}
              </span>
              <span>-{formatPrice(order.discount || order.couponDiscount || 0)}</span>
            </div>
          )}
          {(order.pointsUsed || 0) > 0 && (
            <div className="flex justify-between text-status-success-fg">
              <span>Points ({order.pointsUsed})</span>
              {/* pointsUsed is a count; pointsValue is what they were worth. Older
                   orders lack it, and then 1 point was ₹1. */}
              <span>-{formatPrice(order.pointsValue ?? order.pointsUsed ?? 0)}</span>
            </div>
          )}
          {(order.cashbackUsed || 0) > 0 && (
            <div className="flex justify-between text-status-success-fg">
              <span>Wallet cashback</span>
              <span>-{formatPrice(order.cashbackUsed || 0)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-foreground/[0.08] pt-2 text-base font-semibold text-foreground">
            <span>Total</span>
            <span>{formatPrice(order.total || 0)}</span>
          </div>
          {order.couponCode && (
            <p className="pt-1 text-xs text-muted-foreground">
              Coupon <span className="font-mono font-semibold text-foreground/80">{order.couponCode}</span>
              {order.couponDescription ? `: ${order.couponDescription}` : ''}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-foreground/[0.08] pt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Coins aria-hidden="true" className="size-3.5 shrink-0" />
              {pointsText}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={reconcileRunning}
              onClick={() => checkPaymentAndRewards('rewards')}
            >
              {reconcileRunning && reconcile?.from === 'rewards' ? <Spinner /> : null}
              Check payment & rewards
            </Button>
            {reconcileNote('rewards')}
          </div>
          {scratchText && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Ticket aria-hidden="true" className="size-3.5 shrink-0" />
              {scratchText}
            </p>
          )}
        </div>
      </section>

      {/* Order conversation: admin can see everything (internal + customer
           visible) and reply inside the same thread the customer uses. */}
      <section aria-labelledby="order-chat-title" className={PANEL}>
        <h2 id="order-chat-title" className={SECTION_TITLE}>
          <MessageSquare aria-hidden="true" className="size-4 text-muted-foreground" /> Order conversation
          {chatMessages.length > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-foreground">
              {chatMessages.length}
            </span>
          )}
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Replies marked customer-visible appear on the customer order page in real time.
        </p>

        <div
          ref={chatScrollRef}
          className="max-h-[360px] space-y-2 overflow-y-auto rounded-card border border-foreground/[0.06] bg-muted p-3"
        >
          {chatMessages.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No messages yet. Send the first reply below.
            </p>
          ) : (
            chatMessages.map((m) => {
              const isAdmin = m.authorType === 'admin';
              const isSystem = m.authorType === 'system';
              const align = isAdmin ? 'justify-end' : 'justify-start';
              const bubble = isAdmin
                ? 'border border-primary/20 bg-primary/10 text-foreground'
                : isSystem
                  ? 'border border-dashed border-foreground/20 bg-card text-foreground/80'
                  : 'border border-foreground/[0.08] bg-card text-foreground';
              return (
                <div key={m.id} className={`flex ${align}`}>
                  <div className={`max-w-[85%] rounded-card px-3 py-2 text-sm ${bubble}`}>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground/80">
                        {m.authorName || (isAdmin ? 'Support team' : isSystem ? 'System' : 'Customer')}
                      </span>
                      <span className="tabular-nums">{formatDateTime(m.createdAt)}</span>
                      {m.channel !== 'chat' && (
                        <span className="rounded-chip bg-muted px-1.5 py-0.5">
                          {m.channel}
                        </span>
                      )}
                      {m.visibility === 'internal' && (
                        <span className="rounded-chip border border-status-warning-line bg-status-warning-bg px-1.5 py-0.5 text-status-warning-fg">
                          Internal
                        </span>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap leading-snug">{m.message}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-3 space-y-2">
          <Label htmlFor="admin-chat-reply" className="sr-only">Reply to the customer</Label>
          <Textarea
            id="admin-chat-reply"
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            placeholder="Reply to the customer about this order"
            className="min-h-[88px] resize-none"
            disabled={sendingChat}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Sent as <span className="font-semibold text-foreground/80">{userProfile?.username || user?.displayName || 'Support team'}</span>. Visible to the customer.
            </p>
            <Button
              size="sm"
              onClick={sendAdminChatMessage}
              disabled={sendingChat || !chatDraft.trim()}
            >
              {sendingChat ? <Spinner /> : <Send aria-hidden="true" />}
              {sendingChat ? 'Sending' : 'Send reply'}
            </Button>
          </div>
        </div>
      </section>

      {/* Status + Assign Partner */}
      <div className={`grid gap-4 ${DELIVERY_PARTNERS_ENABLED ? 'lg:grid-cols-2' : ''}`}>
        {/* Status control */}
        <section aria-labelledby="order-status-title" className={PANEL}>
          <h2 id="order-status-title" className={SECTION_TITLE}>
            Order status
          </h2>
          <Label htmlFor="order-status" className="sr-only">Order status</Label>
          <Select
            value={normalizedStatus}
            onValueChange={(v) => {
              const next = v as Order['status'];
              if (next === normalizedStatus) return;
              setConfirmAction({ kind: 'status', next });
            }}
            disabled={savingStatus}
          >
            <SelectTrigger id="order-status" ref={statusTriggerRef} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => {
                const allowed =
                  opt.value === normalizedStatus ||
                  isValidStatusTransition(normalizedStatus, opt.value);
                return (
                  <SelectItem key={opt.value} value={opt.value} disabled={!allowed}>
                    {opt.label}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            You confirm each change. Status can only move forward.
          </p>
          {normalizedStatus === 'returnRequested' && returnTiming !== 'in-window' && (
            <Notice tone="warning" compact className="mt-3 text-xs" role="alert">
              <span className="min-w-0 break-words">
                {returnTiming === 'late' && returnWindowClosed
                  ? `Requested after the ${RETURN_WINDOW_DAYS}-day return window, which closed on ${formatDay(returnWindowClosed.getTime())}. Points earned on this order may already be spent; approving voids them.`
                  : `No delivery or request time is recorded, so the ${RETURN_WINDOW_DAYS}-day return window can't be checked. Confirm the delivery date before approving.`}
              </span>
            </Notice>
          )}
          {normalizedStatus === 'returnRequested' && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                size="sm"
                disabled={returnReviewing !== null || returnMeta.returnStatus === 'approved'}
                onClick={() => setConfirmAction({ kind: 'approve' })}
              >
                {returnReviewing === 'approve' ? <Spinner /> : null}
                {returnMeta.returnStatus === 'approved' ? 'Return approved' : 'Approve return'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={returnReviewing !== null || returnMeta.returnStatus === 'rejected'}
                onClick={() => setConfirmAction({ kind: 'reject' })}
              >
                {returnReviewing === 'reject' ? <Spinner /> : null}
                {returnMeta.returnStatus === 'rejected' ? 'Return rejected' : 'Reject return'}
              </Button>
            </div>
          )}
          {nextStatus && (
            <Button
              className="mt-3 w-full"
              variant="outline"
              size="sm"
              disabled={savingStatus || (DELIVERY_PARTNERS_ENABLED && nextStatus === 'outForDelivery' && !partnerName)}
              onClick={() => setConfirmAction({ kind: 'status', next: nextStatus })}
            >
              {savingStatus ? <Spinner /> : null}
              Mark as {statusLabel(nextStatus)}
            </Button>
          )}
        </section>

        {/* Delivery partner / Return pickup partner: only when the delivery system is on */}
        {DELIVERY_PARTNERS_ENABLED && (
        <section className={PANEL}>
          <h2 className={SECTION_TITLE}>
            <Truck aria-hidden="true" className="size-4 text-muted-foreground" />
            {normalizedStatus === 'returnRequested' || normalizedStatus === 'returnScheduled' || normalizedStatus === 'picked'
              ? 'Return pickup partner'
              : 'Delivery partner'}
          </h2>

          {/* Return flow: assign pickup partner */}
          {normalizedStatus === 'returnRequested' ? (
            <div className="space-y-2">
              {returnMeta.returnStatus !== 'approved' && (
                <Notice tone="warning" compact className="text-xs">
                  Approve the return request above before assigning a pickup partner.
                </Notice>
              )}
              <Select
                onValueChange={handleAssignReturnPartner}
                disabled={assigningReturn || returnMeta.returnStatus !== 'approved'}
              >
                <SelectTrigger aria-label="Pickup partner">
                  <SelectValue placeholder="Select a pickup partner" />
                </SelectTrigger>
                <SelectContent>
                  {deliveryPartners.length === 0 && (
                    <SelectItem value="__none" disabled>
                      No active partners
                    </SelectItem>
                  )}
                  {deliveryPartners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <UserPlus aria-hidden="true" className="size-3" />
                        {p.name}
                        {p.phone ? <span className="text-xs text-muted-foreground">· {p.phone}</span> : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Assigning a pickup partner will set the order to{' '}
                <span className="font-medium text-foreground/80">Return scheduled</span> and share a pickup OTP with
                the customer.
              </p>
              {assigningReturn && (
                <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Spinner size={12} /> Assigning
                </div>
              )}
            </div>
          ) : partnerName ? (
            <div className="rounded-card border border-status-success-line bg-status-success-bg p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground">
                    {partnerName}
                  </p>
                  {partnerPhone && (
                    <a
                      href={`tel:${partnerPhone}`}
                      className="mt-0.5 flex items-center gap-1 text-xs text-status-success-fg"
                    >
                      <Phone aria-hidden="true" className="size-3" /> {partnerPhone}
                    </a>
                  )}
                </div>
                <ShieldCheck aria-hidden="true" className="size-5 text-status-success-fg" />
              </div>
              {otp && normalizedStatus === 'outForDelivery' && (
                <div className="mt-3 rounded-control bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    Delivery OTP
                  </p>
                  <p className="font-mono text-lg font-bold tracking-[0.4em] text-foreground">
                    {otp}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Customer can see this on their order page.
                  </p>
                </div>
              )}
              {returnOtp && normalizedStatus === 'returnScheduled' && (
                <div className="mt-3 rounded-control bg-card px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    Return pickup OTP
                  </p>
                  <p className="font-mono text-lg font-bold tracking-[0.4em] text-foreground">
                    {returnOtp}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Customer shows this OTP to the pickup partner.
                  </p>
                </div>
              )}
              {returnStoreOtp && (normalizedStatus === 'picked' || normalizedStatus === 'deliveryFailed') && (
                <div className="mt-3 rounded-control border border-status-warning-line bg-card px-3 py-2">
                  <p className="text-xs font-medium text-status-warning-fg">
                    Return store OTP
                  </p>
                  <p className="font-mono text-2xl font-bold tracking-[0.4em] text-foreground">
                    {returnStoreOtp}
                  </p>
                  <p className="mt-1 text-xs font-medium text-foreground/80">
                    Tell this OTP to the delivery partner when they arrive at the store.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Select onValueChange={handleAssignPartner} disabled={assigning}>
                <SelectTrigger aria-label="Delivery partner">
                  <SelectValue placeholder="Select a delivery partner" />
                </SelectTrigger>
                <SelectContent>
                  {deliveryPartners.length === 0 && (
                    <SelectItem value="__none" disabled>
                      No active partners
                    </SelectItem>
                  )}
                  {deliveryPartners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <UserPlus aria-hidden="true" className="size-3" />
                        {p.name}
                        {p.phone ? <span className="text-xs text-muted-foreground">· {p.phone}</span> : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Assigning a partner automatically sets the order to{' '}
                <span className="font-medium text-foreground/80">Out for delivery</span> and generates an OTP for
                the customer.
              </p>
              {assigning && (
                <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Spinner size={12} /> Assigning
                </div>
              )}
            </div>
          )}
        </section>
        )}
      </div>

      {/* Delivery window setter: available once the order is packed or out for delivery */}
      {(normalizedStatus === 'packed' || normalizedStatus === 'outForDelivery') && (
        <WindowSetter
          idPrefix="delivery-window"
          title="Set delivery window"
          current={
            order.delivery_window_date && order.delivery_window_from && order.delivery_window_to
              ? { date: order.delivery_window_date, from: order.delivery_window_from, to: order.delivery_window_to }
              : null
          }
          emptyNote={null}
          onTemplate={applyDeliveryTemplate}
          date={windowDate}
          setDate={setWindowDate}
          from={windowFrom}
          setFrom={setWindowFrom}
          to={windowTo}
          setTo={setWindowTo}
          note={windowNote}
          setNote={setWindowNote}
          notePlaceholder="e.g. Please be available at the gate"
          saving={savingWindow}
          onSave={handleSetWindow}
          saveLabel="Save delivery window"
        />
      )}

      {/* Return pickup window setter: visible when a return is scheduled */}
      {normalizedStatus === 'returnScheduled' && (
        <WindowSetter
          idPrefix="return-window"
          title="Set return pickup window"
          current={
            order.return_window_date && order.return_window_from && order.return_window_to
              ? { date: order.return_window_date, from: order.return_window_from, to: order.return_window_to }
              : null
          }
          emptyNote="The pickup partner cannot complete this return until a window is saved."
          onTemplate={applyReturnTemplate}
          date={returnWindowDate}
          setDate={setReturnWindowDate}
          from={returnWindowFrom}
          setFrom={setReturnWindowFrom}
          to={returnWindowTo}
          setTo={setReturnWindowTo}
          note={returnWindowNote}
          setNote={setReturnWindowNote}
          notePlaceholder="e.g. Item should be packed in the original box"
          saving={savingReturnWindow}
          onSave={handleSetReturnWindow}
          saveLabel="Save pickup window"
        />
      )}

      {/* Refund receipt upload (visible only when order is refunded) */}
      {normalizedStatus === 'refunded' && (
        <RefundReceiptUploader order={order} />
      )}

      {/* Address */}
      <section aria-labelledby="order-address-title" className={PANEL}>
        <h2 id="order-address-title" className={SECTION_TITLE}>
          <MapPin aria-hidden="true" className="size-4 text-muted-foreground" /> Delivery address
        </h2>
        <p className="text-sm text-foreground/80">
          {order.shippingAddress?.address}
          {order.shippingAddress?.locality ? `, ${order.shippingAddress.locality}` : ''},{' '}
          {order.shippingAddress?.city}, {order.shippingAddress?.state}{' '}
          {order.shippingAddress?.pincode}
        </p>
        {order.shippingAddress?.landmark && (
          <p className="mt-1 text-xs text-muted-foreground">
            Landmark: {order.shippingAddress.landmark}
          </p>
        )}
      </section>

      {/* Confirmation for status changes and return decisions; the same handlers run after. */}
      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        returnFocusRef={confirmAction?.kind === 'status' ? statusTriggerRef : undefined}
        title={
          confirmAction?.kind === 'approve'
            ? `Approve the return for ${orderLabel(order.orderId)}?`
            : confirmAction?.kind === 'reject'
              ? `Reject the return for ${orderLabel(order.orderId)}?`
              : confirmAction?.kind === 'status'
                ? `Mark ${orderLabel(order.orderId)} as ${statusLabel(confirmAction.next).toLowerCase()}?`
                : 'Confirm'
        }
        description={
          confirmAction?.kind === 'approve'
            ? returnTiming === 'late' && returnWindowClosed
              ? `This request came after the ${RETURN_WINDOW_DAYS}-day return window, which closed on ${formatDay(returnWindowClosed.getTime())}. Approving voids the points earned on this order.`
              : returnTiming !== 'in-window'
                ? `The ${RETURN_WINDOW_DAYS}-day return window can't be checked for this order. Confirm the delivery date first.`
                : DELIVERY_PARTNERS_ENABLED
                  ? 'The return is marked approved. Assign a pickup partner next.'
                  : 'The return is marked approved. Set the status to Returned once the item is back.'
            : confirmAction?.kind === 'reject'
              ? 'The order goes back to Delivered and the return request is closed.'
              : 'Status only moves forward in the workflow, so this cannot be undone from here.'
        }
        confirmLabel={
          confirmAction?.kind === 'approve'
            ? 'Approve return'
            : confirmAction?.kind === 'reject'
              ? 'Reject return'
              : 'Change status'
        }
        tone={confirmAction?.kind === 'reject' ? 'danger' : 'default'}
        onConfirm={() => {
          const action = confirmAction;
          if (!action) return undefined;
          if (action.kind === 'approve') return handleApproveReturn();
          if (action.kind === 'reject') return handleRejectReturn();
          return handleStatusChange(action.next);
        }}
      />
    </div>
  );
};

// ============================================================
// Delivery / return pickup window form (same fields, same handlers)
// ============================================================
function WindowSetter({
  idPrefix,
  title,
  current,
  emptyNote,
  onTemplate,
  date,
  setDate,
  from,
  setFrom,
  to,
  setTo,
  note,
  setNote,
  notePlaceholder,
  saving,
  onSave,
  saveLabel,
}: {
  idPrefix: string;
  title: string;
  current: { date: string; from: string; to: string } | null;
  emptyNote: string | null;
  onTemplate: (id: FulfillmentWindowTemplateId) => void;
  date: string;
  setDate: (v: string) => void;
  from: string;
  setFrom: (v: string) => void;
  to: string;
  setTo: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  notePlaceholder: string;
  saving: boolean;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <section aria-labelledby={`${idPrefix}-title`} className={PANEL}>
      <h2 id={`${idPrefix}-title`} className={SECTION_TITLE}>
        <Calendar aria-hidden="true" className="size-4 text-muted-foreground" /> {title}
      </h2>
      {current ? (
        <p className="mb-3 rounded-control bg-muted px-3 py-2 text-xs text-foreground/80">
          Currently scheduled: <span className="font-semibold text-foreground">{current.date}</span>
          {' · '}{current.from} to {current.to}
        </p>
      ) : emptyNote ? (
        <Notice tone="warning" compact className="mb-3 text-xs">
          {emptyNote}
        </Notice>
      ) : null}
      <div className="space-y-4">
        <div>
          <p className={FIELD_LABEL}>Quick templates</p>
          <div className="grid grid-cols-3 gap-2">
            {FULFILLMENT_WINDOW_TEMPLATES.map((tpl) => (
              <Button
                key={tpl.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onTemplate(tpl.id)}
                className="h-9 whitespace-normal px-2 text-xs leading-tight"
              >
                {tpl.shortLabel}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-date`} className={FIELD_LABEL}>Date</label>
          <Input
            id={`${idPrefix}-date`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${idPrefix}-from`} className={FIELD_LABEL}>From</label>
            <Input id={`${idPrefix}-from`} type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-to`} className={FIELD_LABEL}>To</label>
            <Input id={`${idPrefix}-to`} type="time" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-note`} className={FIELD_LABEL}>Note (optional)</label>
          <Textarea
            id={`${idPrefix}-note`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={notePlaceholder}
            rows={2}
            className="resize-none"
          />
        </div>
        <Button onClick={onSave} disabled={saving || !date || !from || !to} className="w-full">
          {saving ? <Spinner /> : <Clock aria-hidden="true" />}
          {saveLabel}
        </Button>
      </div>
    </section>
  );
}

// ============================================================
// Refund Receipt Uploader (admin uploads PDF or image; customer sees it)
// ============================================================
function RefundReceiptUploader({ order }: { order: Order }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setProgress(0);
    try {
      const isPdf = file.type === 'application/pdf';
      const { url } = await uploadDocument(file, {
        category: 'receipts',
        onProgress: (p) => setProgress(p.percentage),
      });

      await updateDoc(doc(db, 'orders', order.id), {
        refundReceiptUrl: url,
        refundReceiptUploadedAt: serverTimestamp(),
        refundReceiptType: isPdf ? 'pdf' : 'image',
        refundReceiptName: file.name,
      });
      toast.success('Refund receipt uploaded');
    } catch (err) {
      console.error('[refund-receipt] upload failed:', err);
      toast.error(describeUploadError(err));
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <section aria-labelledby="refund-receipt-title" className={PANEL}>
      <h2 id="refund-receipt-title" className={SECTION_TITLE}>
        <Receipt aria-hidden="true" className="size-4 text-muted-foreground" /> Refund receipt
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Upload the refund receipt (image up to 500 KB, or PDF up to 1 MB). The customer will
        see a “View Receipt” button on their order page once uploaded.
      </p>
      <ImageUploader
        acceptPdf
        confirmBeforeUpload
        onImageSelected={handleUpload}
        existingImageUrl={order.refundReceiptUrl || undefined}
        existingFileName={order.refundReceiptName || undefined}
        existingFileType={order.refundReceiptType || undefined}
        isUploading={uploading}
        uploadProgress={uploading ? progress : undefined}
      />
      {order.refundReceiptUrl && (
        <a
          href={order.refundReceiptUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline"
        >
          <ExternalLink aria-hidden="true" className="size-3.5" /> Open current receipt
        </a>
      )}
    </section>
  );
}

export default AdminOrderDetails;
