import React, { useState, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Mail, RefreshCw, CheckCircle, X } from 'lucide-react';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
        toast.success('Email verified successfully!');
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
      toast.success('Logged out successfully.');
    } catch (err) {
      console.error('Logout error:', err);
      toast.error('Failed to logout. Please try again.');
    }
  };

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-amber-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading...</p>
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
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
          <div className="text-center">
            <Mail className="h-16 w-16 text-blue-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Email Verification Required</h2>
            <p className="text-gray-600">Please verify your email to access this page.</p>
          </div>
        </div>

        {/* Email Verification Modal */}
        <Dialog open={showVerificationModal} onOpenChange={setShowVerificationModal}>
          <DialogContent className="sm:max-w-md rounded-2xl border-0 shadow-2xl backdrop-blur-sm bg-white/95 p-0 gap-0 overflow-hidden">
            {/* Close Button */}
            <button
              onClick={() => setShowVerificationModal(false)}
              className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors z-10"
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
                <DialogTitle className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-2">
                  📩 Verify Your Email
                </DialogTitle>
                <DialogDescription className="text-gray-600 text-base leading-relaxed">
                  Your email address is not verified yet.
                  <br />
                  Please check your inbox and click the verification link.
                </DialogDescription>
              </DialogHeader>

              {/* User Email Display */}
              <div className="bg-blue-50 rounded-xl p-4 mb-6 text-center">
                <p className="text-sm text-gray-500 mb-1">Verification email sent to:</p>
                <p className="text-blue-600 font-semibold text-lg break-all">
                  {user.email}
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
                  className="text-sm text-gray-500 hover:text-gray-700 underline transition-colors"
                >
                  Logout and try different account
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
