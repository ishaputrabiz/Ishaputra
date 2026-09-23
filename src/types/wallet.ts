// ============================================
// WALLET & PAYMENT SYSTEM TYPES
// Production-grade type definitions for
// Sreerasthu Silvers eCommerce Platform
// ============================================

import { Timestamp } from 'firebase/firestore';

// ─── WALLET CORE ──────────────────────────────

export type TransactionType = 'credit' | 'debit';

export type TransactionSource =
  | 'refund'
  | 'admin'
  | 'purchase'
  | 'reward'
  | 'cashback'
  | 'gift_card'
  | 'store_credit'
  | 'razorpay'      // Future: Razorpay integration
  | 'promotional'
  | 'referral'
  | 'expiry';        // When wallet credits expire

export type TransactionStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'reversed'
  | 'expired';

export interface WalletTransaction {
  id: string;
  type: TransactionType;
  source: TransactionSource;
  amount: number;
  balanceAfter: number;
  status: TransactionStatus;
  orderId?: string;
  description: string;
  metadata?: Record<string, any>;
  // Razorpay future fields
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  razorpaySignature?: string;
  // Expiry
  expiresAt?: Timestamp;
  // Audit
  createdAt: Timestamp;
  createdBy: string; // uid of who initiated
  updatedAt?: Timestamp;
  ipAddress?: string;
}

export interface WalletBalance {
  available: number;
  pending: number;        // Pending refunds etc.
  locked: number;         // Reserved for ongoing orders
  totalEarned: number;
  totalSpent: number;
  lastUpdated: Timestamp;
}

export interface Wallet {
  userId: string;
  balance: WalletBalance;
  isActive: boolean;
  currency: 'INR';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── REWARD POINTS ────────────────────────────

export type RewardSource =
  | 'purchase'
  | 'review'
  | 'referral'
  | 'birthday'
  | 'signup'
  | 'admin'
  | 'promotional';

export interface RewardEntry {
  id: string;
  points: number;
  source: RewardSource;
  description: string;
  orderId?: string;
  expiresAt?: Timestamp;
  isRedeemed: boolean;
  redeemedAt?: Timestamp;
  createdAt: Timestamp;
}

export interface RewardSummary {
  totalPoints: number;
  availablePoints: number;
  redeemedPoints: number;
  expiringPoints: number;
  expiringDate?: Timestamp;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  nextTierPoints: number;
}

// ─── GIFT CARDS (READY STRUCTURE) ─────────────

export type GiftCardStatus = 'active' | 'redeemed' | 'expired' | 'disabled';

export interface GiftCard {
  id: string;
  code: string;
  originalAmount: number;
  remainingAmount: number;
  currency: 'INR';
  status: GiftCardStatus;
  purchasedBy?: string;
  redeemedBy?: string;
  expiresAt: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ─── PAYMENT METHODS (RAZORPAY READY) ─────────

export type PaymentMethodType =
  | 'razorpay_saved_card'
  | 'razorpay_upi'
  | 'razorpay_netbanking'
  | 'wallet'
  | 'cod';

export interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  isDefault: boolean;
  label: string; // e.g., "HDFC ending 4242"
  // Razorpay token storage (future)
  razorpayTokenId?: string;
  razorpayCustomerId?: string;
  cardLast4?: string;
  cardBrand?: string; // visa, mastercard, etc.
  cardExpiry?: string;
  upiId?: string;
  bankName?: string;
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  isActive: boolean;
}

// ─── ADMIN WALLET OPERATIONS ──────────────────

export interface AdminWalletAction {
  type: 'credit' | 'debit' | 'lock' | 'unlock' | 'deactivate';
  userId: string;
  amount: number;
  reason: string;
  adminId: string;
  adminEmail: string;
  timestamp: Timestamp;
}

// ─── REFUND ───────────────────────────────────

export type RefundStatus =
  | 'initiated'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'rejected';

export type RefundMethod = 'wallet' | 'original_payment' | 'razorpay';

export interface Refund {
  id: string;
  orderId: string;
  userId: string;
  amount: number;
  method: RefundMethod;
  status: RefundStatus;
  reason: string;
  approvedBy?: string;
  walletTransactionId?: string;
  razorpayRefundId?: string; // Future
  createdAt: Timestamp;
  processedAt?: Timestamp;
  completedAt?: Timestamp;
}

// ─── RAZORPAY INTEGRATION READY ───────────────

export interface RazorpayConfig {
  keyId: string;
  // keySecret is NEVER stored client-side
  webhookSecret?: string; // Server-side only
  environment: 'test' | 'live';
}

export interface RazorpayOrderPayload {
  amount: number; // in paise (amount * 100)
  currency: 'INR';
  receipt: string; // orderId
  notes: Record<string, string>;
}

export interface RazorpayPaymentResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayWebhookEvent {
  entity: string;
  account_id: string;
  event: string;
  contains: string[];
  payload: {
    payment?: {
      entity: {
        id: string;
        amount: number;
        currency: string;
        status: string;
        order_id: string;
        method: string;
        description: string;
        notes: Record<string, string>;
      };
    };
    refund?: {
      entity: {
        id: string;
        amount: number;
        payment_id: string;
        status: string;
      };
    };
  };
  created_at: number;
}
