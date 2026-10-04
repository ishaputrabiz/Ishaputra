import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, ArrowLeft, OctagonAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';

const HEADING_FONT: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontStretch: 'var(--font-heading-stretch)',
};

/** Shared entrance: opacity + 8px, 240ms on the strong ease-out. */
const enter = (delay = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.24, ease: [...EASE_OUT] as [number, number, number, number], delay },
});

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
    <main className="grid min-h-screen w-full overflow-hidden bg-charcoal text-charcoal-foreground lg:grid-cols-2">
      {/* LEFT: brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <div aria-hidden="true" className="absolute -left-40 -top-40 size-[480px] rounded-full bg-primary/20 blur-[120px]" />
        <div aria-hidden="true" className="absolute bottom-[-160px] right-[-160px] size-[520px] rounded-full bg-primary/30 blur-[140px]" />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(to right, hsl(var(--highlight)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--highlight)) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />

        <div className="relative z-raised">
          <div className="flex items-center gap-3">
            <img src="/icon-192.png" alt="" width={44} height={44} className="size-11 rounded-card" />
            <div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-highlight-soft">Ishaputra</p>
              <p className="text-sm font-medium text-charcoal-foreground/90">Botanicals</p>
            </div>
          </div>
        </div>

        <motion.div {...enter()} className="relative z-raised max-w-md">
          <p className="mb-5 text-xs uppercase tracking-[0.4em] text-highlight-soft">Admin console</p>
          <p className="text-5xl font-light leading-[1.05] text-charcoal-foreground xl:text-6xl" style={HEADING_FONT}>
            Run the <span className="italic text-highlight-soft">store.</span>
          </p>
          <p className="mt-6 text-sm leading-relaxed text-charcoal-foreground/70">
            Orders, products and content for Ishaputra Botanicals.
          </p>
        </motion.div>

        <div className="relative z-raised flex items-center gap-2 text-xs text-charcoal-foreground/70">
          <ShieldCheck aria-hidden="true" className="size-4 text-highlight-soft" />
          <span>Restricted access</span>
        </div>
      </div>

      {/* RIGHT: sign-in card */}
      <div className="relative flex items-center justify-center p-4 py-10 sm:p-12">
        <motion.div {...enter(0.04)} className="relative w-full max-w-md">
          <div className="rounded-panel border border-charcoal-foreground/10 bg-charcoal-foreground/[0.04] p-6 shadow-[0_30px_80px_-30px_hsl(var(--highlight)/0.35)] sm:p-10">
            <div className="mb-8 flex flex-col items-center text-center">
              <img src="/icon-192.png" alt="" width={56} height={56} className="mb-5 size-14 rounded-card" />
              <p className="mb-1.5 text-[11px] uppercase tracking-[0.3em] text-highlight-soft">Sign in</p>
              <h1 className="text-3xl text-charcoal-foreground" style={HEADING_FONT}>
                Admin console
              </h1>
              <p className="mt-2 text-sm text-charcoal-foreground/70">Use your admin email and password.</p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-control border border-status-danger-line bg-status-danger-bg px-4 py-3 text-sm text-status-danger-fg"
              >
                <OctagonAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <LoginField
                id="email"
                type="email"
                label="Admin email"
                value={email}
                onChange={setEmail}
                disabled={loading}
                autoComplete="username"
                inputMode="email"
                icon={<Mail aria-hidden="true" className="size-4" />}
              />

              <LoginField
                id="password"
                type={showPassword ? 'text' : 'password'}
                label="Password"
                value={password}
                onChange={setPassword}
                disabled={loading}
                autoComplete="current-password"
                icon={<Lock aria-hidden="true" className="size-4" />}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    aria-controls="password"
                    className="relative inline-flex size-9 items-center justify-center rounded-full text-charcoal-foreground/70 transition-[color,background-color,transform] duration-press ease-out after:absolute after:-inset-1 after:rounded-full after:content-[''] hover:bg-charcoal-foreground/10 hover:text-highlight-soft active:scale-[0.97]"
                  >
                    {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                  </button>
                }
              />

              <Button type="submit" disabled={loading} className="mt-1 h-12 w-full">
                {loading ? (
                  <>
                    <Spinner /> Signing in
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>

            <div className="mt-8 border-t border-charcoal-foreground/10 pt-6 text-center">
              <p className="text-xs text-charcoal-foreground/60">
                Restricted area. Unauthorised access is prohibited.
              </p>
            </div>
          </div>

          <div className="mt-6 text-center">
            <a
              href="/"
              className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm text-charcoal-foreground/70 transition-colors duration-hover hover:text-highlight-soft"
            >
              <ArrowLeft aria-hidden="true" className="size-4" /> Back to website
            </a>
          </div>
        </motion.div>
      </div>
    </main>
  );
};

/** Label above a 48px field with a leading icon and an optional trailing control. */
const LoginField = ({
  id, type, label, value, onChange, disabled, icon, trailing, autoComplete, inputMode,
}: {
  id: string;
  type: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) => (
  <div className="flex flex-col gap-2">
    <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-[0.18em] text-charcoal-foreground/70">
      {label}
    </label>
    <div className="relative">
      {icon && (
        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-charcoal-foreground/60">
          {icon}
        </div>
      )}
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        required
        autoComplete={autoComplete}
        inputMode={inputMode}
        className={cn(
          'h-12 w-full rounded-control border border-charcoal-foreground/25 bg-charcoal-foreground/[0.04] pl-11 text-base text-charcoal-foreground transition-[border-color,background-color,box-shadow] duration-hover ease-out md:text-sm',
          'focus-visible:border-highlight-soft focus-visible:bg-charcoal-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-highlight-soft/60',
          'disabled:cursor-not-allowed disabled:opacity-60',
          trailing ? 'pr-12' : 'pr-4',
        )}
      />
      {trailing && <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</div>}
    </div>
  </div>
);

export default AdminLogin;
