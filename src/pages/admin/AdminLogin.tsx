import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Sparkles, ArrowLeft } from 'lucide-react';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login, user, isAdmin } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user && isAdmin) navigate('/admin/dashboard');
  }, [user, isAdmin, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userProfile = await login(email, password);
      if (userProfile.role !== 'admin') {
        setError('Access denied. Admin credentials required.');
        setLoading(false);
        return;
      }
      navigate('/admin/dashboard');
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid admin credentials.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else {
        setError('Authentication failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-[#0d0a07] text-white overflow-hidden">
      {/* LEFT — Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-[#1a0f0c] via-[#2a1810] to-[#0d0a07] overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-amber-500/20 blur-[120px]" />
        <div className="absolute bottom-[-160px] right-[-160px] w-[520px] h-[520px] rounded-full bg-[#832729]/30 blur-[140px]" />
        <div className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #d4af37 1px, transparent 1px), linear-gradient(to bottom, #d4af37 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }} />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-900/40">
              <span className="font-bold text-[#1a0f0c]" style={{ fontFamily: "'Playfair Display', serif" }}>S</span>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-amber-300/70">Sreerasthu</p>
              <p className="text-sm font-medium text-white/90">Silvers & Jewellery</p>
            </div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="relative z-10 max-w-md"
        >
          <p className="text-amber-400/80 text-xs uppercase tracking-[0.4em] mb-5 inline-flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" /> Admin Console
          </p>
          <h1
            className="text-5xl xl:text-6xl leading-[1.05] font-light text-white"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Crafted with <span className="italic text-amber-300">elegance.</span>
            <br />
            Managed with <span className="italic text-amber-300">precision.</span>
          </h1>
          <p className="text-white/60 mt-6 text-sm leading-relaxed">
            Welcome to the Sreerasthu Silvers control room — orchestrate your collections,
            curate your storefront, and craft moments that last lifetimes.
          </p>
        </motion.div>

        <div className="relative z-10 flex items-center gap-2 text-xs text-white/40">
          <ShieldCheck className="w-4 h-4 text-amber-400/70" />
          <span>Restricted access · All sessions are audited.</span>
        </div>
      </div>

      {/* RIGHT — Login card */}
      <div className="relative flex items-center justify-center p-6 sm:p-12 bg-[#0d0a07]">
        <div className="lg:hidden absolute -top-40 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-amber-500/20 blur-[120px]" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="relative w-full max-w-md"
        >
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-2xl shadow-[0_30px_80px_-30px_rgba(212,175,55,0.35)] p-8 sm:p-10">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-900/30 mb-5">
                <ShieldCheck className="w-7 h-7 text-[#1a0f0c]" />
              </div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-amber-400/70 mb-1.5">Sign in</p>
              <h2 className="text-3xl text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
                Admin Console
              </h2>
              <p className="text-white/50 text-sm mt-2">Use your authorized credentials to continue.</p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200"
              >
                {error}
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <FloatingInput
                id="email"
                type="email"
                label="Admin email"
                value={email}
                onChange={setEmail}
                disabled={loading}
                icon={<Mail className="w-4 h-4" />}
              />

              <div className="relative">
                <FloatingInput
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  disabled={loading}
                  icon={<Lock className="w-4 h-4" />}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-amber-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-[#1a0f0c] font-semibold py-3.5 text-sm tracking-wide transition-all shadow-lg shadow-amber-900/30 disabled:opacity-60"
              >
                <span className="relative z-10 inline-flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Authenticating…
                    </>
                  ) : (
                    'Enter Admin Console'
                  )}
                </span>
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-white/10 text-center">
              <p className="text-white/40 text-[11px] uppercase tracking-wider">
                This is a restricted area · Unauthorized access is prohibited
              </p>
            </div>
          </div>

          <div className="mt-6 text-center">
            <a
              href="/"
              className="inline-flex items-center gap-2 text-white/50 hover:text-amber-300 text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to website
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

const FloatingInput = ({
  id, type, label, value, onChange, disabled, icon,
}: {
  id: string;
  type: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) => {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;
  return (
    <div className="relative">
      {icon && (
        <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${active ? 'text-amber-400' : 'text-white/40'}`}>
          {icon}
        </div>
      )}
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
        required
        className="peer w-full rounded-xl border border-white/10 bg-white/[0.03] pl-11 pr-11 pt-5 pb-2 text-sm text-white placeholder-transparent focus:outline-none focus:border-amber-400/60 focus:bg-white/[0.06] transition-colors disabled:opacity-50"
        placeholder={label}
      />
      <label
        htmlFor={id}
        className={`pointer-events-none absolute left-11 transition-all ${
          active
            ? 'top-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-300/80'
            : 'top-1/2 -translate-y-1/2 text-sm text-white/40'
        }`}
      >
        {label}
      </label>
    </div>
  );
};

export default AdminLogin;
