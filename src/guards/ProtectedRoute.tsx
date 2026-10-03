import React, { useState, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Lightbulb, Mail, RefreshCw, CheckCircle } from 'lucide-react';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { PanelSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
  requireEmailVerification?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  redirectTo = '/login',
  requireEmailVerification = false
}) => {
  const { user, userProfile, logout, loading } = useAuth();
  const location = useLocation();
  
  // Email verification modal states
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup countdown timer
  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  // Check for email verification when user is loaded
  useEffect(() => {
    if (!loading && user && requireEmailVerification && !user.emailVerified) {
      setShowVerificationModal(true);
    }
  }, [loading, user, requireEmailVerification]);

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
        toast.success('Email verified');
        setShowVerificationModal(false);
        // Force re-render by reloading the page
        window.location.reload();
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
      toast.success('Signed out');
    } catch (err) {
      console.error('Logout error:', err);
      toast.error('Could not sign out. Please try again.');
    }
  };

  // While Firebase restores the session: the page's shape, not a spinner.
  if (loading) {
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

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Show verification modal if email not verified
  if (requireEmailVerification && !user.emailVerified) {
    return (
      <>
        <div className="tx-paper min-h-dvh flex items-center justify-center px-4">
          <div className="text-center">
            <div className="tx-slate mx-auto mb-5 grid size-14 place-items-center rounded-card">
              <Mail aria-hidden="true" className="size-6 text-highlight-soft" />
            </div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground mb-2">Verify your email</h1>
            <p className="text-sm text-muted-foreground">Verify your email address to open this page.</p>
          </div>
        </div>

        {/* Email Verification Modal */}
        <Dialog open={showVerificationModal} onOpenChange={setShowVerificationModal}>
          <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
            <div className="p-6 sm:p-8">
              <div className="flex justify-center mb-5">
                <div className="tx-slate grid size-14 place-items-center rounded-card">
                  <Mail aria-hidden="true" className="size-6 text-highlight-soft" />
                </div>
              </div>

              <DialogHeader className="text-center sm:text-center gap-2 mb-6">
                <DialogTitle className="text-2xl px-8 sm:px-8">Verify your email</DialogTitle>
                <DialogDescription className="text-sm leading-relaxed">
                  Your email address is not verified yet. Open the link we sent to your inbox.
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-card bg-muted p-4 mb-6 text-center">
                <p className="text-xs text-muted-foreground mb-1">Verification email sent to</p>
                <p className="text-foreground font-semibold break-all">{user.email}</p>
              </div>

              <div className="flex flex-col gap-3">
                <Button onClick={handleVerifyCheck} disabled={verifyLoading} className="w-full">
                  {verifyLoading ? <Spinner /> : <CheckCircle aria-hidden="true" />}
                  {verifyLoading ? 'Checking' : 'I have verified'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleResendVerification}
                  disabled={resendCountdown > 0 || resendLoading}
                  className="w-full"
                >
                  {resendLoading ? <Spinner /> : <RefreshCw aria-hidden="true" />}
                  {resendLoading ? 'Sending' : resendCountdown > 0 ? `Resend in ${resendCountdown}s` : 'Resend email'}
                </Button>
              </div>

              <p className="mt-6 flex items-start justify-center gap-2 text-sm text-muted-foreground">
                <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-highlight" />
                <span>No email yet? Check your spam folder.</span>
              </p>

              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={handleLogoutFromModal}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Sign out and use another account
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
