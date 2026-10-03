import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface EmptyStateAction {
  label: string;
  /** A route to go to. */
  to?: string;
  onClick?: () => void;
}

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  /** One short line. */
  description?: React.ReactNode;
  /** The one copper action, e.g. { label: 'Start shopping', to: '/products' }. */
  action?: EmptyStateAction;
  /** A quieter link-arrow next to it. */
  secondaryAction?: EmptyStateAction;
  /** Heading level for the title; pick the one that fits the page outline. */
  as?: "h1" | "h2" | "h3";
  className?: string;
  children?: React.ReactNode;
}

function ActionLink({ action, className, withArrow }: { action: EmptyStateAction; className: string; withArrow?: boolean }) {
  const content = (
    <>
      {action.label}
      {withArrow && <ArrowRight aria-hidden="true" className="size-3.5" />}
    </>
  );
  if (action.to) {
    return (
      <Link to={action.to} onClick={action.onClick} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={action.onClick} className={className}>
      {content}
    </button>
  );
}

/**
 * Nothing to show yet: a charcoal stone tile with a bronze icon, a short
 * heading-font title, one muted line and at most one copper action.
 *
 *   <EmptyState icon={Heart} title="No saved items yet"
 *     description="Tap the heart on any product to keep it here."
 *     action={{ label: 'Start shopping', to: '/products' }} />
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  as: Heading = "h2",
  className,
  children,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-12 text-center sm:py-16", className)}>
      <div className="tx-slate mb-5 grid size-14 place-items-center rounded-card">
        <Icon aria-hidden="true" className="size-6 text-highlight-soft" />
      </div>
      <Heading className="font-heading text-lg font-semibold tracking-tight text-foreground [text-wrap:balance] sm:text-xl">
        {title}
      </Heading>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">{description}</p>
      )}
      {children}
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {action && <ActionLink action={action} className="btn-copper" />}
          {secondaryAction && <ActionLink action={secondaryAction} className="link-arrow" withArrow />}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
