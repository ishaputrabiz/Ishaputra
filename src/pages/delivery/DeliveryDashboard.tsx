import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  ChevronRight,
  Inbox,
  Loader2,
  LogOut,
  MapPin,
  Package,
  Phone,
  Star,
  Truck,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToDeliveryBoyOrders, Order } from '@/services/orderService';
import { db } from '@/config/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { toast } from 'sonner';

// ── helpers ──────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set([
  'pending',
  'processing',
  'packed',
  'shipped',
  'assigned',
  'outForDelivery',
  'picked',
  'returnScheduled',
]);

type StatusKey = Order['status'];
type TabKey = 'active' | 'done';

const STATUS_CFG: Record<StatusKey, { label: string; color: string; bg: string; dot: string }> = {
  pending:         { label: 'Pending',          color: 'text-gray-600',   bg: 'bg-gray-100',    dot: 'bg-gray-400'   },
  processing:      { label: 'Processing',        color: 'text-blue-600',   bg: 'bg-blue-50',     dot: 'bg-blue-500'   },
  packed:          { label: 'Packed',            color: 'text-orange-600', bg: 'bg-orange-50',   dot: 'bg-orange-500' },
  shipped:         { label: 'Packed',            color: 'text-orange-600', bg: 'bg-orange-50',   dot: 'bg-orange-500' },
  assigned:        { label: 'Packed',            color: 'text-orange-600', bg: 'bg-orange-50',   dot: 'bg-orange-500' },
  outForDelivery:  { label: 'Out for Delivery',  color: 'text-purple-600', bg: 'bg-purple-50',   dot: 'bg-purple-500' },
  picked:          { label: 'Return Picked Up', color: 'text-amber-600', bg: 'bg-amber-50',   dot: 'bg-amber-500' },
  delivered:       { label: 'Delivered',         color: 'text-emerald-600',bg: 'bg-emerald-50',  dot: 'bg-emerald-500'},
  cancelled:       { label: 'Cancelled',         color: 'text-rose-600',   bg: 'bg-rose-50',     dot: 'bg-rose-500'   },
  returnRequested: { label: 'Return Requested',  color: 'text-rose-600',   bg: 'bg-rose-50',     dot: 'bg-rose-500'   },
  returnScheduled: { label: 'Return Pickup',   color: 'text-amber-600',   bg: 'bg-amber-50',    dot: 'bg-amber-500'  },
  returned:        { label: 'Returned',          color: 'text-rose-600',   bg: 'bg-rose-50',     dot: 'bg-rose-500'   },
};

// ── Dashboard ─────────────────────────────────────────────────────────────────

const DeliveryDashboard = () => {
  const navigate = useNavigate();
  const { user, userProfile, logout, isDelivery } = useAuth();

  const [orders, setOrders]   = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<TabKey>('active');
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState(0);
  const prevActive            = useRef(0);

  useEffect(() => {
    if (!user || !isDelivery) {
      navigate('/deliverypartner');
      return;
    }

    const unsub = subscribeToDeliveryBoyOrders(
      user.uid,
      (fetched) => {
        const activeCount = fetched.filter(o => ACTIVE_STATUSES.has(o.status)).length;
        if (activeCount > prevActive.current && prevActive.current > 0) {
          toast.success('New delivery assigned!', {
            description: 'A new order has been added to your queue.',
          });
        }
        prevActive.current = activeCount;
        setOrders(fetched);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error('Failed to load orders');
        setLoading(false);
      },
    );

    return () => unsub();
  }, [user, isDelivery, navigate]);

  // Fetch delivery rating for this partner
  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, 'deliveryRatings'), where('deliveryBoyId', '==', user.uid)))
      .then((snap) => {
        if (snap.empty) return;
        const ratings = snap.docs.map((d) => d.data().rating as number).filter((r) => typeof r === 'number');
        if (ratings.length > 0) {
          const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
          setAvgRating(Math.round(avg * 10) / 10);
          setRatingCount(ratings.length);
        }
      })
      .catch(() => {});
  }, [user]);

  const handleLogout = async () => {
    try {
      await logout();
      localStorage.removeItem('delivery_remembered_email');
      navigate('/deliverypartner', { replace: true });
    } catch {
      toast.error('Failed to logout');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
            <Truck className="h-7 w-7 text-amber-600" />
          </div>
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-amber-500" />
          <p className="text-sm text-stone-400">Loading deliveries…</p>
        </div>
      </div>
    );
  }

  const activeOrders = orders.filter(o => ACTIVE_STATUSES.has(o.status));
  const doneOrders   = orders.filter(o => !ACTIVE_STATUSES.has(o.status));
  const display      = tab === 'active' ? activeOrders : doneOrders;
  const firstName    = userProfile?.name?.split(' ')[0] || userProfile?.username || 'Partner';

  return (
    <div className="min-h-screen bg-stone-50 pb-10">

      {/* ── Header ── */}
      <header className="sticky top-0 z-20 bg-stone-900 shadow-lg">
        {/* Brand row */}
        <div className="mx-auto flex max-w-xl items-center justify-center px-4 pt-3 pb-1.5">
          <img src="/black_logo.png" alt="Sreerasthu Silvers" className="h-6 w-auto brightness-0 invert" />
        </div>
        {/* Partner row */}
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-base font-bold text-white shadow-sm">
              {firstName[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight text-white">{firstName}</p>
              <div className="mt-0.5 flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <p className="text-[10px] text-stone-400">Online</p>
                </div>
                {avgRating !== null && (
                  <div className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                    <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                    <span className="text-[10px] font-semibold text-white">{avgRating}</span>
                    <span className="text-[10px] text-stone-400">· {ratingCount}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-stone-400 transition-all hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden font-medium sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="mx-auto max-w-xl px-4 pt-5">

        {/* Active deliveries banner */}
        <AnimatePresence>
          {activeOrders.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-4 flex items-center gap-3 rounded-2xl bg-amber-500 px-5 py-4 text-white shadow-lg shadow-amber-400/25"
            >
              <Package className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-base font-bold leading-tight">
                  {activeOrders.length} Active {activeOrders.length === 1 ? 'Delivery' : 'Deliveries'}
                </p>
                <p className="text-xs text-amber-100">Tap to start</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        <div className="mb-5 flex gap-2">
          {(['active', 'done'] as TabKey[]).map((t) => {
            const count = t === 'active' ? activeOrders.length : doneOrders.length;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                  tab === t
                    ? 'bg-stone-800 text-white shadow-sm'
                    : 'border border-stone-200 bg-white text-stone-500 hover:border-stone-300'
                }`}
              >
                {t === 'active' ? 'Active' : 'Completed'}
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                      tab === t ? 'bg-white/20 text-white' : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Order list */}
        {display.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-100">
              {tab === 'active' ? (
                <Inbox className="h-8 w-8 text-stone-300" />
              ) : (
                <CheckCircle2 className="h-8 w-8 text-stone-300" />
              )}
            </div>
            <p className="mb-1 font-semibold text-stone-600">
              {tab === 'active' ? 'No active deliveries' : 'No completed deliveries'}
            </p>
            <p className="max-w-xs text-sm text-stone-400">
              {tab === 'active'
                ? 'New assignments will appear here instantly when assigned by admin.'
                : 'Completed and cancelled orders will show here.'}
            </p>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="space-y-3">
              {display.map((order, i) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  index={i}
                  onOpen={() => navigate(`/delivery/order/${order.id}`)}
                />
              ))}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

// ── Order Card ────────────────────────────────────────────────────────────────

const OrderCard = ({
  order,
  index,
  onOpen,
}: {
  order: Order;
  index: number;
  onOpen: () => void;
}) => {
  const cfg = STATUS_CFG[order.status] ?? STATUS_CFG.pending;
  const isReturnPickup = order.status === 'returnScheduled';
  const isReturnPickedUp = order.status === 'picked' && !!(order as any).returnScheduledAt;
  const isActionable = order.status === 'outForDelivery' || isReturnPickup || isReturnPickedUp;

  const isPaid =
    order.paymentStatus === 'paid' ||
    (order.paymentMethod || '').toLowerCase().includes('online') ||
    (order.paymentMethod || '').toLowerCase().includes('upi');

  const phone = order.shippingAddress.mobile || '';
  const addr = [
    order.shippingAddress.address,
    order.shippingAddress.locality,
    order.shippingAddress.city,
    order.shippingAddress.pincode,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: index * 0.04, duration: 0.22 }}
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
        isReturnPickedUp
          ? 'border-amber-200 ring-1 ring-amber-200 shadow-amber-100/50'
          : isReturnPickup
            ? 'border-amber-200 ring-1 ring-amber-200 shadow-amber-100/50'
            : isActionable
              ? 'border-purple-200 ring-1 ring-purple-200 shadow-purple-100/50'
              : 'border-stone-100'
      }`}
    >
      {/* Urgency accent bar */}
      {(isReturnPickup || isReturnPickedUp) && (
        <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
      )}
      {isActionable && !isReturnPickup && !isReturnPickedUp && (
        <div className="h-1 bg-gradient-to-r from-purple-400 to-purple-600" />
      )}

      <div className="p-4">
        {/* Order ID + status */}
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-base font-bold text-stone-800">
            #{order.orderId}
          </p>
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.bg} ${cfg.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </div>
        </div>

        {/* Customer name */}
        <p className="mb-1 text-sm font-semibold text-stone-800">
          {order.shippingAddress.fullName}
        </p>

        {/* Address */}
        <div className="mb-3 flex items-start gap-1.5">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
          <p className="text-xs leading-relaxed text-stone-500">{addr}</p>
        </div>

        {/* Amount + payment type */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-lg font-bold text-stone-900">
            ₹{(order.total || 0).toLocaleString('en-IN')}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${
              isPaid
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {isPaid ? 'Prepaid' : 'COD'}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {phone ? (
            <a
              href={`tel:${phone}`}
              onClick={(e) => e.stopPropagation()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-50 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 active:bg-emerald-200"
            >
              <Phone className="h-4 w-4" />
              Call
            </a>
          ) : null}

          <button
            onClick={onOpen}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-semibold text-white transition-colors ${
              isReturnPickup
                ? 'bg-amber-500 shadow-sm hover:bg-amber-600 active:bg-amber-700'
                : isReturnPickedUp
                  ? 'bg-amber-600 shadow-sm hover:bg-amber-700 active:bg-amber-800'
                  : isActionable
                    ? 'bg-purple-600 shadow-sm hover:bg-purple-700 active:bg-purple-800'
                    : 'bg-stone-800 hover:bg-stone-900 active:bg-stone-950'
            }`}
          >
            {isReturnPickup ? 'Pickup' : isReturnPickedUp ? 'Mark Return' : isActionable ? 'Deliver' : 'View'}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default DeliveryDashboard;
