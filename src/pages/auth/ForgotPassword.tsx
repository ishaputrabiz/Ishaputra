import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, ArrowLeft, CheckCircle, AlertCircle, Shield, Clock, Info } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

// Rate limiting: max attempts per session
const MAX_RESET_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const attemptCount = useRef(0);
  const lastAttemptTime = useRef<number>(0);

  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    // Rate limiting check
    const now = Date.now();
    if (now - lastAttemptTime.current > RATE_LIMIT_WINDOW_MS) {
      // Reset counter after time window
      attemptCount.current = 0;
    }

    if (attemptCount.current >= MAX_RESET_ATTEMPTS) {
      setRateLimited(true);
      const remainingTime = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - lastAttemptTime.current)) / 60000);
      setError(`Too many attempts. Please try again in ${remainingTime} minute${remainingTime > 1 ? 's' : ''}.`);
      return;
    }

    setLoading(true);
    attemptCount.current += 1;
    lastAttemptTime.current = now;

    try {
      await resetPassword(email);
      
      // SECURITY: Always show success to prevent email enumeration
      // Even if user doesn't exist, show same message
      setSuccess(true);
      
      // Start 60-second countdown for resend
      startResendCountdown();
    } catch (err: any) {
      console.error('Reset password error:', err);
      
      // SECURITY: Generic error messages to prevent enumeration
      if (err.code === 'auth/too-many-requests') {
        setRateLimited(true);
        setError('Too many password reset requests. Please try again later.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        // For ALL other errors (including user-not-found), show generic success
        // This prevents attackers from discovering which emails are registered
        setSuccess(true);
        startResendCountdown();
      }
    } finally {
      setLoading(false);
    }
  };

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

  const handleResend = async () => {
    if (resendCountdown > 0) return;
    
    setLoading(true);
    try {
      await resetPassword(email);
      startResendCountdown();
    } catch (err) {
      console.error('Resend error:', err);
      // Silent fail for security
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen tx-paper">
      <Header />
      <div className="flex items-center justify-center py-20 px-4">
        <div className="w-full max-w-md">
          <div className="bg-card rounded-[var(--radius-card)] shadow-xl p-8">
            {success ? (
              /* Success State */
              <div className="text-center">
                <div className="bg-primary/10 rounded-full p-4 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-primary" />
                </div>
                <h1 className="text-2xl font-semibold text-foreground mb-4" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>Check Your Email</h1>
                <p className="text-muted-foreground mb-6">
                  If an account exists for <strong className="text-primary">{email}</strong>, 
                  we've sent a password reset link. Please check your inbox and spam folder.
                </p>

                {/* Security Info */}
                <div className="bg-primary/5 border border-primary/25 rounded-lg p-4 mb-6 text-left">
                  <div className="flex gap-3">
                    <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-foreground/80">
                      <p className="font-semibold mb-1">Security Notice:</p>
                      <ul className="space-y-1 text-xs">
                        <li>• The reset link expires in 1 hour</li>
                        <li>• For your security, we don't confirm if this email is registered</li>
                        <li>• Check spam folder if you don't see the email</li>
                        <li>• Didn't request this? Your account is still secure</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Resend Button */}
                <Button
                  onClick={handleResend}
                  disabled={resendCountdown > 0 || loading}
                  variant="outline"
                  className="w-full mb-4"
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : resendCountdown > 0 ? (
                    <>
                      <Clock className="mr-2 h-4 w-4" />
                      Resend in {resendCountdown}s
                    </>
                  ) : (
                    'Resend Email'
                  )}
                </Button>

                <Link to="/account">
                  <Button className="btn-copper w-full h-12 text-[12px] font-bold rounded-[6px]">
                    Back to Sign In
                  </Button>
                </Link>
              </div>
            ) : (
              /* Form State */
              <>
                {/* Header */}
                <div className="text-center mb-8">
                  <div className="bg-highlight/15 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                    <Mail className="h-10 w-10 text-highlight" />
                  </div>
                  <h1 className="text-3xl font-semibold text-foreground mb-2" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>Forgot Password?</h1>
                  <p className="text-muted-foreground">
                    No worries! Enter your email and we'll send you reset instructions.
                  </p>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex gap-3">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                  </div>
                )}

                {/* Rate Limit Warning */}
                {attemptCount.current >= 2 && !rateLimited && (
                  <div className="bg-highlight/10 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-6 flex gap-3">
                    <Info className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm">
                      You have {MAX_RESET_ATTEMPTS - attemptCount.current} attempt(s) remaining.
                    </span>
                  </div>
                )}

                {/* Reset Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <Label htmlFor="email" className="text-foreground/80 font-medium">Email Address</Label>
                    <div className="relative mt-2">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground/70" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your.email@example.com"
                        className="pl-10 h-12"
                        required
                        disabled={loading || rateLimited}
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="btn-copper w-full h-12 text-[12px] font-bold rounded-[6px]"
                    disabled={loading || rateLimited}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Sending Reset Link...
                      </>
                    ) : (
                      'Send Reset Link'
                    )}
                  </Button>
                </form>

                {/* Google Sign-in Notice */}
                <div className="mt-6 p-3 bg-primary/5 border border-primary/20 rounded-[8px]">
                  <p className="text-xs text-foreground/75 flex items-start gap-2">
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Signed up with Google?</strong> Use "Sign in with Google" on the login page instead.
                    </span>
                  </p>
                </div>

                {/* Back to Login */}
                <Link 
                  to="/account"
                  className="flex items-center justify-center gap-2 mt-6 text-muted-foreground hover:text-highlight transition-colors font-medium"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ForgotPassword;
