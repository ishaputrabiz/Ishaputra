import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeToUserOrders, Order } from '@/services/orderService';
import Header from '@/components/Header';
import MobileHeader from '@/components/MobileHeader';
import MobileSearchBar from '@/components/MobileSearchBar';
import MobileBottomNav from '@/components/MobileBottomNav';
import CategoryIconNav from '@/components/CategoryIconNav';
import Footer from '@/components/Footer';
import EmptyState from '@/components/EmptyState';
import { ListSkeleton } from '@/components/skeletons';
import { IconButton } from '@/components/ui/icon-button';
import { OrderStatusBadge } from '@/components/ui/status-badge';
import { SmartImage } from '@/components/ui/smart-image';
import { formatDateTime, formatINR, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ArrowLeft, ArrowRight, ExternalLink, Package } from 'lucide-react';

/** Statuses that count as "in progress" for the Current tab and the header count. */
const ACTIVE_STATUSES = ['pending', 'processing', 'packed', 'shipped', 'assigned', 'outForDelivery', 'picked'];

const MobileOrders = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedOrderTab, setSelectedOrderTab] = useState<'current' | 'all'>('current');
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Subscribe to user orders
  useEffect(() => {
    if (!user) return;

    setOrdersLoading(true);

    const unsubscribe = subscribeToUserOrders(
      user.uid,
      (fetchedOrders) => {
        setOrders(fetchedOrders);
        setOrdersLoading(false);
      },
      (error) => {
        console.error('Error fetching orders:', error);
        setOrdersLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Filter orders based on tab
  const activeCount = orders.filter((o) => ACTIVE_STATUSES.includes(o.status)).length;
  const filteredOrders = selectedOrderTab === 'current'
    ? orders.filter((order) => ACTIVE_STATUSES.includes(order.status))
    : orders;

  const tabs: Array<{ key: 'current' | 'all'; label: string }> = [
    { key: 'current', label: 'Current' },
    { key: 'all', label: 'All orders' },
  ];

  return (
    <div className="min-h-dvh tx-paper pb-20 lg:pb-0">
      {/* Desktop Header + Nav */}
      <div className="hidden lg:block">
        <Header />
        <CategoryIconNav />
      </div>
      {/* Mobile Header */}
      <div className="lg:hidden">
        <MobileHeader />
        <MobileSearchBar />
      </div>

      <main id="main" tabIndex={-1} className="outline-none">
        {/* Page Header */}
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <div className="panel tx-sheet flex items-center gap-2 px-3 py-3 sm:px-4">
            <IconButton label="Back" onClick={() => navigate('/account')}>
              <ArrowLeft />
            </IconButton>
            <div className="min-w-0">
              <h1 className="font-heading text-xl font-semibold tracking-tight text-foreground">My orders</h1>
              {!ordersLoading && (
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {plural(orders.length, 'order')} · {activeCount} active
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Order Tabs */}
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <div className="flex gap-1 rounded-card bg-foreground/[0.04] p-1" role="group" aria-label="Show orders">
            {tabs.map((tab) => {
              const selected = selectedOrderTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedOrderTab(tab.key)}
                  className={cn(
                    'min-h-[44px] flex-1 rounded-control px-3 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-press ease-out active:scale-[0.97]',
                    selected
                      ? 'bg-card text-foreground shadow-sm ring-1 ring-foreground/[0.06]'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Orders List */}
        <div className="mx-auto max-w-3xl space-y-3 p-4">
          {ordersLoading ? (
            <ListSkeleton rows={3} thumb label="Loading your orders" />
          ) : filteredOrders.length === 0 ? (
            <div className="panel tx-sheet">
              <EmptyState
                icon={Package}
                title={selectedOrderTab === 'current' ? 'Nothing in progress' : 'No orders yet'}
                description={
                  selectedOrderTab === 'current'
                    ? 'Browse the range.'
                    : 'Discover classical Ayurveda made for the modern man.'
                }
                action={{ label: 'Start shopping', to: '/products' }}
              />
            </div>
          ) : (
            filteredOrders.map((order) => (
              <article
                key={order.id}
                className="panel tx-sheet relative p-4 transition-[border-color,box-shadow] duration-hover ease-out hover:border-primary/30 hover:shadow-[var(--shadow-card-hover)]"
              >
                {/* Order Items Display */}
                <div className="space-y-4">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex gap-3">
                      <div className="tile-img size-16 shrink-0 overflow-hidden">
                        <SmartImage src={item.image} alt="" className="h-full w-full object-cover" preset="thumb" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold leading-snug text-foreground">{item.name}</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                          {formatINR(item.price)} · Qty {item.quantity}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <OrderStatusBadge status={order.status} order={order} />
                          <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(order.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* OTP Display for Out for Delivery Orders */}
                {order.status === 'outForDelivery' && order.delivery_otp && (
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-foreground/[0.08] pt-3">
                    <div>
                      <p className="text-xs font-semibold text-foreground">Delivery OTP</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Share it with your delivery partner</p>
                    </div>
                    <p className="font-mono text-lg font-semibold tracking-[0.3em] text-foreground tabular-nums">{order.delivery_otp}</p>
                  </div>
                )}

                {/* Refund receipt link */}
                {order.status === 'refunded' && order.refundReceiptUrl && (
                  <div className="mt-3 border-t border-foreground/[0.08] pt-1">
                    <a
                      href={order.refundReceiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-raised inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      View refund receipt
                      <ExternalLink aria-hidden="true" className="size-3.5" />
                    </a>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-foreground/[0.08] pt-3 text-xs">
                  <span className="text-muted-foreground tabular-nums">ORD-{order.orderId}</span>
                  {/* Stretched link: the whole card opens the order; Tab lands here once per card. */}
                  <Link
                    to={`/account/orders/${order.id}`}
                    className="inline-flex min-h-[24px] items-center gap-1 font-semibold text-primary outline-none after:absolute after:inset-0 after:rounded-panel after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-background"
                  >
                    View details<span className="sr-only"> of order ORD-{order.orderId}</span>
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </div>
              </article>
            ))
          )}
        </div>
      </main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default MobileOrders;
