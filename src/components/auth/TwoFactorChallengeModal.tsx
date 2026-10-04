import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { ShieldCheck, MessageCircle, CircleCheck, RefreshCw } from 'lucide-react';
import { useWhatsAppOtpVerification } from '@/hooks/useWhatsAppOtpVerification';
import { trustCurrentDevice } from '@/services/securityService';

interface TwoFactorChallengeModalProps {
  open: boolean;
  /** 10-digit Indian phone number stored in userProfile (no country code prefix) */
  phoneNumber: string;
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const TwoFactorChallengeModal = ({
  open,
  phoneNumber,
  userId,
  onSuccess,
  onCancel,
}: TwoFactorChallengeModalProps) => {
  const [trustDevice, setTrustDevice] = useState(false);
  const [trusting, setTrusting] = useState(false);

  const otp = useWhatsAppOtpVerification(phoneNumber, open);

  // Auto-send OTP when modal first opens
  useEffect(() => {
    if (open && phoneNumber.length >= 10 && otp.phase === 'idle') {
      otp.sendOtp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleContinue = async () => {
    if (!otp.isVerified) return;
    setTrusting(true);
    try {
      if (trustDevice) {
        await trustCurrentDevice(userId);
      }
      onSuccess();
    } catch {
      onSuccess(); // proceed even if trust-device fails
    } finally {
      setTrusting(false);
    }
  };

  const maskedPhone = phoneNumber.length >= 4
    ? `••••${phoneNumber.slice(-4)}`
    : '••••';

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        hideClose
        className="tx-sheet max-w-sm p-5 sm:p-6"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-left sm:text-left">
          <div className="flex items-start gap-3">
            <div className="tx-slate grid size-12 shrink-0 place-items-center rounded-card">
              <ShieldCheck aria-hidden="true" className="size-5 text-highlight-soft" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <DialogTitle className="px-0 text-xl sm:pl-0 sm:pr-0">Confirm it's you</DialogTitle>
              <DialogDescription className="mt-1">2-step verification is on for your account.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Info banner */}
          <Notice tone="info" icon={MessageCircle} compact>
            {otp.phase !== 'idle' ? 'We sent' : 'We will send'} a 6-digit code to your WhatsApp
            number ending in <strong className="font-semibold tabular-nums">{maskedPhone}</strong>.
          </Notice>

          {/* OTP Input */}
          <div>
            <label htmlFor="twofa-challenge-code" className="mb-1.5 block text-xs font-medium text-foreground/80">
              WhatsApp code
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id="twofa-challenge-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp.otpCode}
                onChange={(e) => otp.setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                disabled={otp.isVerified}
                className="h-11 min-w-0 flex-1 rounded-control border border-input bg-background px-3 text-center font-mono text-base tracking-[0.5em] text-foreground transition-[border-color,box-shadow] duration-hover placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:text-muted-foreground"
              />
              <Button
                type="button"
                onClick={otp.confirmOtp}
                disabled={otp.isBusy || otp.isVerified || otp.otpCode.length !== 6}
                className="shrink-0 px-4"
              >
                {otp.phase === 'verifying' ? (
                  <Spinner label="Checking the code" />
                ) : otp.isVerified ? (
                  <CircleCheck aria-hidden="true" className="size-4" />
                ) : null}
                {otp.isVerified ? 'Verified' : 'Verify'}
              </Button>
            </div>

            {/* Resend button */}
            {!otp.isVerified && (
              <button
                type="button"
                onClick={otp.sendOtp}
                disabled={otp.isBusy || otp.phase === 'sending'}
                className="-mx-1 mt-2 inline-flex min-h-6 items-center gap-1.5 rounded-control px-1 text-xs font-medium text-primary underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60 disabled:no-underline"
              >
                <RefreshCw aria-hidden="true" className="size-3" />
                {otp.phase === 'sending' ? 'Sending…' : 'Resend code'}
              </button>
            )}
          </div>

          {/* Error */}
          {otp.otpError && (
            <Notice tone="danger" compact>{otp.otpError}</Notice>
          )}

          {/* Trust device checkbox */}
          {otp.isVerified && (
            <div className="flex items-start gap-3 rounded-card border border-foreground/10 p-3">
              <Checkbox
                id="twofa-trust-device"
                checked={trustDevice}
                onCheckedChange={(v) => setTrustDevice(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="twofa-trust-device" className="cursor-pointer">
                <span className="block text-sm font-medium text-foreground">Trust this device</span>
                <span className="block text-xs text-muted-foreground">Skip the code on this device next time.</span>
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleContinue}
              disabled={!otp.isVerified || trusting}
              className="flex-1"
            >
              {trusting && <Spinner />}
              Continue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TwoFactorChallengeModal;
