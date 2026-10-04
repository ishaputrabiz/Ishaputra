import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import type { StatusTone } from '@/lib/orderStatus';
import { cn } from '@/lib/utils';

const HEADING_FONT = { fontFamily: 'var(--font-heading)', fontStretch: 'var(--font-heading-stretch)' } as const;

/** Icon chip colours. Neutral by default; a tone only where the stat is a status (pending, approved ...). */
const CHIP_TONE: Record<StatusTone, string> = {
  success: 'bg-status-success-bg text-status-success-fg',
  danger: 'bg-status-danger-bg text-status-danger-fg',
  warning: 'bg-status-warning-bg text-status-warning-fg',
  info: 'bg-status-info-bg text-status-info-fg',
  returns: 'bg-status-returns-bg text-status-returns-fg',
  neutral: 'bg-muted text-foreground/70',
};

export interface StatCardProps {
  /** Small muted label at the top ("Orders", "Total issued"). */
  label: string;
  /** The number or amount, printed large with tabular figures. Format it first (formatINR, formatNumber). */
  value: ReactNode;
  /** Icon in the chip at the top right. */
  icon?: LucideIcon;
  /** Chip colour. Leave it out for a neutral chip. */
  tone?: StatusTone;
  /** One muted line under the value. */
  subtitle?: ReactNode;
  /** Makes the whole card a link with a hover lift (Dashboard). */
  to?: string;
  /** Extra classes for the value (e.g. a danger colour for a warning count). */
  valueClassName?: string;
  className?: string;
}

/**
 * The one admin stat card: label top left, icon chip top right, value in the
 * heading font, optional subtitle. Dashboard, Customers, Coupons, Gift cards,
 * Reviews, Newsletter and Customer detail all use it, so every stat row looks
 * the same. Put it inside an <li> when the row is a list.
 */
export function StatCard({ label, value, icon: Icon, tone = 'neutral', subtitle, to, valueClassName, className }: StatCardProps) {
  const body = (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-control', CHIP_TONE[tone])}>
            <Icon aria-hidden="true" className="size-4" />
          </span>
        )}
      </div>
      <p className={cn('break-words text-2xl font-semibold tabular-nums text-foreground', valueClassName)} style={HEADING_FONT}>
        {value}
      </p>
      {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
    </>
  );

  const base = 'block h-full rounded-card border border-foreground/[0.08] bg-card p-3 text-card-foreground shadow-sm sm:p-4';

  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          base,
          'group transition-[box-shadow,transform,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-foreground/[0.14] hover:shadow-panel motion-reduce:hover:translate-y-0',
          className,
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={cn(base, className)}>{body}</div>;
}

export default StatCard;
