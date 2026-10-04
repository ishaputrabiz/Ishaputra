import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { AUTH_MAIN_CLASS, AuthBackLink, AuthCard } from '@/components/auth/AuthCard';
import { AuthField } from '@/components/auth/AuthField';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useWhatsAppOtpVerification } from '@/hooks/useWhatsAppOtpVerification';
import { usePageMeta } from '@/hooks/usePageMeta';
import { calculatePasswordStrength, validatePassword } from '@/lib/passwordValidation';
import { toast } from 'sonner';
import PasswordStrengthMeter from './PasswordStrengthMeter';

type SignupField = 'username' | 'email' | 'phone' | 'whatsapp' | 'password' | 'confirmPassword' | 'terms';

/** Fields in the order they appear on the form, so the first invalid one gets focus. */
const FIELD_ORDER: SignupField[] = ['username', 'email', 'phone', 'whatsapp', 'password', 'confirmPassword', 'terms'];

/** The control to focus when a field's check fails, so the error is read with it. */
const FIELD_IDS: Record<SignupField, string> = {
  username: 'signup-name',
  email: 'signup-email',
  phone: 'signup-phone',
  whatsapp: 'signup-phone',
  password: 'signup-password',
  confirmPassword: 'signup-confirm-password',
  terms: 'signup-terms',
};

const Signup = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [sameForWhatsApp, setSameForWhatsApp] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  /** One message per field, all shown at once (the Contact and Addresses pattern). */
  const [errors, setErrors] = useState<Partial<Record<SignupField, string>>>({});
  /** Errors that belong to no single field (network, server). */
  const [formError, setFormError] = useState('');
  const whatsappOtp = useWhatsAppOtpVerification(phone, sameForWhatsApp);

  const { signup } = useAuth();
  const navigate = useNavigate();

  usePageMeta({ title: 'Create account', noindex: true });

  const showErrors = (next: Partial<Record<SignupField, string>>) => {
    setErrors(next);
    const first = FIELD_ORDER.find((field) => next[field]);
    if (first) requestAnimationFrame(() => document.getElementById(FIELD_IDS[first])?.focus());
    return !first;
  };

  /** Clear a field's message as soon as it is edited. */
  const clearError = (...fields: SignupField[]) => {
    if (fields.some((field) => errors[field])) {
      setErrors((prev) => {
        const next = { ...prev };
        fields.forEach((field) => delete next[field]);
        return next;
      });
    }
  };

  // One password policy for the whole store: the same rules as password reset.
  // Every check runs, so all problems show on the first submit.
  const validateForm = () => {
    const next: Partial<Record<SignupField, string>> = {};
    if (username.trim().length < 3) {
      next.username = 'Enter your full name, at least 3 characters.';
    }
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!emailValid) {
      next.email = 'Enter a valid email address.';
    }
    const passwordCheck = validatePassword(password);
    const emailName = email.split('@')[0].toLowerCase();
    if (!passwordCheck.valid) {
      next.password = `${passwordCheck.errors[0]}.`;
    } else if (calculatePasswordStrength(password).score < 2) {
      next.password = 'This password is too easy to guess. Choose a stronger one.';
    } else if (emailName && password.toLowerCase().includes(emailName)) {
      next.password = 'Choose a password that does not contain your email address.';
    }
    if (password && !confirmPassword) {
      next.confirmPassword = 'Type your password again.';
    } else if (password !== confirmPassword) {
      next.confirmPassword = 'Passwords do not match.';
    }
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      next.phone = 'Enter a 10-digit Indian mobile number.';
    } else if (phone && sameForWhatsApp && !whatsappOtp.isVerified) {
      next.whatsapp = 'Verify your WhatsApp number before using it for order updates.';
    }
    if (!agreeTerms) {
      next.terms = 'Agree to the Terms and Privacy Policy to continue.';
    }
    return showErrors(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!validateForm()) return;

    setLoading(true);

    try {
      await signup(email, password, username, phone || undefined, sameForWhatsApp);
      toast.success('Account created. Welcome to Ishaputra Botanicals.');
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('Signup error:', err);
      if (err.code === 'auth/email-already-in-use') {
        showErrors({ email: 'An account with this email already exists. Sign in instead.' });
      } else if (err.code === 'auth/invalid-email') {
        showErrors({ email: 'Enter a valid email address.' });
      } else if (err.code === 'auth/weak-password') {
        showErrors({ password: 'This password is too weak. Choose a stronger one.' });
      } else {
        setFormError('Unable to create your account. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fieldError = (field: SignupField) => errors[field];

  return (
    <div className="flex min-h-[100dvh] flex-col tx-paper">
      <Header />
      <main id="main" tabIndex={-1} className={AUTH_MAIN_CLASS}>
        <AuthCard
          title="Create account"
          description="Join for rewards on every order."
          back={<AuthBackLink fallback="/login" />}
        >
          {/* Errors that belong to no single field (network, server) */}
          {formError && (
            <Notice tone="danger" compact className="mb-5">
              {formError}
            </Notice>
          )}

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <AuthField
              id="signup-name"
              label="Full name"
              name="name"
              autoComplete="name"
              value={username}
              onChange={(e) => { setUsername(e.target.value); clearError('username'); }}
              placeholder="Your name"
              required
              disabled={loading}
              error={fieldError('username')}
            />

            <AuthField
              id="signup-email"
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError('email'); }}
              placeholder="you@example.com"
              required
              disabled={loading}
              error={fieldError('email')}
            />

            <div className="flex flex-col gap-3">
              <AuthField
                id="signup-phone"
                label="Phone (optional)"
                type="tel"
                name="tel"
                autoComplete="tel-national"
                inputMode="numeric"
                value={phone}
                onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); clearError('phone', 'whatsapp'); }}
                placeholder="10-digit mobile number"
                disabled={loading}
                error={fieldError('phone')}
                aria-describedby={fieldError('whatsapp') ? 'signup-whatsapp-error' : undefined}
              />
              <div className="flex items-center gap-2.5">
                <Checkbox
                  id="signup-whatsapp"
                  checked={sameForWhatsApp}
                  onCheckedChange={(checked) => { setSameForWhatsApp(checked as boolean); clearError('whatsapp'); }}
                  disabled={loading}
                />
                <Label htmlFor="signup-whatsapp" className="cursor-pointer text-sm font-normal text-muted-foreground">
                  Same number for WhatsApp
                </Label>
              </div>
              {phone && sameForWhatsApp && (
                <div className="flex flex-col gap-3 rounded-card border border-foreground/10 bg-muted/50 p-3.5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-relaxed text-muted-foreground [text-wrap:pretty]">
                      Verify this number on WhatsApp so order updates can reach you there.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => void whatsappOtp.sendOtp()}
                      disabled={loading || whatsappOtp.isBusy}
                    >
                      {whatsappOtp.phase === 'sent' || whatsappOtp.isVerified ? 'Resend code' : 'Send code'}
                    </Button>
                  </div>

                  {(whatsappOtp.phase === 'sent' || whatsappOtp.isVerified) && (
                    <div className="flex flex-col gap-3">
                      <InputOTP
                        maxLength={6}
                        value={whatsappOtp.otpCode}
                        onChange={whatsappOtp.setOtpCode}
                        disabled={loading || whatsappOtp.isBusy || whatsappOtp.isVerified}
                        containerClassName="justify-center"
                        aria-label="6-digit WhatsApp code"
                        autoComplete="one-time-code"
                      >
                        <InputOTPGroup className="justify-center">
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p
                          role="status"
                          className={`text-xs ${whatsappOtp.isVerified ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                        >
                          {whatsappOtp.isVerified
                            ? 'WhatsApp number verified.'
                            : 'Enter the 6-digit code we sent to your WhatsApp.'}
                        </p>
                        {!whatsappOtp.isVerified && (
                          <Button
                            type="button"
                            size="sm"
                            className="shrink-0"
                            onClick={() => void whatsappOtp.confirmOtp()}
                            disabled={loading || whatsappOtp.isBusy || whatsappOtp.otpCode.length !== 6}
                          >
                            Verify code
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {whatsappOtp.otpError && (
                    <p role="alert" className="text-xs text-destructive">{whatsappOtp.otpError}</p>
                  )}
                  {fieldError('whatsapp') && (
                    <p id="signup-whatsapp-error" className="text-xs text-destructive">{fieldError('whatsapp')}</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <AuthField
                id="signup-password"
                label="Password"
                type="password"
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearError('password'); }}
                placeholder="Create a password"
                required
                disabled={loading}
                error={fieldError('password')}
                aria-describedby="signup-password-rules"
              />
              <PasswordStrengthMeter password={password} rulesId="signup-password-rules" />
            </div>

            <AuthField
              id="signup-confirm-password"
              label="Confirm password"
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); clearError('confirmPassword'); }}
              placeholder="Type it again"
              required
              disabled={loading}
              error={fieldError('confirmPassword')}
            />

            <div className="flex flex-col gap-1.5">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="signup-terms"
                  checked={agreeTerms}
                  onCheckedChange={(checked) => { setAgreeTerms(checked as boolean); clearError('terms'); }}
                  disabled={loading}
                  aria-invalid={errors.terms ? true : undefined}
                  aria-describedby={errors.terms ? 'signup-terms-error' : undefined}
                  className="mt-0.5"
                />
                <Label htmlFor="signup-terms" className="cursor-pointer text-sm font-normal leading-snug text-muted-foreground">
                  I agree to the{' '}
                  <Link to="/terms-conditions" className="font-medium text-primary underline-offset-4 hover:underline">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy-policy" className="font-medium text-primary underline-offset-4 hover:underline">
                    Privacy Policy
                  </Link>
                </Label>
              </div>
              {errors.terms && (
                <p id="signup-terms-error" className="pl-[30px] text-xs text-destructive">
                  {errors.terms}
                </p>
              )}
            </div>

            <Button type="submit" size="lg" className="w-full" disabled={loading || whatsappOtp.isBusy}>
              {loading ? (
                <>
                  <Spinner />
                  Creating account…
                </>
              ) : (
                'Create account'
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-foreground/10" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Already have an account?
            </span>
            <span className="h-px flex-1 bg-foreground/10" aria-hidden="true" />
          </div>

          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Sign in</Link>
          </Button>
        </AuthCard>
      </main>
      <Footer />
    </div>
  );
};

export default Signup;
