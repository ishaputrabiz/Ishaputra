// ============================================
// WALLET: member card and tier, points, spend, gift cards and recent orders
// ============================================

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { OrderStatusBadge, StatusBadge } from '@/components/ui/status-badge';
import { PanelSkeleton, StatCardsSkeleton } from '@/components/skeletons';
import { formatDate, formatINR } from '@/lib/format';
import { DUR, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Package, CheckCircle2, Clock, XCircle, 
  TrendingUp, Sparkles, IndianRupee,
  ShoppingBag, Calendar, Eye, EyeOff, Gift, CreditCard, CircleCheck, CircleX,
} from 'lucide-react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { SmartImage } from "@/components/ui/smart-image";
import { RewardsWalletCard } from '@/components/rewards/RewardsWalletCard';
import { ScratchCardsPanel } from '@/components/scratch/ScratchCardsPanel';
import { LoyaltyStatusPanel } from '@/components/loyalty/MemberCard';

interface OrderStats {
  totalSpent: number;
  deliveredCount: number;
  pendingCount: number;
  cancelledCount: number;
  orderHistory: any[];
}

interface GiftCard {
  id: string;
  code: string;
  amount: number;
  usedAmount: number;
  remainingAmount: number;
  isActive: boolean;
  expiryDate: string;
  createdAt: any;
  createdBy: string;
  description: string;
}

const PurchaseSummary: React.FC = () => {
  const navigate = useNavigate();
  const { user, userProfile, loading: authLoading } = useAuth();
  
  const [stats, setStats] = useState<OrderStats>({
    totalSpent: 0,
    deliveredCount: 0,
    pendingCount: 0,
    cancelledCount: 0,
    orderHistory: []
  });
  const [loading, setLoading] = useState(true);
  const [showAmount, setShowAmount] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [giftCards, setGiftCards] = useState<GiftCard[]>([]);
  const [giftCardsLoading, setGiftCardsLoading] = useState(true);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Fetch order statistics
  useEffect(() => {
    if (!user) return;

    const fetchOrderStats = async () => {
      try {
        setLoading(true);
        
        // Query all orders for this user
        const ordersQuery = query(
          collection(db, 'orders'),
          where('userId', '==', user.uid)
        );
        
        const snapshot = await getDocs(ordersQuery);
        
        let totalSpent = 0;
        let deliveredCount = 0;
        let pendingCount = 0;
        let cancelledCount = 0;
        const orderHistory: any[] = [];
        
        snapshot.forEach((doc) => {
          const order = { id: doc.id, ...doc.data() } as any;
          orderHistory.push(order);
          
          const status = order.status?.toLowerCase();
          
          // Count only delivered orders for total spent
          if (status === 'delivered') {
            totalSpent += Number(order.total) || 0;
            deliveredCount++;
          } else if (status === 'cancelled') {
            cancelledCount++;
          } else if (['pending', 'processing', 'packed', 'shipped', 'assigned', 'outfordelivery', 'picked', 'confirmed'].includes(status || '')) {
            pendingCount++;
          }
        });
        
        setStats({
          totalSpent,
          deliveredCount,
          pendingCount,
          cancelledCount,
          orderHistory: orderHistory.sort((a, b) => 
            (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)
          )
        });
      } catch (error) {
        console.error('Error fetching order stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderStats();
  }, [user]);

  // Fetch gift cards
  useEffect(() => {
    if (!user) return;

    const fetchGiftCards = async () => {
      try {
        setGiftCardsLoading(true);
        const giftCardsQuery = query(
          collection(db, 'users', user.uid, 'giftCards'),
          where('isActive', '==', true)
        );
        const snapshot = await getDocs(giftCardsQuery);
        const cards: GiftCard[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as GiftCard[];
        setGiftCards(cards);
      } catch (error) {
        console.error('Error fetching gift cards:', error);
      } finally {
        setGiftCardsLoading(false);
      }
    };

    fetchGiftCards();
  }, [user]);

  const isExpired = (expiryDate: string) => {
    return new Date(expiryDate) < new Date();
  };

  const totalGiftBalance = giftCards
    .filter(gc => !isExpired(gc.expiryDate) && gc.remainingAmount > 0)
    .reduce((sum, gc) => sum + gc.remainingAmount, 0);

  // Page chrome around every state: desktop header + back row, phone top bar.
  const shell = (content: React.ReactNode) => (
    <div className="min-h-dvh tx-paper">
      <div className="hidden lg:block"><Header /></div>

      {/* Mobile Header */}
      <div className="tx-sheet sticky top-0 z-sticky flex items-center gap-2 border-b border-foreground/[0.08] px-2 py-1.5 lg:hidden">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft />
        </IconButton>
        <p className="font-heading text-xl font-semibold tracking-tight text-foreground" aria-hidden="true">Wallet & rewards</p>
      </div>

      <main id="main" tabIndex={-1} className="mx-auto max-w-4xl px-4 py-6 pb-24 outline-none lg:py-10 lg:pb-10">
        {/* Title: the mobile bar above shows it on phones, so the h1 is for screen readers there */}
        <div className="lg:mb-8 lg:flex lg:items-center lg:gap-2">
          <div className="hidden lg:block">
            <IconButton label="Back" onClick={() => navigate('/account')} className="-ml-2">
              <ArrowLeft />
            </IconButton>
          </div>
          <div className="min-w-0">
            <h1 className="sr-only lg:not-sr-only font-heading text-xl font-semibold tracking-tight text-foreground lg:text-2xl">Wallet & rewards</h1>
            <p className="mt-0.5 hidden text-xs text-muted-foreground lg:block">Your member card, tier, points and cashback</p>
          </div>
        </div>
        {content}
      </main>

      <div className="lg:hidden"><MobileBottomNav /></div>
      <div className="hidden lg:block"><Footer /></div>
    </div>
  );

  if (authLoading || loading) {
    return shell(
      <div aria-busy="true">
        <span className="sr-only" role="status">Loading your wallet</span>
        <div className="tx-slate mb-6 h-48 rounded-panel opacity-60" />
        <StatCardsSkeleton count={3} className="mb-6 grid-cols-3 lg:grid-cols-3" label="" />
        <PanelSkeleton lines={3} label="" />
      </div>
    );
  }

  if (!user) {
    return shell(
      <div className="panel tx-sheet p-8 text-center">
        <p className="mb-4 text-muted-foreground">Sign in to see your wallet and rewards.</p>
        <Button onClick={() => navigate('/account')}>Go to account</Button>
      </div>
    );
  }

  const enter = (delay = 0) => ({
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DUR.modal, ease: EASE_OUT, delay },
  });

  return shell(
    <>
      {/* ─── MEMBER CARD AND TIER ──────────────────── */}
      <LoyaltyStatusPanel
        uid={user.uid}
        name={userProfile?.name || userProfile?.username || user.displayName || 'Member'}
        createdAt={userProfile?.createdAt}
      />

      {/* ─── SCRATCH CARDS (Scratch & Win) ──────── */}
      <ScratchCardsPanel uid={user.uid} />

      {/* ─── POINTS & CASHBACK ──────────────────── */}
      <RewardsWalletCard uid={user.uid} />

      {/* ─── TOTAL SPENT CARD ──────────────────── */}
      <motion.section {...enter(0.04)} aria-labelledby="total-spent-heading" className="panel tx-sheet mb-6 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div aria-hidden="true" className="tx-slate flex size-10 items-center justify-center rounded-[8px] text-highlight-soft">
              <TrendingUp className="size-5" />
            </div>
            <h2 id="total-spent-heading" className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Total spent</h2>
          </div>
          <IconButton label="Hide amount" aria-pressed={!showAmount} onClick={() => setShowAmount(!showAmount)}>
            {showAmount ? <Eye className="text-muted-foreground" /> : <EyeOff className="text-muted-foreground" />}
          </IconButton>
        </div>

        <div className="mb-6">
          <div className="mb-1 flex items-baseline gap-1">
            <IndianRupee aria-hidden="true" className="mt-1 size-6 text-primary" />
            <span className="font-heading text-4xl font-semibold tracking-tight text-foreground tabular-nums">
              {showAmount ? formatINR(stats.totalSpent).replace('₹', '') : <><span aria-hidden="true">••••••</span><span className="sr-only">Hidden</span></>}
            </span>
          </div>
          <p className="text-xs font-medium text-muted-foreground">From delivered orders only</p>
        </div>

        <dl className="grid grid-cols-3 gap-4">
          {[
            { label: 'Delivered', value: stats.deliveredCount, icon: CheckCircle2 },
            { label: 'Pending', value: stats.pendingCount, icon: Clock },
            { label: 'Cancelled', value: stats.cancelledCount, icon: XCircle },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex flex-col items-center text-center">
              <div aria-hidden="true" className="tx-slate mx-auto mb-2 flex size-12 items-center justify-center rounded-[8px] text-highlight-soft">
                <Icon className="size-6" />
              </div>
              <dt className="order-last text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
              <dd className="font-heading text-2xl font-semibold text-foreground tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </motion.section>

      {/* ─── QUICK ACTIONS ──────────────────── */}
      <div className="mb-6">
        <Button
          variant="outline"
          className="h-12 w-full border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
          onClick={() => navigate('/products')}
        >
          <ShoppingBag aria-hidden="true" />
          Continue shopping
        </Button>
      </div>

      {/* ─── GIFT CARDS ──────────────────── */}
      <motion.section {...enter(0.08)} aria-labelledby="gift-cards-heading" className="panel tx-sheet mb-6 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div aria-hidden="true" className="tx-slate flex size-10 items-center justify-center rounded-[8px] text-highlight-soft">
              <Gift className="size-5" />
            </div>
            <div>
              <h2 id="gift-cards-heading" className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Gift cards</h2>
              {totalGiftBalance > 0 && (
                <p className="text-xs font-medium text-primary tabular-nums">{formatINR(totalGiftBalance)} available</p>
              )}
            </div>
          </div>
        </div>

        {giftCardsLoading ? (
          <div aria-busy="true" className="space-y-3">
            <span className="sr-only" role="status">Loading gift cards</span>
            <div className="h-24 rounded-card bg-foreground/[0.05]" />
          </div>
        ) : giftCards.length === 0 ? (
          <div className="py-6 text-center">
            <div aria-hidden="true" className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-foreground/[0.04]">
              <Gift className="size-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No gift cards yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Gift cards from the store will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {giftCards.map((card) => {
              const expired = isExpired(card.expiryDate);
              const fullyUsed = card.remainingAmount <= 0;
              const usagePercent = card.amount > 0 ? ((card.amount - card.remainingAmount) / card.amount) * 100 : 0;

              return (
                <div
                  key={card.id}
                  className={cn(
                    'relative overflow-hidden rounded-card border p-4',
                    expired || fullyUsed
                      ? 'border-foreground/[0.08] bg-foreground/[0.03]'
                      : 'border-primary/30 bg-primary/[0.05]',
                  )}
                >
                  {/* Decorative ticket notches */}
                  <div aria-hidden="true" className="absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-card" />
                  <div aria-hidden="true" className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-card" />

                  <div className={cn('relative', (expired || fullyUsed) && 'opacity-70')}>
                    {/* Header row */}
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <CreditCard aria-hidden="true" className="size-4 text-primary" />
                          <span className="font-mono text-xs font-bold tracking-wider text-foreground">{card.code}</span>
                        </div>
                        {card.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
                        )}
                      </div>
                      {expired ? (
                        <StatusBadge tone="danger" label="Expired" icon={CircleX} />
                      ) : fullyUsed ? (
                        <StatusBadge tone="neutral" label="Fully used" icon={CircleCheck} />
                      ) : (
                        <StatusBadge tone="success" label="Active" icon={CircleCheck} />
                      )}
                    </div>

                    {/* Amount */}
                    <div className="mb-2 flex items-baseline gap-1 tabular-nums">
                      <span className="text-xl font-semibold text-foreground">{formatINR(card.remainingAmount)}</span>
                      {card.usedAmount > 0 && (
                        <span className="text-xs text-muted-foreground">/ {formatINR(card.amount)}</span>
                      )}
                    </div>

                    {/* Usage bar */}
                    {card.usedAmount > 0 && (
                      <div className="mb-2">
                        <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                          <div
                            className="h-full origin-left rounded-full bg-primary"
                            style={{ transform: `scaleX(${usagePercent / 100})` }}
                          />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground tabular-nums">{formatINR(card.usedAmount)} used</p>
                      </div>
                    )}

                    {/* Expiry */}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock aria-hidden="true" className="size-3.5" />
                      <span className="tabular-nums">{expired ? 'Expired' : 'Expires'} {formatDate(card.expiryDate)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </motion.section>

      {/* ─── RECENT ORDERS SUMMARY ──────────────────── */}
      <motion.section {...enter(0.12)} aria-labelledby="recent-orders-heading" className="panel tx-sheet mb-6 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div aria-hidden="true" className="tx-slate flex size-10 items-center justify-center rounded-[8px] text-highlight-soft">
              <Calendar className="size-5" />
            </div>
            <h2 id="recent-orders-heading" className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Recent orders</h2>
          </div>
          {stats.deliveredCount > 0 && (
            <Link to="/account/orders" className="link-arrow relative after:absolute after:-inset-x-2 after:-inset-y-3 after:content-['']">
              View all<span className="sr-only"> orders</span>
            </Link>
          )}
        </div>

        {(() => {
          // Filter for delivered orders from the last month only
          const oneMonthAgo = new Date();
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

          const recentDeliveredOrders = stats.orderHistory.filter((order) => {
            const isDelivered = order.status?.toLowerCase() === 'delivered';
            const orderDate = order.createdAt?.toDate?.();
            const isLastMonth = orderDate && orderDate >= oneMonthAgo;
            return isDelivered && isLastMonth;
          }).slice(0, 3);

          return recentDeliveredOrders.length === 0 ? (
            <div className="py-8 text-center">
              <div aria-hidden="true" className="mx-auto mb-3 flex size-14 items-center justify-center rounded-card bg-foreground/[0.04]">
                <Package className="size-7 text-muted-foreground" />
              </div>
              <p className="mb-1 text-sm font-medium text-foreground">No delivered orders this month</p>
              <p className="mb-4 text-xs text-muted-foreground">Recent delivered orders will appear here.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/products')}
                className="h-10 border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
              >
                <ShoppingBag aria-hidden="true" />
                Browse products
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {recentDeliveredOrders.map((order) => {
                const firstItem = order.items?.[0];
                const itemCount = order.items?.length || 0;
                const displayTitle = itemCount > 1
                  ? `${firstItem?.name || 'Product'} +${itemCount - 1} more`
                  : firstItem?.name || 'Product';

                return (
                  <li key={order.id}>
                    <Link
                      to={`/account/orders/${order.id}`}
                      className="flex gap-3 rounded-card border border-foreground/[0.08] bg-card p-3 transition-[border-color,box-shadow] duration-hover ease-out hover:border-primary/35 hover:shadow-[var(--shadow-card-hover)]"
                    >
                      {/* Product Image */}
                      <div className="tile-img size-16 shrink-0 overflow-hidden">
                        {firstItem?.image ? (
                          <SmartImage
                            src={firstItem.image}
                            alt=""
                            className="h-full w-full object-cover" preset="thumb" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package aria-hidden="true" className="size-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Order Info */}
                      <div className="min-w-0 flex-1">
                        <p className="mb-1.5 truncate text-sm font-semibold text-foreground" title={displayTitle}>
                          {displayTitle}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <OrderStatusBadge status={order.status} order={order} />
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatDate(order.createdAt) || 'Date not available'}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          );
        })()}
      </motion.section>

      {/* ─── INFO SECTION ──────────────────── */}
      <motion.div
        {...enter(0.16)}
        className="tx-slate mt-6 rounded-card p-5 text-charcoal-foreground"
      >
        <div className="flex gap-3">
          <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-highlight-soft" />
          <div>
            <p className="mb-1 font-heading text-sm font-semibold">Member benefits</p>
            <p className="text-xs leading-relaxed text-charcoal-foreground/75">
              Earn points on every delivered order and spend them, with your cashback, at checkout.
            </p>
          </div>
        </div>
      </motion.div>
    </>
  );
};

export default PurchaseSummary;
