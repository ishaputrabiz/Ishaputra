// ============================================
// LOGIN & SECURITY SYSTEM TYPES
// Enterprise-grade security type definitions
// ============================================

import { Timestamp } from 'firebase/firestore';

// ─── ACCOUNT STATUS ───────────────────────────

export type AccountStatus = 'active' | 'locked' | 'suspended' | 'deleted' | 'pending_deletion';

// ─── SECURITY SETTINGS ────────────────────────

export interface SecuritySettings {
  twoFactorEnabled: boolean;
  twoFactorMethod?: '2fa_app' | 'sms' | 'email';
  twoFactorSecret?: string; // Encrypted, server-side only
  passwordLastChanged?: Timestamp;
  passwordStrength?: 'weak' | 'medium' | 'strong';
  loginNotifications: boolean;
  suspiciousActivityAlerts: boolean;
  trustedDevices: string[]; // device fingerprint IDs
  maxSessionCount: number;
  autoLockAfterFailedAttempts: number;
  failedLoginAttempts: number;
  lastFailedLoginAt?: Timestamp;
  lockedUntil?: Timestamp;
  phoneVerified: boolean;
  phoneNumber?: string;
  recoveryEmail?: string;
  recoveryEmailVerified: boolean;
}

// ─── LOGIN HISTORY ────────────────────────────

export type LoginMethod = 'email' | 'google' | 'phone' | 'magic_link';
export type LoginStatus = 'success' | 'failed' | 'blocked' | 'suspicious';

export interface LoginHistoryEntry {
  id: string;
  userId: string;
  method: LoginMethod;
  status: LoginStatus;
  ipAddress: string;
  userAgent: string;
  browser?: string;
  os?: string;
  device?: string;
  location?: {
    city?: string;
    region?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  isSuspicious: boolean;
  suspiciousReason?: string;
  timestamp: Timestamp;
}

// ─── SESSION MANAGEMENT ───────────────────────

export interface UserSession {
  id: string;
  userId: string;
  deviceFingerprint: string;
  deviceName: string;
  browser: string;
  os: string;
  ipAddress: string;
  location?: {
    city?: string;
    country?: string;
  };
  isActive: boolean;
  isCurrent: boolean;
  lastActivity: Timestamp;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  tokenVersion: number; // For token invalidation
}

// ─── DEVICE TRACKING ──────────────────────────

export interface TrustedDevice {
  id: string;
  fingerprint: string;
  name: string;
  browser: string;
  os: string;
  lastUsed: Timestamp;
  addedAt: Timestamp;
  isTrusted: boolean;
}

// ─── USER PROFILE EXTENDED ────────────────────

export interface ExtendedUserProfile {
  uid: string;
  email: string | null;
  username: string;
  role: 'user' | 'admin' | 'delivery';
  accountStatus: AccountStatus;
  securitySettings: SecuritySettings;
  // Profile
  phone?: string;
  avatar?: string;
  name?: string;
  // Delivery
  vehicleType?: 'bike' | 'cycle' | 'van';
  address?: string;
  isActive?: boolean;
  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
  deletionRequestedAt?: Timestamp;
  deletionScheduledAt?: Timestamp;
  // Token management
  tokenVersion: number; // Increment to invalidate all tokens
}

// ─── ACCOUNT DELETION (GDPR) ─────────────────

export type DeletionStatus = 'requested' | 'processing' | 'completed' | 'cancelled';

export interface AccountDeletionRequest {
  id: string;
  userId: string;
  email: string;
  reason?: string;
  status: DeletionStatus;
  requestedAt: Timestamp;
  scheduledDeletionAt: Timestamp; // 30-day grace period
  processedAt?: Timestamp;
  processedBy?: string; // Admin who processed
  dataExported: boolean;
  dataExportUrl?: string;
}

// ─── AUDIT LOG ────────────────────────────────

export type AuditAction =
  | 'login'
  | 'logout'
  | 'password_change'
  | 'email_change'
  | 'profile_update'
  | 'wallet_credit'
  | 'wallet_debit'
  | 'order_placed'
  | 'order_cancelled'
  | 'account_locked'
  | 'account_unlocked'
  | 'account_suspended'
  | 'account_deletion_requested'
  | 'session_terminated'
  | 'role_changed'
  | '2fa_enabled'
  | '2fa_disabled'
  | 'device_trusted'
  | 'device_removed';

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: AuditAction;
  description: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  performedBy: string; // uid — could be admin or user themselves
  timestamp: Timestamp;
}

// ─── RE-AUTHENTICATION ────────────────────────

export interface ReAuthRequest {
  action: 'change_password' | 'change_email' | 'delete_account' | 'enable_2fa' | 'view_payment_methods';
  requiredMethods: ('password' | 'google' | 'otp')[];
}

// ─── PASSWORD POLICY ──────────────────────────

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxAge: number; // days before password must be changed
  preventReuse: number; // number of previous passwords to check
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  maxAge: 90,
  preventReuse: 5,
};
