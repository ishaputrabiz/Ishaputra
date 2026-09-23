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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <Header />
      <div className="flex items-center justify-center py-20 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-8">
            {success ? (
              /* Success State */
              <div className="text-center">
                <div className="bg-green-100 rounded-full p-4 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-green-600" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mb-4">Check Your Email</h1>
                <p className="text-gray-600 dark:text-zinc-400 mb-6">
                  If an account exists for <strong className="text-blue-600">{email}</strong>, 
                  we've sent a password reset link. Please check your inbox and spam folder.
                </p>

                {/* Security Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
                  <div className="flex gap-3">
                    <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-gray-700 dark:text-zinc-300">
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
                  <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white">
                    Back to Sign In
                  </Button>
                </Link>
              </div>
            ) : (
              /* Form State */
              <>
                {/* Header */}
                <div className="text-center mb-8">
                  <div className="bg-amber-100 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                    <Mail className="h-10 w-10 text-amber-600" />
                  </div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-zinc-100 mb-2">Forgot Password?</h1>
                  <p className="text-gray-600 dark:text-zinc-400">
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
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg mb-6 flex gap-3">
                    <Info className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm">
                      You have {MAX_RESET_ATTEMPTS - attemptCount.current} attempt(s) remaining.
                    </span>
                  </div>
                )}

                {/* Reset Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <Label htmlFor="email" className="text-gray-700 dark:text-zinc-300 font-medium">Email Address</Label>
                    <div className="relative mt-2">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-zinc-500" />
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
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 h-12 font-semibold"
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
                <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <p className="text-xs text-blue-800 flex items-start gap-2">
                    <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Signed up with Google?</strong> Use "Sign in with Google" on the login page instead.
                    </span>
                  </p>
                </div>

                {/* Back to Login */}
                <Link 
                  to="/account"
                  className="flex items-center justify-center gap-2 mt-6 text-gray-600 dark:text-zinc-400 hover:text-amber-600 transition-colors font-medium"
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
