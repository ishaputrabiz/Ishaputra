import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { Spinner } from '@/components/ui/spinner';
import { MessageCircle, CircleCheck } from 'lucide-react';
import { useWhatsAppOtpVerification } from '@/hooks/useWhatsAppOtpVerification';

interface WhatsAppSetupModalProps {
  open: boolean;
  /** Called with the verified 10-digit phone number after OTP success */
  onSuccess: (phone: string) => void;
  onSkip: () => void;
}

const WhatsAppSetupModal = ({ open, onSuccess, onSkip }: WhatsAppSetupModalProps) => {
  const [phone, setPhone] = useState('');

  // Hook is enabled once the modal is open AND phone has 10 digits
  const otp = useWhatsAppOtpVerification(phone, open && phone.length === 10);

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    setPhone(digits);
  };

  const handleContinue = () => {
    if (!otp.isVerified) return;
    onSuccess(phone);
  };

  const codeSent = otp.phase === 'sent' || otp.phase === 'verifying' || otp.isVerified;

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
              <MessageCircle aria-hidden="true" className="size-5 text-highlight-soft" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <DialogTitle className="px-0 text-xl sm:pl-0 sm:pr-0">Add your WhatsApp number</DialogTitle>
              <DialogDescription className="mt-1">Get order updates and sign-in codes on WhatsApp.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Verify your number to protect your account with 2-step verification.
          </p>

          {/* Phone number input */}
          <div>
            <label htmlFor="whatsapp-setup-phone" className="mb-1.5 block text-xs font-medium text-foreground/80">
              WhatsApp number
            </label>
            <div className="flex h-12 overflow-hidden rounded-control border border-input bg-background transition-[border-color,box-shadow] duration-hover focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
              <span className="flex w-16 shrink-0 select-none items-center justify-center border-r border-input bg-foreground/[0.04] text-sm font-medium text-muted-foreground">
                +91
              </span>
              <input
                id="whatsapp-setup-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={10}
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="10-digit number"
                disabled={otp.isVerified}
                className="min-w-0 flex-1 bg-transparent px-4 text-base text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:text-muted-foreground"
              />
            </div>
            {!otp.isVerified && (
              <Button
                type="button"
                onClick={otp.sendOtp}
                disabled={otp.isBusy || otp.isVerified || phone.length !== 10}
                className="mt-2 w-full"
              >
                {otp.phase === 'sending' && <Spinner />}
                {otp.phase === 'sending'
                  ? 'Sending…'
                  : otp.phase !== 'idle'
                  ? 'Resend code'
                  : 'Send code'}
              </Button>
            )}
          </div>

          {/* OTP input: shown after the code is sent */}
          {codeSent && (
            <div>
              <label htmlFor="whatsapp-setup-code" className="mb-1.5 block text-xs font-medium text-foreground/80">
                6-digit WhatsApp code
              </label>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row">
                <input
                  id="whatsapp-setup-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={otp.otpCode}
                  onChange={(e) =>
                    otp.setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="123456"
                  disabled={otp.isVerified}
                  className="h-12 min-w-0 flex-1 rounded-control border border-input bg-background px-4 text-center font-mono text-base tracking-[0.3em] text-foreground transition-[border-color,box-shadow] duration-hover placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:text-muted-foreground"
                />
                <Button
                  type="button"
                  size="lg"
                  onClick={otp.confirmOtp}
                  disabled={otp.isBusy || otp.isVerified || otp.otpCode.length !== 6}
                  className="shrink-0 sm:min-w-[112px]"
                >
                  {otp.phase === 'verifying' ? (
                    <Spinner label="Checking the code" />
                  ) : otp.isVerified ? (
                    <CircleCheck aria-hidden="true" className="size-4" />
                  ) : null}
                  {otp.isVerified ? 'Verified' : 'Verify'}
                </Button>
              </div>
            </div>
          )}

          {/* Verified badge */}
          {otp.isVerified && (
            <Notice tone="success" compact>Number verified.</Notice>
          )}

          {/* Error */}
          {otp.otpError && (
            <Notice tone="danger" compact>{otp.otpError}</Notice>
          )}

          {/* Actions */}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={onSkip}
              className="w-full sm:w-auto sm:flex-1"
            >
              Skip for now
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={handleContinue}
              disabled={!otp.isVerified}
              className="w-full sm:w-auto sm:flex-1"
            >
              Continue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppSetupModal;
