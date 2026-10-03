import { Check, Circle } from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  calculatePasswordStrength,
  getPasswordRequirementChecks,
  getStrengthColorClass,
  getStrengthLabel,
  getStrengthTextColorClass,
} from '@/lib/passwordValidation';
import type { PasswordStrengthResult } from '@/lib/passwordValidation';

interface PasswordStrengthMeterProps {
  password: string;
  /** Pass the page's own result when it already computes one. */
  strength?: PasswordStrengthResult | null;
  /** id of the requirements list, for the field's aria-describedby. */
  rulesId: string;
  className?: string;
}

/**
 * Strength bar plus a live checklist of the password rules, shared by sign-up
 * and reset so both show the one policy. The bar grows with transform (no
 * width animation); the strength word stays in the text colour.
 */
const PasswordStrengthMeter = ({ password, strength, rulesId, className }: PasswordStrengthMeterProps) => {
  const result = strength !== undefined ? strength : password ? calculatePasswordStrength(password) : null;
  const checks = getPasswordRequirementChecks(password);
  const percent = result ? Math.max(4, Math.min(100, Math.round(result.percentage))) : 0;
  const label = result ? getStrengthLabel(result.strength) : '';
  const tip = result?.feedback.slice(1).find(Boolean);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {result && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs text-muted-foreground">Strength</span>
            <span
              className={cn(
                'text-[11px] font-semibold uppercase tracking-[0.16em]',
                getStrengthTextColorClass(result.strength),
              )}
            >
              {label}
            </span>
          </div>
          <div
            role="meter"
            aria-label="Password strength"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={label}
            className="h-1.5 overflow-hidden rounded-full bg-foreground/10"
          >
            <div
              className={cn(
                'h-full w-full origin-left rounded-full transition-[transform,background-color] duration-dropdown ease-out',
                getStrengthColorClass(result.strength),
              )}
              style={{ transform: `scaleX(${percent / 100})` }}
            />
          </div>
          {tip && <p className="text-xs text-muted-foreground">{tip}</p>}
        </div>
      )}

      <div id={rulesId}>
        <p className="mb-1.5 text-xs font-medium text-foreground">Your password needs</p>
        <ul className="grid gap-1">
          {checks.map((check) => (
            <li
              key={check.label}
              className={cn(
                'flex items-center gap-2 text-xs transition-colors duration-hover',
                check.met ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {check.met ? (
                <Check aria-hidden="true" className="size-3.5 shrink-0 text-primary [stroke-width:2.25]" />
              ) : (
                <Circle aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span>
                {check.label}
                <span className="sr-only">{check.met ? ', done' : ', not yet'}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default PasswordStrengthMeter;
