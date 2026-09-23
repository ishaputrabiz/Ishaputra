import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  Loader2,
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
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
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
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
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
 * (shipped/assigned/picked) are intentionally excluded — they are normalised
 * to `packed` / `outForDelivery` for display.
 */
const STATUS_OPTIONS: Array<{ value: Order['status']; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'packed', label: 'Packed' },
  { value: 'outForDelivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
  // Exception flow
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'returnRequested', label: 'Return Requested' },
  { value: 'returnScheduled', label: 'Return Scheduled' },
  { value: 'picked', label: 'Return Picked Up' },
  { value: 'returned', label: 'Returned' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'deliveryFailed', label: 'Delivery Failed' },
];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-gray-200 text-gray-800 hover:bg-gray-200' },
  processing: { label: 'Processing', className: 'bg-blue-100 text-blue-700 hover:bg-blue-100' },
  packed: { label: 'Packed', className: 'bg-orange-100 text-orange-700 hover:bg-orange-100' },
  outForDelivery: { label: 'Out for Delivery', className: 'bg-purple-100 text-purple-700 hover:bg-purple-100' },
  delivered: { label: 'Delivered', className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  returnRequested: { label: 'Return Requested', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  returnScheduled: { label: 'Return Scheduled', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  picked: { label: 'Return Picked Up', className: 'bg-amber-100 text-amber-700 hover:bg-amber-100' },
  returned: { label: 'Returned', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
  refunded: { label: 'Refunded', className: 'bg-green-100 text-green-700 hover:bg-green-100' },
  deliveryFailed: { label: 'Delivery Failed', className: 'bg-red-100 text-red-700 hover:bg-red-100' },
};

const NEXT_STEP_HINT: Record<string, string> = {
  pending: 'Confirm the order to start processing.',
  processing: 'Pack the items and mark as Packed when ready.',
  packed: 'Assign a delivery partner — this will mark the order as Out for Delivery.',
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

const formatPrice = (price: number) =>
  `₹${(price ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

type TimestampLike = { seconds?: number; toDate?: () => Date } | Date | string | number | null | undefined;
type OrderReturnMeta = Order & {
  returnScheduledAt?: unknown;
  return_otp?: string;
  return_store_otp?: string;
  returnStatus?: string;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const formatDateTime = (value: TimestampLike) => {
  if (!value) return 'N/A';
  const date = value instanceof Date
    ? value
    : typeof value === 'object' && value.toDate
      ? value.toDate()
      : typeof value === 'object' && typeof value.seconds === 'number'
        ? new Date(value.seconds * 1000)
        : typeof value === 'string' || typeof value === 'number'
          ? new Date(value)
          : new Date();
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

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
        title: 'New reply from Sreerasthu support',
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
    if (!order || next === order.status) return;
    if (!isValidStatusTransition(order.status, next)) {
      toast.error('Status can only move forward in the workflow.');
      return;
    }
    // When the in-house delivery system is enabled, these statuses are driven by
    // the assign-partner / OTP panels rather than the dropdown. With it disabled,
    // the admin moves the order through every status directly.
    if (DELIVERY_PARTNERS_ENABLED && next === 'outForDelivery' && !order.delivery_boy_id && !order.delivery_partner_id) {
      toast.error('Assign a delivery partner first — that will mark the order as Out for Delivery.');
      return;
    }
    if (DELIVERY_PARTNERS_ENABLED && next === 'returnScheduled') {
      toast.error('Use the “Assign pickup partner” panel below to schedule a return — direct status change is disabled.');
      return;
    }
    setSavingStatus(true);
    try {
      await updateOrderStatus(order.id, next);
      toast.success(`Status updated to ${STATUS_BADGE[next]?.label || next}`);
    } catch (err: unknown) {
      console.error(err);
      toast.error(getErrorMessage(err, 'Failed to update status'));
    } finally {
      setSavingStatus(false);
    }
  };

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
      toast.success('Delivery window saved!');
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
      toast.success('Return pickup window saved!');
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
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  if (!order) return null;

  const badge = STATUS_BADGE[normalizedStatus] || STATUS_BADGE.pending;
  const nextStatus = normalizedStatus === 'picked' ? ('returned' as Order['status']) : getNextStatus(normalizedStatus);

  // In admin-managed fulfilment mode (delivery system off), the admin advances
  // the order through every step directly, so the hints reference the dropdown
  // rather than a delivery partner / OTP.
  const ADMIN_DRIVEN_HINTS: Record<string, string> = {
    packed: 'Mark the order as Out for Delivery once it leaves the store.',
    outForDelivery: 'Mark as Delivered once the customer has received the order.',
    returnRequested: 'Approve the return, then set the status to Returned once the item is back.',
    returnScheduled: 'Set the status to Returned once the item is back with you.',
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

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/orders')}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-400">Order</p>
            <h1 className="font-mono text-lg font-bold text-gray-900 dark:text-zinc-100">
              #{order.orderId}
            </h1>
          </div>
        </div>
        <Badge className={`${badge.className} px-3 py-1.5 text-sm font-semibold`}>
          {badge.label}
        </Badge>
      </div>

      {/* Top summary card */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-gray-400">Customer</p>
            <p className="mt-1 font-semibold text-gray-900 dark:text-zinc-100">
              {order.shippingAddress?.fullName || order.userName}
            </p>
            <p className="text-xs text-gray-500">{order.shippingAddress?.mobile}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-gray-400">Total</p>
            <p className="mt-1 text-xl font-bold text-amber-600">{formatPrice(order.total)}</p>
            <p className="text-xs text-gray-500">{order.items?.length || 0} item(s)</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-gray-400">Payment</p>
            <p className="mt-1 font-semibold text-gray-900 dark:text-zinc-100">
              {order.paymentMethod || 'Online'}
            </p>
            {/* Cash on Delivery was retired, but historic orders still carry it -
                so the label follows the order rather than assuming COD. */}
            <p className={`text-xs font-medium ${isPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
              {isPaid ? (isCod ? 'COD collected' : 'Paid') : isCod ? 'COD pending' : 'Payment pending'}
            </p>
            {order.paymentCollectedAt && (
              <p className="mt-1 text-[11px] text-gray-500">
                Collected {formatDateTime(order.paymentCollectedAt)}
                {order.paymentCollectedByName ? ` by ${order.paymentCollectedByName}` : ''}
              </p>
            )}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-gray-400">Placed</p>
            <p className="mt-1 text-sm text-gray-700 dark:text-zinc-300">
              {formatDateTime(order.createdAt)}
            </p>
          </div>
        </div>

        {statusHint && (
          <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
            <span className="font-semibold">Next:</span> {statusHint}
          </div>
        )}
        {isCod && !isPaid && normalizedStatus === 'outForDelivery' && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
            {DELIVERY_PARTNERS_ENABLED
              ? 'COD payment is still pending. The delivery partner must collect cash and mark it received before the order can be completed.'
              : 'This is a Cash on Delivery order. The payment will be recorded as collected when you mark the order Delivered.'}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-zinc-100">
          <Package className="h-4 w-4" /> Items
        </h2>
        <div className="space-y-2">
          {order.items?.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 rounded-lg bg-gray-50 p-2 dark:bg-zinc-800/50"
            >
              {item.image && (
                <SmartImage
                  src={item.image}
                  alt={item.name}
                  className="h-12 w-12 rounded-md object-cover" preset="thumb" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-zinc-100">
                  {item.name}
                </p>
                <p className="text-xs text-gray-500">Qty {item.quantity}</p>
              </div>
              <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
                {formatPrice(item.price * item.quantity)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing breakdown — sourced from the saved order so admins see exactly
           what the customer paid (subtotal, delivery, GST, COD, coupon, total). */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-zinc-100">
          Pricing breakdown
        </h2>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-700 dark:text-zinc-300">
            <span>Subtotal</span>
            <span>{formatPrice(order.subtotal || 0)}</span>
          </div>
          <div className="flex justify-between text-gray-700 dark:text-zinc-300">
            <span>Delivery</span>
            <span>{(order.deliveryCharge || 0) === 0 ? 'FREE' : formatPrice(order.deliveryCharge || 0)}</span>
          </div>
          {(order.taxAmount || 0) > 0 && (
            <div className="flex justify-between text-gray-700 dark:text-zinc-300">
              <span>
                GST{order.gstRate ? ` (${order.gstRate}%${order.gstInclusive ? ' incl.' : ''})` : ''}
              </span>
              <span>{formatPrice(order.taxAmount || 0)}</span>
            </div>
          )}
          {(order.codCharge || 0) > 0 && (
            <div className="flex justify-between text-gray-700 dark:text-zinc-300">
              <span>COD charge</span>
              <span>{formatPrice(order.codCharge || 0)}</span>
            </div>
          )}
          {(order.discount || order.couponDiscount || 0) > 0 && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <span>
                Discount{order.couponCode ? ` (${order.couponCode})` : ''}
              </span>
              <span>-{formatPrice(order.discount || order.couponDiscount || 0)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900 dark:border-zinc-800 dark:text-zinc-100">
            <span>Total</span>
            <span className="text-amber-600">{formatPrice(order.total || 0)}</span>
          </div>
          {order.couponCode && (
            <p className="pt-1 text-xs text-gray-500">
              Coupon <span className="font-mono font-semibold">{order.couponCode}</span>
              {order.couponDescription ? ` — ${order.couponDescription}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Order conversation — admin can see everything (internal + customer
           visible) and reply inside the same thread the customer uses. */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-zinc-100">
          <MessageSquare className="h-4 w-4" /> Order conversation
          {chatMessages.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
              {chatMessages.length}
            </span>
          )}
        </h2>
        <p className="mb-3 text-xs text-gray-500 dark:text-zinc-400">
          Replies marked customer-visible appear on the customer order page in real time.
        </p>

        <div
          ref={chatScrollRef}
          className="max-h-[360px] space-y-2 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40"
        >
          {chatMessages.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-500 dark:text-zinc-400">
              No messages yet. Send the first reply below.
            </p>
          ) : (
            chatMessages.map((m) => {
              const isAdmin = m.authorType === 'admin';
              const isSystem = m.authorType === 'system';
              const align = isAdmin ? 'justify-end' : 'justify-start';
              const bubble = isAdmin
                ? 'bg-amber-600 text-white'
                : isSystem
                  ? 'border border-dashed border-gray-300 bg-white text-gray-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
                  : 'border border-gray-200 bg-white text-gray-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100';
              return (
                <div key={m.id} className={`flex ${align}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${bubble}`}>
                    <div className={`flex flex-wrap items-center gap-2 text-[10px] ${isAdmin ? 'text-white/80' : 'text-gray-500 dark:text-zinc-400'}`}>
                      <span className="font-semibold">
                        {m.authorName || (isAdmin ? 'Support team' : isSystem ? 'System' : 'Customer')}
                      </span>
                      <span>{formatDateTime(m.createdAt)}</span>
                      {m.channel !== 'chat' && (
                        <span className={`rounded-full px-1.5 py-0.5 ${isAdmin ? 'bg-white/15' : 'bg-gray-100 dark:bg-zinc-800'}`}>
                          {m.channel}
                        </span>
                      )}
                      {m.visibility === 'internal' && (
                        <span className={`rounded-full px-1.5 py-0.5 ${isAdmin ? 'bg-white/15' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'}`}>
                          internal
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
          <Textarea
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            placeholder="Reply to the customer about this order…"
            className="min-h-[88px] resize-none"
            disabled={sendingChat}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500 dark:text-zinc-400">
              Sent as <span className="font-semibold">{userProfile?.username || user?.displayName || 'Support team'}</span> — visible to the customer.
            </p>
            <Button
              size="sm"
              onClick={sendAdminChatMessage}
              disabled={sendingChat || !chatDraft.trim()}
              className="gap-2"
            >
              {sendingChat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sendingChat ? 'Sending…' : 'Send reply'}
            </Button>
          </div>
        </div>
      </div>

      {/* Status + Assign Partner */}
      <div className={`grid gap-4 ${DELIVERY_PARTNERS_ENABLED ? 'lg:grid-cols-2' : ''}`}>
        {/* Status control */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-zinc-100">
            Order Status
          </h2>
          <Select
            value={normalizedStatus}
            onValueChange={(v) => handleStatusChange(v as Order['status'])}
            disabled={savingStatus}
          >
            <SelectTrigger className="w-full">
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
          <p className="mt-2 text-xs text-gray-500">
            Changes save automatically. Status can only move forward.
          </p>
          {normalizedStatus === 'returnRequested' && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={returnReviewing !== null || returnMeta.returnStatus === 'approved'}
                onClick={handleApproveReturn}
              >
                {returnReviewing === 'approve' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {returnMeta.returnStatus === 'approved' ? 'Return Approved' : 'Approve Return'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={returnReviewing !== null || returnMeta.returnStatus === 'rejected'}
                onClick={handleRejectReturn}
              >
                {returnReviewing === 'reject' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {returnMeta.returnStatus === 'rejected' ? 'Return Rejected' : 'Reject Return'}
              </Button>
            </div>
          )}
          {nextStatus && (
            <Button
              className="mt-3 w-full"
              variant="outline"
              size="sm"
              disabled={savingStatus || (DELIVERY_PARTNERS_ENABLED && nextStatus === 'outForDelivery' && !partnerName)}
              onClick={() => handleStatusChange(nextStatus)}
            >
              {savingStatus ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Mark as {STATUS_BADGE[nextStatus]?.label || nextStatus}
            </Button>
          )}
        </div>

        {/* Delivery partner / Return pickup partner — only when the delivery system is on */}
        {DELIVERY_PARTNERS_ENABLED && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-zinc-100">
            <Truck className="h-4 w-4" />
            {normalizedStatus === 'returnRequested' || normalizedStatus === 'returnScheduled' || normalizedStatus === 'picked'
              ? 'Return Pickup Partner'
              : 'Delivery Partner'}
          </h2>

          {/* Return flow — assign pickup partner */}
          {normalizedStatus === 'returnRequested' ? (
            <div className="space-y-2">
              {returnMeta.returnStatus !== 'approved' && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200">
                  Approve the return request above before assigning a pickup partner.
                </p>
              )}
              <Select
                onValueChange={handleAssignReturnPartner}
                disabled={assigningReturn || returnMeta.returnStatus !== 'approved'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a pickup partner…" />
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
                        <UserPlus className="h-3 w-3" />
                        {p.name}
                        {p.phone ? <span className="text-xs text-gray-500">· {p.phone}</span> : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Assigning a pickup partner will set the order to{' '}
                <span className="font-medium">Return Scheduled</span> and share a pickup OTP with
                the customer.
              </p>
              {assigningReturn && (
                <div className="flex items-center gap-2 text-xs text-amber-600">
                  <Loader2 className="h-3 w-3 animate-spin" /> Assigning…
                </div>
              )}
            </div>
          ) : partnerName ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-emerald-800 dark:text-emerald-200">
                    {partnerName}
                  </p>
                  {partnerPhone && (
                    <a
                      href={`tel:${partnerPhone}`}
                      className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300"
                    >
                      <Phone className="h-3 w-3" /> {partnerPhone}
                    </a>
                  )}
                </div>
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              {otp && normalizedStatus === 'outForDelivery' && (
                <div className="mt-3 rounded-md bg-white px-3 py-2 dark:bg-zinc-900/60">
                  <p className="text-[10px] uppercase tracking-widest text-gray-400">
                    Delivery OTP
                  </p>
                  <p className="font-mono text-lg font-bold tracking-[0.4em] text-amber-600">
                    {otp}
                  </p>
                  <p className="mt-1 text-[10px] text-gray-500">
                    Customer can see this on their order page.
                  </p>
                </div>
              )}
              {returnOtp && normalizedStatus === 'returnScheduled' && (
                <div className="mt-3 rounded-md bg-white px-3 py-2 dark:bg-zinc-900/60">
                  <p className="text-[10px] uppercase tracking-widest text-gray-400">
                    Return Pickup OTP
                  </p>
                  <p className="font-mono text-lg font-bold tracking-[0.4em] text-amber-600">
                    {returnOtp}
                  </p>
                  <p className="mt-1 text-[10px] text-gray-500">
                    Customer shows this OTP to the pickup partner.
                  </p>
                </div>
              )}
              {returnStoreOtp && (normalizedStatus === 'picked' || normalizedStatus === 'deliveryFailed') && (
                <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 dark:bg-amber-500/10 dark:border-amber-500/30">
                  <p className="text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-400">
                    Return Store OTP
                  </p>
                  <p className="font-mono text-2xl font-bold tracking-[0.4em] text-amber-700 dark:text-amber-300">
                    {returnStoreOtp}
                  </p>
                  <p className="mt-1 text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                    Tell this OTP to the delivery partner when they arrive at the store.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Select onValueChange={handleAssignPartner} disabled={assigning}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a delivery partner…" />
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
                        <UserPlus className="h-3 w-3" />
                        {p.name}
                        {p.phone ? <span className="text-xs text-gray-500">· {p.phone}</span> : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Assigning a partner automatically sets the order to{' '}
                <span className="font-medium">Out for Delivery</span> and generates an OTP for
                the customer.
              </p>
              {assigning && (
                <div className="flex items-center gap-2 text-xs text-amber-600">
                  <Loader2 className="h-3 w-3 animate-spin" /> Assigning…
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </div>

      {/* Delivery Window Setter — available once the order is packed or out for delivery */}
      {(normalizedStatus === 'packed' || normalizedStatus === 'outForDelivery') && (
        <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-5 shadow-sm dark:border-purple-800 dark:bg-purple-900/20">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-purple-900 dark:text-purple-100">
            <Calendar className="h-4 w-4" /> Set Delivery Window
          </h2>
          {(order.delivery_window_date && order.delivery_window_from && order.delivery_window_to) && (
            <p className="mb-3 rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs text-purple-800 dark:bg-zinc-800 dark:border-purple-700 dark:text-purple-200">
              Currently scheduled: <span className="font-semibold">{order.delivery_window_date}</span>
              {' · '}{order.delivery_window_from}–{order.delivery_window_to}
            </p>
          )}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-purple-700 mb-1 block">Quick templates</label>
              <div className="grid grid-cols-3 gap-1.5">
                {FULFILLMENT_WINDOW_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyDeliveryTemplate(tpl.id)}
                    className="rounded-lg border border-purple-200 bg-white px-2 py-2 text-[11px] font-semibold text-purple-700 hover:border-purple-400 hover:bg-purple-100 transition-colors dark:bg-zinc-800 dark:border-purple-700 dark:text-purple-200"
                  >
                    {tpl.shortLabel}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-purple-700 mb-1 block">Date</label>
              <input
                type="date"
                value={windowDate}
                onChange={(e) => setWindowDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full rounded-xl border border-purple-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none dark:bg-zinc-800 dark:border-purple-600 dark:text-zinc-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-purple-700 mb-1 block">From</label>
                <input
                  type="time"
                  value={windowFrom}
                  onChange={(e) => setWindowFrom(e.target.value)}
                  className="w-full rounded-xl border border-purple-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none dark:bg-zinc-800 dark:border-purple-600 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-purple-700 mb-1 block">To</label>
                <input
                  type="time"
                  value={windowTo}
                  onChange={(e) => setWindowTo(e.target.value)}
                  className="w-full rounded-xl border border-purple-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none dark:bg-zinc-800 dark:border-purple-600 dark:text-zinc-100"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-purple-700 mb-1 block">Note (optional)</label>
              <textarea
                value={windowNote}
                onChange={(e) => setWindowNote(e.target.value)}
                placeholder="e.g. Please be available at the gate"
                rows={2}
                className="w-full rounded-xl border border-purple-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none resize-none dark:bg-zinc-800 dark:border-purple-600 dark:text-zinc-100"
              />
            </div>
            <Button
              onClick={handleSetWindow}
              disabled={savingWindow || !windowDate || !windowFrom || !windowTo}
              className="w-full bg-purple-600 hover:bg-purple-700 text-sm font-bold"
            >
              {savingWindow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
              Save Delivery Window
            </Button>
          </div>
        </div>
      )}

      {/* Return Pickup Window Setter — visible when a return is scheduled */}
      {normalizedStatus === 'returnScheduled' && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm dark:border-amber-800 dark:bg-amber-900/20">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
            <Calendar className="h-4 w-4" /> Set Return Pickup Window
          </h2>
          {(order.return_window_date && order.return_window_from && order.return_window_to) ? (
            <p className="mb-3 rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800 dark:bg-zinc-800 dark:border-amber-700 dark:text-amber-200">
              Currently scheduled: <span className="font-semibold">{order.return_window_date}</span>
              {' · '}{order.return_window_from}–{order.return_window_to}
            </p>
          ) : (
            <p className="mb-3 rounded-lg border border-amber-300 bg-amber-100/70 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-200">
              The pickup partner cannot complete this return until a window is saved.
            </p>
          )}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-amber-800 mb-1 block">Quick templates</label>
              <div className="grid grid-cols-3 gap-1.5">
                {FULFILLMENT_WINDOW_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => applyReturnTemplate(tpl.id)}
                    className="rounded-lg border border-amber-200 bg-white px-2 py-2 text-[11px] font-semibold text-amber-800 hover:border-amber-400 hover:bg-amber-100 transition-colors dark:bg-zinc-800 dark:border-amber-700 dark:text-amber-200"
                  >
                    {tpl.shortLabel}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-amber-800 mb-1 block">Date</label>
              <input
                type="date"
                value={returnWindowDate}
                onChange={(e) => setReturnWindowDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:bg-zinc-800 dark:border-amber-600 dark:text-zinc-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-semibold text-amber-800 mb-1 block">From</label>
                <input
                  type="time"
                  value={returnWindowFrom}
                  onChange={(e) => setReturnWindowFrom(e.target.value)}
                  className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:bg-zinc-800 dark:border-amber-600 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-amber-800 mb-1 block">To</label>
                <input
                  type="time"
                  value={returnWindowTo}
                  onChange={(e) => setReturnWindowTo(e.target.value)}
                  className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:bg-zinc-800 dark:border-amber-600 dark:text-zinc-100"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-amber-800 mb-1 block">Note (optional)</label>
              <textarea
                value={returnWindowNote}
                onChange={(e) => setReturnWindowNote(e.target.value)}
                placeholder="e.g. Item should be packed in the original box"
                rows={2}
                className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none resize-none dark:bg-zinc-800 dark:border-amber-600 dark:text-zinc-100"
              />
            </div>
            <Button
              onClick={handleSetReturnWindow}
              disabled={savingReturnWindow || !returnWindowDate || !returnWindowFrom || !returnWindowTo}
              className="w-full bg-amber-600 hover:bg-amber-700 text-sm font-bold"
            >
              {savingReturnWindow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock className="mr-2 h-4 w-4" />}
              Save Return Pickup Window
            </Button>
          </div>
        </div>
      )}

      {/* Refund receipt upload (visible only when order is refunded) */}
      {normalizedStatus === 'refunded' && (
        <RefundReceiptUploader order={order} />
      )}

      {/* Address */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-zinc-100">
          <MapPin className="h-4 w-4" /> Delivery Address
        </h2>
        <p className="text-sm text-gray-700 dark:text-zinc-300">
          {order.shippingAddress?.address}
          {order.shippingAddress?.locality ? `, ${order.shippingAddress.locality}` : ''},{' '}
          {order.shippingAddress?.city}, {order.shippingAddress?.state} -{' '}
          {order.shippingAddress?.pincode}
        </p>
        {order.shippingAddress?.landmark && (
          <p className="mt-1 text-xs italic text-gray-500">
            Landmark: {order.shippingAddress.landmark}
          </p>
        )}
      </div>
    </div>
  );
};

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
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/20">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-200">
        <Receipt className="h-4 w-4" /> Refund Receipt
      </h2>
      <p className="mb-3 text-xs text-emerald-800/80 dark:text-emerald-300/80">
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
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open current receipt
        </a>
      )}
    </div>
  );
}

export default AdminOrderDetails;
