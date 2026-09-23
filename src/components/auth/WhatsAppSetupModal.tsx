import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, MessageCircle, AlertCircle, CheckCircle2 } from 'lucide-react';
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

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="w-[calc(100vw-1rem)] max-w-[min(24rem,calc(100vw-1rem))] rounded-[28px] border border-emerald-100/80 bg-white/95 p-4 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/95 sm:w-[calc(100vw-1.5rem)] sm:max-w-sm sm:p-6"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-0">
          <div className="flex items-start gap-3 pr-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shadow-inner shadow-emerald-100/70 flex-shrink-0 dark:bg-emerald-500/10 dark:text-emerald-300 dark:shadow-transparent">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[1.55rem] leading-none tracking-[-0.02em] text-zinc-950 dark:text-zinc-50">Add WhatsApp Number</DialogTitle>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Verify to receive order updates</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <p className="text-sm leading-7 text-zinc-600 dark:text-zinc-300">
            Verify your WhatsApp number to receive order updates and secure your account with
            two-factor authentication.
          </p>

          {/* Phone number input */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              WhatsApp number
            </label>
            <div className="rounded-[22px] border border-emerald-200/80 bg-emerald-50/40 p-2 dark:border-emerald-500/20 dark:bg-zinc-900/85">
              <div className="grid grid-cols-[68px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-emerald-200/80 bg-white dark:border-zinc-700 dark:bg-zinc-950">
                <span className="flex h-12 items-center justify-center border-r border-emerald-100 bg-emerald-50/70 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                  +91
                </span>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="10-digit number"
                  disabled={otp.isVerified}
                  className="h-12 min-w-0 bg-transparent px-4 text-base text-zinc-900 outline-none placeholder:text-zinc-400 disabled:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:disabled:text-zinc-500"
                />
              </div>
              <button
                type="button"
                onClick={otp.sendOtp}
                disabled={otp.isBusy || otp.isVerified || phone.length !== 10}
                className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:bg-emerald-200 disabled:text-emerald-700 disabled:opacity-100 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
              >
                {otp.phase === 'sending'
                  ? 'Sending…'
                  : otp.phase !== 'idle'
                  ? 'Resend code'
                  : 'Send code'}
              </button>
            </div>
          </div>

          {/* OTP input — shown after code is sent */}
          {(otp.phase === 'sent' || otp.phase === 'verifying' || otp.isVerified) && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-zinc-300 mb-1.5">
                6-digit WhatsApp code
              </label>
              <div className="flex flex-col sm:flex-row items-stretch gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp.otpCode}
                  onChange={(e) =>
                    otp.setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  placeholder="123456"
                  disabled={otp.isVerified}
                  className="h-12 flex-1 min-w-0 rounded-2xl border border-emerald-200 bg-white px-4 text-base tracking-[0.3em] font-mono text-center text-zinc-900 outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-emerald-500/40 dark:disabled:bg-zinc-900 dark:disabled:text-zinc-500"
                />
                <Button
                  type="button"
                  size="default"
                  onClick={otp.confirmOtp}
                  disabled={otp.isBusy || otp.isVerified || otp.otpCode.length !== 6}
                  className="h-12 rounded-2xl bg-emerald-600 px-5 text-white sm:min-w-[112px] flex-shrink-0 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400"
                >
                  {otp.phase === 'verifying' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : otp.isVerified ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    'Verify'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Verified badge */}
          {otp.isVerified && (
            <p className="flex items-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              Number verified successfully
            </p>
          )}

          {/* Error */}
          {otp.otpError && (
            <p className="flex items-start gap-1 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{otp.otpError}</span>
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="default"
              onClick={onSkip}
              className="h-12 flex-1 rounded-2xl border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Skip for now
            </Button>
            <Button
              type="button"
              size="default"
              onClick={handleContinue}
              disabled={!otp.isVerified}
              className="h-12 flex-1 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-zinc-950 dark:hover:bg-emerald-400"
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
