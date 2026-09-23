import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Eye, EyeOff, Loader2, Mail, Lock, User, Truck, X, RefreshCw, CheckCircle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '@/config/firebase';
import logo from '@/assets/dark.png';
import { getSecuritySettings, generateDeviceFingerprint, updateSecuritySettings } from '@/services/securityService';
import TwoFactorChallengeModal from '@/components/auth/TwoFactorChallengeModal';
import WhatsAppSetupModal from '@/components/auth/WhatsAppSetupModal';

type LoginTab = 'user' | 'delivery';

const Login = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as LoginTab | null;
  const [activeTab, setActiveTab] = useState<LoginTab>(tabFromUrl === 'delivery' ? 'delivery' : 'user');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Email verification modal states (kept for backwards-compat, never triggered)
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // 2FA / WhatsApp modal states
  const loginFlowRef = useRef<'idle' | 'checking' | '2fa' | 'whatsapp'>('idle');
  const [showTwoFactor, setShowTwoFactor] = useState(false);
  const [twoFactorPhone, setTwoFactorPhone] = useState('');
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [pendingDestination, setPendingDestination] = useState('/');
  const [pendingProfile, setPendingProfile] = useState<UserProfile | null>(null);
  const [isGoogleLogin, setIsGoogleLogin] = useState(false);

  const { login, loginWithGoogle, logout, updateUserProfile, user, userProfile, isDelivery, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // After a normal-user login, return to the page they came from (e.g. the
  // product they were viewing when prompted to log in). Falls back to home.
  // Callers pass it via navigate('/login', { state: { from } }) where `from`
  // is either a location object or a pathname string.
  const fromState = (location.state as { from?: { pathname?: string } | string } | null)?.from;
  const fromPath =
    (typeof fromState === 'string' ? fromState : fromState?.pathname) || '/';

  // Redirect if already logged in — skip when a login flow (2FA / WhatsApp) is in progress.
  useEffect(() => {
    if (!authLoading && user && userProfile && loginFlowRef.current === 'idle') {
      if (isDelivery) {
        navigate('/delivery/dashboard', { replace: true });
      } else if (userProfile.role === 'admin') {
        navigate('/admin/dashboard', { replace: true });
      } else {
        navigate(fromPath, { replace: true });
      }
    }
  }, [user, userProfile, isDelivery, authLoading, navigate]);

  // ─── Post-login gate: check 2FA and WhatsApp ─────────────────────────────
  const proceedAfterLogin = async (
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
              toast.error('Two-factor authentication is enabled but no WhatsApp number is on file.');
              await logout();
              loginFlowRef.current = 'idle';
              setLoading(false);
              return;
            }
            setPendingDestination(destination);
            setPendingProfile(profile);
            setIsGoogleLogin(isGoogle);
            setTwoFactorPhone(phone);
            loginFlowRef.current = '2fa';
            setShowTwoFactor(true);
            return;
          }
        }
      } catch {
        // 2FA check failed — proceed without it
      }

      // Check WhatsApp collection (Google sign-in users only)
      if (isGoogle && !profile.whatsappNumber) {
        setPendingDestination(destination);
        setPendingProfile(profile);
        loginFlowRef.current = 'whatsapp';
        setShowWhatsApp(true);
        return;
      }
    }

    navigate(destination, { replace: true });
  };

  const handleTwoFactorSuccess = async () => {
    setShowTwoFactor(false);
    if (isGoogleLogin && pendingProfile && !pendingProfile.whatsappNumber) {
      loginFlowRef.current = 'whatsapp';
      setShowWhatsApp(true);
    } else {
      loginFlowRef.current = 'idle';
      navigate(pendingDestination, { replace: true });
    }
  };

  const handleTwoFactorCancel = async () => {
    setShowTwoFactor(false);
    loginFlowRef.current = 'idle';
    setLoading(false);
    try { await logout(); } catch { /* ignore */ }
  };

  const handleWhatsAppSuccess = async (phone: string) => {
    setShowWhatsApp(false);
    loginFlowRef.current = 'idle';
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
    loginFlowRef.current = 'idle';
    navigate(pendingDestination, { replace: true });
  };

  // Load remembered delivery email
  useEffect(() => {
    if (activeTab === 'delivery') {
      const rememberedEmail = localStorage.getItem('delivery_remembered_email');
      if (rememberedEmail) {
        setEmail(rememberedEmail);
      }
    }
  }, [activeTab]);

  // Reset form when switching tabs
  const handleTabChange = (tab: LoginTab) => {
    setActiveTab(tab);
    setEmail('');
    setPassword('');
    setError('');
    // Update URL to reflect tab change
    if (tab === 'delivery') {
      setSearchParams({ tab: 'delivery' });
    } else {
      setSearchParams({});
    }
  };

  // Cleanup countdown timer
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  // Start countdown timer for resend button
  const startResendCountdown = () => {
    setResendCountdown(30);
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
    }
    countdownRef.current = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Handle resend verification email
  const handleResendVerification = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setResendLoading(true);
    try {
      await sendEmailVerification(currentUser);
      toast.success('Verification email sent again.');
      startResendCountdown();
    } catch (err: any) {
      console.error('Resend verification error:', err);
      if (err.code === 'auth/too-many-requests') {
        toast.error('Too many requests. Please wait before trying again.');
      } else {
        toast.error('Failed to send verification email. Please try again.');
      }
    } finally {
      setResendLoading(false);
    }
  };

  // Handle "I Have Verified" button click
  const handleVerifyCheck = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    setVerifyLoading(true);
    try {
      await currentUser.reload();
      
      if (currentUser.emailVerified) {
        toast.success('Email verified successfully!');
        setShowVerificationModal(false);
        
        // Redirect based on user role
        if (userProfile?.role === 'delivery') {
          navigate('/delivery/dashboard', { replace: true });
        } else if (userProfile?.role === 'admin') {
          navigate('/admin/dashboard', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      } else {
        toast.error('Email not verified yet. Please check your inbox.');
      }
    } catch (err: any) {
      console.error('Verify check error:', err);
      toast.error('Failed to check verification status. Please try again.');
    } finally {
      setVerifyLoading(false);
    }
  };

  // Handle logout from verification modal
  const handleLogoutFromModal = async () => {
    try {
      await logout();
      setShowVerificationModal(false);
      toast.success('Logged out successfully.');
    } catch (err) {
      console.error('Logout error:', err);
      toast.error('Failed to logout. Please try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    loginFlowRef.current = 'checking'; // prevent redirect useEffect

    try {
      const profile = await login(email, password);
      
      if (activeTab === 'delivery') {
        // Delivery login — skip 2FA/WhatsApp checks
        if (profile.role !== 'delivery') {
          setError('This login is for delivery partners only. Please use the User tab.');
          loginFlowRef.current = 'idle';
          setLoading(false);
          return;
        }
        localStorage.setItem('delivery_remembered_email', email);
        toast.success('Welcome back, delivery partner!');
        loginFlowRef.current = 'idle';
        navigate('/delivery/dashboard', { replace: true });
        return;
      }

      if (profile.role === 'delivery') {
        setError('Delivery partners should use the Delivery tab to login.');
        loginFlowRef.current = 'idle';
        setLoading(false);
        return;
      }

      const destination = profile.role === 'admin' ? '/admin/dashboard' : fromPath;
      await proceedAfterLogin(profile, destination, false);
      // Do NOT reset loading — either navigating away or showing a modal
    } catch (err: any) {
      loginFlowRef.current = 'idle';
      setLoading(false);
      console.error('Login error:', err);
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else {
        setError('Failed to login. Please check your credentials.');
      }
    }
  };

  const handleGoogleSignIn = async () => {
    if (activeTab === 'delivery') {
      setError('Google Sign-In is not available for delivery partners.');
      return;
    }
    
    setError('');
    setLoading(true);
    loginFlowRef.current = 'checking'; // prevent redirect useEffect
    try {
      const profile = await loginWithGoogle();
      const destination = profile.role === 'admin' ? '/admin/dashboard' : fromPath;
      await proceedAfterLogin(profile, destination, true);
      // Do NOT reset loading — either navigating away or showing a modal
    } catch (err: any) {
      loginFlowRef.current = 'idle';
      setLoading(false);
      console.error('Google sign-in error:', err);
      setError('Failed to sign in with Google. Please try again.');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col">
        <div className="flex-1 flex items-center justify-center py-8 px-4">
          <div className="w-full max-w-md">
          {/* Brand Logo */}
          <div className="flex justify-center mb-4">
            <Link to="/">
              <img src={logo} alt="Sreerasthu Silvers" className="h-12 md:h-14 w-auto" />
            </Link>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-6 md:p-8 relative">
            {/* Back Arrow — always visible */}
            <button
              onClick={() => navigate(-1)}
              className="mb-3 flex items-center gap-2 text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              <span className="text-sm font-medium">Back</span>
            </button>

            {/* Tabs */}
            <div className="flex mb-6 bg-gray-100 dark:bg-zinc-800 rounded-xl p-1">
              <button
                onClick={() => handleTabChange('user')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'user'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <User className="h-4 w-4" />
                User
              </button>
              <button
                onClick={() => handleTabChange('delivery')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'delivery'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Truck className="h-4 w-4" />
                Delivery
              </button>
            </div>

            {/* Header */}
            <div className="text-center mb-5">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-zinc-100 mb-2">Welcome Back</h1>
              <p className="text-gray-600 dark:text-zinc-400">
                {activeTab === 'user' 
                  ? 'Sign in to access your account' 
                  : 'Sign in to the Delivery Partner Portal'}
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                {error}
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email" className="text-gray-700 dark:text-zinc-300">Email</Label>
                <div className="relative mt-2">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-zinc-500" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="pl-10 h-12 border-gray-300 dark:border-zinc-700 rounded-lg"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="password" className="text-gray-700 dark:text-zinc-300">Password</Label>
                <div className="relative mt-2">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-zinc-500" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="pl-10 pr-10 h-12 border-gray-300 dark:border-zinc-700 rounded-lg"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:text-zinc-400"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 h-12 rounded-lg text-base font-medium"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            {/* Forgot Password Link */}
            <div className="text-center mt-4">
              <span className="text-gray-600 dark:text-zinc-400">Forgot Login Detail? </span>
              <Link 
                to="/forgot-password" 
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Reset
              </Link>
            </div>

            {/* Google Sign In - Only for User tab */}
            {activeTab === 'user' && (
              <>
                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-zinc-800"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white dark:bg-zinc-900 text-gray-500 dark:text-zinc-500">OR</span>
                  </div>
                </div>

                {/* Google Sign In Button */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full h-12 border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 dark:bg-zinc-900 rounded-lg font-medium"
                >
                  <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign in with Google
                </Button>
              </>
            )}

            {/* Delivery Help Text */}
            {activeTab === 'delivery' && (
              <p className="text-center text-sm text-gray-500 dark:text-zinc-500 mt-6">
                Contact admin if you need your delivery account credentials.
              </p>
            )}

            {/* Sign Up Link - Only for User tab */}
            {activeTab === 'user' && (
              <div className="text-center mt-4">
                <span className="text-gray-600 dark:text-zinc-400">Don't have an account? </span>
                <Link to="/signup" className="text-blue-600 hover:text-blue-700 font-medium">
                  Sign Up Now
                </Link>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      {/* 2FA Challenge Modal */}
      <TwoFactorChallengeModal
        open={showTwoFactor}
        phoneNumber={twoFactorPhone}
        userId={pendingProfile?.uid ?? ''}
        onSuccess={handleTwoFactorSuccess}
        onCancel={handleTwoFactorCancel}
      />

      {/* WhatsApp Setup Modal */}
      <WhatsAppSetupModal
        open={showWhatsApp}
        onSuccess={handleWhatsAppSuccess}
        onSkip={handleWhatsAppSkip}
      />

      {/* Email Verification Modal — kept but never triggered */}
      <Dialog open={showVerificationModal} onOpenChange={setShowVerificationModal}>
        <DialogContent className="sm:max-w-md rounded-2xl border-0 shadow-2xl backdrop-blur-sm bg-white/95 dark:bg-zinc-900/95 p-0 gap-0 overflow-hidden">
          {/* Close Button */}
          <button
            onClick={() => setShowVerificationModal(false)}
            className="absolute right-4 top-4 rounded-full p-1 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 dark:bg-zinc-800 transition-colors z-10"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="p-8">
            {/* Email Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center">
                <Mail className="h-10 w-10 text-blue-500" />
              </div>
            </div>

            {/* Header */}
            <DialogHeader className="text-center space-y-3 mb-6">
              <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-zinc-100 flex items-center justify-center gap-2">
                📩 Verify Your Email
              </DialogTitle>
              <DialogDescription className="text-gray-600 dark:text-zinc-400 text-base leading-relaxed">
                Your email address is not verified yet.
                <br />
                Please check your inbox and click the verification link.
              </DialogDescription>
            </DialogHeader>

            {/* User Email Display */}
            <div className="bg-blue-50 rounded-xl p-4 mb-6 text-center">
              <p className="text-sm text-gray-500 dark:text-zinc-500 mb-1">Verification email sent to:</p>
              <p className="text-blue-600 font-semibold text-lg break-all">
                {verificationEmail}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              {/* Resend Verification Email Button */}
              <Button
                variant="outline"
                onClick={handleResendVerification}
                disabled={resendCountdown > 0 || resendLoading}
                className="w-full h-12 border-blue-300 text-blue-600 hover:bg-blue-50 rounded-xl font-medium transition-all"
              >
                {resendLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Sending...
                  </>
                ) : resendCountdown > 0 ? (
                  <>
                    <RefreshCw className="mr-2 h-5 w-5" />
                    Resend in {resendCountdown}s
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-5 w-5" />
                    Resend Verification Email
                  </>
                )}
              </Button>

              {/* I Have Verified Button */}
              <Button
                onClick={handleVerifyCheck}
                disabled={verifyLoading}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all"
              >
                {verifyLoading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-5 w-5" />
                    I Have Verified
                  </>
                )}
              </Button>
            </div>

            {/* Tip */}
            <div className="mt-6 p-3 bg-amber-50 rounded-lg border border-amber-100">
              <p className="text-sm text-amber-700 text-center">
                💡 <span className="font-medium">Tip:</span> Didn't receive email? Check your spam folder.
              </p>
            </div>

            {/* Logout Link */}
            <div className="mt-6 text-center">
              <button
                onClick={handleLogoutFromModal}
                className="text-sm text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:text-zinc-300 underline transition-colors"
              >
                Logout and try different account
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Footer />
    </>
  );
};

export default Login;
