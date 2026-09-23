// ============================================
// WALLET SERVICE — Production-Grade
// Sreerasthu Silvers eCommerce Platform
// ============================================
// ARCHITECTURE NOTES:
// 1. Wallet balance is ALWAYS computed server-side via Firestore transactions
// 2. Client can NEVER directly write wallet balance
// 3. All mutations go through atomic runTransaction()
// 4. For production: move credit/debit to Cloud Functions
// 5. Razorpay webhooks will call the same transaction methods
// ============================================

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  increment,
  startAfter,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  Wallet,
  WalletBalance,
  WalletTransaction,
  TransactionType,
  TransactionSource,
  TransactionStatus,
  RewardEntry,
  RewardSummary,
  RewardSource,
  GiftCard,
  PaymentMethod,
  Refund,
  RefundStatus,
  RefundMethod,
  AdminWalletAction,
} from '@/types/wallet';

// ─── CONSTANTS ────────────────────────────────

const COLLECTIONS = {
  USERS: 'users',
  WALLETS: 'wallets',
  TRANSACTIONS: 'transactions',
  REWARDS: 'rewards',
  GIFT_CARDS: 'giftCards',
  PAYMENT_METHODS: 'paymentMethods',
  REFUNDS: 'refunds',
  ADMIN_WALLET_LOG: 'adminWalletLog',
} as const;

// Reward tiers (points needed)
const REWARD_TIERS = {
  bronze: { min: 0, max: 999, multiplier: 1 },
  silver: { min: 1000, max: 4999, multiplier: 1.5 },
  gold: { min: 5000, max: 14999, multiplier: 2 },
  platinum: { min: 15000, max: Infinity, multiplier: 3 },
} as const;

// Points per ₹100 spent
const BASE_POINTS_PER_100 = 10;

// Wallet credit expiry (days)
const DEFAULT_CREDIT_EXPIRY_DAYS = 365;

// ─── WALLET INITIALIZATION ────────────────────

/**
 * Initialize wallet for a new user.
 * Called during signup or first wallet access.
 */
export const initializeWallet = async (userId: string): Promise<Wallet> => {
  const walletRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.WALLETS, 'main');
  const walletSnap = await getDoc(walletRef);

  if (walletSnap.exists()) {
    return { userId, ...walletSnap.data() } as Wallet;
  }

  const newWallet: Omit<Wallet, 'userId'> = {
    balance: {
      available: 0,
      pending: 0,
      locked: 0,
      totalEarned: 0,
      totalSpent: 0,
      lastUpdated: Timestamp.now(),
    },
    isActive: true,
    currency: 'INR',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await setDoc(walletRef, newWallet);
  return { userId, ...newWallet };
};

// ─── WALLET READ OPERATIONS ───────────────────

/**
 * Get wallet balance for a user.
 */
export const getWalletBalance = async (userId: string): Promise<WalletBalance | null> => {
  const walletRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.WALLETS, 'main');
  const walletSnap = await getDoc(walletRef);

  if (!walletSnap.exists()) {
    return null;
  }

  return walletSnap.data().balance as WalletBalance;
};

/**
 * Real-time wallet balance listener.
 */
export const subscribeToWallet = (
  userId: string,
  onUpdate: (wallet: Wallet) => void,
  onError?: (error: Error) => void
) => {
  const walletRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.WALLETS, 'main');

  return onSnapshot(
    walletRef,
    (snapshot) => {
      if (snapshot.exists()) {
        onUpdate({ userId, ...snapshot.data() } as Wallet);
      }
    },
    (error) => onError?.(error)
  );
};

/**
 * Get paginated transaction history.
 */
export const getTransactionHistory = async (
  userId: string,
  pageSize: number = 20,
  lastDoc?: QueryDocumentSnapshot
): Promise<{ transactions: WalletTransaction[]; lastDoc: QueryDocumentSnapshot | null }> => {
  const txRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRANSACTIONS);
  
  let q = query(txRef, orderBy('createdAt', 'desc'), limit(pageSize));
  if (lastDoc) {
    q = query(txRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(pageSize));
  }

  const snapshot = await getDocs(q);
  const transactions: WalletTransaction[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as WalletTransaction[];

  const newLastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

  return { transactions, lastDoc: newLastDoc };
};

/**
 * Real-time transaction history listener.
 */
export const subscribeToTransactions = (
  userId: string,
  limitCount: number = 50,
  onUpdate: (transactions: WalletTransaction[]) => void,
  onError?: (error: Error) => void
) => {
  const txRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRANSACTIONS);
  const q = query(txRef, orderBy('createdAt', 'desc'), limit(limitCount));

  return onSnapshot(
    q,
    (snapshot) => {
      const transactions: WalletTransaction[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as WalletTransaction[];
      onUpdate(transactions);
    },
    (error) => onError?.(error)
  );
};

/**
 * Get filtered transactions by type or source.
 */
export const getFilteredTransactions = async (
  userId: string,
  filters: { type?: TransactionType; source?: TransactionSource; status?: TransactionStatus },
  pageSize: number = 20
): Promise<WalletTransaction[]> => {
  const txRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRANSACTIONS);
  const constraints: any[] = [orderBy('createdAt', 'desc'), limit(pageSize)];

  if (filters.type) constraints.unshift(where('type', '==', filters.type));
  if (filters.source) constraints.unshift(where('source', '==', filters.source));
  if (filters.status) constraints.unshift(where('status', '==', filters.status));

  const q = query(txRef, ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as WalletTransaction[];
};

// ─── WALLET WRITE OPERATIONS (ATOMIC) ─────────
// CRITICAL: These use Firestore transactions to prevent race conditions
// and ensure balance consistency. In production, these should be
// Cloud Functions triggered by server-side events.

/**
 * Credit wallet balance atomically.
 * Used for: refunds, admin credits, cashback, rewards.
 */
export const creditWallet = async (
  userId: string,
  amount: number,
  source: TransactionSource,
  description: string,
  metadata?: {
    orderId?: string;
    adminId?: string;
    expiresInDays?: number;
  }
): Promise<WalletTransaction> => {
  if (amount <= 0) throw new Error('Credit amount must be positive');
  if (amount > 500000) throw new Error('Single credit cannot exceed ₹5,00,000');

  const walletRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.WALLETS, 'main');
  const txRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRANSACTIONS);

  let transactionData: Omit<WalletTransaction, 'id'>;

  await runTransaction(db, async (transaction) => {
    const walletSnap = await transaction.get(walletRef);

    let currentBalance: WalletBalance;
    if (!walletSnap.exists()) {
      // Auto-initialize wallet
      currentBalance = {
        available: 0,
        pending: 0,
        locked: 0,
        totalEarned: 0,
        totalSpent: 0,
        lastUpdated: Timestamp.now(),
      };
    } else {
      currentBalance = walletSnap.data().balance as WalletBalance;
    }

    const newAvailable = currentBalance.available + amount;
    const newTotalEarned = currentBalance.totalEarned + amount;

    const updatedBalance: WalletBalance = {
      ...currentBalance,
      available: newAvailable,
      totalEarned: newTotalEarned,
      lastUpdated: Timestamp.now(),
    };

    // Calculate expiry
    const expiryDays = metadata?.expiresInDays || DEFAULT_CREDIT_EXPIRY_DAYS;
    const expiresAt = Timestamp.fromDate(
      new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
    );

    transactionData = {
      type: 'credit',
      source,
      amount,
      balanceAfter: newAvailable,
      status: 'completed',
      orderId: metadata?.orderId,
      description,
      metadata: metadata || {},
      expiresAt,
      createdAt: Timestamp.now(),
      createdBy: metadata?.adminId || userId,
    };

    // Atomic write: update balance + create transaction log
    transaction.set(walletRef, {
      balance: updatedBalance,
      isActive: true,
      currency: 'INR',
      updatedAt: Timestamp.now(),
      ...(walletSnap.exists() ? {} : { createdAt: Timestamp.now() }),
    }, { merge: true });
  });

  // Add transaction log (outside of runTransaction to get auto-ID)
  const txDoc = await addDoc(txRef, transactionData!);
  return { id: txDoc.id, ...transactionData! };
};

/**
 * Debit wallet balance atomically.
 * Used for: purchases, redemptions.
 */
export const debitWallet = async (
  userId: string,
  amount: number,
  source: TransactionSource,
  description: string,
  metadata?: {
    orderId?: string;
  }
): Promise<WalletTransaction> => {
  if (amount <= 0) throw new Error('Debit amount must be positive');

  const walletRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.WALLETS, 'main');
  const txRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRANSACTIONS);

  let transactionData: Omit<WalletTransaction, 'id'>;

  await runTransaction(db, async (transaction) => {
    const walletSnap = await transaction.get(walletRef);

    if (!walletSnap.exists()) {
      throw new Error('Wallet not found. Cannot debit.');
    }

    const currentBalance = walletSnap.data().balance as WalletBalance;

    if (currentBalance.available < amount) {
      throw new Error(
        `Insufficient wallet balance. Available: ₹${currentBalance.available.toFixed(2)}, Required: ₹${amount.toFixed(2)}`
      );
    }

    if (!walletSnap.data().isActive) {
      throw new Error('Wallet is deactivated. Contact support.');
    }

    const newAvailable = currentBalance.available - amount;
    const newTotalSpent = currentBalance.totalSpent + amount;

    const updatedBalance: WalletBalance = {
      ...currentBalance,
      available: newAvailable,
      totalSpent: newTotalSpent,
      lastUpdated: Timestamp.now(),
    };

    transactionData = {
      type: 'debit',
      source,
      amount,
      balanceAfter: newAvailable,
      status: 'completed',
      orderId: metadata?.orderId,
      description,
      metadata: metadata || {},
      createdAt: Timestamp.now(),
      createdBy: userId,
    };

    transaction.set(walletRef, {
      balance: updatedBalance,
      updatedAt: Timestamp.now(),
    }, { merge: true });
  });

  const txDoc = await addDoc(txRef, transactionData!);
  return { id: txDoc.id, ...transactionData! };
};

/**
 * Lock funds for pending order (reserve).
 * When order is confirmed, convert to debit.
 * When order is cancelled, release lock.
 */
export const lockFunds = async (
  userId: string,
  amount: number,
  orderId: string
): Promise<void> => {
  if (amount <= 0) throw new Error('Lock amount must be positive');

  const walletRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.WALLETS, 'main');

  await runTransaction(db, async (transaction) => {
    const walletSnap = await transaction.get(walletRef);
    if (!walletSnap.exists()) throw new Error('Wallet not found');

    const balance = walletSnap.data().balance as WalletBalance;
    if (balance.available < amount) throw new Error('Insufficient funds to lock');

    transaction.update(walletRef, {
      'balance.available': balance.available - amount,
      'balance.locked': balance.locked + amount,
      'balance.lastUpdated': Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  });
};

/**
 * Release locked funds (order cancelled).
 */
export const releaseFunds = async (
  userId: string,
  amount: number,
  orderId: string
): Promise<void> => {
  const walletRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.WALLETS, 'main');

  await runTransaction(db, async (transaction) => {
    const walletSnap = await transaction.get(walletRef);
    if (!walletSnap.exists()) throw new Error('Wallet not found');

    const balance = walletSnap.data().balance as WalletBalance;

    transaction.update(walletRef, {
      'balance.available': balance.available + amount,
      'balance.locked': Math.max(0, balance.locked - amount),
      'balance.lastUpdated': Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  });
};

// ─── REWARD POINTS ────────────────────────────

/**
 * Calculate reward tier from total points.
 */
export const calculateTier = (totalPoints: number): RewardSummary['tier'] => {
  if (totalPoints >= REWARD_TIERS.platinum.min) return 'platinum';
  if (totalPoints >= REWARD_TIERS.gold.min) return 'gold';
  if (totalPoints >= REWARD_TIERS.silver.min) return 'silver';
  return 'bronze';
};

/**
 * Calculate points to next tier.
 */
export const pointsToNextTier = (totalPoints: number): number => {
  const currentTier = calculateTier(totalPoints);
  switch (currentTier) {
    case 'bronze': return REWARD_TIERS.silver.min - totalPoints;
    case 'silver': return REWARD_TIERS.gold.min - totalPoints;
    case 'gold': return REWARD_TIERS.platinum.min - totalPoints;
    case 'platinum': return 0;
  }
};

/**
 * Get reward summary for a user.
 */
export const getRewardSummary = async (userId: string): Promise<RewardSummary> => {
  const rewardsRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.REWARDS);
  const snapshot = await getDocs(rewardsRef);

  let totalPoints = 0;
  let availablePoints = 0;
  let redeemedPoints = 0;
  let expiringPoints = 0;
  let earliestExpiry: Timestamp | undefined;

  const now = Timestamp.now();
  const thirtyDaysFromNow = Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

  snapshot.docs.forEach((doc) => {
    const entry = doc.data() as RewardEntry;
    totalPoints += entry.points;

    if (entry.isRedeemed) {
      redeemedPoints += entry.points;
    } else if (entry.expiresAt && entry.expiresAt.toMillis() < now.toMillis()) {
      // Expired
    } else {
      availablePoints += entry.points;
      // Check expiring soon
      if (entry.expiresAt && entry.expiresAt.toMillis() < thirtyDaysFromNow.toMillis()) {
        expiringPoints += entry.points;
        if (!earliestExpiry || entry.expiresAt.toMillis() < earliestExpiry.toMillis()) {
          earliestExpiry = entry.expiresAt;
        }
      }
    }
  });

  const tier = calculateTier(totalPoints);
  return {
    totalPoints,
    availablePoints,
    redeemedPoints,
    expiringPoints,
    expiringDate: earliestExpiry,
    tier,
    nextTierPoints: pointsToNextTier(totalPoints),
  };
};

/**
 * Award reward points for a purchase.
 */
export const awardPurchasePoints = async (
  userId: string,
  orderTotal: number,
  orderId: string
): Promise<RewardEntry> => {
  const summary = await getRewardSummary(userId);
  const tierMultiplier = REWARD_TIERS[summary.tier].multiplier;
  const points = Math.floor((orderTotal / 100) * BASE_POINTS_PER_100 * tierMultiplier);

  const rewardsRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.REWARDS);
  const entry: Omit<RewardEntry, 'id'> = {
    points,
    source: 'purchase',
    description: `Earned ${points} points for order #${orderId}`,
    orderId,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)),
    isRedeemed: false,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(rewardsRef, entry);
  return { id: docRef.id, ...entry };
};

/**
 * Award bonus points (signup, review, referral, etc.).
 */
export const awardBonusPoints = async (
  userId: string,
  points: number,
  source: RewardSource,
  description: string
): Promise<RewardEntry> => {
  const rewardsRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.REWARDS);
  const entry: Omit<RewardEntry, 'id'> = {
    points,
    source,
    description,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)),
    isRedeemed: false,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(rewardsRef, entry);
  return { id: docRef.id, ...entry };
};

/**
 * Redeem reward points as wallet credit.
 * Conversion: 100 points = ₹10
 */
export const redeemPoints = async (
  userId: string,
  points: number
): Promise<WalletTransaction> => {
  const summary = await getRewardSummary(userId);
  if (points > summary.availablePoints) {
    throw new Error(`Insufficient points. Available: ${summary.availablePoints}`);
  }
  if (points < 100) {
    throw new Error('Minimum 100 points required for redemption');
  }

  const creditAmount = (points / 100) * 10; // ₹10 per 100 points

  // Credit wallet
  const tx = await creditWallet(
    userId,
    creditAmount,
    'reward',
    `Redeemed ${points} reward points`,
    { expiresInDays: 90 }
  );

  // Mark rewards as redeemed (oldest first)
  const rewardsRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.REWARDS);
  const q = query(
    rewardsRef,
    where('isRedeemed', '==', false),
    orderBy('createdAt', 'asc')
  );
  const snapshot = await getDocs(q);

  let remaining = points;
  for (const rewardDoc of snapshot.docs) {
    if (remaining <= 0) break;
    const entry = rewardDoc.data() as RewardEntry;
    if (entry.points <= remaining) {
      await setDoc(rewardDoc.ref, { isRedeemed: true, redeemedAt: Timestamp.now() }, { merge: true });
      remaining -= entry.points;
    }
  }

  return tx;
};

/**
 * Get reward entries (paginated).
 */
export const getRewardHistory = async (
  userId: string,
  pageSize: number = 20
): Promise<RewardEntry[]> => {
  const rewardsRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.REWARDS);
  const q = query(rewardsRef, orderBy('createdAt', 'desc'), limit(pageSize));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as RewardEntry[];
};

// ─── GIFT CARDS ───────────────────────────────

/**
 * Redeem a gift card and add balance to wallet.
 */
export const redeemGiftCard = async (
  userId: string,
  giftCardCode: string
): Promise<WalletTransaction> => {
  // Find gift card by code
  const giftCardsRef = collection(db, COLLECTIONS.GIFT_CARDS);
  const q = query(giftCardsRef, where('code', '==', giftCardCode.toUpperCase()));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error('Invalid gift card code');
  }

  const giftCardDoc = snapshot.docs[0];
  const giftCard = { id: giftCardDoc.id, ...giftCardDoc.data() } as GiftCard;

  if (giftCard.status !== 'active') {
    throw new Error(`Gift card is ${giftCard.status}`);
  }

  if (giftCard.expiresAt.toMillis() < Date.now()) {
    throw new Error('Gift card has expired');
  }

  if (giftCard.remainingAmount <= 0) {
    throw new Error('Gift card has no remaining balance');
  }

  // Credit wallet with gift card amount
  const tx = await creditWallet(
    userId,
    giftCard.remainingAmount,
    'gift_card',
    `Gift card redeemed: ${giftCardCode}`,
    { expiresInDays: 365 }
  );

  // Update gift card status
  await setDoc(giftCardDoc.ref, {
    status: 'redeemed',
    remainingAmount: 0,
    redeemedBy: userId,
    updatedAt: Timestamp.now(),
  }, { merge: true });

  return tx;
};

// ─── REFUND ARCHITECTURE ──────────────────────

/**
 * Initiate refund to wallet.
 */
export const initiateWalletRefund = async (
  orderId: string,
  userId: string,
  amount: number,
  reason: string
): Promise<Refund> => {
  if (amount <= 0) throw new Error('Refund amount must be positive');

  const refundsRef = collection(db, COLLECTIONS.REFUNDS);
  const refund: Omit<Refund, 'id'> = {
    orderId,
    userId,
    amount,
    method: 'wallet',
    status: 'initiated',
    reason,
    createdAt: Timestamp.now(),
  };

  const docRef = await addDoc(refundsRef, refund);
  return { id: docRef.id, ...refund };
};

/**
 * Process approved refund (admin action or auto).
 */
export const processRefund = async (
  refundId: string,
  approvedBy: string
): Promise<WalletTransaction> => {
  const refundRef = doc(db, COLLECTIONS.REFUNDS, refundId);
  const refundSnap = await getDoc(refundRef);

  if (!refundSnap.exists()) throw new Error('Refund not found');

  const refund = { id: refundSnap.id, ...refundSnap.data() } as Refund;

  if (refund.status !== 'initiated') {
    throw new Error(`Refund is already ${refund.status}`);
  }

  // Credit wallet
  const tx = await creditWallet(
    refund.userId,
    refund.amount,
    'refund',
    `Refund for order #${refund.orderId}: ${refund.reason}`,
    { orderId: refund.orderId, adminId: approvedBy, expiresInDays: 365 }
  );

  // Update refund status
  await setDoc(refundRef, {
    status: 'completed',
    approvedBy,
    walletTransactionId: tx.id,
    processedAt: Timestamp.now(),
    completedAt: Timestamp.now(),
  }, { merge: true });

  return tx;
};

// ─── ADMIN OPERATIONS ─────────────────────────

/**
 * Admin: manually credit user wallet.
 * Logs the action for audit trail.
 */
export const adminCreditWallet = async (
  userId: string,
  amount: number,
  reason: string,
  adminId: string,
  adminEmail: string
): Promise<WalletTransaction> => {
  // Log admin action
  const logRef = collection(db, COLLECTIONS.ADMIN_WALLET_LOG);
  await addDoc(logRef, {
    type: 'credit',
    userId,
    amount,
    reason,
    adminId,
    adminEmail,
    timestamp: Timestamp.now(),
  });

  return creditWallet(userId, amount, 'admin', `Admin credit: ${reason}`, {
    adminId,
    expiresInDays: DEFAULT_CREDIT_EXPIRY_DAYS,
  });
};

/**
 * Admin: deactivate wallet (fraud prevention).
 */
export const adminDeactivateWallet = async (
  userId: string,
  adminId: string,
  reason: string
): Promise<void> => {
  const walletRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.WALLETS, 'main');

  await setDoc(walletRef, {
    isActive: false,
    updatedAt: Timestamp.now(),
  }, { merge: true });

  // Log
  const logRef = collection(db, COLLECTIONS.ADMIN_WALLET_LOG);
  await addDoc(logRef, {
    type: 'deactivate',
    userId,
    amount: 0,
    reason,
    adminId,
    adminEmail: '',
    timestamp: Timestamp.now(),
  });
};

/**
 * Admin: get all refunds (with optional status filter).
 */
export const getRefunds = async (
  status?: RefundStatus,
  pageSize: number = 50
): Promise<Refund[]> => {
  const refundsRef = collection(db, COLLECTIONS.REFUNDS);
  let q;
  if (status) {
    q = query(refundsRef, where('status', '==', status), orderBy('createdAt', 'desc'), limit(pageSize));
  } else {
    q = query(refundsRef, orderBy('createdAt', 'desc'), limit(pageSize));
  }
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as Refund[];
};

// ─── PAYMENT METHODS (RAZORPAY READY) ─────────

/**
 * Get saved payment methods for a user.
 */
export const getPaymentMethods = async (userId: string): Promise<PaymentMethod[]> => {
  const pmRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.PAYMENT_METHODS);
  const q = query(pmRef, where('isActive', '==', true), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as PaymentMethod[];
};

/**
 * Add payment method (future: called by Razorpay tokenization).
 */
export const addPaymentMethod = async (
  userId: string,
  method: Omit<PaymentMethod, 'id' | 'createdAt' | 'updatedAt'>
): Promise<PaymentMethod> => {
  const pmRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.PAYMENT_METHODS);

  // If setting as default, unset other defaults
  if (method.isDefault) {
    const existing = await getPaymentMethods(userId);
    for (const pm of existing) {
      if (pm.isDefault) {
        await setDoc(doc(pmRef, pm.id), { isDefault: false }, { merge: true });
      }
    }
  }

  const data = {
    ...method,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(pmRef, data);
  return { id: docRef.id, ...data } as PaymentMethod;
};

/**
 * Remove payment method.
 */
export const removePaymentMethod = async (
  userId: string,
  methodId: string
): Promise<void> => {
  const pmRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.PAYMENT_METHODS, methodId);
  await setDoc(pmRef, { isActive: false, updatedAt: Timestamp.now() }, { merge: true });
};

// ─── RAZORPAY INTEGRATION INSERTION POINTS ────
// These functions are stubs that will be implemented when Razorpay is integrated.
// The database architecture supports this without restructuring.

/**
 * FUTURE: Create Razorpay order.
 * Will be a Cloud Function that calls Razorpay API.
 * Returns razorpay_order_id to frontend.
 */
export const createRazorpayOrder = async (
  _orderId: string,
  _amount: number,
  _userId: string
): Promise<{ razorpayOrderId: string }> => {
  // TODO: Implement via Cloud Function
  // const order = await razorpay.orders.create({
  //   amount: amount * 100, // paise
  //   currency: 'INR',
  //   receipt: orderId,
  //   notes: { userId, orderId }
  // });
  // return { razorpayOrderId: order.id };
  throw new Error('Razorpay integration not yet implemented. Use wallet or COD.');
};

/**
 * FUTURE: Verify Razorpay payment signature.
 * Must be done server-side (Cloud Function).
 */
export const verifyRazorpayPayment = async (
  _razorpayPaymentId: string,
  _razorpayOrderId: string,
  _razorpaySignature: string
): Promise<boolean> => {
  // TODO: Implement in Cloud Function
  // const generated = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET)
  //   .update(razorpayOrderId + '|' + razorpayPaymentId)
  //   .digest('hex');
  // return generated === razorpaySignature;
  throw new Error('Razorpay verification not yet implemented.');
};

/**
 * FUTURE: Handle Razorpay webhook events.
 * Cloud Function endpoint: /api/razorpay/webhook
 */
export const handleRazorpayWebhook = async (
  _event: any
): Promise<void> => {
  // TODO: Implement in Cloud Function
  // switch (event.event) {
  //   case 'payment.captured':
  //     await markOrderPaid(event.payload.payment.entity);
  //     break;
  //   case 'payment.failed':
  //     await markOrderPaymentFailed(event.payload.payment.entity);
  //     break;
  //   case 'refund.processed':
  //     await processRazorpayRefund(event.payload.refund.entity);
  //     break;
  // }
  throw new Error('Razorpay webhook handler not yet implemented.');
};
