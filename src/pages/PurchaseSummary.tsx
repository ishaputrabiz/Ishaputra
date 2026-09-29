// ============================================
// WALLET — loyalty tier, spend, gift cards and recent orders
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft, Package, CheckCircle2, Clock, XCircle, 
  TrendingUp, Award, Crown, Diamond, Sparkles, IndianRupee,
  ShoppingBag, Calendar, Eye, EyeOff, Gift, CreditCard, AlertCircle
} from 'lucide-react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { SmartImage } from "@/components/ui/smart-image";
import { BRAND } from '@/config/brand';
import { RewardsWalletCard } from '@/components/rewards/RewardsWalletCard';

const HEADING = { fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" };

// Loyalty tiers: names and thresholds from the brand config, look from here
// (metal tones on the charcoal card, copper for the top tier).
const TIER_STYLE = [
  { icon: Award, accent: 'hsl(30 6% 68%)' },
  { icon: Crown, accent: 'hsl(var(--highlight-soft))' },
  { icon: Diamond, accent: 'hsl(36 24% 86%)' },
  { icon: Crown, accent: 'hsl(var(--primary))' },
];
const LOYALTY_TIERS = BRAND.loyaltyTiers.map((tier, i, all) => ({
  ...tier,
  ...TIER_STYLE[Math.min(i, TIER_STYLE.length - 1)],
  isPremium: i === all.length - 1,
}));
/** Spend at which the progress bar is full: the top tier's threshold. */
const PROGRAMME_TOP = LOYALTY_TIERS[LOYALTY_TIERS.length - 1].min;

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
            totalSpent += order.totalAmount || 0;
            deliveredCount++;
          } else if (status === 'cancelled') {
            cancelledCount++;
          } else if (['pending', 'processing', 'packed', 'shipped', 'assigned', 'outForDelivery', 'picked', 'confirmed'].includes(status || '')) {
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

  // Get current loyalty tier
  const getLoyaltyTier = () => {
    // Check from highest tier to lowest to handle Premium (max tier)
    for (let i = LOYALTY_TIERS.length - 1; i >= 0; i--) {
      const tier = LOYALTY_TIERS[i];
      if (stats.totalSpent >= tier.min) {
        return tier;
      }
    }
    return LOYALTY_TIERS[0];
  };

  // Get next tier and progress
  const getNextTierProgress = () => {
    const currentTier = getLoyaltyTier();
    const currentIndex = LOYALTY_TIERS.indexOf(currentTier);
    
    if (currentIndex === LOYALTY_TIERS.length - 1) {
      return { nextTier: null, progress: 100, remaining: 0 };
    }
    
    const nextTier = LOYALTY_TIERS[currentIndex + 1];
    const progress = ((stats.totalSpent - currentTier.min) / (nextTier.min - currentTier.min)) * 100;
    const remaining = nextTier.min - stats.totalSpent;
    
    return { nextTier, progress: Math.min(progress, 100), remaining };
  };

  const currentTier = getLoyaltyTier();
  const { nextTier, progress, remaining } = getNextTierProgress();
  const TierIcon = currentTier.icon;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center tx-paper">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center tx-paper">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Please log in to view your purchase summary</p>
          <Button onClick={() => navigate('/account')} className="btn-copper h-auto py-3 text-[11px] font-bold rounded-[6px]">Go to account</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen tx-paper">
      <div className="hidden lg:block"><Header /></div>

      {/* Desktop Back Button */}
      <div className="hidden lg:block border-b border-foreground/[0.08]">
        <div className="max-w-4xl mx-auto px-4">
          <button
            onClick={() => navigate('/account')}
            className="flex items-center gap-1.5 py-3 text-muted-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em]">Back to account</span>
          </button>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-foreground/[0.08] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1 hover:bg-foreground/[0.06] rounded-full">
          <ArrowLeft className="w-5 h-5 text-foreground/80" />
        </button>
        <h1 className="text-lg font-semibold text-foreground" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>Wallet & rewards</h1>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-10 pb-24 lg:pb-10">
        <div className="hidden lg:block mb-8">
          <p className="eyebrow-no mb-3"><span>Your wallet</span></p>
          <h1 className="text-4xl font-semibold text-foreground" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>Wallet & rewards</h1>
        </div>
        
        {/* ─── LOYALTY TIER CARD ──────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="tx-slate tx-contour rounded-[var(--radius-panel)] p-6 mb-6 relative overflow-hidden shadow-[var(--shadow-panel)] text-charcoal-foreground"
        >
          <div className="absolute top-0 right-0 opacity-[0.07]">
            <TierIcon className="w-32 h-32 -translate-y-8 translate-x-8" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative">
                {currentTier.isPremium && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                    <Crown className="w-5 h-5 text-highlight fill-highlight-soft drop-shadow-lg" />
                  </div>
                )}
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-charcoal border border-white/20 shadow-md"
                  style={{ background: currentTier.accent }}
                >
                  <TierIcon className="w-6 h-6" />
                </div>
              </div>
              <div>
                <p className="eyebrow-no on-dark !text-[9px]"><span>Your status</span></p>
                <h2 className="text-xl font-semibold mt-1" style={{ ...HEADING, color: currentTier.accent }}>{currentTier.name}</h2>
              </div>
            </div>

            {/* Tier Stages Display */}
            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-charcoal-foreground/60 font-medium">Membership progress</span>
                <span className="font-semibold tabular-nums">₹{stats.totalSpent.toLocaleString('en-IN')} / ₹{PROGRAMME_TOP.toLocaleString('en-IN')}</span>
              </div>

              {/* All Stages with Progress Bar */}
              <div className="relative py-2">
                {/* Progress Bar connecting badges */}
                <div className="absolute top-[26px] left-[12.5%] right-[12.5%] h-1 bg-white/10 rounded-full">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((stats.totalSpent / PROGRAMME_TOP) * 100, 100)}%` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-highlight-soft to-primary rounded-full"
                  />
                </div>

                {/* Stage Indicators */}
                <div className="relative flex justify-between items-start">
                  {LOYALTY_TIERS.map((tier) => {
                    const TierBadgeIcon = tier.icon;
                    const isCurrentTier = currentTier.name === tier.name;
                    const isCompleted = stats.totalSpent >= tier.min;

                    return (
                      <div key={tier.name} className="flex flex-col items-center flex-1 z-10">
                        <div
                          className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                            isCurrentTier
                              ? 'text-charcoal ring-2 ring-offset-2 ring-offset-charcoal ring-white/40 scale-110 shadow-xl'
                              : isCompleted
                              ? 'text-charcoal shadow-md'
                              : 'bg-charcoal border border-white/15 text-white/35'
                          }`}
                          style={isCompleted ? { background: tier.accent } : undefined}
                        >
                          {tier.isPremium && isCurrentTier && (
                            <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                              <Crown className="w-4 h-4 text-highlight fill-highlight-soft drop-shadow" />
                            </div>
                          )}
                          <TierBadgeIcon className="w-5 h-5" />
                        </div>
                        <p className={`text-[10px] mt-2.5 text-center font-bold uppercase tracking-[0.12em] leading-tight ${
                          isCurrentTier ? 'text-charcoal-foreground' : 'text-charcoal-foreground/45'
                        }`}>
                          {tier.name.replace(' Member', '')}
                        </p>
                        <p className="text-[10px] text-charcoal-foreground/40 tabular-nums">₹{tier.min.toLocaleString('en-IN')}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Next Tier Info */}
              {nextTier ? (
                <p className="text-xs text-charcoal-foreground/70 font-medium text-center">
                  Spend ₹{remaining.toLocaleString('en-IN')} more to unlock {nextTier.name}
                </p>
              ) : (
                <div className="flex items-center justify-center gap-2 bg-white/5 rounded-[8px] p-2 border border-highlight-soft/30">
                  <Sparkles className="w-4 h-4 text-highlight-soft" />
                  <p className="text-xs font-medium">
                    You've reached the highest tier!
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ─── POINTS & CASHBACK ──────────────────── */}
        <RewardsWalletCard uid={user.uid} />

        {/* ─── TOTAL SPENT CARD ──────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="panel tx-sheet p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="tx-slate w-10 h-10 rounded-[8px] flex items-center justify-center text-highlight-soft">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Total spent</h3>
            </div>
            <button 
              onClick={() => setShowAmount(!showAmount)} 
              className="p-2 hover:bg-foreground/[0.06] rounded-full transition-colors"
            >
              {showAmount ? <Eye className="w-4 h-4 text-muted-foreground" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
            </button>
          </div>

          <div className="mb-6">
            <div className="flex items-baseline gap-1 mb-1">
              <IndianRupee className="w-6 h-6 text-primary mt-1" />
              <span className="text-4xl font-semibold text-foreground tabular-nums" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
                {showAmount ? stats.totalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '••••••'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-medium">From delivered orders only</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="tx-slate w-12 h-12 rounded-[8px] flex items-center justify-center mx-auto mb-2 text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-2xl font-semibold text-foreground tabular-nums" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>{stats.deliveredCount}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Delivered</p>
            </div>
            
            <div className="text-center">
              <div className="tx-slate w-12 h-12 rounded-[8px] flex items-center justify-center mx-auto mb-2 text-highlight-soft">
                <Clock className="w-6 h-6" />
              </div>
              <p className="text-2xl font-semibold text-foreground tabular-nums" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>{stats.pendingCount}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Pending</p>
            </div>
            
            <div className="text-center">
              <div className="tx-slate w-12 h-12 rounded-[8px] flex items-center justify-center mx-auto mb-2 text-red-400">
                <XCircle className="w-6 h-6" />
              </div>
              <p className="text-2xl font-semibold text-foreground tabular-nums" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>{stats.cancelledCount}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Cancelled</p>
            </div>
          </div>
        </motion.div>

        {/* ─── QUICK ACTIONS ──────────────────── */}
        <div className="mb-6">
          <Button 
            variant="outline"
            className="w-full h-12 flex items-center justify-center gap-2 rounded-[6px] border-primary/50 bg-transparent text-primary hover:bg-primary/10 hover:text-primary text-[11px] font-bold uppercase tracking-[0.16em] transition-all"
            onClick={() => navigate('/products')}
          >
            <ShoppingBag className="w-4 h-4" />
            Continue Shopping
          </Button>
        </div>

        {/* ─── GIFT CARDS ──────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="panel tx-sheet p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="tx-slate w-10 h-10 rounded-[8px] flex items-center justify-center text-highlight-soft">
                <Gift className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Gift cards</h3>
                {totalGiftBalance > 0 && (
                  <p className="text-xs text-primary font-medium">₹{totalGiftBalance.toLocaleString('en-IN')} available</p>
                )}
              </div>
            </div>
          </div>

          {giftCardsLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : giftCards.length === 0 ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-foreground/[0.03] rounded-full flex items-center justify-center mx-auto mb-3">
                <Gift className="w-7 h-7 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No gift cards yet</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Gift cards from the store will appear here</p>
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
                    className={`relative overflow-hidden rounded-[10px] border-2 p-4 transition-all ${
                      expired || fullyUsed 
                        ? 'border-foreground/[0.08] bg-foreground/[0.03] opacity-60' 
                        : 'border-primary/30 bg-primary/[0.05]'
                    }`}
                  >
                    {/* Decorative circles */}
                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-card rounded-full" />
                    <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-card rounded-full" />

                    <div className="relative">
                      {/* Header row */}
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-primary" />
                            <span className="text-xs font-bold text-foreground/80 tracking-wider font-mono">{card.code}</span>
                          </div>
                          {card.description && (
                            <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
                          )}
                        </div>
                        <div className="text-right">
                          {expired ? (
                            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Expired</span>
                          ) : fullyUsed ? (
                            <span className="text-[10px] bg-foreground/10 text-muted-foreground px-2 py-0.5 rounded-full font-medium">Fully Used</span>
                          ) : (
                            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Active</span>
                          )}
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="flex items-baseline gap-1 mb-2">
                        <span className="text-xl font-bold text-foreground">₹{card.remainingAmount.toLocaleString('en-IN')}</span>
                        {card.usedAmount > 0 && (
                          <span className="text-xs text-muted-foreground/70">/ ₹{card.amount.toLocaleString('en-IN')}</span>
                        )}
                      </div>

                      {/* Usage bar */}
                      {card.usedAmount > 0 && (
                        <div className="mb-2">
                          <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${usagePercent}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground/70 mt-1">₹{card.usedAmount.toLocaleString('en-IN')} used</p>
                        </div>
                      )}

                      {/* Expiry */}
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                        <Clock className="w-3 h-3" />
                        <span>Expires {new Date(card.expiryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* ─── RECENT ORDERS SUMMARY ──────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="panel tx-sheet p-6 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="tx-slate w-10 h-10 rounded-[8px] flex items-center justify-center text-highlight-soft">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Recent orders</h3>
            </div>
            {stats.deliveredCount > 0 && (
              <button 
                onClick={() => navigate('/account/orders')}
                className="link-arrow"
              >
                View All
              </button>
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
              <div className="text-center py-8">
                <div className="w-14 h-14 bg-foreground/[0.06] rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Package className="w-7 h-7 text-muted-foreground/70" />
                </div>
                <p className="text-sm font-medium text-foreground/80 mb-1">No delivered orders this month</p>
                <p className="text-xs text-muted-foreground/70 mb-4">Recent delivered orders will appear here</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate('/products')}
                  className="h-10 rounded-[6px] border-primary/50 text-primary hover:bg-primary/10 hover:text-primary text-[11px] font-bold uppercase tracking-[0.16em]"
                >
                  <ShoppingBag className="w-4 h-4 mr-2" />
                  Browse Collection
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {recentDeliveredOrders.map((order) => {
                  const firstItem = order.items?.[0];
                  const itemCount = order.items?.length || 0;
                  const displayTitle = itemCount > 1 
                    ? `${firstItem?.name || 'Product'} +${itemCount - 1} more`
                    : firstItem?.name || 'Product';
                  
                  return (
                    <div 
                      key={order.id} 
                      className="flex gap-3 p-3 bg-card rounded-[10px] border border-foreground/[0.08] hover:border-primary/35 hover:shadow-[var(--shadow-card-hover)] transition-all cursor-pointer"
                      onClick={() => navigate(`/account/orders/${order.id}`)}
                    >
                      {/* Product Image */}
                      <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-foreground/[0.06]">
                        {firstItem?.image ? (
                          <SmartImage 
                            src={firstItem.image} 
                            alt={firstItem.name}
                            className="w-full h-full object-cover" preset="thumb" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-6 h-6 text-muted-foreground/70" />
                          </div>
                        )}
                      </div>

                      {/* Order Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate mb-1">
                          {displayTitle}
                        </p>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            {order.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground/70">
                          {order.createdAt?.toDate?.()?.toLocaleDateString('en-IN', { 
                            day: 'numeric', 
                            month: 'short',
                            year: 'numeric'
                          }) || 'N/A'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </motion.div>

        {/* ─── INFO SECTION ──────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="tx-slate rounded-[var(--radius-card)] p-5 mt-6 text-charcoal-foreground"
        >
          <div className="flex gap-3">
            <Sparkles className="w-5 h-5 text-highlight-soft flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold mb-1" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>Member benefits</p>
              <p className="text-xs text-charcoal-foreground/65 leading-relaxed">
                Unlock special offers, early access to new collections, and personalized recommendations as you progress through loyalty tiers.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="lg:hidden"><MobileBottomNav /></div>
      <div className="hidden lg:block"><Footer /></div>
    </div>
  );
};

export default PurchaseSummary;
