import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '@/config/firebase';
import logo from '@/assets/dark.png';

const VerifyEmail = () => {
  const [resendCountdown, setResendCountdown] = useState(30);
  const [resendLoading, setResendLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const { user, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get email from location state, sessionStorage, or current user
  const emailFromState = (location.state as any)?.email;
  const emailFromStorage = sessionStorage.getItem('pendingVerificationEmail');
  const userEmail = emailFromState || emailFromStorage || user?.email || '';

  // Reload user on mount to get fresh emailVerified status
  useEffect(() => {
    const checkVerification = async () => {
      if (auth.currentUser) {
        try {
          await auth.currentUser.reload();
          if (auth.currentUser.emailVerified) {
            sessionStorage.removeItem('pendingVerificationEmail');
            toast.success('Email already verified!');
            navigate('/account', { replace: true });
          }
        } catch (error) {
          console.error('Error checking verification:', error);
        }
      }
    };
    
    if (!authLoading) {
      if (!user) {
        navigate('/login', { replace: true });
      } else {
        // Email verification is no longer required — send users home
        sessionStorage.removeItem('pendingVerificationEmail');
        navigate('/', { replace: true });
      }
    }
  }, [user, authLoading, navigate]);

  // Cleanup countdown timer
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  // Start countdown on mount
  useEffect(() => {
    startResendCountdown();
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
    if (!currentUser) {
      toast.error('No user found. Please login again.');
      navigate('/login');
      return;
    }

    setResendLoading(true);
    try {
      await sendEmailVerification(currentUser);
      toast.success('Verification email sent again. Check your inbox & spam folder.');
      startResendCountdown();
    } catch (err: any) {
      console.error('Resend verification error:', err);
      if (err.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Please wait a few minutes before trying again.');
        // Set a longer cooldown (60s) on rate limit
        setResendCountdown(60);
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = setInterval(() => {
          setResendCountdown((prev) => {
            if (prev <= 1) {
              if (countdownRef.current) clearInterval(countdownRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
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
    if (!currentUser) {
      toast.error('No user found. Please login again.');
      sessionStorage.removeItem('pendingVerificationEmail');
      navigate('/login');
      return;
    }

    setVerifyLoading(true);
    try {
      await currentUser.reload();
      
      if (currentUser.emailVerified) {
        sessionStorage.removeItem('pendingVerificationEmail');
        toast.success('Email verified successfully! Welcome to Sreerasthu Silvers!');
        navigate('/account', { replace: true });
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

  // Handle logout
  const handleLogout = async () => {
    try {
      sessionStorage.removeItem('pendingVerificationEmail');
      await logout();
      toast.success('Logged out successfully.');
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
      toast.error('Failed to logout. Please try again.');
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
      </div>
    );
  }

  if (dismissed) {
    return null;
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 flex flex-col items-center justify-center p-4 font-poppins">
      {/* Brand Logo */}
      <div className="mb-6">
        <img src={logo} alt="Sreerasthu Silvers" className="h-12 md:h-14 w-auto" />
      </div>

      <div className="relative w-full max-w-md bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm rounded-2xl p-8 sm:p-10">
        {/* Close Button - just dismisses the card, no navigation */}
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-5 right-5 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:text-zinc-400 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {/* Email Icon with Purple Circle */}
        <div className="flex justify-center mb-6">
          <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
            {/* Pink dot indicator */}
            <div className="absolute top-2 right-2 w-4 h-4 bg-pink-500 rounded-full animate-pulse" />
            {/* Mail icon */}
            <Mail className="w-14 h-14 text-white" strokeWidth={2.5} />
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mb-3">
            Verify Your Email
          </h1>
          <p className="text-gray-600 dark:text-zinc-400 text-sm leading-relaxed">
            Your email address is not verified yet. Please check your inbox and click the verification link.
          </p>
        </div>

        {/* Email Display */}
        <div className="mb-6 text-center">
          <p className="text-sm text-gray-500 dark:text-zinc-500 mb-2">Verification email sent to:</p>
          <p className="text-blue-600 font-semibold text-base break-all">
            {userEmail}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 mb-5">
          {/* Resend Button */}
          <Button
            variant="outline"
            onClick={handleResendVerification}
            disabled={resendCountdown > 0 || resendLoading}
            className="w-full h-12 bg-white dark:bg-zinc-900 border border-blue-300 text-blue-600 hover:bg-blue-50 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* Verify Button */}
          <Button
            onClick={handleVerifyCheck}
            disabled={verifyLoading}
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50"
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

        {/* Tip Box */}
        <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 mb-5">
          <p className="text-xs text-yellow-800 text-center flex items-start justify-center gap-2">
            <span className="text-base">💡</span>
            <span>
              <span className="font-semibold">Tip:</span> Didn't receive email? Check your spam folder.
            </span>
          </p>
        </div>

        {/* Logout Link */}
        <div className="text-center">
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:text-zinc-300 transition-colors underline"
          >
            Logout and try different account
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
