import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { DELIVERY_PARTNERS_ENABLED } from '@/config/features';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { IconButton } from '@/components/ui/icon-button';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { OrderStatusBadge } from '@/components/ui/status-badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AuthField } from '@/components/auth/AuthField';
import { AuthCardSkeleton, PanelSkeleton } from '@/components/skeletons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AUTH_MAIN_CLASS, AuthBackLink } from '@/components/auth/AuthCard';
import { EmptyState } from '@/components/EmptyState';
import Header from '@/components/Header';
import CategoryIconNav from '@/components/CategoryIconNav';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import { subscribeToUserOrders, Order } from '@/services/orderService';
import { useWhatsAppOtpVerification } from '@/hooks/useWhatsAppOtpVerification';
import { getSecuritySettings, generateDeviceFingerprint, updateSecuritySettings } from '@/services/securityService';
import { validatePassword } from '@/lib/passwordValidation';
import { formatINR, formatDateTime } from '@/lib/format';
import { fadeUp } from '@/lib/motion';
import TwoFactorChallengeModal from '@/components/auth/TwoFactorChallengeModal';
import WhatsAppSetupModal from '@/components/auth/WhatsAppSetupModal';
import { toast } from 'sonner';
import {
  User,
  MapPin,
  Shield,
  Heart,
  Package,
  LogOut,
  ChevronRight,
  MessageCircle,
  Truck,
  ExternalLink,
  ArrowLeft,
  Edit,
  Video,
  Wallet,
  SunMoon,
} from 'lucide-react';
import { SmartImage } from "@/components/ui/smart-image";

const HEADING_FONT = { fontFamily: 'var(--font-heading)', fontStretch: 'var(--font-heading-stretch)' } as const;

/** The full-page placeholder while auth resolves or a sign-in finishes: the sign-in card's shape, not a spinner. */
const SignInPlaceholder = () => (
  <div className="tx-paper flex min-h-dvh flex-col">
    <div className="h-[var(--sticky-top)] border-b border-foreground/[0.08] bg-background" />
    <div className={AUTH_MAIN_CLASS}>
      <AuthCardSkeleton label="Signing you in" />
    </div>
  </div>
);

const Account = () => {
  const { user, loading, logout, updateUserProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Login flow: 'idle' = normal | 'loading' = between login and checks (prevents flash) | '2fa' | 'whatsapp'
  const [loginFlow, setLoginFlow] = useState<'idle' | 'loading' | '2fa' | 'whatsapp'>('idle');
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [twoFactorPhone, setTwoFactorPhone] = useState('');
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [pendingDestination, setPendingDestination] = useState('/');
  const [pendingProfile, setPendingProfile] = useState<UserProfile | null>(null);
  const [isGoogleLogin, setIsGoogleLogin] = useState(false);

  const handleLoginStart = () => setLoginFlow('loading');
  const handleLoginError = () => setLoginFlow('idle');

  const handleLoginComplete = async (
    profile: UserProfile,
    destination: string,
    isGoogle: boolean
  ) => {
    if (profile.role === 'user') {
      // Check 2FA
      try {
        const settings = await getSecuritySettings(profile.uid);
        if (settings.twoFactorEnabled) {
          const fingerprint = generateDeviceFingerprint();
          if (!settings.trustedDevices.includes(fingerprint)) {
            const phone = profile.whatsappNumber || profile.phone || '';
            if (!phone) {
              toast.error('2-step verification is on, but there is no WhatsApp number on your account. Contact support to sign in.');
              await logout();
              setLoginFlow('idle');
              return;
            }
            setPendingDestination(destination);
            setPendingProfile(profile);
            setIsGoogleLogin(isGoogle);
            setTwoFactorPhone(phone);
            setLoginFlow('2fa');
            setShowTwoFactor(true);
            return;
          }
        }
      } catch {
        // 2FA check failed: proceed without it
      }

      // Check WhatsApp collection (Google sign-in users only)
      if (isGoogle && !profile.whatsappNumber) {
        setPendingDestination(destination);
        setPendingProfile(profile);
        setLoginFlow('whatsapp');
        setShowWhatsApp(true);
        return;
      }
    }

    navigate(destination, { replace: true });
  };

  const handleTwoFactorSuccess = async () => {
    setShowTwoFactor(false);
    if (isGoogleLogin && pendingProfile && !pendingProfile.whatsappNumber) {
      setLoginFlow('whatsapp');
      setShowWhatsApp(true);
    } else {
      setLoginFlow('idle');
      navigate(pendingDestination, { replace: true });
    }
  };

  const handleTwoFactorCancel = async () => {
    setShowTwoFactor(false);
    setLoginFlow('idle');
    try { await logout(); } catch { /* ignore */ }
  };

  const handleWhatsAppSuccess = async (phone: string) => {
    setShowWhatsApp(false);
    setLoginFlow('idle');
    try {
      await updateUserProfile({ whatsappNumber: phone });
      if (user?.uid) {
        await updateSecuritySettings(user.uid, { phoneVerified: true });
      }
    } catch { /* ignore */ }
    navigate(pendingDestination, { replace: true });
  };

  const handleWhatsAppSkip = () => {
    setShowWhatsApp(false);
    setLoginFlow('idle');
    navigate(pendingDestination, { replace: true });
  };

  // Auth loading state: the shape of the page that is about to appear
  if (loading) {
    const onSignInRoute = location.pathname === '/login' || location.pathname === '/auth/login';
    if (onSignInRoute) return <SignInPlaceholder />;
    return (
      <div aria-busy="true" className="tx-paper min-h-dvh">
        <span className="sr-only" role="status">Loading your account</span>
        <div className="h-[var(--sticky-top)] border-b border-foreground/[0.08] bg-background" />
        <div className="container-custom flex flex-col gap-5 py-8 md:py-12">
          <Skeleton className="h-8 w-48" />
          <PanelSkeleton lines={3} label="" />
          <PanelSkeleton lines={4} label="" />
        </div>
      </div>
    );
  }

  // Transition placeholder: prevents an AccountPage flash once Firebase has a user but the
  // 2-step / WhatsApp checks are still running. While there is no user yet the sign-in form
  // stays mounted, so its error message and typed email survive a failed attempt.
  if (loginFlow === 'loading' && user) {
    return <SignInPlaceholder />;
  }

  // 2FA modal: shown even when Firebase has signed the user in, gates navigation
  if (loginFlow === '2fa') {
    return (
      <>
        <SignInPlaceholder />
        <TwoFactorChallengeModal
          open={showTwoFactor}
          phoneNumber={twoFactorPhone}
          userId={pendingProfile?.uid ?? ''}
          onSuccess={handleTwoFactorSuccess}
          onCancel={handleTwoFactorCancel}
        />
      </>
    );
  }

  // WhatsApp setup modal
  if (loginFlow === 'whatsapp') {
    return (
      <>
        <SignInPlaceholder />
        <WhatsAppSetupModal
          open={showWhatsApp}
          onSuccess={handleWhatsAppSuccess}
          onSkip={handleWhatsAppSkip}
        />
      </>
    );
  }

  // If user is not authenticated, show login form
  if (!user) {
    return (
      <LoginForm
        onLoginStart={handleLoginStart}
        onLoginError={handleLoginError}
        onLoginComplete={handleLoginComplete}
      />
    );
  }

  // If user is authenticated and no login flow pending, show account page
  return <AccountPage />;
};

// Login Form Component
type LoginTab = 'user' | 'delivery';

interface LoginFormProps {
  onLoginStart: () => void;
  onLoginError: () => void;
  onLoginComplete: (profile: UserProfile, destination: string, isGoogle: boolean) => Promise<void>;
}

/** Screens that must never be a post-login destination, or login loops. */
const AUTH_PATHS = [
  '/login', '/signup', '/admin', '/auth', '/verify-email', '/forgot-password', '/reset-password', '/__',
];

/**
 * Where to land after signing in.
 *
 * ProtectedRoute sends `state.from` when it bounces a guest off a protected
 * page, and the product page sends it when "Add to Cart" needs an account.
 * That was being thrown away and everyone was dropped on the homepage - so a
 * shopper who clicked "Add to Cart" or opened checkout lost their place mid
 * purchase. Honour it when it points at a real in-app page; otherwise keep the
 * old behaviour (admins to their dashboard, everyone else home).
 */
const resolveDestination = (from: unknown, role: string | undefined): string => {
  const fallback = role === 'admin' ? '/admin/dashboard' : '/';
  const loc = from as { pathname?: string; search?: string; hash?: string } | null | undefined;
  const pathname = typeof loc?.pathname === 'string' ? loc.pathname : '';

  // In-app absolute paths only: the browser reads "//evil.com" as another site.
  if (!pathname.startsWith('/') || pathname.startsWith('//')) return fallback;
  if (AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return fallback;

  return `${pathname}${loc?.search || ''}${loc?.hash || ''}`;
};

/** Why a guest was sent here (state.reason from checkout, the cart drawer and ProtectedRoute). */
const REASON_COPY: Record<string, string> = {
  checkout: 'Sign in to check out. Your bag is saved.',
  cart: 'Sign in to check out. Your bag is saved.',
  wishlist: 'Sign in to see your saved items.',
};

/** Sign-up uses the same password policy as reset (owner decision AUTH-24). */
const PASSWORD_POLICY_HINT = 'At least 8 characters, with an uppercase and a lowercase letter, a number and a symbol.';

type ErrorField = 'email' | 'password' | 'name' | 'phone' | 'terms' | 'otp';

const LoginForm = ({ onLoginStart, onLoginError, onLoginComplete }: LoginFormProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const tabFromUrl = searchParams.get('tab') as LoginTab | null;
  const [activeTab, setActiveTab] = useState<LoginTab>(
    tabFromUrl === 'delivery' && DELIVERY_PARTNERS_ENABLED ? 'delivery' : 'user'
  );
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [sameForWhatsApp, setSameForWhatsApp] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [error, setError] = useState('');
  /** Which fields the current error is about (marked aria-invalid and tied to the message). */
  const [errorFields, setErrorFields] = useState<ErrorField[]>([]);
  const whatsappOtp = useWhatsAppOtpVerification(phone, activeTab === 'user' && isSignUp && sameForWhatsApp);

  const { loginWithGoogle, login, signup } = useAuth();
  const navigate = useNavigate();

  const navState = (location.state ?? {}) as { reason?: string; passwordUpdated?: boolean };
  const reasonCopy = navState.reason ? REASON_COPY[navState.reason] : undefined;
  const passwordUpdated = navState.passwordUpdated === true || navState.reason === 'password-updated';

  /** Text fields that can show their own error underneath (AuthField). */
  const INLINE_FIELDS: Partial<Record<ErrorField, string>> = {
    email: 'login-email', password: 'login-password', name: 'signup-name', phone: 'signup-phone',
  };

  /**
   * Show an error. One text field at fault: the message goes under that field and the
   * field gets focus. Anything else (wrong credentials, network, terms, WhatsApp code):
   * the banner above the form, announced, with every field it is about marked invalid.
   */
  const showError = (message: string, fields: ErrorField[] = []) => {
    setError(message);
    setErrorFields(fields);
    const inlineId = fields.length === 1 ? INLINE_FIELDS[fields[0]] : undefined;
    if (message && inlineId) {
      requestAnimationFrame(() => document.getElementById(inlineId)?.focus());
    }
  };
  const clearError = () => showError('');

  const inlineError = !!error && errorFields.length === 1 && !!INLINE_FIELDS[errorFields[0]];
  const bannerError = !!error && !inlineError;

  /** Error wiring for a field: its own message underneath, or invalid + described by the banner. */
  const fieldErrorProps = (field: ErrorField) => {
    if (!error || !errorFields.includes(field)) return {};
    if (inlineError) return { error };
    return { 'aria-invalid': true as const, 'aria-describedby': 'login-error' };
  };

  // Handle tab change
  const handleTabChange = (tab: LoginTab) => {
    setActiveTab(tab);
    setIsSignUp(false);
    setEmail('');
    setPassword('');
    setFullName('');
    setPhone('');
    clearError();
    // Update URL to reflect tab change
    if (tab === 'delivery') {
      setSearchParams({ tab: 'delivery' });
    } else {
      setSearchParams({});
    }
  };

  const handleGoogleSignIn = async () => {
    if (activeTab === 'delivery') {
      showError('Google sign-in is not available for delivery partners.');
      return;
    }

    clearError();
    setGoogleLoading(true);
    onLoginStart(); // Prevent AccountPage flash

    try {
      const profile = await loginWithGoogle();
      const destination = resolveDestination(location.state?.from, profile.role);
      await onLoginComplete(profile, destination, true);
      // Do NOT reset loading: navigating away or showing a modal
    } catch (err: any) {
      console.error('Google login error:', err);
      setGoogleLoading(false);
      onLoginError();

      if (err.code === 'auth/popup-closed-by-user') {
        showError('The Google window closed before sign-in finished. Try again.');
      } else if (err.code === 'auth/popup-blocked') {
        showError('Your browser blocked the Google window. Allow pop-ups for this site, then try again.');
      } else if (err.code === 'auth/unauthorized-domain') {
        showError('Google sign-in is not set up for this address. Contact support.');
      } else if (err.code === 'auth/operation-not-allowed') {
        showError('Google sign-in is turned off. Sign in with your email instead.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        showError('Another Google window is already open. Close it and try again.');
      } else if (err.code === 'auth/network-request-failed') {
        showError('Unable to reach Google. Check your connection and try again.');
      } else {
        showError('Unable to sign in with Google. Try again.');
      }
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (isSignUp && !fullName.trim()) {
      showError('Enter your full name.', ['name']);
      return;
    }

    if (!email) {
      showError('Enter your email address.', ['email']);
      return;
    }

    if (!password) {
      showError('Enter your password.', ['password']);
      return;
    }

    if (isSignUp && !validatePassword(password).valid) {
      showError(`Choose a stronger password: ${PASSWORD_POLICY_HINT.charAt(0).toLowerCase()}${PASSWORD_POLICY_HINT.slice(1)}`, ['password']);
      return;
    }

    if (isSignUp && phone && !/^[6-9]\d{9}$/.test(phone)) {
      showError('Enter a 10-digit mobile number starting with 6, 7, 8 or 9.', ['phone']);
      return;
    }

    if (isSignUp && sameForWhatsApp && phone && !whatsappOtp.isVerified) {
      showError('Verify your WhatsApp number with the code we send, then create your account.', ['otp']);
      return;
    }

    if (isSignUp && !agreeTerms) {
      showError('Agree to the Terms and Privacy Policy to create your account.', ['terms']);
      return;
    }

    setEmailLoading(true);
    onLoginStart(); // Prevent AccountPage flash: must run before any await that could trigger auth state change

    try {
      if (isSignUp) {
        await signup(email, password, fullName, phone || undefined, sameForWhatsApp);
        // Signup: skip 2FA/WhatsApp flow (brand-new account), but still return
        // to whatever the shopper was doing before the account was required.
        navigate(resolveDestination(location.state?.from, 'user'), { replace: true });
        // Don't reset emailLoading - navigating away
        return;
      } else {
        const profile = await login(email, password);

        // Handle delivery login
        if (activeTab === 'delivery') {
          if (profile.role !== 'delivery') {
            showError('This sign-in is for delivery partners only. Use the User tab.');
            setEmailLoading(false);
            onLoginError();
            return;
          }
          navigate('/delivery/dashboard');
          // Don't reset loading - navigating away
          return;
        }

        // Handle user login - check they're not delivery
        if (profile.role === 'delivery') {
          showError('Delivery partners sign in from the Delivery tab.');
          setEmailLoading(false);
          onLoginError();
          return;
        }

        const destination = resolveDestination(location.state?.from, profile.role);
        await onLoginComplete(profile, destination, false);
        // Do NOT reset loading: navigating away or showing a modal
        return;
      }
    } catch (err: any) {
      console.error('Email auth error:', err);
      setEmailLoading(false);
      onLoginError();

      if (err.code === 'auth/user-not-found') {
        showError('No account uses this email. Check it, or create an account.', ['email']);
      } else if (err.code === 'auth/wrong-password') {
        showError('That password is incorrect. Try again, or reset it.', ['password']);
      } else if (err.code === 'auth/invalid-credential') {
        showError('Email or password is incorrect. Check both and try again.', ['email', 'password']);
      } else if (err.code === 'auth/email-already-in-use') {
        showError('An account already uses this email. Sign in instead.', ['email']);
      } else if (err.code === 'auth/weak-password') {
        showError(`Choose a stronger password: ${PASSWORD_POLICY_HINT.charAt(0).toLowerCase()}${PASSWORD_POLICY_HINT.slice(1)}`, ['password']);
      } else if (err.code === 'auth/invalid-email') {
        showError('Enter a valid email address, like name@example.com.', ['email']);
      } else if (err.code === 'auth/too-many-requests') {
        showError('Too many attempts. Wait a few minutes, then try again.');
      } else if (err.code === 'auth/network-request-failed') {
        showError('Unable to connect. Check your connection and try again.');
      } else {
        showError(isSignUp ? 'Unable to create your account. Try again.' : 'Unable to sign in. Try again.');
      }
    }
  };

  const toggleSignUp = () => {
    setIsSignUp(!isSignUp);
    clearError();
  };

  const title = activeTab === 'delivery'
    ? 'Delivery partner sign in'
    : (isSignUp ? 'Create account' : 'Welcome back');
  const description = activeTab === 'delivery'
    ? 'Open your delivery dashboard.'
    : (isSignUp ? 'Sign up to save your bag, orders and addresses.' : 'Sign in to your account.');

  return (
    <div className="min-h-screen flex flex-col tx-paper">
      {/* Site Header */}
      <Header />

      {/* Content area */}
      <main id="main" tabIndex={-1} className={AUTH_MAIN_CLASS}>
        <motion.div
          initial={fadeUp.initial}
          animate={fadeUp.animate}
          transition={fadeUp.transition}
          className="panel tx-sheet tx-contour mx-auto w-full max-w-md p-6 sm:p-9"
        >
          {/* Back: the same control and place as every other auth card */}
          <AuthBackLink />

          {/* Tabs: the Delivery partner tab is hidden while the delivery system is off */}
          {DELIVERY_PARTNERS_ENABLED && (
            <div className="mb-6 flex gap-1 rounded-control bg-muted p-1">
              {([['user', 'User', User], ['delivery', 'Delivery', Truck]] as const).map(([tab, label, Icon]) => (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={activeTab === tab}
                  onClick={() => handleTabChange(tab)}
                  className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium transition-[background-color,color,box-shadow,transform] duration-press ease-out active:scale-[0.97] ${
                    activeTab === tab
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Header */}
          <div className="mb-6 flex flex-col gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground [text-wrap:balance]" style={HEADING_FONT}>
              {title}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">{description}</p>
          </div>

          {/* Why the visitor is here (checkout, cart, wishlist) or a finished password reset */}
          {(passwordUpdated || reasonCopy) && !bannerError && (
            <Notice
              tone={passwordUpdated ? 'success' : 'info'}
              compact
              className="mb-5"
            >
              {passwordUpdated ? 'Password updated. Sign in with your new password.' : reasonCopy}
            </Notice>
          )}

          {/* Error Message */}
          {bannerError && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} className="mb-5">
              <Notice id="login-error" tone="danger" compact>
                {error}
              </Notice>
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleEmailSignIn} noValidate className="flex flex-col gap-5">
            {/* Full Name and Phone: only for Sign Up (User tab only) */}
            {activeTab === 'user' && isSignUp && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-5"
              >
                <AuthField
                  id="signup-name"
                  name="name"
                  label="Full name"
                  autoComplete="name"
                  autoCapitalize="words"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  {...fieldErrorProps('name')}
                />

                <div className="flex flex-col gap-3">
                  <AuthField
                    id="signup-phone"
                    name="tel-national"
                    label="Mobile number (optional)"
                    type="tel"
                    autoComplete="tel-national"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="10-digit number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    {...fieldErrorProps('phone')}
                  />
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="signup-same-whatsapp"
                      checked={sameForWhatsApp}
                      onCheckedChange={(v) => setSameForWhatsApp(v === true)}
                    />
                    <label htmlFor="signup-same-whatsapp" className="text-sm text-muted-foreground">
                      Use this number for WhatsApp
                    </label>
                  </div>
                  {phone && sameForWhatsApp && (
                    <div className="flex flex-col gap-3 rounded-card border border-foreground/10 bg-muted/50 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          Verify this number on WhatsApp so order updates can reach you there.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => void whatsappOtp.sendOtp()}
                          disabled={emailLoading || whatsappOtp.isBusy}
                          {...fieldErrorProps('otp')}
                        >
                          {whatsappOtp.phase === 'sent' || whatsappOtp.isVerified ? 'Resend code' : 'Send code'}
                        </Button>
                      </div>

                      {(whatsappOtp.phase === 'sent' || whatsappOtp.isVerified) && (
                        <div className="flex flex-col gap-3">
                          <InputOTP
                            maxLength={6}
                            value={whatsappOtp.otpCode}
                            onChange={whatsappOtp.setOtpCode}
                            disabled={emailLoading || whatsappOtp.isBusy || whatsappOtp.isVerified}
                            containerClassName="justify-center"
                            aria-label="6-digit WhatsApp code"
                            autoComplete="one-time-code"
                            inputMode="numeric"
                          >
                            <InputOTPGroup className="justify-center">
                              <InputOTPSlot index={0} />
                              <InputOTPSlot index={1} />
                              <InputOTPSlot index={2} />
                              <InputOTPSlot index={3} />
                              <InputOTPSlot index={4} />
                              <InputOTPSlot index={5} />
                            </InputOTPGroup>
                          </InputOTP>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p
                              role="status"
                              className={`text-xs ${whatsappOtp.isVerified ? 'font-semibold text-status-success-fg' : 'text-muted-foreground'}`}
                            >
                              {whatsappOtp.isVerified
                                ? 'WhatsApp number verified.'
                                : 'Enter the 6-digit code we sent to your WhatsApp.'}
                            </p>
                            {!whatsappOtp.isVerified && (
                              <Button
                                type="button"
                                size="sm"
                                className="shrink-0"
                                onClick={() => void whatsappOtp.confirmOtp()}
                                disabled={emailLoading || whatsappOtp.isBusy || whatsappOtp.otpCode.length !== 6}
                              >
                                Verify code
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {whatsappOtp.otpError && (
                        <p role="alert" className="text-xs text-destructive">{whatsappOtp.otpError}</p>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Email */}
            <AuthField
              id="login-email"
              name="email"
              label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              {...fieldErrorProps('email')}
            />

            {/* Password. "Forgot password?" comes after the input in the DOM (so Tab goes
                email, password, then the link) and sits on the label row visually. */}
            <div className="relative">
              <AuthField
                id="login-password"
                name="password"
                label="Password"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                hint={isSignUp ? PASSWORD_POLICY_HINT : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                {...fieldErrorProps('password')}
              />
              {!isSignUp && activeTab === 'user' && (
                <Link
                  to="/forgot-password"
                  state={{ email }}
                  className="absolute -top-1 right-0 -mr-1 inline-flex min-h-6 items-center rounded-control px-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Forgot your password?
                </Link>
              )}
            </div>

            {/* Terms Agreement - User tab sign up only */}
            {activeTab === 'user' && isSignUp && (
              <div className="flex items-start gap-3">
                <Checkbox
                  id="signup-terms"
                  checked={agreeTerms}
                  onCheckedChange={(v) => setAgreeTerms(v === true)}
                  className="mt-0.5"
                  {...fieldErrorProps('terms')}
                />
                <label htmlFor="signup-terms" className="text-sm leading-relaxed text-muted-foreground">
                  I agree to the{' '}
                  <Link to="/terms-conditions" className="font-medium text-primary underline-offset-4 hover:underline">Terms</Link>
                  {' '}and{' '}
                  <Link to="/privacy-policy" className="font-medium text-primary underline-offset-4 hover:underline">Privacy Policy</Link>
                </label>
              </div>
            )}

            {/* Sign In / Sign Up Button */}
            <Button
              type="submit"
              size="lg"
              disabled={emailLoading || whatsappOtp.isBusy}
              aria-busy={emailLoading || undefined}
              className="mt-1 w-full"
            >
              {emailLoading && <Spinner />}
              {emailLoading
                ? (isSignUp ? 'Creating account…' : 'Signing in…')
                : (isSignUp ? 'Create account' : 'Sign in')}
            </Button>
          </form>

          {/* Divider - User tab only */}
          {activeTab === 'user' && (
            <div className="my-6 flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1 bg-foreground/[0.08]" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Or</span>
              <div className="h-px flex-1 bg-foreground/[0.08]" />
            </div>
          )}

          {/* Social Sign In - User tab only */}
          {activeTab === 'user' && (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              aria-busy={googleLoading || undefined}
              className="flex h-12 w-full items-center justify-center gap-3 rounded-control border border-input bg-background text-sm font-semibold text-foreground transition-[transform,background-color,border-color] duration-press ease-out hover:bg-muted active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {googleLoading ? (
                <Spinner />
              ) : (
                <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              )}
              {googleLoading ? 'Signing in…' : 'Continue with Google'}
            </button>
          )}

          {/* Toggle Sign In / Sign Up - User tab only */}
          {activeTab === 'user' && (
            <p className="mt-6 border-t border-foreground/[0.08] pt-5 text-center text-sm text-muted-foreground">
              {isSignUp ? 'Already have an account? ' : 'New here? '}
              <button
                type="button"
                onClick={toggleSignUp}
                className="-mx-1 inline-flex min-h-6 items-center rounded-control px-1 font-semibold text-primary underline-offset-4 hover:underline"
              >
                {isSignUp ? 'Sign in' : 'Create an account'}
              </button>
            </p>
          )}

          {/* Delivery Help Text */}
          {activeTab === 'delivery' && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Ask the store admin for your delivery account details.
            </p>
          )}
        </motion.div>
      </main>

      <Footer />
      {/* Mobile Bottom Nav */}
      <MobileBottomNav />
    </div>
  );
};

/** Order statuses that count as "current" (in progress). */
const CURRENT_STATUSES = ['pending', 'processing', 'packed', 'shipped', 'assigned', 'outForDelivery', 'picked'];

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

// Account Page Component
const AccountPage = () => {
  const navigate = useNavigate();
  const { logout, userProfile, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [selectedOrderTab, setSelectedOrderTab] = useState<'current' | 'all'>('current');
  const [isMobile, setIsMobile] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const signOutTriggerRef = useRef<HTMLElement | null>(null);

  // Update avatar URL when user or userProfile changes
  useEffect(() => {
    setAvatarUrl(userProfile?.avatar || user?.photoURL || null);
  }, [userProfile?.avatar, user?.photoURL]);

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

        // Check if it's an index error
        if (error.message?.includes('index') || error.message?.includes('requires an index')) {
          console.error('FIRESTORE INDEX REQUIRED: Please create the composite index for orders collection');
        }

        setOrdersLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user]);

  // Detect mobile
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /** Ask first (styled dialog); once confirmed, sign out straight away (one safeguard, no extra wait). */
  const handleLogout = () => {
    signOutTriggerRef.current = document.activeElement as HTMLElement | null;
    setConfirmSignOut(true);
  };

  const performLogout = async () => {
    try {
      await logout();
      toast.success('Signed out');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Unable to sign out. Try again.');
      throw error; // keeps the dialog open so the shopper can retry
    }
  };

  const signOutDialog = (
    <ConfirmDialog
      open={confirmSignOut}
      onOpenChange={setConfirmSignOut}
      title="Sign out?"
      description="You can sign back in any time. Your bag and saved items stay on your account."
      confirmLabel="Sign out"
      cancelLabel="Stay signed in"
      onConfirm={performLogout}
      returnFocusRef={signOutTriggerRef}
    />
  );

  const menuItems = [
    { id: 'orders', label: 'My orders', icon: Package, path: '/account' },
    { id: 'wallet', label: 'Wallet & rewards', icon: Wallet, path: '/wallet' },
    { id: 'videocalls', label: 'My video calls', icon: Video, path: '/my-video-calls' },
    { id: 'editProfile', label: 'Edit profile', icon: Edit, path: '/account/profile-edit' },
    { id: 'addresses', label: 'Your addresses', icon: MapPin, path: '/account/addresses' },
    { id: 'security', label: 'Sign-in & security', icon: Shield, path: '/security' },
    { id: 'saved', label: 'Saved items', icon: Heart, path: '/wishlist' },
    { id: 'support', label: 'Customer support', icon: MessageCircle, path: '/customer-support' },
  ];

  // Drawer-style menu for the mobile account page
  const accountMenu = [
    { label: 'My orders', icon: Package, href: '/account/orders' },
    { label: 'Wallet & rewards', icon: Wallet, href: '/wallet' },
    { label: 'My video calls', icon: Video, href: '/my-video-calls' },
    { label: 'Edit profile', icon: Edit, href: '/account/profile-edit' },
    { label: 'Your addresses', icon: MapPin, href: '/account/addresses' },
    { label: 'Sign-in & security', icon: Shield, href: '/security' },
    { label: 'Saved items', icon: Heart, href: '/wishlist' },
    { label: 'Customer support', icon: MessageCircle, href: '/customer-support' },
  ];

  // Filter orders based on selected tab
  const filteredOrders = orders.filter(order =>
    selectedOrderTab === 'current' ? CURRENT_STATUSES.includes(order.status) : true
  );

  const displayName = userProfile?.name || userProfile?.username || user?.displayName?.split(' ')[0] || 'Welcome';

  // Mobile view
  if (isMobile) {
    const rowClass =
      'focus-inset flex min-h-14 w-full items-center gap-4 border-b border-foreground/[0.08] px-5 py-4 text-left transition-colors duration-hover hover:bg-muted/60';
    return (
      <>
        <main id="main" tabIndex={-1} className="min-h-screen pt-2 tx-paper pb-20 outline-none">
          <div className="px-4 py-2">
            {/* Drawer-style top bar */}
            <div className="flex items-center justify-between py-2">
              <IconButton label="Back to home" className="-ml-2" onClick={() => navigate('/')}>
                <ArrowLeft aria-hidden="true" />
              </IconButton>
              <User aria-hidden="true" className="size-6 text-muted-foreground" />
            </div>

            {/* Member card */}
            <div className="mb-4 mt-1 relative">
              <div className="tx-slate tx-contour relative overflow-hidden rounded-panel p-5 flex items-center gap-4 text-charcoal-foreground shadow-[var(--shadow-panel)] dark:ring-1 dark:ring-highlight-soft/20">
                <div className="flex-shrink-0">
                  {avatarUrl ? (
                    <SmartImage
                      key={`avatar-${avatarUrl}-${user?.uid}`}
                      src={avatarUrl}
                      alt=""
                      className="w-[72px] h-[72px] rounded-full object-cover ring-1 ring-highlight-soft/50"
                      referrerPolicy="no-referrer" preset="thumb" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="grid w-[72px] h-[72px] place-items-center rounded-full border border-highlight-soft/45 bg-charcoal-foreground/5 text-3xl font-semibold text-highlight-soft"
                      style={HEADING_FONT}
                    >
                      {(userProfile?.name || userProfile?.username || user?.displayName || user?.email || '?').trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="eyebrow-no on-dark mb-1.5 !text-[9px]"><span>Ishaputra member</span></p>
                  <h1 className="text-xl font-semibold leading-tight break-words [overflow-wrap:anywhere]" style={HEADING_FONT}>
                    Hi, {displayName}
                  </h1>
                  <p className="text-charcoal-foreground/70 text-xs mt-0.5 mb-3 break-words [overflow-wrap:anywhere]">{user?.email}</p>
                  <Link
                    to="/account/profile-edit"
                    className="link-arrow relative !text-charcoal-foreground after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']"
                  >
                    View profile <ChevronRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Menu list: drawer style */}
            <nav aria-label="Account" className="panel tx-sheet overflow-hidden">
              {accountMenu.map((item) => (
                <Link key={item.label} to={item.href} className={rowClass}>
                  <item.icon aria-hidden="true" className="size-[22px] shrink-0 text-primary" />
                  <span className="text-[15px] font-medium text-foreground flex-1 tracking-wide">{item.label}</span>
                  <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
                </Link>
              ))}

              {/* Theme: Light / Dark / System (owner decision ACCT-31) */}
              <div className="flex min-h-14 items-center gap-4 border-b border-foreground/[0.08] px-5 py-2.5">
                <SunMoon aria-hidden="true" className="size-[22px] shrink-0 text-primary" />
                <span id="theme-label" className="text-[15px] font-medium text-foreground flex-1 tracking-wide">Theme</span>
                <ToggleGroup
                  type="single"
                  size="sm"
                  value={theme}
                  onValueChange={(v) => { if (v) setTheme(v as 'light' | 'dark' | 'system'); }}
                  aria-labelledby="theme-label"
                  className="shrink-0"
                >
                  {THEME_OPTIONS.map((opt) => (
                    <ToggleGroupItem key={opt.value} value={opt.value} className="h-9 px-2.5 text-xs">
                      {opt.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              {/* Logout */}
              <button type="button" onClick={handleLogout} className={`${rowClass} border-b-0`}>
                <LogOut aria-hidden="true" className="size-[22px] shrink-0 text-primary" />
                <span className="text-[15px] font-medium text-primary flex-1 tracking-wide">Sign out</span>
                <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
              </button>
            </nav>
          </div>
        </main>
        <MobileBottomNav />
        {signOutDialog}
      </>
    );
  }

  // Desktop view: sidebar layout
  const tabClass = (active: boolean) =>
    `-mb-px border-b-2 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] transition-colors duration-hover ${
      active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
    }`;

  return (
    <>
      <Header />
      <CategoryIconNav />
      <main id="main" tabIndex={-1} className="tx-paper pt-8 outline-none">
        <div className="container mx-auto px-6 pb-8">
          <div className="grid grid-cols-12 gap-6 -mt-4">
            {/* Sidebar */}
            <div className="col-span-3">
              <div className="panel tx-sheet p-6 sticky top-[var(--sticky-top)]">
                {/* User Info */}
                <div className="mb-6">
                  <p className="eyebrow-no mb-3"><span>Ishaputra member</span></p>
                  <h1 className="text-2xl font-semibold text-foreground mb-1" style={HEADING_FONT}>Your account</h1>
                  <p className="text-sm text-muted-foreground font-medium break-words [overflow-wrap:anywhere]">{userProfile?.username || 'User'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 break-words [overflow-wrap:anywhere]">{userProfile?.email || user?.email}</p>
                </div>

                {/* Menu Items */}
                <nav aria-label="Account" className="flex flex-col gap-1">
                  {menuItems.map((item) => {
                    const current = item.id === 'orders';
                    return (
                      <Link
                        key={item.id}
                        to={item.path}
                        aria-current={current ? 'page' : undefined}
                        className={`flex w-full items-center gap-3 rounded-control px-4 py-3 text-left text-sm font-medium transition-colors duration-hover ${
                          current
                            ? 'bg-primary/10 text-primary font-semibold shadow-[inset_2px_0_0_hsl(var(--primary))]'
                            : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground'
                        }`}
                      >
                        <item.icon aria-hidden="true" className="size-5 shrink-0" />
                        {item.label}
                      </Link>
                    );
                  })}
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-control px-4 py-3 text-left text-sm font-medium text-foreground/80 transition-colors duration-hover hover:bg-muted/60 hover:text-foreground"
                  >
                    <LogOut aria-hidden="true" className="size-5 shrink-0" />
                    Sign out
                  </button>
                </nav>
              </div>
            </div>

            {/* Main Content */}
            <div className="col-span-9">
              <section aria-labelledby="orders-heading" className="panel tx-sheet">
                <h2 id="orders-heading" className="sr-only">Your orders</h2>
                {/* Order Tabs */}
                <div className="border-b border-foreground/[0.08] px-6 pt-4">
                  <div className="flex gap-4" role="group" aria-label="Show orders">
                    <button
                      type="button"
                      aria-pressed={selectedOrderTab === 'current'}
                      onClick={() => setSelectedOrderTab('current')}
                      className={tabClass(selectedOrderTab === 'current')}
                    >
                      Current
                    </button>
                    <button
                      type="button"
                      aria-pressed={selectedOrderTab === 'all'}
                      onClick={() => setSelectedOrderTab('all')}
                      className={tabClass(selectedOrderTab === 'all')}
                    >
                      All orders
                    </button>
                  </div>
                </div>

                {/* Orders List */}
                <div className="p-6 flex flex-col gap-5">
                  {ordersLoading ? (
                    <div aria-busy="true" className="flex flex-col gap-5">
                      <span className="sr-only" role="status">Loading your orders</span>
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="flex gap-4 rounded-card border border-foreground/[0.08] p-4">
                          <Skeleton className="size-20 shrink-0 rounded-[8px]" />
                          <div className="flex flex-1 flex-col gap-2.5 pt-1">
                            <Skeleton className="h-4 w-1/2" />
                            <Skeleton className="h-3.5 w-1/4" />
                            <Skeleton className="h-3.5 w-1/5" />
                            <Skeleton className="h-6 w-48 rounded-chip" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    selectedOrderTab === 'current' && orders.length > 0 ? (
                      <EmptyState
                        icon={Package}
                        as="h3"
                        title="Nothing in progress"
                        description="Your delivered and past orders are under All orders."
                        action={{ label: 'All orders', onClick: () => setSelectedOrderTab('all') }}
                      />
                    ) : (
                      <EmptyState
                        icon={Package}
                        as="h3"
                        title="No orders yet"
                        description="Discover classical Ayurveda made for the modern man."
                        action={{ label: 'Start shopping', to: '/products' }}
                      />
                    )
                  ) : (
                    filteredOrders.map((order) => (
                      <article
                        key={order.id}
                        className="relative rounded-card border border-foreground/[0.08] bg-card/70 p-4 transition-[border-color,box-shadow] duration-hover hover:border-primary/35 hover:shadow-[var(--shadow-card-hover)] has-[a[data-card-link]:focus-visible]:outline has-[a[data-card-link]:focus-visible]:outline-2 has-[a[data-card-link]:focus-visible]:outline-offset-2 has-[a[data-card-link]:focus-visible]:outline-ring"
                        style={{ fontFamily: "var(--font-body)" }}
                      >
                        {/* Order Items Display */}
                        <div className="flex flex-col gap-4">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex gap-4">
                              <div className="tile-img w-20 h-20 flex-shrink-0 overflow-hidden">
                                <SmartImage src={item.image} alt="" className="w-full h-full object-cover" preset="thumb" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-base font-semibold text-foreground mb-1">
                                  {idx === 0 ? (
                                    // Stretched link: the whole card opens the order
                                    <Link
                                      to={`/account/orders/${order.id}`}
                                      data-card-link
                                      className="outline-none after:absolute after:inset-0 after:rounded-card after:content-['']"
                                    >
                                      {item.name}
                                    </Link>
                                  ) : (
                                    item.name
                                  )}
                                </h3>
                                <p className="text-sm text-muted-foreground tabular-nums">Price: {formatINR(item.price)}</p>
                                <p className="text-sm text-muted-foreground tabular-nums">Quantity: {item.quantity}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                  <OrderStatusBadge status={order.status} order={order} />
                                  <span aria-hidden="true" className="text-sm text-muted-foreground">·</span>
                                  <span className="text-sm text-muted-foreground tabular-nums">{formatDateTime(order.createdAt)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Tracking Information - Real-time updated */}
                        {(order.trackingId || order.carrier) && (
                          <div className="mt-4 flex items-center justify-between gap-3 border-t border-foreground/[0.08] pt-4">
                            <div className="flex items-center gap-3">
                              <div className="grid size-9 place-items-center rounded-full bg-primary/10">
                                <Truck aria-hidden="true" className="size-4 text-primary" />
                              </div>
                              <div>
                                {order.carrier && (
                                  <p className="text-sm font-medium text-foreground">{order.carrier}</p>
                                )}
                                {order.trackingId && (
                                  <p className="text-xs text-muted-foreground tabular-nums">Tracking ID {order.trackingId}</p>
                                )}
                              </div>
                            </div>
                            {order.trackingUrl && (
                              <a
                                href={order.trackingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="relative z-raised inline-flex h-9 items-center gap-1.5 rounded-control border border-input px-3 text-xs font-semibold text-foreground transition-[background-color,transform] duration-press ease-out hover:bg-muted active:scale-[0.97]"
                              >
                                Track package
                                <ExternalLink aria-hidden="true" className="size-3.5" />
                                <span className="sr-only"> (opens in a new tab)</span>
                              </a>
                            )}
                          </div>
                        )}

                        {/* OTP Display for Out for Delivery Orders */}
                        {order.status === 'outForDelivery' && order.delivery_otp && (
                          <div className="mt-4 flex items-center justify-between gap-3 border-t border-foreground/[0.08] pt-4">
                            <div>
                              <p className="text-sm font-semibold text-foreground">Delivery OTP</p>
                              <p className="text-xs text-muted-foreground mt-0.5">Share it with your delivery partner</p>
                            </div>
                            <p className="font-mono text-lg font-semibold tracking-[0.3em] text-foreground tabular-nums">{order.delivery_otp}</p>
                          </div>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
      {signOutDialog}
    </>
  );
};

export default Account;
