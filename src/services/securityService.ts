// ============================================
// SECURITY SERVICE — Enterprise-Grade
// Sreerasthu Silvers eCommerce Platform
// ============================================
// Handles: Login history, session management,
// device tracking, account lock, 2FA prep,
// password change, email update, account deletion
// ============================================

import {
  collection,
  doc,
  deleteField,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  updatePassword,
  updateEmail as firebaseUpdateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithPopup,
  sendEmailVerification,
  deleteUser as firebaseDeleteUser,
  signOut,
  multiFactor,
} from 'firebase/auth';
import { auth, db } from '@/config/firebase';
import {
  SecuritySettings,
  LoginHistoryEntry,
  LoginMethod,
  LoginStatus,
  UserSession,
  TrustedDevice,
  AccountDeletionRequest,
  AuditLogEntry,
  AuditAction,
  AccountStatus,
  PasswordPolicy,
  DEFAULT_PASSWORD_POLICY,
} from '@/types/security';

// ─── CONSTANTS ────────────────────────────────

const COLLECTIONS = {
  USERS: 'users',
  LOGIN_HISTORY: 'loginHistory',
  SESSIONS: 'sessions',
  TRUSTED_DEVICES: 'trustedDevices',
  AUDIT_LOG: 'auditLog',
  DELETION_REQUESTS: 'accountDeletionRequests',
} as const;

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 30;
const SESSION_EXPIRY_DAYS = 30;
const MAX_LOGIN_HISTORY = 100;
const DELETION_GRACE_PERIOD_DAYS = 30;

// ─── DEVICE FINGERPRINTING ───────────────────

/**
 * Generate a simple device fingerprint from browser data.
 * In production, use a library like FingerprintJS.
 */
export const generateDeviceFingerprint = (): string => {
  const nav = navigator;
  const screen = window.screen;
  const raw = [
    nav.userAgent,
    nav.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    nav.hardwareConcurrency || 'unknown',
  ].join('|');

  // Simple hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

/**
 * Parse user agent string for display.
 */
export const parseUserAgent = (ua: string): { browser: string; os: string; device: string } => {
  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'Desktop';

  // Browser detection
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';

  // OS detection
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  // Device type
  if (ua.includes('Mobile') || ua.includes('Android')) device = 'Mobile';
  else if (ua.includes('Tablet') || ua.includes('iPad')) device = 'Tablet';

  return { browser, os, device };
};

// ─── SECURITY SETTINGS ────────────────────────

/**
 * Get or initialize security settings for a user.
 */
export const getSecuritySettings = async (userId: string): Promise<SecuritySettings> => {
  const userRef = doc(db, COLLECTIONS.USERS, userId);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists() && userSnap.data().securitySettings) {
    return userSnap.data().securitySettings as SecuritySettings;
  }

  // Initialize default security settings
  const defaults: SecuritySettings = {
    twoFactorEnabled: false,
    loginNotifications: true,
    suspiciousActivityAlerts: true,
    trustedDevices: [],
    maxSessionCount: 5,
    autoLockAfterFailedAttempts: MAX_FAILED_ATTEMPTS,
    failedLoginAttempts: 0,
    phoneVerified: false,
    recoveryEmailVerified: false,
  };

  await setDoc(userRef, { securitySettings: defaults }, { merge: true });
  return defaults;
};

/**
 * Update security settings.
 */
export const updateSecuritySettings = async (
  userId: string,
  updates: Partial<SecuritySettings>
): Promise<void> => {
  const userRef = doc(db, COLLECTIONS.USERS, userId);
  const updateData: Record<string, any> = {};

  Object.entries(updates).forEach(([key, value]) => {
    updateData[`securitySettings.${key}`] = value === undefined ? deleteField() : value;
  });

  updateData.updatedAt = serverTimestamp();
  await updateDoc(userRef, updateData);
};

// ─── LOGIN HISTORY ────────────────────────────

/**
 * Record a login attempt.
 */
export const recordLoginAttempt = async (
  userId: string,
  method: LoginMethod,
  status: LoginStatus,
  additionalData?: { ipAddress?: string }
): Promise<LoginHistoryEntry> => {
  const ua = navigator.userAgent;
  const { browser, os, device } = parseUserAgent(ua);
  const fingerprint = generateDeviceFingerprint();

  // Simple suspicious login detection
  let isSuspicious = false;
  let suspiciousReason: string | undefined;

  if (status === 'success') {
    // Check if this device has been seen before
    const settings = await getSecuritySettings(userId);
    if (settings.trustedDevices.length > 0 && !settings.trustedDevices.includes(fingerprint)) {
      isSuspicious = true;
      suspiciousReason = 'Login from new/untrusted device';
    }
  }

  const entry: Omit<LoginHistoryEntry, 'id'> = {
    userId,
    method,
    status,
    ipAddress: additionalData?.ipAddress || 'unknown',
    userAgent: ua,
    browser,
    os,
    device,
    isSuspicious,
    timestamp: Timestamp.now(),
  };

  if (suspiciousReason) {
    entry.suspiciousReason = suspiciousReason;
  }

  const historyRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.LOGIN_HISTORY);
  const docRef = await addDoc(historyRef, entry);

  // Handle failed attempts
  if (status === 'failed') {
    await handleFailedLogin(userId);
  } else if (status === 'success') {
    await resetFailedAttempts(userId);
  }

  return { id: docRef.id, ...entry };
};

/**
 * Get login history for a user.
 */
export const getLoginHistory = async (
  userId: string,
  pageSize: number = 20
): Promise<LoginHistoryEntry[]> => {
  const historyRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.LOGIN_HISTORY);
  const q = query(historyRef, orderBy('timestamp', 'desc'), limit(pageSize));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as LoginHistoryEntry[];
};

/**
 * Subscribe to login history (real-time).
 */
export const subscribeToLoginHistory = (
  userId: string,
  onUpdate: (entries: LoginHistoryEntry[]) => void,
  onError?: (error: Error) => void
) => {
  const historyRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.LOGIN_HISTORY);
  const q = query(historyRef, orderBy('timestamp', 'desc'), limit(20));

  return onSnapshot(q, (snapshot) => {
    const entries: LoginHistoryEntry[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as LoginHistoryEntry[];
    onUpdate(entries);
  }, (error) => onError?.(error));
};

// ─── FAILED LOGIN / ACCOUNT LOCK ──────────────

/**
 * Handle failed login attempt — increment counter, lock if exceeded.
 */
const handleFailedLogin = async (userId: string): Promise<void> => {
  const userRef = doc(db, COLLECTIONS.USERS, userId);

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists()) return;

    const settings = (userSnap.data()?.securitySettings || {}) as Partial<SecuritySettings>;
    const attempts = (settings.failedLoginAttempts || 0) + 1;
    const maxAttempts = settings.autoLockAfterFailedAttempts || MAX_FAILED_ATTEMPTS;

    const updates: Record<string, any> = {
      'securitySettings.failedLoginAttempts': attempts,
      'securitySettings.lastFailedLoginAt': Timestamp.now(),
    };

    if (attempts >= maxAttempts) {
      const lockUntil = Timestamp.fromDate(
        new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000)
      );
      updates['securitySettings.lockedUntil'] = lockUntil;
      updates['accountStatus'] = 'locked';

      // Log the lock
      await addDoc(collection(db, COLLECTIONS.USERS, userId, 'auditLog'), {
        userId,
        action: 'account_locked' as AuditAction,
        description: `Account locked after ${attempts} failed login attempts`,
        performedBy: 'system',
        timestamp: Timestamp.now(),
      });
    }

    transaction.update(userRef, updates);
  });
};

/**
 * Reset failed login counter on successful login.
 */
const resetFailedAttempts = async (userId: string): Promise<void> => {
  const userRef = doc(db, COLLECTIONS.USERS, userId);
  await updateDoc(userRef, {
    'securitySettings.failedLoginAttempts': 0,
    'securitySettings.lastFailedLoginAt': null,
    'securitySettings.lockedUntil': null,
    accountStatus: 'active',
    lastLoginAt: serverTimestamp(),
  });
};

/**
 * Check if account is locked.
 */
export const isAccountLocked = async (userId: string): Promise<{ locked: boolean; until?: Date }> => {
  const userRef = doc(db, COLLECTIONS.USERS, userId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) return { locked: false };

  const data = userSnap.data();
  if (data.accountStatus === 'locked' && data.securitySettings?.lockedUntil) {
    const lockedUntil = data.securitySettings.lockedUntil.toDate();
    if (lockedUntil > new Date()) {
      return { locked: true, until: lockedUntil };
    }
    // Lock expired, unlock
    await updateDoc(userRef, {
      accountStatus: 'active',
      'securitySettings.failedLoginAttempts': 0,
      'securitySettings.lockedUntil': null,
    });
  }

  if (data.accountStatus === 'suspended') {
    return { locked: true };
  }

  return { locked: false };
};

// ─── SESSION MANAGEMENT ───────────────────────

/**
 * Create a new session entry.
 */
export const createSession = async (userId: string): Promise<UserSession> => {
  const fingerprint = generateDeviceFingerprint();
  const ua = navigator.userAgent;
  const { browser, os } = parseUserAgent(ua);

  const sessionsRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.SESSIONS);

  // Check session limit
  const settings = await getSecuritySettings(userId);
  const activeSessions = await getActiveSessions(userId);

  if (activeSessions.length >= settings.maxSessionCount) {
    // Remove oldest session
    const oldest = activeSessions[activeSessions.length - 1];
    await terminateSession(userId, oldest.id);
  }

  const session: Omit<UserSession, 'id'> = {
    userId,
    deviceFingerprint: fingerprint,
    deviceName: `${os} - ${browser}`,
    browser,
    os,
    ipAddress: 'unknown', // Set by server in production
    isActive: true,
    isCurrent: true,
    lastActivity: Timestamp.now(),
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000)),
    tokenVersion: 1,
  };

  // Mark all other sessions as not current
  for (const s of activeSessions) {
    if (s.isCurrent) {
      await updateDoc(doc(sessionsRef, s.id), { isCurrent: false });
    }
  }

  const docRef = await addDoc(sessionsRef, session);
  return { id: docRef.id, ...session };
};

/**
 * Get all active sessions for a user.
 */
export const getActiveSessions = async (userId: string): Promise<UserSession[]> => {
  const sessionsRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.SESSIONS);
  const q = query(sessionsRef, where('isActive', '==', true), orderBy('lastActivity', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as UserSession[];
};

/**
 * Subscribe to sessions (real-time).
 */
export const subscribeToSessions = (
  userId: string,
  onUpdate: (sessions: UserSession[]) => void,
  onError?: (error: Error) => void
) => {
  const sessionsRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.SESSIONS);
  const q = query(sessionsRef, where('isActive', '==', true), orderBy('lastActivity', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const sessions: UserSession[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as UserSession[];
    onUpdate(sessions);
  }, (error) => onError?.(error));
};

/**
 * Terminate a specific session.
 */
export const terminateSession = async (userId: string, sessionId: string): Promise<void> => {
  const sessionRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.SESSIONS, sessionId);
  await updateDoc(sessionRef, {
    isActive: false,
    lastActivity: Timestamp.now(),
  });

  await logAuditEvent(userId, 'session_terminated', `Session ${sessionId} terminated`, userId);
};

/**
 * Terminate all sessions except current (logout from all devices).
 */
export const terminateAllSessions = async (userId: string): Promise<number> => {
  const sessions = await getActiveSessions(userId);
  const currentFingerprint = generateDeviceFingerprint();
  let terminated = 0;

  for (const session of sessions) {
    if (session.deviceFingerprint !== currentFingerprint) {
      await terminateSession(userId, session.id);
      terminated++;
    }
  }

  // Increment token version to invalidate all tokens
  const userRef = doc(db, COLLECTIONS.USERS, userId);
  await updateDoc(userRef, {
    tokenVersion: (await getDoc(userRef)).data()?.tokenVersion ? 
      (await getDoc(userRef)).data()!.tokenVersion + 1 : 1,
  });

  await logAuditEvent(userId, 'session_terminated', `All sessions terminated (${terminated} sessions)`, userId);
  return terminated;
};

/**
 * Update session activity timestamp.
 */
export const updateSessionActivity = async (userId: string, sessionId: string): Promise<void> => {
  const sessionRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.SESSIONS, sessionId);
  await updateDoc(sessionRef, { lastActivity: Timestamp.now() });
};

// ─── PASSWORD MANAGEMENT ──────────────────────

/**
 * Validate password against policy.
 */
export const validatePassword = (password: string, policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY): {
  valid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (policy.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (policy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return { valid: errors.length === 0, errors };
};

/**
 * Calculate password strength.
 */
export const getPasswordStrength = (password: string): 'weak' | 'medium' | 'strong' => {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (password.length >= 16) score++;

  if (score >= 6) return 'strong';
  if (score >= 4) return 'medium';
  return 'weak';
};

/**
 * Change password with re-authentication.
 */
export const changePassword = async (
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('No authenticated user');

  // Validate new password
  const validation = validatePassword(newPassword);
  if (!validation.valid) {
    throw new Error(validation.errors.join('. '));
  }

  // Re-authenticate
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);

  // Update password
  await updatePassword(user, newPassword);

  // Update security settings
  await updateSecuritySettings(user.uid, {
    passwordLastChanged: Timestamp.now(),
    passwordStrength: getPasswordStrength(newPassword),
  });

  await logAuditEvent(user.uid, 'password_change', 'Password changed successfully', user.uid);
};

/**
 * Update email with re-authentication.
 */
export const changeEmail = async (
  currentPassword: string,
  newEmail: string
): Promise<void> => {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('No authenticated user');

  // Re-authenticate
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);

  // Update email
  await firebaseUpdateEmail(user, newEmail);

  // Send verification for new email
  await sendEmailVerification(user);

  // Update Firestore
  await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), {
    email: newEmail,
    updatedAt: serverTimestamp(),
  });

  await logAuditEvent(user.uid, 'email_change', `Email changed to ${newEmail}`, user.uid);
};

/**
 * Re-authenticate with Google (for Google-linked accounts).
 */
export const reauthenticateWithGoogle = async (): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user');

  const provider = new GoogleAuthProvider();
  await reauthenticateWithPopup(user, provider);
};

// ─── TRUSTED DEVICES ─────────────────────────

/**
 * Add current device as trusted.
 */
export const trustCurrentDevice = async (userId: string): Promise<TrustedDevice> => {
  const fingerprint = generateDeviceFingerprint();
  const ua = navigator.userAgent;
  const { browser, os } = parseUserAgent(ua);

  const device: Omit<TrustedDevice, 'id'> = {
    fingerprint,
    name: `${os} - ${browser}`,
    browser,
    os,
    lastUsed: Timestamp.now(),
    addedAt: Timestamp.now(),
    isTrusted: true,
  };

  // Add to trusted devices list in security settings
  const settings = await getSecuritySettings(userId);
  if (!settings.trustedDevices.includes(fingerprint)) {
    await updateSecuritySettings(userId, {
      trustedDevices: [...settings.trustedDevices, fingerprint],
    });
  }

  // Store device details
  const devicesRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRUSTED_DEVICES);
  const docRef = await addDoc(devicesRef, device);

  await logAuditEvent(userId, 'device_trusted', `Device trusted: ${device.name}`, userId);
  return { id: docRef.id, ...device };
};

/**
 * Get trusted devices for a user.
 */
export const getTrustedDevices = async (userId: string): Promise<TrustedDevice[]> => {
  const devicesRef = collection(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRUSTED_DEVICES);
  const q = query(devicesRef, where('isTrusted', '==', true), orderBy('lastUsed', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as TrustedDevice[];
};

/**
 * Remove a trusted device.
 */
export const removeTrustedDevice = async (userId: string, deviceId: string): Promise<void> => {
  const deviceRef = doc(db, COLLECTIONS.USERS, userId, COLLECTIONS.TRUSTED_DEVICES, deviceId);
  const deviceSnap = await getDoc(deviceRef);

  if (deviceSnap.exists()) {
    const fingerprint = deviceSnap.data().fingerprint;
    await updateDoc(deviceRef, { isTrusted: false });

    // Remove from security settings
    const settings = await getSecuritySettings(userId);
    await updateSecuritySettings(userId, {
      trustedDevices: settings.trustedDevices.filter((f) => f !== fingerprint),
    });

    await logAuditEvent(userId, 'device_removed', `Device removed: ${deviceSnap.data().name}`, userId);
  }
};

// ─── ACCOUNT DELETION (GDPR) ─────────────────

/**
 * Request account deletion (soft delete with grace period).
 */
export const requestAccountDeletion = async (
  userId: string,
  reason?: string
): Promise<AccountDeletionRequest> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const scheduledDate = new Date(Date.now() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

  const request: Omit<AccountDeletionRequest, 'id'> = {
    userId,
    email: user.email || '',
    reason,
    status: 'requested',
    requestedAt: Timestamp.now(),
    scheduledDeletionAt: Timestamp.fromDate(scheduledDate),
    dataExported: false,
  };

  // Create deletion request
  const requestsRef = collection(db, COLLECTIONS.DELETION_REQUESTS);
  const docRef = await addDoc(requestsRef, request);

  // Update user account status
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
    accountStatus: 'pending_deletion',
    deletionRequestedAt: Timestamp.now(),
    deletionScheduledAt: Timestamp.fromDate(scheduledDate),
    updatedAt: serverTimestamp(),
  });

  await logAuditEvent(userId, 'account_deletion_requested', `Account deletion requested. Scheduled: ${scheduledDate.toISOString()}`, userId);

  return { id: docRef.id, ...request };
};

/**
 * Cancel account deletion request.
 */
export const cancelAccountDeletion = async (userId: string): Promise<void> => {
  // Find active deletion request
  const requestsRef = collection(db, COLLECTIONS.DELETION_REQUESTS);
  const q = query(requestsRef, where('userId', '==', userId), where('status', '==', 'requested'));
  const snapshot = await getDocs(q);

  for (const docSnap of snapshot.docs) {
    await updateDoc(docSnap.ref, { status: 'cancelled' });
  }

  // Restore account status
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
    accountStatus: 'active',
    deletionRequestedAt: null,
    deletionScheduledAt: null,
    updatedAt: serverTimestamp(),
  });

  await logAuditEvent(userId, 'account_deletion_requested', 'Account deletion cancelled', userId);
};

/**
 * Get account deletion status.
 */
export const getDeletionStatus = async (userId: string): Promise<AccountDeletionRequest | null> => {
  const requestsRef = collection(db, COLLECTIONS.DELETION_REQUESTS);
  const q = query(requestsRef, where('userId', '==', userId), where('status', '==', 'requested'), limit(1));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as AccountDeletionRequest;
};

// ─── AUDIT LOG ────────────────────────────────

/**
 * Log an audit event.
 */
export const logAuditEvent = async (
  userId: string,
  action: AuditAction,
  description: string,
  performedBy: string,
  metadata?: Record<string, any>
): Promise<void> => {
  const auditRef = collection(db, COLLECTIONS.USERS, userId, 'auditLog');
  await addDoc(auditRef, {
    userId,
    action,
    description,
    metadata,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    performedBy,
    timestamp: Timestamp.now(),
  });
};

/**
 * Get audit log for a user.
 */
export const getAuditLog = async (
  userId: string,
  pageSize: number = 50
): Promise<AuditLogEntry[]> => {
  const auditRef = collection(db, COLLECTIONS.USERS, userId, 'auditLog');
  const q = query(auditRef, orderBy('timestamp', 'desc'), limit(pageSize));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as AuditLogEntry[];
};

// ─── ADMIN SECURITY OPERATIONS ────────────────

/**
 * Admin: suspend user account.
 */
export const adminSuspendAccount = async (
  userId: string,
  adminId: string,
  reason: string
): Promise<void> => {
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
    accountStatus: 'suspended',
    updatedAt: serverTimestamp(),
  });

  await logAuditEvent(userId, 'account_suspended', `Account suspended: ${reason}`, adminId);
};

/**
 * Admin: unlock user account.
 */
export const adminUnlockAccount = async (
  userId: string,
  adminId: string
): Promise<void> => {
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
    accountStatus: 'active',
    'securitySettings.failedLoginAttempts': 0,
    'securitySettings.lockedUntil': null,
    updatedAt: serverTimestamp(),
  });

  await logAuditEvent(userId, 'account_unlocked', 'Account unlocked by admin', adminId);
};

/**
 * Admin: change user role.
 */
export const adminChangeRole = async (
  userId: string,
  newRole: 'user' | 'admin' | 'delivery',
  adminId: string
): Promise<void> => {
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
    role: newRole,
    updatedAt: serverTimestamp(),
  });

  await logAuditEvent(userId, 'role_changed', `Role changed to ${newRole}`, adminId);
};

// ─── LOGOUT ───────────────────────────────────

/**
 * Logout and clean up session.
 */
export const secureLogout = async (userId: string): Promise<void> => {
  // Mark current session as inactive
  const sessions = await getActiveSessions(userId);
  const currentFingerprint = generateDeviceFingerprint();
  
  for (const session of sessions) {
    if (session.deviceFingerprint === currentFingerprint && session.isCurrent) {
      await terminateSession(userId, session.id);
    }
  }

  await logAuditEvent(userId, 'logout', 'User logged out', userId);
  await signOut(auth);
};

/**
 * Logout from all devices.
 */
export const logoutAllDevices = async (userId: string): Promise<void> => {
  await terminateAllSessions(userId);
  await signOut(auth);
};

// ─── PASSWORD RESET SECURITY ─────────────────

/**
 * Log password reset request event.
 */
export const logPasswordResetRequest = async (
  email: string,
  ipAddress?: string
): Promise<void> => {
  try {
    // Try to find user by email (but don't reveal if exists for security)
    // In production, log this server-side with Cloud Functions
    console.log('Password reset requested for:', email, 'IP:', ipAddress);
    
    // This is a placeholder - in production, this should be logged server-side
    // to prevent client-side manipulation
  } catch (error) {
    console.error('Error logging password reset request:', error);
  }
};

/**
 * Log successful password reset and invalidate sessions.
 * IMPORTANT: Call this after firebase confirmPasswordReset succeeds.
 */
export const handlePasswordResetComplete = async (
  userId: string,
  email: string
): Promise<void> => {
  try {
    // 1. Log the password change in audit log
    await logAuditEvent(
      userId,
      'password_change',
      'Password reset via email link',
      userId
    );

    // 2. Record in login history as security event
    const loginHistoryRef = collection(
      db,
      COLLECTIONS.USERS,
      userId,
      COLLECTIONS.LOGIN_HISTORY
    );

    await addDoc(loginHistoryRef, {
      timestamp: serverTimestamp(),
      method: 'email' as LoginMethod,
      status: 'success' as LoginStatus,
      ipAddress: 'unknown', // Would be captured server-side
      deviceFingerprint: generateDeviceFingerprint(),
      userAgent: navigator.userAgent,
      location: 'unknown',
      isSuspicious: false,
      notes: 'Password reset completed',
    });

    // 3. Terminate all active sessions for security
    await terminateAllSessions(userId);

    // 4. Reset failed login attempts
    await resetFailedAttempts(userId);

    console.log('Password reset completed for user:', userId);
  } catch (error) {
    console.error('Error handling password reset completion:', error);
    throw error;
  }
};

/**
 * Check if password reset request should be rate-limited.
 * Returns true if too many requests detected.
 */
export const checkPasswordResetRateLimit = async (
  email: string
): Promise<boolean> => {
  // In production, implement this server-side with Cloud Functions
  // to check if email has requested too many resets in a time window
  
  // This is a placeholder that always returns false (allow)
  // Real implementation would query a rate-limit collection
  return false;
};

/**
 * Notify user of password change via email.
 * In production, this should be handled by Cloud Functions.
 */
export const sendPasswordChangedNotification = async (
  email: string
): Promise<void> => {
  // This would be handled by Cloud Functions in production
  console.log('Password change notification should be sent to:', email);
  
  // Cloud Function would:
  // 1. Send email notification
  // 2. Include timestamp, IP, device info
  // 3. Provide "Was this you?" link
  // 4. Include security tips
};
