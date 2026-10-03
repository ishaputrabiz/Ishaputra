import React, { useState, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { AuthCard } from '@/components/auth/AuthCard';
import { AuthField } from '@/components/auth/AuthField';
import { ArrowLeft, Info, MailCheck } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { usePageMeta } from '@/hooks/usePageMeta';

// Rate limiting: max attempts per session
const MAX_RESET_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const ForgotPassword = () => {
  // The sign-in page passes the email typed there, so it isn't typed twice.
  const location = useLocation();
  const [email, setEmail] = useState(() => (location.state as { email?: string } | null)?.email ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const attemptCount = useRef(0);
  const lastAttemptTime = useRef<number>(0);

  const { resetPassword } = useAuth();

  usePageMeta({ title: 'Forgot password', noindex: true });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Enter a valid email address.');
      requestAnimationFrame(() => document.getElementById('forgot-email')?.focus());
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
      setError(`Too many attempts. Try again in ${remainingTime} minute${remainingTime > 1 ? 's' : ''}.`);
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
        setError('Too many reset requests. Wait a few minutes and try again.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Enter a valid email address.');
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

  const attemptsLeft = MAX_RESET_ATTEMPTS - attemptCount.current;

  return (
    <div className="flex min-h-screen flex-col tx-paper">
      <Header />
      <main id="main" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 py-10 outline-none sm:items-center md:py-16">
        {success ? (
          /* Success state */
          <div className="panel tx-sheet tx-contour mx-auto w-full max-w-md p-6 text-center sm:p-9">
            <div className="tx-slate mx-auto mb-5 grid h-14 w-14 place-items-center rounded-card text-highlight-soft">
              <MailCheck aria-hidden="true" className="size-6" />
            </div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground [text-wrap:balance]">
              Check your email
            </h1>
            <p role="status" className="mt-2 text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">
              If an account exists for <strong className="[overflow-wrap:anywhere] font-semibold text-foreground">{email}</strong>,
              we've sent a link to reset your password. Look in your inbox and spam folder.
            </p>

            <ul className="mt-5 list-disc space-y-1.5 border-t border-foreground/[0.08] pl-5 pt-5 text-left text-sm leading-relaxed text-muted-foreground marker:text-primary">
              <li>The link expires in 1 hour.</li>
              <li>For your security, we don't say whether an email is registered.</li>
            </ul>

            <div className="mt-6 flex flex-col gap-3">
              <Button asChild size="lg" className="w-full">
                <Link to="/account">Back to sign in</Link>
              </Button>
              <Button
                onClick={handleResend}
                disabled={resendCountdown > 0 || loading}
                variant="outline"
                className="w-full"
              >
                {loading ? (
                  <>
                    <Spinner />
                    Sending…
                  </>
                ) : resendCountdown > 0 ? (
                  <span className="tabular-nums">Resend in {resendCountdown}s</span>
                ) : (
                  'Resend email'
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* Form state */
          <AuthCard
            title="Forgot your password?"
            description="Enter your email and we'll send a reset link."
            footer={
              <Link
                to="/account"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-control px-2 font-medium text-foreground transition-colors duration-hover hover:text-primary"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
                Back to sign in
              </Link>
            }
          >
            {error && rateLimited && (
              <Notice tone="danger" compact className="mb-5">
                {error}
              </Notice>
            )}

            {attemptCount.current >= 2 && !rateLimited && (
              <Notice tone="warning" compact className="mb-5">
                You have {attemptsLeft} {attemptsLeft === 1 ? 'attempt' : 'attempts'} left.
              </Notice>
            )}

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
              <AuthField
                id="forgot-email"
                label="Email"
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={loading || rateLimited}
                autoComplete="email"
                inputMode="email"
                error={error && !rateLimited ? error : undefined}
              />

              <Button type="submit" size="lg" className="w-full" disabled={loading || rateLimited}>
                {loading ? (
                  <>
                    <Spinner />
                    Sending…
                  </>
                ) : (
                  'Send reset link'
                )}
              </Button>
            </form>

            <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <Info aria-hidden="true" className="mt-px size-4 shrink-0" />
              <span>
                <strong className="font-semibold text-foreground">Signed up with Google?</strong> Go back to sign in and
                continue with Google instead.
              </span>
            </p>
          </AuthCard>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default ForgotPassword;
