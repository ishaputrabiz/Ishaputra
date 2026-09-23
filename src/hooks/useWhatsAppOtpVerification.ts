import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { normalizePhoneNumber, startWhatsAppOtp, verifyWhatsAppOtp } from '@/services/whatsappService';

type OtpPhase = 'idle' | 'sending' | 'sent' | 'verifying' | 'verified';

export const useWhatsAppOtpVerification = (phone: string, enabled: boolean) => {
  const normalizedPhone = enabled ? normalizePhoneNumber(phone) : '';
  const [phase, setPhase] = useState<OtpPhase>('idle');
  const [otpRef, setOtpRef] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [verifiedPhone, setVerifiedPhone] = useState('');

  useEffect(() => {
    if (!enabled || normalizedPhone !== verifiedPhone) {
      setPhase('idle');
      setOtpRef('');
      setOtpCode('');
      setOtpError('');
      if (!enabled) {
        setVerifiedPhone('');
      }
    }
  }, [enabled, normalizedPhone, verifiedPhone]);

  const isVerified = phase === 'verified' && normalizedPhone === verifiedPhone;
  const isBusy = phase === 'sending' || phase === 'verifying';

  const sendOtp = async () => {
    if (!enabled) return false;
    if (!/^91[6-9]\d{9}$/.test(normalizedPhone)) {
      setOtpError('Enter a valid 10-digit Indian WhatsApp number first.');
      return false;
    }

    setPhase('sending');
    setOtpError('');
    try {
      const data = await startWhatsAppOtp({ to: normalizedPhone });
      setOtpRef(data.otpRef);
      setOtpCode('');
      setPhase('sent');
      toast.success('Verification code sent on WhatsApp.');
      return true;
    } catch (err) {
      setPhase('idle');
      const msg = (err as Error).message || 'Failed to send WhatsApp verification code.';
      setOtpError(msg);
      // Surface the real server error so the user / dev can act on it
      console.error('[whatsapp-otp] sendOtp failed:', err);
      toast.error(msg);
      return false;
    }
  };

  const confirmOtp = async () => {
    if (!otpRef) {
      setOtpError('Send the verification code first.');
      return false;
    }
    if (!/^\d{6}$/.test(otpCode)) {
      setOtpError('Enter the 6-digit code from WhatsApp.');
      return false;
    }

    setPhase('verifying');
    setOtpError('');
    try {
      const data = await verifyWhatsAppOtp({ otpRef, otp: otpCode });
      if (!data.verified) {
        throw new Error('Verification failed.');
      }
      setVerifiedPhone(normalizedPhone);
      setPhase('verified');
      toast.success('WhatsApp number verified.');
      return true;
    } catch (err) {
      setPhase('sent');
      setOtpError((err as Error).message || 'Failed to verify WhatsApp code.');
      return false;
    }
  };

  return {
    phase,
    otpCode,
    otpError,
    isBusy,
    isVerified,
    setOtpCode,
    sendOtp,
    confirmOtp,
  };
};

export default useWhatsAppOtpVerification;