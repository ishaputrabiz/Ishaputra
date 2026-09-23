// ============================================
// LOGIN & SECURITY PAGE — Enterprise-Grade
// Password, email, sessions, devices, login history,
// account deletion, 2FA preparation
// ============================================

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import { Button } from '@/components/ui/button';
import useWhatsAppOtpVerification from '@/hooks/useWhatsAppOtpVerification';
import { normalizePhoneNumber } from '@/services/whatsappService';
import {
  ArrowLeft, Shield, Lock, Mail, Eye, EyeOff, Loader2, Check, X, AlertTriangle,
  Smartphone, Monitor, Globe, Clock, LogOut, Trash2, ChevronRight, Key, Fingerprint,
  AlertCircle, CheckCircle2, XCircle, MapPin, RefreshCcw, Settings, UserX,
  ShieldCheck, ShieldAlert, Laptop, Info, ChevronDown,
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
      showMessage('error', 'Please verify the OTP before saving.');
      return;
    }
    setActionLoading('change-phone');
    try {
      const fullPhone = normalizePhoneNumber(newPhoneInput);
      await updateUserProfile({ whatsappNumber: fullPhone, phone: fullPhone });
      showMessage('success', 'Phone number updated successfully.');
      setChangePhoneOpen(false);
      setNewPhoneInput('');
    } catch {
      showMessage('error', 'Failed to update phone number.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEnable2FA = async () => {
    if (!user) return;
    if (!canEnable2FA) {
      showMessage('error', 'Verify the WhatsApp code before enabling 2FA.');
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
      showMessage('success', `2FA enabled. Codes will be sent on WhatsApp to +${fullPhone}.`);
      setTwoFaPanelOpen(false);
    } catch (err: any) {
      showMessage('error', err.message || 'Failed to enable 2FA');
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
      showMessage('success', 'Two-factor authentication disabled.');
    } catch (err: any) {
      showMessage('error', err.message || 'Failed to disable 2FA');
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
      showMessage('error', 'Please enter your email address');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(resetEmail)) {
      showMessage('error', 'Please enter a valid email address');
      return;
    }
    if (resetAttempts.current >= 3) {
      showMessage('error', 'Too many attempts. Please try again later.');
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
        showMessage('error', 'Too many requests. Please try again later.');
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
      showMessage('error', 'Please fill all fields');
      return;
    }
    setChangingEmail(true);
    try {
      await changeEmail(emailPassword, newEmail);
      showMessage('success', 'Email updated. Please verify your new email address.');
      setNewEmail('');
      setEmailPassword('');
    } catch (err: any) {
      showMessage('error', err.message || 'Failed to update email');
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
      showMessage('success', 'Session terminated');
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
      showMessage('success', `Logged out from ${count} device(s)`);
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
      showMessage('success', 'Device removed');
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
      showMessage('success', 'This device is now trusted');
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

  const handleCancelDeletion = async () => {
    if (!user) return;
    setActionLoading('cancel-delete');
    try {
      await cancelAccountDeletion(user.uid);
      setDeletionStatus(null);
      showMessage('success', 'Account deletion cancelled');
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

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
      ' ' + date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatRelativeTime = (timestamp: any) => {
    if (!timestamp) return 'N/A';
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
    if (!timestamp) return 'N/A';
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
      case 'google': return 'Google Sign-In';
      case 'email': return 'Email & Password';
      case 'phone': return 'Phone OTP';
      case 'magic_link': return 'Magic Link';
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
      case 'overview': return 'Login & Security';
      case 'password': return 'Change Password';
      case 'login-history': return 'Login History';
      case 'account': return 'Account Settings';
      default: return 'Login & Security';
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900 dark:bg-[linear-gradient(180deg,rgba(19,17,15,0.98)_0%,rgba(14,14,15,0.98)_100%)]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-zinc-500 dark:text-zinc-400">Loading security settings...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    navigate('/account');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 dark:bg-[linear-gradient(180deg,rgba(19,17,15,0.98)_0%,rgba(14,14,15,0.98)_100%)]" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <Header />

      {/* Back Button */}
      <div className="border-b border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 dark:bg-zinc-950/90">
        <div className="max-w-4xl mx-auto px-4 flex items-center gap-3">
          <button
            onClick={() => {
              if (activeTab !== 'overview') { setActiveTab('overview'); return; }
              navigate('/account');
            }}
            className="flex items-center gap-2 py-3 text-gray-600 dark:text-zinc-400 transition-colors hover:text-gray-900 dark:hover:text-zinc-100"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">Back to Account</span>
          </button>
          <span className="ml-2 text-sm font-semibold text-gray-900 dark:text-zinc-100 lg:hidden">
            {getSectionTitle(activeTab)}
          </span>
        </div>
      </div>

      {/* Message Toast */}
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            className="fixed top-4 right-4 z-50 w-[min(calc(100vw-1.5rem),22rem)]"
          >
            <div
              className={[
                'rounded-[22px] border px-4 py-3 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.45)] backdrop-blur-xl',
                'flex items-start gap-3',
                message.type === 'success'
                  ? 'border-emerald-200/70 bg-white/95 text-emerald-950 dark:border-emerald-500/20 dark:bg-zinc-950/95 dark:text-emerald-50'
                  : 'border-red-200/70 bg-white/95 text-red-950 dark:border-red-500/20 dark:bg-zinc-950/95 dark:text-red-50',
              ].join(' ')}
            >
              <div
                className={[
                  'mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border',
                  message.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300',
                ].join(' ')}
              >
                {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              </div>

              <div className="min-w-0 flex-1 pr-2">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-current/55">
                  {message.type === 'success' ? 'Success' : 'Error'}
                </p>
                <p className="mt-1 text-sm font-medium leading-6">{message.text}</p>
              </div>

              <button
                type="button"
                onClick={() => setMessage(null)}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-black/5 text-current/50 transition hover:bg-black/5 hover:text-current dark:border-white/10 dark:hover:bg-white/10"
                aria-label="Close message"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-4xl mx-auto px-4 py-6 lg:py-10 pb-24 lg:pb-10">
        {/* Account Status Banner */}
        {deletionStatus && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-900">Account Deletion Scheduled</p>
              <p className="text-xs text-red-700 mt-1">
                Your account will be permanently deleted on {formatDate(deletionStatus.scheduledDeletionAt)}.
                All data will be removed.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancelDeletion}
                disabled={actionLoading === 'cancel-delete'}
                className="mt-3 border-red-300 text-red-700 hover:bg-red-100"
              >
                {actionLoading === 'cancel-delete' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Cancel Deletion
              </Button>
            </div>
          </div>
        )}

        {/* ─── SECURITY OVERVIEW CARDS ────────── */}
        {activeTab === 'overview' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Security Score */}
            <div className="mb-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/88">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-gray-600 dark:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-zinc-500 dark:text-zinc-400">Account Security</p>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-100">
                    {settings?.twoFactorEnabled ? 'Protected' : 'Basic Protection'}
                  </h2>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-500 dark:text-zinc-400">
                    {settings?.twoFactorEnabled
                      ? 'Two-factor authentication is enabled'
                      : 'Enable 2FA for enhanced security'}
                  </p>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="space-y-1">
              {[
                { id: 'password' as SecurityTab, icon: <Key className="w-5 h-5" />, label: 'Change Password', desc: 'Update your password', color: 'text-blue-600' },
                { id: 'login-history' as SecurityTab, icon: <Clock className="w-5 h-5" />, label: 'Login History', desc: 'View recent login activity', color: 'text-purple-600' },
                { id: 'account' as SecurityTab, icon: <Settings className="w-5 h-5" />, label: 'Account Settings', desc: 'Email, notifications & more', color: 'text-gray-600 dark:text-zinc-400' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className="flex w-full items-center gap-3 bg-white dark:bg-zinc-900 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/88 dark:hover:bg-zinc-800/80"
                >
                  <div className={`${item.color}`}>
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">{item.label}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-zinc-500 dark:text-zinc-400">{item.desc}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 dark:text-zinc-500" />
                </button>
              ))}
            </div>

            {/* 2FA — Real WhatsApp OTP flow */}
            <div className={`rounded-xl p-4 mt-6 border ${settings?.twoFactorEnabled ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-start gap-3">
                <Fingerprint className={`w-5 h-5 flex-shrink-0 mt-0.5 ${settings?.twoFactorEnabled ? 'text-green-600' : 'text-amber-600'}`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className={`text-sm font-medium ${settings?.twoFactorEnabled ? 'text-green-900' : 'text-amber-900'}`}>
                      Two-Factor Authentication
                      {settings?.twoFactorEnabled && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-600 text-white">
                          <CheckCircle2 className="w-3 h-3" /> ON
                        </span>
                      )}
                    </p>
                    {settings?.twoFactorEnabled ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDisable2FA}
                        disabled={actionLoading === 'disable-2fa'}
                        className="border-green-300 text-green-700 hover:bg-green-100"
                      >
                        {actionLoading === 'disable-2fa' ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                        Disable
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => setTwoFaPanelOpen((v) => !v)}
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                      >
                        {twoFaPanelOpen ? 'Cancel' : 'Enable'}
                      </Button>
                    )}
                  </div>
                  <p className={`text-xs mt-1 ${settings?.twoFactorEnabled ? 'text-green-700' : 'text-amber-700'}`}>
                    {settings?.twoFactorEnabled
                      ? 'A WhatsApp code is required on every new sign-in to keep your account safe.'
                      : 'Add an extra layer of security by verifying logins with a one-time code on WhatsApp.'}
                  </p>
                </div>
              </div>

              {twoFaPanelOpen && !settings?.twoFactorEnabled && (
                <div className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-white dark:bg-zinc-900 p-4 dark:border-amber-800/70 dark:bg-zinc-950/90">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-zinc-300 mb-1">WhatsApp number</label>
                    <div className="flex flex-col sm:flex-row rounded-lg border border-gray-200 dark:border-zinc-800 overflow-hidden focus-within:ring-2 focus-within:ring-amber-300">
                      <span className="px-3 py-2 bg-gray-50 dark:bg-zinc-900/50 text-sm text-gray-600 dark:text-zinc-400 border-b sm:border-b-0 sm:border-r border-gray-200 dark:border-zinc-800">+91</span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={10}
                        value={twoFaPhone}
                        onChange={(e) => { setTwoFaPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); }}
                        placeholder="10-digit number"
                        disabled={twoFaOtp.isVerified || phoneAlreadyVerified}
                        className="flex-1 min-w-0 px-3 py-2 text-sm outline-none disabled:bg-gray-50 dark:bg-zinc-900/50 disabled:text-gray-500 dark:text-zinc-500 dark:text-zinc-400"
                      />
                      {phoneAlreadyVerified ? (
                        <span className="px-3 py-2 flex items-center justify-center sm:justify-start text-xs font-semibold text-green-600 gap-1 border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-zinc-800">
                          <Check className="w-3.5 h-3.5" /> Verified
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={twoFaOtp.sendOtp}
                          disabled={twoFaOtp.isBusy || twoFaOtp.isVerified || twoFaPhone.length !== 10}
                          className="px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-zinc-800"
                        >
                          {twoFaOtp.phase === 'sending' ? 'Sending…' : twoFaOtp.phase === 'sent' || twoFaOtp.phase === 'verified' ? 'Resend' : 'Send code'}
                        </button>
                      )}
                    </div>
                    {phoneAlreadyVerified && (
                      <p className="text-xs text-green-600 mt-1">This number is already verified on your account — you can proceed.</p>
                    )}
                  </div>

                  {!phoneAlreadyVerified && (twoFaOtp.phase === 'sent' || twoFaOtp.phase === 'verifying' || twoFaOtp.phase === 'verified') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-zinc-300 mb-1">6-digit WhatsApp code</label>
                      <div className="flex flex-col sm:flex-row items-stretch gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          value={twoFaOtp.otpCode}
                          onChange={(e) => twoFaOtp.setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="123456"
                          disabled={twoFaOtp.isVerified}
                          className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-zinc-800 outline-none focus:ring-2 focus:ring-amber-300 tracking-[0.4em] font-mono disabled:bg-gray-50 dark:bg-zinc-900/50"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={twoFaOtp.confirmOtp}
                          disabled={twoFaOtp.isBusy || twoFaOtp.isVerified || twoFaOtp.otpCode.length !== 6}
                          className="bg-amber-600 hover:bg-amber-700 text-white"
                        >
                          {twoFaOtp.phase === 'verifying' ? <Loader2 className="w-4 h-4 animate-spin" /> : twoFaOtp.isVerified ? <Check className="w-4 h-4" /> : 'Verify'}
                        </Button>
                      </div>
                    </div>
                  )}

                  {twoFaOtp.otpError && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> {twoFaOtp.otpError}
                    </p>
                  )}

                  <Button
                    onClick={handleEnable2FA}
                    disabled={!canEnable2FA || actionLoading === 'enable-2fa'}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                  >
                    {actionLoading === 'enable-2fa' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                    Turn on 2FA
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── CHANGE PASSWORD (Email Reset Flow) ─────────────────── */}
        {activeTab === 'password' && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-6">
              {resetEmailSent ? (
                /* ── Step 2: Check Your Email ── */
                <div className="text-center">
                  <div className="bg-purple-100 rounded-full p-5 w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                    <Mail className="w-12 h-12 text-purple-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-zinc-100 mb-2">Check Your Email</h3>
                  <p className="text-gray-500 dark:text-zinc-500 dark:text-zinc-400 text-sm mb-6">
                    We've sent a password reset link to<br />
                    <strong className="text-gray-900 dark:text-zinc-100">{resetEmail}</strong>
                  </p>

                  {/* Instructions */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
                    <div className="flex gap-3">
                      <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-gray-700 dark:text-zinc-300">
                        <p className="font-semibold mb-1">What to do next:</p>
                        <ul className="space-y-1 text-xs">
                          <li>• Open the email and click the reset link</li>
                          <li>• Set your new password on the page that opens</li>
                          <li>• You'll be redirected back here once done</li>
                          <li>• The link expires in 1 hour</li>
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
                    className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm transition-colors mb-3"
                  >
                    <Mail className="w-4 h-4" />
                    Open Email App
                  </a>

                  {/* Resend */}
                  <Button
                    onClick={handleResendResetEmail}
                    disabled={resendCountdown > 0 || sendingReset}
                    variant="outline"
                    className="w-full mb-3"
                  >
                    {sendingReset ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Sending...</>
                    ) : resendCountdown > 0 ? (
                      <><Clock className="w-4 h-4 mr-2" /> Resend in {resendCountdown}s</>
                    ) : (
                      'Resend Email'
                    )}
                  </Button>

                  {/* Didn't receive hint */}
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-2">
                    Didn't receive the email? Check your spam folder,<br />
                    or try with a different email address.
                  </p>
                  <button
                    onClick={() => setResetEmailSent(false)}
                    className="text-xs text-blue-600 hover:underline mt-2"
                  >
                    Try another email address
                  </button>
                </div>
              ) : (
                /* ── Step 1: Enter Email ── */
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
                      <Key className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-zinc-100">Reset Password</h3>
                      <p className="text-sm text-gray-500 dark:text-zinc-500 dark:text-zinc-400">We'll send a reset link to your email</p>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-zinc-400 mb-5">
                    Enter the email address associated with your account and we'll send you a link to reset your password.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1.5">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-zinc-500" />
                        <input
                          type="email"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-zinc-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="your.email@example.com"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={handleSendResetEmail}
                      disabled={sendingReset || !resetEmail}
                      className="w-full py-3 h-12 rounded-xl bg-blue-600 hover:bg-blue-700"
                    >
                      {sendingReset ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Sending...</>
                      ) : (
                        'Send Reset Link'
                      )}
                    </Button>
                  </div>

                  {/* Google sign-in notice */}
                  <div className="mt-5 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <p className="text-xs text-amber-800 flex items-start gap-2">
                      <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>Signed up with Google?</strong> Your password is managed by Google.
                        You can still set a password here to use email sign-in as an alternative.
                      </span>
                    </p>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── LOGIN HISTORY ───────────────────── */}
        {activeTab === 'login-history' && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            {/* Timeline */}
            <div className="space-y-0">
              {loginHistory.length > 0 ? loginHistory.map((entry, index) => {
                const isExpanded = historyExpanded === entry.id;
                const isLast = index === loginHistory.length - 1;
                return (
                  <div key={entry.id} className="relative">
                    {/* Timeline connector line */}
                    {!isLast && (
                      <div className="absolute left-[18px] top-[40px] bottom-0 w-[2px] bg-gray-100 dark:bg-zinc-800" />
                    )}

                    <motion.div
                      layout
                      onClick={() => setHistoryExpanded(isExpanded ? null : entry.id)}
                      className={`relative flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-all hover:bg-gray-50 dark:bg-zinc-900/50 ${
                        isExpanded ? 'bg-gray-50 dark:bg-zinc-900/50' : ''
                      }`}
                    >
                      {/* Status dot */}
                      <div className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm border-2 border-white dark:border-zinc-800 ${
                        entry.status === 'success' ? 'bg-green-100 text-green-600' :
                        entry.status === 'failed' ? 'bg-red-100 text-red-600' :
                        'bg-amber-100 text-amber-600'
                      }`}>
                        {entry.status === 'success' ? <CheckCircle2 className="w-4 h-4" /> :
                         entry.status === 'failed' ? <XCircle className="w-4 h-4" /> :
                         <AlertTriangle className="w-4 h-4" />}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100 capitalize">
                              {entry.status === 'success' ? 'Successful Login' :
                               entry.status === 'failed' ? 'Failed Attempt' :
                               'Login Attempt'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-zinc-500 dark:text-zinc-400 mt-0.5">
                              {getLoginMethodLabel(entry.method)}
                              <span className="text-gray-300 mx-1">•</span>
                              {entry.browser || 'Unknown'} on {entry.os || 'Unknown'}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <p className="text-xs font-medium text-gray-700 dark:text-zinc-300">{formatRelativeTime(entry.timestamp)}</p>
                            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 ml-auto mt-0.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                        </div>

                        {/* Expanded details */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-zinc-800 space-y-2.5">
                                {/* Full timestamp */}
                                <div className="flex items-center gap-2 text-xs">
                                  <Clock className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 flex-shrink-0" />
                                  <span className="text-gray-600 dark:text-zinc-400">{formatFullTimestamp(entry.timestamp)}</span>
                                </div>

                                {/* Device info */}
                                <div className="flex items-center gap-2 text-xs">
                                  {entry.os?.includes('Android') || entry.os?.includes('iOS') ? (
                                    <Smartphone className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 flex-shrink-0" />
                                  ) : (
                                    <Monitor className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 flex-shrink-0" />
                                  )}
                                  <span className="text-gray-600 dark:text-zinc-400">
                                    {entry.device || 'Unknown Device'} — {entry.browser} / {entry.os}
                                  </span>
                                </div>

                                {/* IP Address */}
                                {entry.ipAddress && entry.ipAddress !== 'unknown' && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <Globe className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 flex-shrink-0" />
                                    <span className="text-gray-600 dark:text-zinc-400">IP: {entry.ipAddress}</span>
                                  </div>
                                )}

                                {/* Location */}
                                {entry.location && (entry.location.city || entry.location.country) && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <MapPin className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 flex-shrink-0" />
                                    <span className="text-gray-600 dark:text-zinc-400">
                                      {[entry.location.city, entry.location.region, entry.location.country].filter(Boolean).join(', ')}
                                    </span>
                                  </div>
                                )}

                                {/* Auth method */}
                                <div className="flex items-center gap-2 text-xs">
                                  <Key className="w-3.5 h-3.5 text-gray-400 dark:text-zinc-500 flex-shrink-0" />
                                  <span className="text-gray-600 dark:text-zinc-400">{getLoginMethodLabel(entry.method)}</span>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  </div>
                );
              }) : (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl p-10 text-center shadow-sm border border-gray-100 dark:border-zinc-800">
                  <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-zinc-900/50 mx-auto mb-4 flex items-center justify-center">
                    <Clock className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-sm font-medium text-gray-700 dark:text-zinc-300">No login history yet</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">Login events will appear here as they happen</p>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ─── ACCOUNT SETTINGS ────────────────── */}
        {activeTab === 'account' && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            {/* Account Info */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-gray-100 dark:border-zinc-800 p-5 mb-6">
              <h3 className="font-semibold text-gray-900 dark:text-zinc-100 mb-4">Account Information</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-600 dark:text-zinc-400">Email</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-zinc-100">{user?.email}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-600 dark:text-zinc-400">Account Type</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-zinc-100 capitalize">{userProfile?.role || 'User'}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-600 dark:text-zinc-400">Email Verified</span>
                  <span className={`text-sm font-medium flex items-center gap-1 ${user?.emailVerified ? 'text-green-600' : 'text-amber-600'}`}>
                    {user?.emailVerified ? <><CheckCircle2 className="w-4 h-4" /> Verified</> : <><AlertCircle className="w-4 h-4" /> Not Verified</>}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-600 dark:text-zinc-400">Phone Verified</span>
                  <span className={`text-sm font-medium flex items-center gap-1 ${isPhoneVerified ? 'text-green-600' : 'text-gray-400 dark:text-zinc-500'}`}>
                    {isPhoneVerified ? <><CheckCircle2 className="w-4 h-4" /> Verified</> : 'Not set'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-50">
                  <span className="text-sm text-gray-600 dark:text-zinc-400">Phone Number</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-zinc-100">
                      {(userProfile?.whatsappNumber || userProfile?.phone)
                        ? `+91 ${(userProfile?.whatsappNumber || userProfile?.phone || '').replace(/\D/g, '').slice(-10)}`
                        : <span className="text-gray-400 dark:text-zinc-500">Not set</span>}
                    </span>
                    <button
                      onClick={() => { setChangePhoneOpen(true); setNewPhoneInput(''); }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      Change
                    </button>
                  </div>
                </div>
                {changePhoneOpen && (
                  <div className="py-3 border-b border-gray-50">
                    <p className="text-sm text-gray-600 dark:text-zinc-400 mb-3">Enter your new 10-digit WhatsApp number to receive a verification code.</p>
                    <div className="flex gap-2 mb-3">
                      <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 dark:text-zinc-300 border border-gray-200 dark:border-zinc-700 select-none">+91</div>
                      <input
                        type="tel"
                        maxLength={10}
                        placeholder="10-digit number"
                        value={newPhoneInput}
                        onChange={(e) => setNewPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        className="flex-1 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-400 outline-none"
                      />
                      <button
                        onClick={() => changePhoneOtp.sendOtp()}
                        disabled={newPhoneInput.length !== 10 || changePhoneOtp.isBusy || changePhoneOtp.isVerified}
                        className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors font-medium"
                      >
                        {changePhoneOtp.phase === 'sent' || changePhoneOtp.phase === 'verifying' || changePhoneOtp.phase === 'verified' ? 'Resend' : 'Send OTP'}
                      </button>
                    </div>
                    {(changePhoneOtp.phase === 'sent' || changePhoneOtp.phase === 'verifying') && !changePhoneOtp.isVerified && (
                      <div className="flex gap-2 mb-3">
                        <input
                          type="text"
                          maxLength={6}
                          placeholder="Enter 6-digit OTP"
                          value={changePhoneOtp.otpCode}
                          onChange={(e) => changePhoneOtp.setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="flex-1 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-400 outline-none"
                        />
                        <button
                          onClick={() => changePhoneOtp.confirmOtp()}
                          disabled={changePhoneOtp.otpCode.length !== 6 || changePhoneOtp.isBusy}
                          className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors font-medium"
                        >
                          Verify
                        </button>
                      </div>
                    )}
                    {changePhoneOtp.isVerified && (
                      <p className="text-sm text-green-600 flex items-center gap-1 mb-3"><CheckCircle2 className="w-4 h-4" /> OTP verified</p>
                    )}
                    {changePhoneOtp.otpError && (
                      <p className="text-sm text-red-500 mb-2">{changePhoneOtp.otpError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleChangePhone}
                        disabled={!changePhoneOtp.isVerified || actionLoading === 'change-phone'}
                        className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg disabled:opacity-50 hover:bg-green-700 transition-colors font-medium"
                      >
                        {actionLoading === 'change-phone' ? 'Saving…' : 'Save Number'}
                      </button>
                      <button
                        onClick={() => { setChangePhoneOpen(false); setNewPhoneInput(''); }}
                        className="px-4 py-2 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors font-medium text-gray-600 dark:text-zinc-300"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-gray-600 dark:text-zinc-400">2FA</span>
                  <span className={`text-sm font-medium flex items-center gap-1 ${settings?.twoFactorEnabled ? 'text-green-600' : 'text-gray-400 dark:text-zinc-500'}`}>
                    {settings?.twoFactorEnabled ? <><CheckCircle2 className="w-4 h-4" /> On (WhatsApp)</> : 'Off'}
                  </span>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-red-200 p-5">
              <h3 className="font-semibold text-red-900 mb-2">Danger Zone</h3>
              <p className="text-xs text-gray-500 dark:text-zinc-500 dark:text-zinc-400 mb-4">
                Deleting your account will remove all your data, orders, and rewards permanently after a 30-day grace period.
              </p>

              {!showDeleteConfirm ? (
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  <UserX className="w-4 h-4 mr-2" /> Delete Account
                </Button>
              ) : (
                <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                  <p className="text-sm font-medium text-red-900 mb-3">Are you absolutely sure?</p>
                  <textarea
                    value={deleteReason}
                    onChange={(e) => setDeleteReason(e.target.value)}
                    placeholder="Optional: Tell us why you're leaving..."
                    className="w-full p-3 border border-red-200 rounded-lg text-sm resize-none h-20 focus:ring-2 focus:ring-red-400 outline-none mb-3"
                  />
                  <div className="flex gap-3">
                    <Button
                      onClick={handleDeleteAccount}
                      disabled={actionLoading === 'delete'}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      {actionLoading === 'delete' ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                      Delete My Account
                    </Button>
                    <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default SecurityPage;
