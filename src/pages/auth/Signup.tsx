import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Eye, EyeOff, Loader2, Mail, Lock, User, Phone } from 'lucide-react';
import { useWhatsAppOtpVerification } from '@/hooks/useWhatsAppOtpVerification';
import { toast } from 'sonner';
import logo from '@/assets/dark.png';

const Signup = () => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [sameForWhatsApp, setSameForWhatsApp] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const whatsappOtp = useWhatsAppOtpVerification(phone, sameForWhatsApp);

  const { signup } = useAuth();
  const navigate = useNavigate();

  const validateForm = () => {
    if (username.length < 3) {
      setError('Username must be at least 3 characters.');
      return false;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return false;
    }
    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return false;
    }
    if (phone && sameForWhatsApp && !whatsappOtp.isVerified) {
      setError('Verify your WhatsApp number before using it for order updates.');
      return false;
    }
    if (!agreeTerms) {
      setError('Please agree to the Terms and Privacy Policy.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) return;

    setLoading(true);

    try {
      await signup(email, password, username, phone || undefined, sameForWhatsApp);
      toast.success('Account created! Welcome to Sreerasthu Silvers.');
      navigate('/', { replace: true });
    } catch (err: any) {
      console.error('Signup error:', err);
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Use at least 6 characters.');
      } else {
        setError('Failed to create account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gray-50 dark:bg-zinc-900 flex flex-col">
      <div className="flex-1 flex items-center justify-center py-6 px-4">
        <div className="w-full max-w-md">
          {/* Brand Logo */}
          <div className="flex justify-center mb-4">
            <Link to="/">
              <img src={logo} alt="Sreerasthu Silvers" className="h-12 md:h-14 w-auto" />
            </Link>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-6 md:p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <h1 className="text-2xl md:text-3xl font-light text-gray-900 dark:text-zinc-100 mb-2">Create Account</h1>
              <p className="text-gray-600 dark:text-zinc-400">Join Sreerasthu Silvers today</p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
                {error}
              </div>
            )}

            {/* Signup Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="username" className="text-gray-700 dark:text-zinc-300">Username</Label>
                <div className="relative mt-2">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-zinc-500" />
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className="pl-10"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="email" className="text-gray-700 dark:text-zinc-300">Email Address</Label>
                <div className="relative mt-2">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-zinc-500" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="pl-10"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="phone" className="text-gray-700 dark:text-zinc-300">Phone Number</Label>
                <div className="relative mt-2">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-zinc-500" />
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="Enter your phone number"
                    className="pl-10"
                    disabled={loading}
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Checkbox
                    id="whatsapp"
                    checked={sameForWhatsApp}
                    onCheckedChange={(checked) => setSameForWhatsApp(checked as boolean)}
                    disabled={loading}
                  />
                  <Label htmlFor="whatsapp" className="text-xs text-gray-500 dark:text-zinc-500 cursor-pointer">
                    Same number for WhatsApp
                  </Label>
                </div>
                {phone && sameForWhatsApp && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-gray-600 dark:text-zinc-400">
                        Verify this number on WhatsApp so order updates can reach you there.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void whatsappOtp.sendOtp()}
                        disabled={loading || whatsappOtp.isBusy}
                      >
                        {whatsappOtp.phase === 'sent' || whatsappOtp.isVerified ? 'Resend Code' : 'Send Code'}
                      </Button>
                    </div>

                    {(whatsappOtp.phase === 'sent' || whatsappOtp.isVerified) && (
                      <div className="space-y-3">
                        <InputOTP
                          maxLength={6}
                          value={whatsappOtp.otpCode}
                          onChange={whatsappOtp.setOtpCode}
                          disabled={loading || whatsappOtp.isBusy || whatsappOtp.isVerified}
                          containerClassName="justify-center"
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
                          <p className={`text-xs ${whatsappOtp.isVerified ? 'text-green-700' : 'text-gray-500'}`}>
                            {whatsappOtp.isVerified
                              ? 'WhatsApp number verified.'
                              : 'Enter the 6-digit code we sent to your WhatsApp.'}
                          </p>
                          {!whatsappOtp.isVerified && (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void whatsappOtp.confirmOtp()}
                              disabled={loading || whatsappOtp.isBusy || whatsappOtp.otpCode.length !== 6}
                            >
                              Verify Code
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {whatsappOtp.otpError && (
                      <p className="text-xs text-red-600">{whatsappOtp.otpError}</p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="password" className="text-gray-700 dark:text-zinc-300">Password</Label>
                <div className="relative mt-2">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-zinc-500" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password"
                    className="pl-10 pr-10"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:text-zinc-400"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="text-gray-700 dark:text-zinc-300">Confirm Password</Label>
                <div className="relative mt-2">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-zinc-500" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    className="pl-10"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="terms"
                  checked={agreeTerms}
                  onCheckedChange={(checked) => setAgreeTerms(checked as boolean)}
                  disabled={loading}
                />
                <Label htmlFor="terms" className="text-sm text-gray-600 dark:text-zinc-400 cursor-pointer leading-tight">
                  I agree to the{' '}
                  <Link to="/terms" className="text-amber-600 hover:text-amber-700">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link to="/privacy" className="text-amber-600 hover:text-amber-700">
                    Privacy Policy
                  </Link>
                </Label>
              </div>

              <Button
                type="submit"
                className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3"
                disabled={loading || whatsappOtp.isBusy}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-zinc-800"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white dark:bg-zinc-900 text-gray-500 dark:text-zinc-500">Already have an account?</span>
              </div>
            </div>

            {/* Login Link */}
            <Link to="/login">
              <Button
                variant="outline"
                className="w-full border-amber-600 text-amber-600 hover:bg-amber-50"
              >
                Sign In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
