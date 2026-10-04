import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { getOrderStatus, type OrderStatusContext, type StatusTone } from "@/lib/orderStatus";

export type { StatusTone };

/** Tone classes for chips and tinted rows. Full strings so Tailwind keeps them. */
export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  success: "border-status-success-line bg-status-success-bg text-status-success-fg",
  danger: "border-status-danger-line bg-status-danger-bg text-status-danger-fg",
  warning: "border-status-warning-line bg-status-warning-bg text-status-warning-fg",
  info: "border-status-info-line bg-status-info-bg text-status-info-fg",
  returns: "border-status-returns-line bg-status-returns-bg text-status-returns-fg",
  neutral: "border-status-neutral-line bg-status-neutral-bg text-status-neutral-fg",
};

const DOT_CLASSES: Record<StatusTone, string> = {
  success: "bg-status-success-fg",
  danger: "bg-status-danger-fg",
  warning: "bg-status-warning-fg",
  info: "bg-status-info-fg",
  returns: "bg-status-returns-fg",
  neutral: "bg-status-neutral-fg",
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
  label: string;
  /** Lucide icon shown before the label. Colour is never the only signal: give an icon or a dot. */
  icon?: LucideIcon | null;
  /** A small tone dot instead of an icon (live indicators). */
  dot?: boolean;
  /** Gently pulse the dot (stops under reduced motion). Use only for something live. */
  pulse?: boolean;
}

/**
 * A status chip: icon + label on the tone's tint, 24px tall, 4px radius.
 *
 *   <StatusBadge tone="success" label="Delivered" icon={CircleCheck} />
 *   <OrderStatusBadge status={order.status} order={order} />
 */
export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ tone, label, icon: Icon, dot = false, pulse = false, className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip border px-2 text-xs font-semibold",
        STATUS_TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn("size-1.5 rounded-full", DOT_CLASSES[tone], pulse && "animate-pulse motion-reduce:animate-none")}
        />
      ) : Icon ? (
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      ) : null}
      {label}
    </span>
  ),
);
StatusBadge.displayName = "StatusBadge";

export interface OrderStatusBadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  status: string | null | undefined;
  /** Pass the order for COD, needs-review, late-return and return-pickup wording. */
  order?: OrderStatusContext;
}

/** StatusBadge for an order status, through the shared map in src/lib/orderStatus.ts. */
export const OrderStatusBadge = React.forwardRef<HTMLSpanElement, OrderStatusBadgeProps>(
  ({ status, order, ...props }, ref) => {
    const s = getOrderStatus(status, order);
    return <StatusBadge ref={ref} tone={s.tone} label={s.label} icon={s.icon} {...props} />;
  },
);
OrderStatusBadge.displayName = "OrderStatusBadge";

export default StatusBadge;
