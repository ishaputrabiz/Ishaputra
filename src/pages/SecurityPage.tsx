// ============================================
// LOGIN & SECURITY PAGE: enterprise-grade
// Password, email, sessions, devices, login history,
// account deletion, 2FA preparation
// ============================================

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/ui/status-badge';
import { AuthField } from '@/components/auth/AuthField';
import { ListSkeleton, PanelSkeleton } from '@/components/skeletons';
import { EmptyState } from '@/components/EmptyState';
import { formatDateTime } from '@/lib/format';
import { DUR, EASE_OUT } from '@/lib/motion';
import useWhatsAppOtpVerification from '@/hooks/useWhatsAppOtpVerification';
import { normalizePhoneNumber } from '@/services/whatsappService';
import {
  ArrowLeft, Shield, Mail, Check, X, AlertTriangle,
  Smartphone, Monitor, Globe, Clock, Trash2, ChevronRight, Key, Fingerprint,
  AlertCircle, CheckCircle2, CircleCheck, XCircle, MapPin, Settings, UserX,
  ShieldCheck, ChevronDown,
} from 'lucide-react';
import {
  getSecuritySettings,
  updateSecuritySettings,
  subscribeToLoginHistory,
  getActiveSessions,
  terminateSession,
  terminateAllSessions,
  changeEmail,
  getTrustedDevices,
  removeTrustedDevice,
  trustCurrentDevice,
  requestAccountDeletion,
  cancelAccountDeletion,
  getDeletionStatus,
  secureLogout,
  logoutAllDevices,
  parseUserAgent,
} from '@/services/securityService';
import type {
  SecuritySettings,
  LoginHistoryEntry,
  UserSession,
  TrustedDevice,
  AccountDeletionRequest,
} from '@/types/security';

type SecurityTab = 'overview' | 'password' | 'sessions' | 'login-history' | 'devices' | 'account';

const SecurityPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile, loading: authLoading, logout, updateUserProfile } = useAuth();

  // Tab & UI
  const [activeTab, setActiveTab] = useState<SecurityTab>('overview');
  const [isMobile, setIsMobile] = useState(false);

  // Keyboard and screen-reader users keep their place across sub-views: opening one moves
  // focus to its heading, going back returns focus to the row that opened it.
  const sectionHeadingRef = useRef<HTMLHeadingElement>(null);
  const openedFromRef = useRef<SecurityTab | null>(null);
  const tabChangedRef = useRef(false);
  useEffect(() => {
    if (!tabChangedRef.current) { tabChangedRef.current = true; return; }
    if (activeTab === 'overview') {
      const id = openedFromRef.current;
      const row = id ? document.querySelector<HTMLElement>(`[data-security-row="${id}"]`) : null;
      (row ?? sectionHeadingRef.current)?.focus();
    } else {
      sectionHeadingRef.current?.focus();
    }
  }, [activeTab]);

  // Show success message if redirected from password reset
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    location.state?.message ? { type: location.state.type || 'success', text: location.state.message } : null
  );

  // Clear location state after reading to prevent re-showing on refresh
  useEffect(() => {
    if (location.state?.message) {
      window.history.replaceState({}, document.title);
      // Auto-dismiss after 6 seconds
      setTimeout(() => setMessage(null), 6000);
    }
  }, []);

  // Data
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [deletionStatus, setDeletionStatus] = useState<AccountDeletionRequest | null>(null);
  const [loading, setLoading] = useState(true);

  // Password reset via email
  const [resetEmail, setResetEmail] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const resetAttempts = useRef(0);

  // Email change
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);

  // Login history filters
  const [historyFilter, setHistoryFilter] = useState<'all' | 'success' | 'failed' | 'suspicious'>('all');
  const [historyExpanded, setHistoryExpanded] = useState<string | null>(null);

  // General
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

  // Change Phone Number
  const [changePhoneOpen, setChangePhoneOpen] = useState(false);
  const [newPhoneInput, setNewPhoneInput] = useState('');
  const changePhoneOtp = useWhatsAppOtpVerification(newPhoneInput, changePhoneOpen && newPhoneInput.length === 10);

  // 2FA via WhatsApp OTP
  const [twoFaPanelOpen, setTwoFaPanelOpen] = useState(false);
  const [twoFaPhone, setTwoFaPhone] = useState('');
  const twoFaOtp = useWhatsAppOtpVerification(twoFaPhone, twoFaPanelOpen && !settings?.twoFactorEnabled);

  // Pre-fill 2FA phone from existing profile WhatsApp/phone number
  useEffect(() => {
    if (twoFaPanelOpen && !twoFaPhone) {
      const raw = userProfile?.whatsappNumber || userProfile?.phone || '';
      const normalized = normalizePhoneNumber(raw);
      // Strip the leading 91 country code for the input field
      setTwoFaPhone(normalized.startsWith('91') ? normalized.slice(2) : normalized);
    }
  }, [twoFaPanelOpen, userProfile, twoFaPhone]);

  const isPhoneVerified = Boolean(settings?.phoneVerified || userProfile?.whatsappNumber);

  // If a verified WhatsApp number already exists on the profile, or we previously marked
  // the phone as verified in security settings, let users enable 2FA without repeating OTP.
  const verifiedProfilePhone = (() => {
    const raw = userProfile?.whatsappNumber || (settings?.phoneVerified ? userProfile?.phone : '') || '';
    const normalized = normalizePhoneNumber(raw);
    return normalized.startsWith('91') ? normalized.slice(2) : normalized;
  })();
  const phoneAlreadyVerified = twoFaPhone.length === 10 && isPhoneVerified && !!verifiedProfilePhone && twoFaPhone === verifiedProfilePhone;
  const canEnable2FA = twoFaOtp.isVerified || phoneAlreadyVerified;

  const handleChangePhone = async () => {
    if (!user) return;
    if (!changePhoneOtp.isVerified) {
      showMessage('error', 'Verify the code before saving.');
      return;
    }
    setActionLoading('change-phone');
    try {
      const fullPhone = normalizePhoneNumber(newPhoneInput);
      await updateUserProfile({ whatsappNumber: fullPhone, phone: fullPhone });
      showMessage('success', 'Phone number updated.');
      setChangePhoneOpen(false);
      setNewPhoneInput('');
    } catch {
      showMessage('error', 'Unable to update your phone number. Try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEnable2FA = async () => {
    if (!user) return;
    if (!canEnable2FA) {
      showMessage('error', 'Verify the WhatsApp code before turning on 2-step verification.');
      return;
    }
    setActionLoading('enable-2fa');
    try {
      const fullPhone = normalizePhoneNumber(twoFaPhone);
      // 1. Persist 2FA settings
      await updateSecuritySettings(user.uid, {
        twoFactorEnabled: true,
        twoFactorMethod: 'sms',
        phoneVerified: true,
      });
      // 2. Save WhatsApp number to user profile so login flow can find it
      //    Stored as 10 digits without country code (matches WhatsAppSetupModal contract)
      if (twoFaPhone && twoFaPhone.length === 10) {
        try {
          await updateUserProfile({ whatsappNumber: twoFaPhone });
        } catch {
          /* non-fatal: 2FA still enabled */
        }
      }
      // 3. Auto-trust the current device so the user enabling 2FA isn't
      //    immediately challenged on this same device next time they log in.
      try {
        await trustCurrentDevice(user.uid);
      } catch {
        /* non-fatal */
      }
      setSettings((prev) => prev ? {
        ...prev,
        twoFactorEnabled: true,
        twoFactorMethod: 'sms',
        phoneVerified: true,
      } : prev);
      showMessage('success', `2-step verification is on. Codes go to WhatsApp on +${fullPhone}.`);
      setTwoFaPanelOpen(false);
    } catch (err: any) {
      showMessage('error', err.message || 'Unable to turn on 2-step verification. Try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisable2FA = async () => {
    if (!user) return;
    setActionLoading('disable-2fa');
    try {
      await updateSecuritySettings(user.uid, {
        twoFactorEnabled: false,
        twoFactorMethod: undefined as any,
      });
      setSettings((prev) => prev ? { ...prev, twoFactorEnabled: false, twoFactorMethod: undefined } : prev);
      setTwoFaPanelOpen(false);
      setTwoFaPhone('');
      showMessage('success', '2-step verification is off.');
    } catch (err: any) {
      showMessage('error', err.message || 'Unable to turn off 2-step verification. Try again.');
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Load initial data
  useEffect(() => {
    if (!user) return;
    const loadData = async () => {
      try {
        const [sec, sess, dev, deletion] = await Promise.all([
          getSecuritySettings(user.uid).catch(() => null),
          getActiveSessions(user.uid).catch(() => []),
          getTrustedDevices(user.uid).catch(() => []),
          getDeletionStatus(user.uid).catch(() => null),
        ]);
        setSettings(sec);
        setSessions(sess || []);
        setDevices(dev || []);
        setDeletionStatus(deletion);
      } catch (error) {
        console.error('Security data load error:', error);
        setSettings(null);
        setSessions([]);
        setDevices([]);
        setDeletionStatus(null);
      } finally {
        setLoading(false);
      }
    };
    loadData();

    // Subscribe to login history in real-time
    const unsubHistory = subscribeToLoginHistory(
      user.uid,
      (entries) => setLoginHistory(entries),
      () => setLoginHistory([])
    );
    return () => unsubHistory();
  }, [user]);

  // Pre-fill user email for password reset
  useEffect(() => {
    if (user?.email && !resetEmail) {
      setResetEmail(user.email);
    }
  }, [user]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // ─── HANDLERS ─────────────────────────────

  const startResendCountdown = () => {
    setResendCountdown(60);
    const interval = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendResetEmail = async () => {
    if (!resetEmail) {
      showMessage('error', 'Enter your email address.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resetEmail)) {
      showMessage('error', 'Enter a valid email address, like name@example.com.');
      return;
    }
    if (resetAttempts.current >= 3) {
      showMessage('error', 'Too many attempts. Try again later.');
      return;
    }
    setSendingReset(true);
    try {
      const actionCodeSettings = {
        url: `${window.location.origin}/`,
        handleCodeInApp: false,
      };
      await sendPasswordResetEmail(auth, resetEmail, actionCodeSettings);
      resetAttempts.current += 1;
      setResetEmailSent(true);
      startResendCountdown();
    } catch (err: any) {
      console.error('Send reset email error:', err);
      if (err.code === 'auth/too-many-requests') {
        showMessage('error', 'Too many attempts. Try again later.');
      } else {
        // For security, always show success (prevents email enumeration)
        setResetEmailSent(true);
        startResendCountdown();
      }
    } finally {
      setSendingReset(false);
    }
  };

  const handleResendResetEmail = async () => {
    if (resendCountdown > 0) return;
    setSendingReset(true);
    try {
      const actionCodeSettings = {
        url: `${window.location.origin}/`,
        handleCodeInApp: false,
      };
      await sendPasswordResetEmail(auth, resetEmail, actionCodeSettings);
      startResendCountdown();
    } catch (err) {
      console.error('Resend error:', err);
    } finally {
      setSendingReset(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail || !emailPassword) {
      showMessage('error', 'Fill in both fields.');
      return;
    }
    setChangingEmail(true);
    try {
      await changeEmail(emailPassword, newEmail);
      showMessage('success', 'Email updated. Check your inbox to verify it.');
      setNewEmail('');
      setEmailPassword('');
    } catch (err: any) {
      showMessage('error', err.message || 'Unable to update your email. Try again.');
    } finally {
      setChangingEmail(false);
    }
  };

  const handleTerminateSession = async (sessionId: string) => {
    if (!user) return;
    setActionLoading(sessionId);
    try {
      await terminateSession(user.uid, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      showMessage('success', 'Session ended.');
    } catch (err: any) {
      showMessage('error', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogoutAllDevices = async () => {
    if (!user) return;
    setActionLoading('all-sessions');
    try {
      const count = await terminateAllSessions(user.uid);
      showMessage('success', `Signed out of ${count} ${count === 1 ? 'device' : 'devices'}.`);
      await logout();
    } catch (err: any) {
      showMessage('error', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    if (!user) return;
    setActionLoading(deviceId);
    try {
      await removeTrustedDevice(user.uid, deviceId);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
      showMessage('success', 'Device removed.');
    } catch (err: any) {
      showMessage('error', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleTrustDevice = async () => {
    if (!user) return;
    setActionLoading('trust-device');
    try {
      const device = await trustCurrentDevice(user.uid);
      setDevices((prev) => [device, ...prev]);
      showMessage('success', 'This device is now trusted.');
    } catch (err: any) {
      showMessage('error', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    setActionLoading('delete');
    try {
      const req = await requestAccountDeletion(user.uid, deleteReason);
      setDeletionStatus(req);
      setShowDeleteConfirm(false);
      showMessage('success', 'Account deletion scheduled. You have 30 days to cancel.');
    } catch (err: any) {
      showMessage('error', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const [verifyLinkSent, setVerifyLinkSent] = useState(false);
  const handleSendVerifyLink = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setActionLoading('verify-email');
    try {
      await sendEmailVerification(currentUser);
      setVerifyLinkSent(true);
      showMessage('success', 'Verification link sent. Check your inbox and spam folder.');
    } catch (err: any) {
      showMessage(
        'error',
        err?.code === 'auth/too-many-requests'
          ? 'Too many attempts. Wait a few minutes and try again.'
          : 'Unable to send the link. Try again.',
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelDeletion = async () => {
    if (!user) return;
    setActionLoading('cancel-delete');
    try {
      await cancelAccountDeletion(user.uid);
      setDeletionStatus(null);
      showMessage('success', 'Account deletion cancelled.');
    } catch (err: any) {
      showMessage('error', err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleSetting = async (key: keyof SecuritySettings, value: boolean) => {
    if (!user) return;
    try {
      await updateSecuritySettings(user.uid, { [key]: value });
      setSettings((prev) => prev ? { ...prev, [key]: value } : prev);
    } catch (err: any) {
      showMessage('error', err.message);
    }
  };

  const formatDate = (timestamp: any) => formatDateTime(timestamp) || 'a date to be confirmed';

  const formatRelativeTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const formatFullTimestamp = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const dayName = date.toLocaleDateString('en-IN', { weekday: 'long' });
    const dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    return `${dayName}, ${dateStr} at ${timeStr}`;
  };

  const getFilteredHistory = () => {
    if (historyFilter === 'all') return loginHistory;
    if (historyFilter === 'suspicious') return loginHistory.filter(e => e.isSuspicious);
    return loginHistory.filter(e => e.status === historyFilter);
  };

  const getHistoryStats = () => {
    const total = loginHistory.length;
    const successful = loginHistory.filter(e => e.status === 'success').length;
    const failed = loginHistory.filter(e => e.status === 'failed').length;
    const suspicious = loginHistory.filter(e => e.isSuspicious).length;
    const lastLogin = loginHistory.find(e => e.status === 'success');
    return { total, successful, failed, suspicious, lastLogin };
  };

  const getLoginMethodLabel = (method: string) => {
    switch (method) {
      case 'google': return 'Google';
      case 'email': return 'Email and password';
      case 'phone': return 'Phone code';
      case 'magic_link': return 'Email link';
      default: return method;
    }
  };

  const getDeviceIcon = (os: string) => {
    if (os?.includes('Android') || os?.includes('iOS')) return <Smartphone className="w-5 h-5" />;
    if (os?.includes('Windows') || os?.includes('Mac') || os?.includes('Linux')) return <Monitor className="w-5 h-5" />;
    return <Globe className="w-5 h-5" />;
  };

  const getSectionTitle = (tab: SecurityTab) => {
    switch (tab) {
      case 'overview': return 'Sign-in & security';
      case 'password': return 'Change password';
      case 'login-history': return 'Sign-in history';
      case 'account': return 'Account settings';
      default: return 'Sign-in & security';
    }
  };

  /** Sub-views slide in 12px from the side; reduced motion keeps only the fade (MotionConfig). */
  const subView = {
    initial: { opacity: 0, x: 12 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.2, ease: EASE_OUT },
  };

  /** A field box with a +91 prefix and a trailing action: one border, copper focus ring on the whole box. */
  const fieldBox =
    'flex min-h-11 overflow-hidden rounded-control border border-input bg-background transition-[border-color,box-shadow] duration-hover focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30';
  const bareInput =
    'min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:text-muted-foreground sm:text-sm';
  const inputClass =
    'h-11 w-full rounded-control border border-input bg-background px-3 text-base text-foreground transition-[border-color,box-shadow] duration-hover placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm';
  const prefix = 'flex select-none items-center border-r border-input bg-foreground/[0.04] px-3 text-sm font-medium text-muted-foreground';

  if (authLoading || loading) {
    return (
      <div className="min-h-screen tx-paper" style={{ fontFamily: "var(--font-body)" }}>
        <Header />
        <div aria-busy="true" className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6 lg:py-10">
          <span className="sr-only" role="status">Loading security settings</span>
          <Skeleton className="h-7 w-48" />
          <PanelSkeleton lines={1} label="" />
          <ListSkeleton rows={3} label="" />
          <PanelSkeleton lines={2} label="" />
        </div>
      </div>
    );
  }

  if (!user) {
    navigate('/account');
    return null;
  }

  return (
    <div className="min-h-screen tx-paper" style={{ fontFamily: "var(--font-body)" }}>
      <Header />

      <main id="main" tabIndex={-1} className="outline-none">
      {/* Back Button */}
      <div className="border-b border-foreground/[0.08] bg-card">
        <div className="max-w-4xl mx-auto px-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (activeTab !== 'overview') { setActiveTab('overview'); return; }
              navigate('/account');
            }}
            className="-ml-2 inline-flex h-11 items-center gap-2 rounded-control px-2 text-muted-foreground transition-[color,transform] duration-press ease-out hover:text-foreground active:scale-[0.97]"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            <span className="text-sm font-medium">{activeTab === 'overview' ? 'Back to account' : 'Back'}</span>
          </button>
          <h1 ref={sectionHeadingRef} tabIndex={-1} className="ml-1 text-sm font-semibold text-foreground outline-none lg:sr-only">
            {getSectionTitle(activeTab)}
          </h1>
        </div>
      </div>

      {/* Message: a notice pinned to the top right, dismissed after a few seconds */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: DUR.dropdown, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: DUR.exit } }}
            className="fixed right-4 top-4 z-toast w-[min(calc(100vw-2rem),22rem)]"
          >
            <Notice
              tone={message.type === 'success' ? 'success' : 'danger'}
              className="pr-12 shadow-panel"
            >
              {message.text}
            </Notice>
            <IconButton
              label="Dismiss message"
              size="sm"
              className="absolute right-1.5 top-1.5 text-muted-foreground"
              onClick={() => setMessage(null)}
            >
              <X aria-hidden="true" />
            </IconButton>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-10 pb-24 lg:pb-10">
        {/* Account Status Banner */}
        {deletionStatus && (
          <Notice
            tone="danger"
            role="status"
            title="Account deletion scheduled"
            className="mb-6"
            action={
              <Button
                size="sm"
                variant="destructive"
                onClick={handleCancelDeletion}
                disabled={actionLoading === 'cancel-delete'}
              >
                {actionLoading === 'cancel-delete' && <Spinner />}
                Cancel deletion
              </Button>
            }
          >
            Your account will be deleted on {formatDate(deletionStatus.scheduledDeletionAt)}. All your data will be removed.
          </Notice>
        )}

        {/* ─── SECURITY OVERVIEW CARDS ────────── */}
        {activeTab === 'overview' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
            <h2 className="sr-only">Overview</h2>
            {/* Security Score */}
            <div className="panel tx-sheet mb-4 flex items-center gap-3 p-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-card bg-primary/10 text-primary">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Account security</p>
                <p className="text-base font-semibold text-foreground">
                  {settings?.twoFactorEnabled ? 'Protected' : 'Basic protection'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {settings?.twoFactorEnabled
                    ? '2-step verification is on.'
                    : 'Turn on 2-step verification for stronger protection.'}
                </p>
              </div>
            </div>

            {/* Menu Items */}
            <nav aria-label="Security settings" className="panel tx-sheet overflow-hidden divide-y divide-foreground/[0.08]">
              {[
                { id: 'password' as SecurityTab, icon: Key, label: 'Change password', desc: 'Get a reset link by email' },
                { id: 'login-history' as SecurityTab, icon: Clock, label: 'Sign-in history', desc: 'See recent sign-in activity' },
                { id: 'account' as SecurityTab, icon: Settings, label: 'Account settings', desc: 'Email, phone and account deletion' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-security-row={item.id}
                  onClick={() => { openedFromRef.current = item.id; setActiveTab(item.id); }}
                  className="focus-inset flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-hover hover:bg-muted/60"
                >
                  <item.icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-foreground">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.desc}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
                </button>
              ))}
            </nav>

            {/* 2FA: real WhatsApp OTP flow */}
            <section
              aria-labelledby="twofa-heading"
              className={`mt-6 rounded-panel border p-4 ${
                settings?.twoFactorEnabled
                  ? 'border-status-success-line bg-status-success-bg'
                  : 'border-highlight/30 bg-highlight/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <Fingerprint
                  aria-hidden="true"
                  className={`mt-0.5 size-5 shrink-0 ${settings?.twoFactorEnabled ? 'text-status-success-fg' : 'text-primary'}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2
                        id="twofa-heading"
                        className={`text-sm font-semibold ${settings?.twoFactorEnabled ? 'text-status-success-fg' : 'text-foreground'}`}
                      >
                        2-step verification
                      </h2>
                      {settings?.twoFactorEnabled && <StatusBadge tone="success" label="On" icon={CircleCheck} />}
                    </div>
                    {settings?.twoFactorEnabled ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDisable2FA}
                        disabled={actionLoading === 'disable-2fa'}
                      >
                        {actionLoading === 'disable-2fa' && <Spinner />}
                        Turn off
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant={twoFaPanelOpen ? 'outline' : 'default'}
                        aria-expanded={twoFaPanelOpen}
                        aria-controls="twofa-panel"
                        onClick={() => setTwoFaPanelOpen((v) => !v)}
                      >
                        {twoFaPanelOpen ? 'Cancel' : 'Turn on'}
                      </Button>
                    )}
                  </div>
                  <p className={`mt-1 text-xs leading-relaxed ${settings?.twoFactorEnabled ? 'text-status-success-fg' : 'text-muted-foreground'}`}>
                    {settings?.twoFactorEnabled
                      ? 'A WhatsApp code is needed for every sign-in on a new device.'
                      : 'Confirm each sign-in on a new device with a one-time code on WhatsApp.'}
                  </p>
                </div>
              </div>

              {twoFaPanelOpen && !settings?.twoFactorEnabled && (
                <motion.div
                  id="twofa-panel"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="mt-4 flex flex-col gap-4 rounded-card border border-foreground/10 bg-card p-4"
                >
                  <div>
                    <label htmlFor="twofa-phone" className="mb-1.5 block text-xs font-medium text-foreground/80">WhatsApp number</label>
                    <div className={fieldBox}>
                      <span className={prefix}>+91</span>
                      <input
                        id="twofa-phone"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        maxLength={10}
                        value={twoFaPhone}
                        onChange={(e) => { setTwoFaPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); }}
                        placeholder="10-digit number"
                        disabled={twoFaOtp.isVerified || phoneAlreadyVerified}
                        className={bareInput}
                      />
                      {phoneAlreadyVerified ? (
                        <span className="flex items-center px-2.5">
                          <StatusBadge tone="success" label="Verified" icon={Check} />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={twoFaOtp.sendOtp}
                          disabled={twoFaOtp.isBusy || twoFaOtp.isVerified || twoFaPhone.length !== 10}
                          className="shrink-0 border-l border-input px-3 text-xs font-semibold text-primary transition-colors duration-hover hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {twoFaOtp.phase === 'sending' ? 'Sending…' : twoFaOtp.phase === 'sent' || twoFaOtp.phase === 'verified' ? 'Resend' : 'Send code'}
                        </button>
                      )}
                    </div>
                    {phoneAlreadyVerified && (
                      <p className="mt-1.5 text-xs text-status-success-fg">This number is already verified on your account.</p>
                    )}
                  </div>

                  {!phoneAlreadyVerified && (twoFaOtp.phase === 'sent' || twoFaOtp.phase === 'verifying' || twoFaOtp.phase === 'verified') && (
                    <div>
                      <label htmlFor="twofa-code" className="mb-1.5 block text-xs font-medium text-foreground/80">6-digit WhatsApp code</label>
                      <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                        <input
                          id="twofa-code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={twoFaOtp.otpCode}
                          onChange={(e) => twoFaOtp.setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="123456"
                          disabled={twoFaOtp.isVerified}
                          className={`${inputClass} flex-1 font-mono tracking-[0.4em]`}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={twoFaOtp.confirmOtp}
                          disabled={twoFaOtp.isBusy || twoFaOtp.isVerified || twoFaOtp.otpCode.length !== 6}
                        >
                          {twoFaOtp.phase === 'verifying' ? <Spinner /> : twoFaOtp.isVerified ? <Check aria-hidden="true" className="size-4" /> : null}
                          {twoFaOtp.isVerified ? 'Verified' : 'Verify'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {twoFaOtp.otpError && (
                    <p role="alert" className="flex items-center gap-1.5 text-xs text-destructive">
                      <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" /> {twoFaOtp.otpError}
                    </p>
                  )}

                  <Button
                    onClick={handleEnable2FA}
                    disabled={!canEnable2FA || actionLoading === 'enable-2fa'}
                    className="w-full"
                  >
                    {actionLoading === 'enable-2fa' ? <Spinner /> : <ShieldCheck aria-hidden="true" className="size-4" />}
                    Turn on 2-step verification
                  </Button>
                </motion.div>
              )}
            </section>
          </motion.div>
        )}

        {/* ─── CHANGE PASSWORD (Email Reset Flow) ─────────────────── */}
        {activeTab === 'password' && (
          <motion.div {...subView}>
            <div className="panel tx-sheet p-6">
              {resetEmailSent ? (
                /* ── Step 2: Check Your Email ── */
                <div className="text-center">
                  <div className="mx-auto mb-5 grid size-16 place-items-center rounded-full bg-primary/10">
                    <Mail aria-hidden="true" className="size-7 text-primary" />
                  </div>
                  <h2 className="font-heading mb-2 text-xl font-semibold tracking-tight text-foreground">Check your email</h2>
                  <p className="mb-6 text-sm text-muted-foreground">
                    We sent a password reset link to<br />
                    <strong className="font-semibold text-foreground break-words [overflow-wrap:anywhere]">{resetEmail}</strong>
                  </p>

                  {/* Instructions */}
                  <div className="mb-6 rounded-card border border-foreground/10 bg-muted/50 p-4 text-left">
                    <div className="flex gap-3">
                      <Shield aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                      <div className="text-sm text-foreground/80">
                        <p className="mb-1 font-semibold text-foreground">What to do next</p>
                        <ul className="list-disc space-y-1 pl-4 text-xs marker:text-primary">
                          <li>Open the email and select the reset link.</li>
                          <li>Choose your new password on the page that opens.</li>
                          <li>Then sign in with your new password.</li>
                          <li>The link expires in 1 hour.</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Open Email App hint */}
                  <a
                    href={
                      resetEmail.includes('gmail') ? 'https://mail.google.com' :
                      resetEmail.includes('yahoo') ? 'https://mail.yahoo.com' :
                      resetEmail.includes('outlook') || resetEmail.includes('hotmail') ? 'https://outlook.live.com' :
                      'mailto:'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-copper mb-3 w-full"
                  >
                    <Mail aria-hidden="true" className="size-4" />
                    Open email
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>

                  {/* Resend */}
                  <Button
                    onClick={handleResendResetEmail}
                    disabled={resendCountdown > 0 || sendingReset}
                    variant="outline"
                    className="mb-3 w-full"
                  >
                    {sendingReset ? (
                      <><Spinner /> Sending…</>
                    ) : resendCountdown > 0 ? (
                      <><Clock aria-hidden="true" className="size-4" /> <span className="tabular-nums">Resend in {resendCountdown}s</span></>
                    ) : (
                      'Resend email'
                    )}
                  </Button>

                  {/* Didn't receive hint */}
                  <p className="mt-2 text-xs text-muted-foreground">
                    No email? Check your spam folder, or try a different address.
                  </p>
                  <button
                    type="button"
                    onClick={() => setResetEmailSent(false)}
                    className="-mx-1 mt-1 inline-flex min-h-6 items-center rounded-control px-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Try another email address
                  </button>
                </div>
              ) : (
                /* ── Step 1: Enter Email ── */
                <>
                  <div className="mb-5 flex items-center gap-3">
                    <div className="grid size-12 shrink-0 place-items-center rounded-card bg-primary/10">
                      <Key aria-hidden="true" className="size-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">Reset your password</h2>
                      <p className="text-sm text-muted-foreground">We'll email you a reset link.</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <AuthField
                      id="reset-email"
                      name="email"
                      label="Email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="name@example.com"
                      hint="Use the email address on your account."
                    />

                    <Button
                      size="lg"
                      onClick={handleSendResetEmail}
                      disabled={sendingReset || !resetEmail}
                      className="w-full"
                    >
                      {sendingReset ? <><Spinner /> Sending…</> : 'Send reset link'}
                    </Button>
                  </div>

                  {/* Google sign-in notice */}
                  <Notice tone="info" role="note" title="Signed up with Google?" className="mt-5">
                    Google manages your password. You can still set one here to sign in with your email as well.
                  </Notice>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── LOGIN HISTORY ───────────────────── */}
        {activeTab === 'login-history' && (
          <motion.div {...subView}>
            {loginHistory.length > 0 ? (
              <ol className="flex flex-col">
                {loginHistory.map((entry, index) => {
                  const isExpanded = historyExpanded === entry.id;
                  const isLast = index === loginHistory.length - 1;
                  const detailsId = `login-${entry.id}-details`;
                  return (
                    <li key={entry.id} className="relative">
                      {/* Timeline connector line */}
                      {!isLast && (
                        <div aria-hidden="true" className="absolute bottom-0 left-[30px] top-[52px] w-px bg-foreground/[0.08]" />
                      )}

                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={detailsId}
                        onClick={() => setHistoryExpanded(isExpanded ? null : entry.id)}
                        className={`relative flex w-full items-start gap-3 rounded-card p-3 text-left transition-colors duration-hover hover:bg-muted/60 ${
                          isExpanded ? 'bg-muted/50' : ''
                        }`}
                      >
                        {/* Status dot */}
                        <span
                          aria-hidden="true"
                          className={`relative z-raised grid size-9 shrink-0 place-items-center rounded-full border-2 border-card ${
                            entry.status === 'success' ? 'bg-status-success-bg text-status-success-fg' :
                            entry.status === 'failed' ? 'bg-status-danger-bg text-status-danger-fg' :
                            'bg-status-warning-bg text-status-warning-fg'
                          }`}
                        >
                          {entry.status === 'success' ? <CheckCircle2 className="size-4" /> :
                           entry.status === 'failed' ? <XCircle className="size-4" /> :
                           <AlertTriangle className="size-4" />}
                        </span>

                        {/* Content */}
                        <span className="flex min-w-0 flex-1 items-start justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-foreground">
                              {entry.status === 'success' ? 'Signed in' :
                               entry.status === 'failed' ? 'Failed attempt' :
                               'Sign-in attempt'}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {getLoginMethodLabel(entry.method)}
                              <span aria-hidden="true" className="mx-1">·</span>
                              {entry.browser || 'Unknown browser'} on {entry.os || 'unknown device'}
                            </span>
                          </span>
                          <span className="ml-2 flex shrink-0 flex-col items-end">
                            <span className="text-xs font-medium text-foreground/80">{formatRelativeTime(entry.timestamp)}</span>
                            <ChevronDown
                              aria-hidden="true"
                              className={`mt-0.5 size-3.5 text-muted-foreground transition-transform duration-dropdown ease-out ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </span>
                        </span>
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <motion.div
                          id={detailsId}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.2, ease: EASE_OUT }}
                          className="pb-3 pl-[60px] pr-3"
                        >
                          <div className="flex flex-col gap-2.5 border-t border-foreground/[0.08] pt-3 text-xs text-muted-foreground">
                            {/* Full timestamp */}
                            <div className="flex items-center gap-2">
                              <Clock aria-hidden="true" className="size-3.5 shrink-0" />
                              <span>{formatFullTimestamp(entry.timestamp)}</span>
                            </div>

                            {/* Device info */}
                            <div className="flex items-center gap-2">
                              {entry.os?.includes('Android') || entry.os?.includes('iOS') ? (
                                <Smartphone aria-hidden="true" className="size-3.5 shrink-0" />
                              ) : (
                                <Monitor aria-hidden="true" className="size-3.5 shrink-0" />
                              )}
                              <span>
                                {entry.device || 'Unknown device'} · {entry.browser} / {entry.os}
                              </span>
                            </div>

                            {/* IP Address */}
                            {entry.ipAddress && entry.ipAddress !== 'unknown' && (
                              <div className="flex items-center gap-2">
                                <Globe aria-hidden="true" className="size-3.5 shrink-0" />
                                <span className="tabular-nums">IP {entry.ipAddress}</span>
                              </div>
                            )}

                            {/* Location */}
                            {entry.location && (entry.location.city || entry.location.country) && (
                              <div className="flex items-center gap-2">
                                <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
                                <span>
                                  {[entry.location.city, entry.location.region, entry.location.country].filter(Boolean).join(', ')}
                                </span>
                              </div>
                            )}

                            {/* Auth method */}
                            <div className="flex items-center gap-2">
                              <Key aria-hidden="true" className="size-3.5 shrink-0" />
                              <span>{getLoginMethodLabel(entry.method)}</span>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="panel tx-sheet">
                <EmptyState
                  icon={Clock}
                  title="No sign-ins yet"
                  description="Each sign-in to your account will be listed here."
                />
              </div>
            )}
          </motion.div>
        )}

        {/* ─── ACCOUNT SETTINGS ────────────────── */}
        {activeTab === 'account' && (
          <motion.div {...subView}>
            {/* Account Info */}
            <section aria-labelledby="account-info-heading" className="panel tx-sheet mb-6 p-5">
              <h2 id="account-info-heading" className="font-heading mb-3 text-lg font-semibold tracking-tight text-foreground">Account information</h2>
              <div className="flex flex-col divide-y divide-foreground/[0.08]">
                <div className="flex items-center justify-between gap-4 py-3">
                  <span className="shrink-0 text-sm text-muted-foreground">Email</span>
                  <span className="min-w-0 text-right text-sm font-medium text-foreground break-words [overflow-wrap:anywhere]">{user?.email}</span>
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <span className="text-sm text-muted-foreground">Email verified</span>
                  {user?.emailVerified ? (
                    <StatusBadge tone="success" label="Verified" icon={CircleCheck} />
                  ) : (
                    <div className="flex items-center gap-3">
                      <StatusBadge tone="warning" label="Not verified" icon={AlertCircle} />
                      <button
                        type="button"
                        onClick={handleSendVerifyLink}
                        disabled={actionLoading === 'verify-email'}
                        className="-mx-1 inline-flex min-h-6 items-center gap-1.5 rounded-control px-1 text-xs font-medium text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionLoading === 'verify-email' && <Spinner />}
                        {verifyLinkSent ? 'Resend link' : 'Send link'}
                        <span className="sr-only"> to verify your email</span>
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <span className="text-sm text-muted-foreground">Phone verified</span>
                  {isPhoneVerified
                    ? <StatusBadge tone="success" label="Verified" icon={CircleCheck} />
                    : <span className="text-sm text-muted-foreground">Not set</span>}
                </div>
                <div className="flex items-center justify-between gap-4 py-3">
                  <span className="text-sm text-muted-foreground">Phone number</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground tabular-nums">
                      {(userProfile?.whatsappNumber || userProfile?.phone)
                        ? `+91 ${(userProfile?.whatsappNumber || userProfile?.phone || '').replace(/\D/g, '').slice(-10)}`
                        : <span className="font-normal text-muted-foreground">Not set</span>}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setChangePhoneOpen(true); setNewPhoneInput(''); }}
                      aria-expanded={changePhoneOpen}
                      className="-mx-1 inline-flex min-h-6 items-center rounded-control px-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Change<span className="sr-only"> phone number</span>
                    </button>
                  </div>
                </div>
                {changePhoneOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                    className="flex flex-col gap-3 py-4"
                  >
                    <label htmlFor="new-phone" className="text-sm text-muted-foreground">
                      Enter your new 10-digit WhatsApp number. We'll send it a verification code.
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <div className={`${fieldBox} flex-1`}>
                        <span className={prefix}>+91</span>
                        <input
                          id="new-phone"
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel-national"
                          maxLength={10}
                          placeholder="10-digit number"
                          value={newPhoneInput}
                          onChange={(e) => setNewPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          className={bareInput}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => changePhoneOtp.sendOtp()}
                        disabled={newPhoneInput.length !== 10 || changePhoneOtp.isBusy || changePhoneOtp.isVerified}
                      >
                        {changePhoneOtp.phase === 'sent' || changePhoneOtp.phase === 'verifying' || changePhoneOtp.phase === 'verified' ? 'Resend code' : 'Send code'}
                      </Button>
                    </div>
                    {(changePhoneOtp.phase === 'sent' || changePhoneOtp.phase === 'verifying') && !changePhoneOtp.isVerified && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          aria-label="6-digit code"
                          maxLength={6}
                          placeholder="6-digit code"
                          value={changePhoneOtp.otpCode}
                          onChange={(e) => changePhoneOtp.setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className={`${inputClass} flex-1`}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => changePhoneOtp.confirmOtp()}
                          disabled={changePhoneOtp.otpCode.length !== 6 || changePhoneOtp.isBusy}
                        >
                          Verify
                        </Button>
                      </div>
                    )}
                    {changePhoneOtp.isVerified && (
                      <p role="status" className="flex items-center gap-1.5 text-sm text-status-success-fg">
                        <CheckCircle2 aria-hidden="true" className="size-4" /> Code verified
                      </p>
                    )}
                    {changePhoneOtp.otpError && (
                      <p role="alert" className="text-sm text-destructive">{changePhoneOtp.otpError}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={handleChangePhone}
                        disabled={!changePhoneOtp.isVerified || actionLoading === 'change-phone'}
                      >
                        {actionLoading === 'change-phone' && <Spinner />}
                        {actionLoading === 'change-phone' ? 'Saving…' : 'Save number'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setChangePhoneOpen(false); setNewPhoneInput(''); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                )}
                <div className="flex items-center justify-between gap-4 py-3">
                  <span className="text-sm text-muted-foreground">2-step verification</span>
                  {settings?.twoFactorEnabled
                    ? <StatusBadge tone="success" label="On (WhatsApp)" icon={CircleCheck} />
                    : <span className="text-sm text-muted-foreground">Off</span>}
                </div>
              </div>
            </section>

            {/* Danger Zone */}
            <section aria-labelledby="danger-heading" className="panel tx-sheet border-destructive/30 p-5">
              <h2 id="danger-heading" className="font-heading mb-2 text-lg font-semibold tracking-tight text-destructive">Danger zone</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Deleting your account removes your data, orders and rewards for good after a 30-day grace period.
              </p>

              {!showDeleteConfirm ? (
                <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
                  <UserX aria-hidden="true" className="size-4" /> Delete account
                </Button>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, ease: EASE_OUT }}
                  className="flex flex-col gap-3 border-t border-foreground/[0.08] pt-4"
                >
                  <p className="text-sm font-semibold text-foreground">Delete your account?</p>
                  <label htmlFor="delete-reason" className="text-xs text-muted-foreground">Why are you leaving? (optional)</label>
                  <textarea
                    id="delete-reason"
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    className="h-20 w-full resize-none rounded-control border border-input bg-background p-3 text-base text-foreground transition-[border-color,box-shadow] duration-hover placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 sm:text-sm"
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="destructive"
                      onClick={handleDeleteAccount}
                      disabled={actionLoading === 'delete'}
                    >
                      {actionLoading === 'delete' ? <Spinner /> : <Trash2 aria-hidden="true" className="size-4" />}
                      Delete account
                    </Button>
                    <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Keep account</Button>
                  </div>
                </motion.div>
              )}
            </section>
          </motion.div>
        )}
      </div>
      </main>

      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default SecurityPage;
