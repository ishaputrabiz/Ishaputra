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
        toast.success('Email verified successfully! Welcome to Ishaputra Botanicals!');
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
      <div className="min-h-screen flex items-center justify-center tx-paper">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (dismissed) {
    return null;
  }

  return (
    <div className="min-h-[100dvh] tx-paper flex flex-col items-center justify-center p-4">
      {/* Brand Logo */}
      <div className="mb-6">
        <img src={logo} alt="Ishaputra Botanicals" className="h-12 md:h-14 w-auto" />
      </div>

      <div className="relative w-full max-w-md bg-white/80 backdrop-blur-sm rounded-[var(--radius-card)] p-8 sm:p-10">
        {/* Close Button - just dismisses the card, no navigation */}
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-5 right-5 text-muted-foreground/70 hover:text-foreground transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {/* Email Icon with Purple Circle */}
        <div className="flex justify-center mb-6">
          <div className="relative w-28 h-28 rounded-full bg-primary flex items-center justify-center shadow-lg">
            {/* Pink dot indicator */}
            <div className="absolute top-2 right-2 w-4 h-4 bg-pink-500 rounded-full animate-pulse" />
            {/* Mail icon */}
            <Mail className="w-14 h-14 text-white" strokeWidth={2.5} />
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-semibold text-foreground mb-3" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
            Verify Your Email
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your email address is not verified yet. Please check your inbox and click the verification link.
          </p>
        </div>

        {/* Email Display */}
        <div className="mb-6 text-center">
          <p className="text-sm text-muted-foreground mb-2">Verification email sent to:</p>
          <p className="text-primary font-semibold text-base break-all">
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
            className="w-full h-12 bg-card border border-primary/50 text-primary hover:bg-primary/10 rounded-[10px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="w-full h-12 bg-primary hover:bg-primary/90 text-white rounded-[10px] font-semibold transition-all disabled:opacity-50"
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
        <div className="p-3 bg-highlight/10 rounded-lg border border-yellow-200 mb-5">
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
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Logout and try different account
          </button>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
