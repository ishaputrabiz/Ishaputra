// ============================================
// PURCHASE SUMMARY — Premium Jewellery Journey
// Track your investment and order history
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

// Loyalty Tier Configuration
const LOYALTY_TIERS = [
  { name: 'Silver Member', min: 0, max: 50000, icon: Award, color: 'text-gray-600', bgColor: 'bg-gradient-to-br from-gray-50 to-gray-100', borderColor: 'border-gray-300', badgeBg: 'bg-gray-500' },
  { name: 'Gold Member', min: 50000, max: 100000, icon: Crown, color: 'text-yellow-600', bgColor: 'bg-gradient-to-br from-yellow-50 to-amber-100', borderColor: 'border-yellow-400', badgeBg: 'bg-gradient-to-r from-yellow-500 to-amber-500' },
  { name: 'Platinum Member', min: 100000, max: 175000, icon: Diamond, color: 'text-blue-600', bgColor: 'bg-gradient-to-br from-blue-50 to-indigo-100', borderColor: 'border-blue-400', badgeBg: 'bg-gradient-to-r from-blue-500 to-indigo-600' },
  { name: 'Premium Member', min: 175000, max: 300000, icon: Crown, color: 'text-purple-600', bgColor: 'bg-gradient-to-br from-purple-50 to-pink-100', borderColor: 'border-purple-400', badgeBg: 'bg-gradient-to-r from-purple-600 to-pink-600', isPremium: true },
];

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
        <div className="text-center">
          <p className="text-gray-600 dark:text-zinc-400 mb-4">Please log in to view your purchase summary</p>
          <Button onClick={() => navigate('/account')}>Go to Account</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <div className="hidden lg:block"><Header /></div>

      {/* Desktop Back Button */}
      <div className="hidden lg:block bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800">
        <div className="max-w-4xl mx-auto px-4">
          <button
            onClick={() => navigate('/account')}
            className="flex items-center gap-2 py-3 text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:text-zinc-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Account</span>
          </button>
        </div>
      </div>

      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-30 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full">
          <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-zinc-300" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-zinc-100">My Jewellery Journey</h1>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-10 pb-24 lg:pb-10">
        
        {/* ─── LOYALTY TIER CARD ──────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`${currentTier.bgColor} ${currentTier.borderColor} border-2 rounded-2xl p-6 mb-6 relative overflow-hidden shadow-sm`}
        >
          <div className="absolute top-0 right-0 opacity-10">
            <TierIcon className="w-32 h-32 -translate-y-8 translate-x-8" />
          </div>
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="relative">
                {currentTier.isPremium && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
                    <Crown className="w-5 h-5 text-yellow-500 fill-yellow-400 drop-shadow-lg" />
                  </div>
                )}
                <div className={`w-12 h-12 ${currentTier.badgeBg} rounded-full flex items-center justify-center text-white border-2 ${currentTier.borderColor} shadow-md`}>
                  <TierIcon className="w-6 h-6" />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-600 dark:text-zinc-400">Your Status</p>
                <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100">{currentTier.name}</h2>
              </div>
            </div>

            {/* Tier Stages Display */}
            <div className="space-y-3 mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-600 dark:text-zinc-400 font-medium">Membership Progress</span>
                <span className="text-gray-900 dark:text-zinc-100 font-semibold">₹{stats.totalSpent.toLocaleString('en-IN')} / ₹3,00,000</span>
              </div>

              {/* All Stages with Progress Bar */}
              <div className="relative py-2">
                {/* Progress Bar connecting badges */}
                <div className="absolute top-[22px] left-[5%] right-[5%] h-2 bg-white/50 backdrop-blur rounded-full shadow-inner border border-gray-200 dark:border-zinc-800">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((stats.totalSpent / 300000) * 100, 100)}%` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-gray-500 via-yellow-500 via-blue-500 to-purple-600 shadow-sm rounded-full"
                  />
                </div>

                {/* Stage Indicators */}
                <div className="relative flex justify-between items-start">
                  {LOYALTY_TIERS.map((tier, index) => {
                    const TierBadgeIcon = tier.icon;
                    const isCurrentTier = currentTier.name === tier.name;
                    const isCompleted = stats.totalSpent >= tier.min;
                    
                    return (
                      <div key={tier.name} className="flex flex-col items-center flex-1 z-10">
                        <div className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                          isCurrentTier 
                            ? `${tier.badgeBg} text-white border-[3px] border-white shadow-xl scale-110` 
                            : isCompleted
                            ? `${tier.badgeBg} text-white border-[3px] border-white shadow-md`
                            : 'bg-white border-[3px] border-gray-300 text-gray-400'
                        }`}>
                          {tier.isPremium && isCurrentTier && (
                            <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                              <Crown className="w-4 h-4 text-yellow-500 fill-yellow-400 drop-shadow" />
                            </div>
                          )}
                          <TierBadgeIcon className="w-5 h-5" />
                        </div>
                        <p className={`text-[10px] mt-2 text-center font-medium leading-tight ${
                          isCurrentTier ? 'text-gray-900' : 'text-gray-500'
                        }`}>
                          {tier.name.replace(' Member', '')}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Next Tier Info */}
              {nextTier ? (
                <p className="text-xs text-gray-600 dark:text-zinc-400 font-medium text-center">
                  Spend ₹{remaining.toLocaleString('en-IN')} more to unlock {nextTier.name}
                </p>
              ) : (
                <div className="flex items-center justify-center gap-2 bg-white/60 backdrop-blur rounded-lg p-2 border border-purple-200">
                  <Sparkles className="w-4 h-4 text-yellow-500" />
                  <p className="text-xs text-gray-700 dark:text-zinc-300 font-medium">
                    You've reached the highest tier!
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ─── TOTAL INVESTMENT CARD ──────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-white to-gray-50 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-zinc-800 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center text-white shadow-md">
                <TrendingUp className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Total Investment</h3>
            </div>
            <button 
              onClick={() => setShowAmount(!showAmount)} 
              className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 rounded-full transition-colors"
            >
              {showAmount ? <Eye className="w-4 h-4 text-gray-500 dark:text-zinc-500" /> : <EyeOff className="w-4 h-4 text-gray-500 dark:text-zinc-500" />}
            </button>
          </div>

          <div className="mb-6">
            <div className="flex items-baseline gap-1 mb-1">
              <IndianRupee className="w-6 h-6 text-gray-700 dark:text-zinc-300 mt-1" />
              <span className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                {showAmount ? stats.totalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '••••••'}
              </span>
            </div>
            <p className="text-xs text-gray-600 dark:text-zinc-400 font-medium">From delivered orders only</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-lg flex items-center justify-center text-white mx-auto mb-2 shadow-md">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100">{stats.deliveredCount}</p>
              <p className="text-xs text-gray-600 dark:text-zinc-400 font-medium">Delivered</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center text-white mx-auto mb-2 shadow-md">
                <Clock className="w-6 h-6" />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100">{stats.pendingCount}</p>
              <p className="text-xs text-gray-600 dark:text-zinc-400 font-medium">Pending</p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-gradient-to-br from-red-400 to-rose-500 rounded-lg flex items-center justify-center text-white mx-auto mb-2 shadow-md">
                <XCircle className="w-6 h-6" />
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-zinc-100">{stats.cancelledCount}</p>
              <p className="text-xs text-gray-600 dark:text-zinc-400 font-medium">Cancelled</p>
            </div>
          </div>
        </motion.div>

        {/* ─── QUICK ACTIONS ──────────────────── */}
        <div className="mb-6">
          <Button 
            variant="outline"
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 hover:from-blue-100 hover:to-indigo-100 transition-all shadow-sm"
            onClick={() => navigate('/jewelry')}
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
          className="bg-gradient-to-br from-white to-pink-50 rounded-2xl p-6 shadow-sm border border-pink-200 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg flex items-center justify-center text-white shadow-md">
                <Gift className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Gift Cards</h3>
                {totalGiftBalance > 0 && (
                  <p className="text-xs text-green-600 font-medium">₹{totalGiftBalance.toLocaleString('en-IN')} available</p>
                )}
              </div>
            </div>
          </div>

          {giftCardsLoading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500"></div>
            </div>
          ) : giftCards.length === 0 ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-gray-50 dark:bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-3">
                <Gift className="w-7 h-7 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-600 dark:text-zinc-400">No gift cards yet</p>
              <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">Gift cards from the store will appear here</p>
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
                    className={`relative overflow-hidden rounded-xl border-2 p-4 transition-all ${
                      expired || fullyUsed 
                        ? 'border-gray-200 bg-gray-50 opacity-60' 
                        : 'border-pink-200 bg-gradient-to-r from-pink-50 to-purple-50'
                    }`}
                  >
                    {/* Decorative circles */}
                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white dark:bg-zinc-900 rounded-full" />
                    <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white dark:bg-zinc-900 rounded-full" />

                    <div className="relative">
                      {/* Header row */}
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <CreditCard className="w-4 h-4 text-pink-600" />
                            <span className="text-xs font-bold text-gray-700 dark:text-zinc-300 tracking-wider font-mono">{card.code}</span>
                          </div>
                          {card.description && (
                            <p className="text-xs text-gray-500 dark:text-zinc-500 mt-1">{card.description}</p>
                          )}
                        </div>
                        <div className="text-right">
                          {expired ? (
                            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">Expired</span>
                          ) : fullyUsed ? (
                            <span className="text-[10px] bg-gray-200 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 px-2 py-0.5 rounded-full font-medium">Fully Used</span>
                          ) : (
                            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                          )}
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="flex items-baseline gap-1 mb-2">
                        <span className="text-xl font-bold text-gray-900 dark:text-zinc-100">₹{card.remainingAmount.toLocaleString('en-IN')}</span>
                        {card.usedAmount > 0 && (
                          <span className="text-xs text-gray-400 dark:text-zinc-500">/ ₹{card.amount.toLocaleString('en-IN')}</span>
                        )}
                      </div>

                      {/* Usage bar */}
                      {card.usedAmount > 0 && (
                        <div className="mb-2">
                          <div className="h-1.5 bg-gray-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-pink-500 rounded-full transition-all"
                              style={{ width: `${usagePercent}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-1">₹{card.usedAmount.toLocaleString('en-IN')} used</p>
                        </div>
                      )}

                      {/* Expiry */}
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-zinc-500">
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
          className="bg-gradient-to-br from-white to-purple-50 rounded-2xl p-6 shadow-sm border border-purple-200 mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center text-white shadow-md">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Recent Orders</h3>
            </div>
            {stats.deliveredCount > 0 && (
              <button 
                onClick={() => navigate('/orders')}
                className="text-sm text-purple-600 hover:text-purple-700 font-medium"
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
                <div className="w-14 h-14 bg-gray-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <Package className="w-7 h-7 text-gray-400 dark:text-zinc-500" />
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">No delivered orders this month</p>
                <p className="text-xs text-gray-400 dark:text-zinc-500 mb-4">Recent delivered orders will appear here</p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate('/products')}
                  className="text-sm"
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
                      className="flex gap-3 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer"
                      onClick={() => navigate(`/account/orders/${order.id}`)}
                    >
                      {/* Product Image */}
                      <div className="w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800">
                        {firstItem?.image ? (
                          <SmartImage 
                            src={firstItem.image} 
                            alt={firstItem.name}
                            className="w-full h-full object-cover" preset="thumb" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-6 h-6 text-gray-400 dark:text-zinc-500" />
                          </div>
                        )}
                      </div>

                      {/* Order Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 truncate mb-1">
                          {displayTitle}
                        </p>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                            {order.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-zinc-500">
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
          className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mt-6 shadow-sm"
        >
          <div className="flex gap-3">
            <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-900 mb-1">Exclusive Member Benefits</p>
              <p className="text-xs text-blue-700">
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
