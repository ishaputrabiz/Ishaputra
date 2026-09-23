// ============================================
// RESET PASSWORD PAGE
// Handles password reset from email link
// Production-grade security for eCommerce
// ============================================

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock, Eye, EyeOff, CheckCircle, AlertCircle, Shield, Info } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import {
  calculatePasswordStrength,
  validatePassword,
  getStrengthColorClass,
  getStrengthTextColorClass,
  getPasswordRequirementsText,
} from '@/lib/passwordValidation';
import type { PasswordStrengthResult } from '@/lib/passwordValidation';
import { toast } from 'sonner';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrengthResult | null>(null);
  const [validToken, setValidToken] = useState(false);

  // Verify the reset code on mount
  useEffect(() => {
    const verifyCode = async () => {
      if (!oobCode || mode !== 'resetPassword') {
        setError('Invalid or missing reset link. Please request a new password reset.');
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
          setError('This password reset link has expired. Please request a new one.');
        } else if (err.code === 'auth/invalid-action-code') {
          setError('This password reset link is invalid or has already been used.');
        } else {
          setError('Unable to verify reset link. Please request a new password reset.');
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
      setError(validation.errors[0]);
      return;
    }

    // Security: Prevent weak passwords
    if (passwordStrength && passwordStrength.score < 2) {
      setError('Password is too weak. Please choose a stronger password.');
      return;
    }

    // Prevent password containing email
    if (newPassword.toLowerCase().includes(email.split('@')[0].toLowerCase())) {
      setError('Password should not contain your email address.');
      return;
    }

    if (!oobCode) {
      setError('Missing reset code. Please request a new password reset.');
      return;
    }

    setLoading(true);

    try {
      // Confirm the password reset
      await confirmPasswordReset(auth, oobCode, newPassword);
      
      setSuccess(true);
      toast.success('Password reset successful!');

      // Navigate to security page after 3 seconds
      setTimeout(() => {
        navigate('/security', { 
          state: { 
            message: 'Password changed successfully! Your account is now secure.',
            type: 'success'
          } 
        });
      }, 3000);
    } catch (err: any) {
      console.error('Reset password error:', err);
      
      if (err.code === 'auth/expired-action-code') {
        setError('This password reset link has expired. Please request a new one.');
      } else if (err.code === 'auth/invalid-action-code') {
        setError('This password reset link is invalid or has already been used.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Please choose a stronger password.');
      } else {
        setError('Failed to reset password. Please try again or request a new reset link.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
        <Header />
        <div className="flex items-center justify-center py-20 px-4">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-amber-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-zinc-400">Verifying reset link...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Invalid token state
  if (!validToken && !verifying) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
        <Header />
        <div className="flex items-center justify-center py-20 px-4">
          <div className="w-full max-w-md">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-8 text-center">
              <div className="bg-red-100 rounded-full p-4 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                <AlertCircle className="h-10 w-10 text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mb-4">Invalid Reset Link</h1>
              <p className="text-gray-600 dark:text-zinc-400 mb-6">{error}</p>
              <Button
                onClick={() => navigate('/forgot-password')}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              >
                Request New Reset Link
              </Button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
        <Header />
        <div className="flex items-center justify-center py-20 px-4">
          <div className="w-full max-w-md">
            <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-8 text-center">
              <div className="bg-green-100 rounded-full p-4 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mb-4">Password Reset Successful!</h1>
              <p className="text-gray-600 dark:text-zinc-400 mb-6">
                Your password has been updated successfully. You can now sign in with your new password.
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-left">
                <div className="flex gap-3">
                  <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-gray-700 dark:text-zinc-300">
                    <p className="font-semibold mb-1">Security Notice:</p>
                    <ul className="space-y-1 text-xs">
                      <li>• All previous sessions have been logged out for security</li>
                      <li>• A confirmation email has been sent to you</li>
                      <li>• If you didn't make this change, contact support immediately</li>
                    </ul>
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-zinc-500 mb-4">
                Redirecting to sign in page...
              </p>
              <Button
                onClick={() => navigate('/account')}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
              >
                Sign In Now
              </Button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Reset form
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      <Header />
      <div className="flex items-center justify-center py-20 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-8">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="bg-amber-100 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                <Lock className="h-10 w-10 text-amber-600" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-zinc-100 mb-2">Reset Your Password</h1>
              <p className="text-gray-600 dark:text-zinc-400">
                Enter a new strong password for <strong className="text-blue-600">{email}</strong>
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex gap-3">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Reset Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* New Password */}
              <div>
                <Label htmlFor="newPassword" className="text-gray-700 dark:text-zinc-300 font-medium">New Password</Label>
                <div className="relative mt-2">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-zinc-500" />
                  <Input
                    id="newPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="pl-10 pr-10 h-12"
                    required
                    disabled={loading}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:text-zinc-400"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>

                {/* Password Strength Meter */}
                {passwordStrength && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600 dark:text-zinc-400">Password strength:</span>
                      <span className={`text-xs font-semibold ${getStrengthTextColorClass(passwordStrength.strength)}`}>
                        {passwordStrength.strength.replace('-', ' ').toUpperCase()}
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getStrengthColorClass(passwordStrength.strength)} transition-all duration-300`}
                        style={{ width: `${passwordStrength.percentage}%` }}
                      />
                    </div>
                    {passwordStrength.feedback.length > 0 && (
                      <p className="text-xs text-gray-600 dark:text-zinc-400 mt-2">{passwordStrength.feedback[0]}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <Label htmlFor="confirmPassword" className="text-gray-700 dark:text-zinc-300 font-medium">Confirm Password</Label>
                <div className="relative mt-2">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-zinc-500" />
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="pl-10 pr-10 h-12"
                    required
                    disabled={loading}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:text-zinc-400"
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Password Requirements */}
              <div className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-700 dark:text-zinc-300 mb-2">Password must contain:</p>
                <ul className="space-y-1">
                  {getPasswordRequirementsText().map((req, idx) => (
                    <li key={idx} className="text-xs text-gray-600 dark:text-zinc-400 flex items-center gap-2">
                      <span className="w-1 h-1 bg-gray-400 rounded-full" />
                      {req}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                className="w-full bg-amber-600 hover:bg-amber-700 text-white py-3 h-12 font-semibold"
                disabled={loading || !passwordStrength || !passwordStrength.meetsMinimum}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Resetting Password...
                  </>
                ) : (
                  'Reset Password'
                )}
              </Button>
            </form>

            {/* Security Notice */}
            <div className="mt-6 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <p className="text-xs text-blue-800 flex items-start gap-2">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  After resetting your password, you'll be logged out from all devices for security purposes.
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default ResetPassword;
