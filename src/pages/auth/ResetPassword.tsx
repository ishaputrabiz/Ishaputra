// ============================================
// RESET PASSWORD PAGE
// Handles password reset from email link
// Production-grade security for eCommerce
// ============================================

import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { AuthCard } from '@/components/auth/AuthCard';
import { AuthField } from '@/components/auth/AuthField';
import { AuthCardSkeleton } from '@/components/skeletons';
import { Info, Link2Off, ShieldCheck } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { usePageMeta } from '@/hooks/usePageMeta';
import { calculatePasswordStrength, validatePassword } from '@/lib/passwordValidation';
import type { PasswordStrengthResult } from '@/lib/passwordValidation';
import { toast } from 'sonner';
import PasswordStrengthMeter from './PasswordStrengthMeter';

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // URL parameters from Firebase email link
  const oobCode = searchParams.get('oobCode'); // Reset token
  const mode = searchParams.get('mode'); // Should be 'resetPassword'

  // State
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrengthResult | null>(null);
  const [validToken, setValidToken] = useState(false);

  usePageMeta({ title: 'Reset password', noindex: true });

  // After a reset the visitor is signed out, so sign-in is the next step.
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goToSignIn = () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
    navigate('/login', {
      state: { passwordUpdated: true, message: 'Password updated. Sign in with your new password.', type: 'success' },
    });
  };
  useEffect(() => () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current);
  }, []);

  // Verify the reset code on mount
  useEffect(() => {
    const verifyCode = async () => {
      if (!oobCode || mode !== 'resetPassword') {
        setError('This reset link is incomplete. Request a new one.');
        setVerifying(false);
        return;
      }

      try {
        // Verify the code and get the email
        const userEmail = await verifyPasswordResetCode(auth, oobCode);
        setEmail(userEmail);
        setValidToken(true);
      } catch (err: any) {
        console.error('Verify code error:', err);
        
        if (err.code === 'auth/expired-action-code') {
          setError('This reset link has expired. Request a new one.');
        } else if (err.code === 'auth/invalid-action-code') {
          setError('This reset link is not valid or has already been used. Request a new one.');
        } else {
          setError('Unable to check this reset link. Request a new one.');
        }
      } finally {
        setVerifying(false);
      }
    };

    verifyCode();
  }, [oobCode, mode]);

  // Calculate password strength on change
  useEffect(() => {
    if (newPassword) {
      const strength = calculatePasswordStrength(newPassword);
      setPasswordStrength(strength);
    } else {
      setPasswordStrength(null);
    }
  }, [newPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    // Validate password strength
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      setError(`${validation.errors[0]}.`);
      return;
    }

    // Security: Prevent weak passwords
    if (passwordStrength && passwordStrength.score < 2) {
      setError('This password is too easy to guess. Choose a stronger one.');
      return;
    }

    // Prevent password containing email
    if (newPassword.toLowerCase().includes(email.split('@')[0].toLowerCase())) {
      setError('Choose a password that does not contain your email address.');
      return;
    }

    if (!oobCode) {
      setError('This reset link is incomplete. Request a new one.');
      return;
    }

    setLoading(true);

    try {
      // Confirm the password reset
      await confirmPasswordReset(auth, oobCode, newPassword);
      
      setSuccess(true);
      toast.success('Password updated');

      // Take the visitor to sign in after 3 seconds (owner decision: /login, not /security)
      redirectTimer.current = setTimeout(goToSignIn, 3000);
    } catch (err: any) {
      console.error('Reset password error:', err);
      
      if (err.code === 'auth/expired-action-code') {
        setError('This reset link has expired. Request a new one.');
      } else if (err.code === 'auth/invalid-action-code') {
        setError('This reset link is not valid or has already been used. Request a new one.');
      } else if (err.code === 'auth/weak-password') {
        setError('This password is too easy to guess. Choose a stronger one.');
      } else {
        setError('Unable to reset your password. Try again, or request a new link.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Loading state: the card's shape while the link is checked
  if (verifying) {
    return (
      <div className="flex min-h-screen flex-col tx-paper">
        <Header />
        <main id="main" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 py-10 outline-none sm:items-center md:py-16">
          <AuthCardSkeleton label="Checking your reset link" />
        </main>
        <Footer />
      </div>
    );
  }

  // Invalid token state
  if (!validToken && !verifying) {
    return (
      <div className="flex min-h-screen flex-col tx-paper">
        <Header />
        <main id="main" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 py-10 outline-none sm:items-center md:py-16">
          <div className="panel tx-sheet tx-contour mx-auto w-full max-w-md p-6 text-center sm:p-9">
            <div className="tx-slate mx-auto mb-5 grid h-14 w-14 place-items-center rounded-card text-highlight-soft">
              <Link2Off aria-hidden="true" className="size-6" />
            </div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground [text-wrap:balance]">
              This link can&rsquo;t be used
            </h1>
            <p role="alert" className="mt-2 text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">
              {error}
            </p>
            <Button asChild size="lg" className="mt-6 w-full">
              <Link to="/forgot-password">Request new link</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="flex min-h-screen flex-col tx-paper">
        <Header />
        <main id="main" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 py-10 outline-none sm:items-center md:py-16">
          <div className="panel tx-sheet tx-contour mx-auto w-full max-w-md p-6 text-center sm:p-9">
            <div className="tx-slate mx-auto mb-5 grid h-14 w-14 place-items-center rounded-card text-highlight-soft">
              <ShieldCheck aria-hidden="true" className="size-6" />
            </div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground [text-wrap:balance]">
              Password updated
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">
              You can now sign in with your new password.
            </p>
            <ul className="mt-5 list-disc space-y-1.5 border-t border-foreground/[0.08] pl-5 pt-5 text-left text-sm leading-relaxed text-muted-foreground marker:text-primary">
              <li>You&rsquo;ve been signed out on your other devices.</li>
              <li>If you didn&rsquo;t make this change, contact support right away.</li>
            </ul>
            <p role="status" className="mt-6 text-sm text-muted-foreground">
              Taking you to sign in&hellip;
            </p>
            <Button onClick={goToSignIn} size="lg" className="mt-3 w-full">
              Sign in now
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Reset form
  return (
    <div className="flex min-h-screen flex-col tx-paper">
      <Header />
      <main id="main" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 py-10 outline-none sm:items-center md:py-16">
        <AuthCard
          title="Reset your password"
          description={
            <>
              Choose a new password for <strong className="[overflow-wrap:anywhere] font-semibold text-foreground">{email}</strong>.
            </>
          }
          footer={
            <p className="flex items-start justify-center gap-2 text-left text-xs leading-relaxed">
              <Info aria-hidden="true" className="mt-px size-4 shrink-0" />
              <span>After you reset it, you&rsquo;ll be signed out on all your devices.</span>
            </p>
          }
        >
          {error && (
            <Notice tone="danger" compact className="mb-5">
              {error}
            </Notice>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <AuthField
                id="reset-new-password"
                label="New password"
                type="password"
                name="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Create a password"
                required
                disabled={loading}
                autoComplete="new-password"
                aria-describedby="reset-password-rules"
              />
              <PasswordStrengthMeter password={newPassword} strength={passwordStrength} rulesId="reset-password-rules" />
            </div>

            <AuthField
              id="reset-confirm-password"
              label="Confirm password"
              type="password"
              name="confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Type it again"
              required
              disabled={loading}
              autoComplete="new-password"
            />

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={loading || !passwordStrength || !passwordStrength.meetsMinimum}
            >
              {loading ? (
                <>
                  <Spinner />
                  Resetting&hellip;
                </>
              ) : (
                'Reset password'
              )}
            </Button>
          </form>
        </AuthCard>
      </main>
      <Footer />
    </div>
  );
};

export default ResetPassword;
