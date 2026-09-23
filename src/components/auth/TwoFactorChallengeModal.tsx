import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, AlertCircle, MessageCircle, CheckCircle2, RefreshCw } from 'lucide-react';
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
        className="w-[calc(100vw-1.5rem)] max-w-sm p-5 sm:p-6 rounded-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-base">Verify Your Identity</DialogTitle>
              <p className="text-xs text-gray-500 mt-0.5">Two-factor authentication required</p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Info banner */}
          <div className="flex gap-2 rounded-lg bg-blue-50 border border-blue-100 p-3">
            <MessageCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              A 6-digit code{' '}
              {otp.phase !== 'idle' ? 'has been sent' : 'will be sent'} to your WhatsApp
              number ending in <strong>{maskedPhone}</strong>.
            </p>
          </div>

          {/* OTP Input */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Enter WhatsApp code
            </label>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp.otpCode}
                onChange={(e) => otp.setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="• • • • • •"
                disabled={otp.isVerified}
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-blue-300 tracking-[0.5em] font-mono text-center disabled:bg-gray-50 disabled:text-gray-500"
              />
              <Button
                type="button"
                size="sm"
                onClick={otp.confirmOtp}
                disabled={otp.isBusy || otp.isVerified || otp.otpCode.length !== 6}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3"
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

            {/* Resend button */}
            <button
              type="button"
              onClick={otp.sendOtp}
              disabled={otp.isBusy || otp.phase === 'sending'}
              className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:underline disabled:opacity-40 disabled:no-underline"
            >
              <RefreshCw className="w-3 h-3" />
              {otp.phase === 'sending' ? 'Sending…' : 'Resend code'}
            </button>
          </div>

          {/* Error */}
          {otp.otpError && (
            <p className="flex items-center gap-1 text-xs text-red-600">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {otp.otpError}
            </p>
          )}

          {/* Trust device checkbox */}
          {otp.isVerified && (
            <label className="flex items-center gap-2.5 cursor-pointer rounded-lg border border-gray-200 p-3">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">Trust this device</p>
                <p className="text-xs text-gray-500">Skip verification on this device next time</p>
              </div>
            </label>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleContinue}
              disabled={!otp.isVerified || trusting}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {trusting && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Continue
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TwoFactorChallengeModal;
