import * as React from "react";
import { CircleCheck, Info, OctagonAlert, RotateCcw, TriangleAlert, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/orderStatus";

const RULE: Record<StatusTone, string> = {
  success: "border-l-status-success-fg",
  danger: "border-l-status-danger-fg",
  warning: "border-l-status-warning-fg",
  info: "border-l-status-info-fg",
  returns: "border-l-status-returns-fg",
  neutral: "border-l-status-neutral-fg",
};

const ICON_COLOUR: Record<StatusTone, string> = {
  success: "text-status-success-fg",
  danger: "text-status-danger-fg",
  warning: "text-status-warning-fg",
  info: "text-status-info-fg",
  returns: "text-status-returns-fg",
  neutral: "text-status-neutral-fg",
};

const DEFAULT_ICON: Record<StatusTone, LucideIcon> = {
  success: CircleCheck,
  danger: OctagonAlert,
  warning: TriangleAlert,
  info: Info,
  returns: RotateCcw,
  neutral: Info,
};

export interface NoticeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: StatusTone;
  title?: React.ReactNode;
  /** Replace the tone's icon, or pass null for none. */
  icon?: LucideIcon | null;
  /** A button or link shown under the text (e.g. a btn-copper "Try again"). */
  action?: React.ReactNode;
  /** Tighter padding for inline field errors. */
  compact?: boolean;
}

/**
 * Every banner, callout and inline error: paper sheet, a 3px rule in the
 * tone's colour, the tone's icon, body text in the normal text colour.
 * Errors (tone="danger") are announced with role="alert"; the rest with
 * role="status". Override with `role` when a notice is static page content.
 *
 *   <Notice tone="warning" title="Delivery failed">We'll try again tomorrow.</Notice>
 */
export const Notice = React.forwardRef<HTMLDivElement, NoticeProps>(
  ({ tone = "info", title, icon, action, compact = false, className, children, role, ...props }, ref) => {
    const Icon = icon === null ? null : (icon ?? DEFAULT_ICON[tone]);
    return (
      <div
        ref={ref}
        role={role ?? (tone === "danger" ? "alert" : "status")}
        className={cn(
          "tx-sheet flex gap-3 border border-foreground/10 border-l-[3px] text-sm text-foreground",
          compact ? "rounded-card px-3 py-2.5" : "rounded-panel p-4",
          RULE[tone],
          className,
        )}
        {...props}
      >
        {Icon && <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", ICON_COLOUR[tone])} />}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {title && <p className="font-semibold leading-snug">{title}</p>}
          {children && <div className="leading-relaxed text-foreground [text-wrap:pretty]">{children}</div>}
          {action && <div className="mt-2 flex flex-wrap items-center gap-3">{action}</div>}
        </div>
      </div>
    );
  },
);
Notice.displayName = "Notice";

export default Notice;
