import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { AuthCard } from '@/components/auth/AuthCard';
import { AuthCardSkeleton } from '@/components/skeletons';
import { usePageMeta } from '@/hooks/usePageMeta';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '@/config/firebase';
import logo from '@/assets/dark.png';

const VerifyEmail = () => {
  const [resendCountdown, setResendCountdown] = useState(30);
  const [resendLoading, setResendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  const { user, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  usePageMeta({ title: 'Verify email', noindex: true });
  
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
            toast.success('Email already verified');
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
        // Email verification is no longer required: send users home
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
      toast.error('Your session has ended. Sign in again.');
      navigate('/login');
      return;
    }

    setResendLoading(true);
    try {
      await sendEmailVerification(currentUser);
      toast.success('Verification email sent. Check your inbox and spam folder.');
      startResendCountdown();
    } catch (err: any) {
      console.error('Resend verification error:', err);
      if (err.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Wait a few minutes and try again.');
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
        toast.error('Unable to send the email. Try again.');
      }
    } finally {
      setResendLoading(false);
    }
  };

  // Handle "I Have Verified" button click
  const handleVerifyCheck = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast.error('Your session has ended. Sign in again.');
      sessionStorage.removeItem('pendingVerificationEmail');
      navigate('/login');
      return;
    }

    setVerifyLoading(true);
    try {
      await currentUser.reload();
      
      if (currentUser.emailVerified) {
        sessionStorage.removeItem('pendingVerificationEmail');
        toast.success('Email verified. Welcome to Ishaputra Botanicals.');
        navigate('/account', { replace: true });
      } else {
        toast.error('Not verified yet. Open the link in your inbox first.');
      }
    } catch (err: any) {
      console.error('Verify check error:', err);
      toast.error('Unable to check right now. Try again.');
    } finally {
      setVerifyLoading(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      sessionStorage.removeItem('pendingVerificationEmail');
      await logout();
      toast.success('Signed out');
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout error:', err);
      toast.error('Unable to sign out. Try again.');
    }
  };

  // Email verification is switched off: the effect above sends every visitor
  // on (guests to sign in, signed-in shoppers home). Show the card's shape on
  // the paper background until it does. The card below is kept, restyled, for
  // when verification is switched back on.
  const verificationRequired: boolean = false;
  if (authLoading || !verificationRequired) {
    return (
      <main id="main" tabIndex={-1} className="flex min-h-[100dvh] items-center justify-center px-4 py-10 tx-paper outline-none">
        <AuthCardSkeleton label="One moment" />
      </main>
    );
  }

  return (
    <main id="main" tabIndex={-1} className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-4 py-10 tx-paper outline-none">
      <img src={logo} alt="Ishaputra Botanicals" className="h-12 w-auto md:h-14" />

      <AuthCard
        title="Verify your email"
        description="Your email address is not verified yet. Open the link we sent to your inbox."
        className="relative"
        footer={
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-10 items-center rounded-control px-2 font-medium text-foreground underline-offset-4 transition-colors duration-hover hover:text-primary hover:underline"
          >
            Sign out and use another account
          </button>
        }
      >
        <IconButton label="Close" className="absolute right-3 top-3" onClick={() => navigate('/', { replace: true })}>
          <X />
        </IconButton>

        <div className="mb-6 border-y border-foreground/[0.08] py-4 text-center">
          <p className="text-xs text-muted-foreground">We sent the link to</p>
          <p className="mt-1 [overflow-wrap:anywhere] text-base font-semibold text-foreground">{userEmail}</p>
        </div>

        <div className="flex flex-col gap-3">
          <Button onClick={handleVerifyCheck} disabled={verifyLoading} size="lg" className="w-full">
            {verifyLoading ? (
              <>
                <Spinner />
                Checking&hellip;
              </>
            ) : (
              'I have verified'
            )}
          </Button>

          <Button
            variant="outline"
            onClick={handleResendVerification}
            disabled={resendCountdown > 0 || resendLoading}
            className="w-full"
          >
            {resendLoading ? (
              <>
                <Spinner />
                Sending&hellip;
              </>
            ) : resendCountdown > 0 ? (
              <span className="tabular-nums">Resend in {resendCountdown}s</span>
            ) : (
              'Resend email'
            )}
          </Button>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          No email? Check your spam folder.
        </p>
      </AuthCard>
    </main>
  );
};

export default VerifyEmail;
