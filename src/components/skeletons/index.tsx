/**
 * Loading states shaped like the final layout. Use these instead of spinners
 * for anything bigger than a button, inside the normal page chrome (Header and
 * Footer stay on screen), at the final height so nothing jumps (CLS < 0.1).
 *
 * Every root sets aria-busy="true" and carries a screen-reader "Loading"
 * (override with `label`). Blocks pulse gently and hold still under reduced
 * motion. Guide: docs/ui-system.md.
 */
import * as React from "react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface BusyProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Screen-reader text. Default "Loading". */
  label?: string;
}

/** Root wrapper: aria-busy + sr-only label. */
function Busy({ label = "Loading", className, children, ...props }: BusyProps) {
  return (
    <div aria-busy="true" className={className} {...props}>
      {label && (
        <span className="sr-only" role="status">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

const range = (n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => i);

/* ── Products ─────────────────────────────────────────────────────────────── */

function ProductCardBody({ className }: { className?: string }) {
  return (
    <div className={cn("card-product flex flex-col p-1.5 lg:p-2", className)}>
      <Skeleton className="mb-2.5 aspect-square w-full rounded-[8px] lg:mb-3" />
      <div className="flex flex-col gap-2 px-1 pb-1">
        <Skeleton className="h-2.5 w-1/3" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="mt-1 h-4 w-1/2" />
        <Skeleton className="mt-2 h-9 w-full" />
      </div>
    </div>
  );
}

/** One product card (grid size). */
export function ProductCardSkeleton({ className, label }: { className?: string; label?: string }) {
  return (
    <Busy label={label} className={className}>
      <ProductCardBody />
    </Busy>
  );
}

/** A product grid: 2 columns on phones, 3 at md, 4 at lg. */
export function ProductGridSkeleton({ count = 8, className, label }: { count?: number; className?: string; label?: string }) {
  return (
    <Busy label={label ?? "Loading products"} className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-5", className)}>
      {range(count).map((i) => (
        <ProductCardBody key={i} />
      ))}
    </Busy>
  );
}

/** A horizontal home row of product cards (230px wide by default). */
export function ProductRowSkeleton({
  count = 5,
  className,
  itemClassName = "w-[230px]",
  label,
}: {
  count?: number;
  className?: string;
  itemClassName?: string;
  label?: string;
}) {
  return (
    <Busy label={label ?? "Loading products"} className={cn("flex gap-3 overflow-hidden md:gap-4", className)}>
      {range(count).map((i) => (
        <ProductCardBody key={i} className={cn("flex-none", itemClassName)} />
      ))}
    </Busy>
  );
}

/* ── Page blocks ──────────────────────────────────────────────────────────── */

/** The home hero while banners load: the charcoal stone at the hero's final size, nothing else. */
export function HeroSkeleton({ className, label }: { className?: string; label?: string }) {
  return (
    <Busy
      label={label ?? "Loading"}
      className={cn("tx-slate aspect-[4/5] w-full md:aspect-[4/3] lg:aspect-auto lg:h-[min(84vh,56.25vw)]", className)}
    />
  );
}

/** A section heading (eyebrow + title) with any skeleton under it. */
export function SectionSkeleton({
  title = true,
  className,
  children,
  label,
}: {
  title?: boolean;
  className?: string;
  children?: React.ReactNode;
  label?: string;
}) {
  return (
    <Busy label={label} className={cn("flex flex-col gap-6", className)}>
      {title && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-7 w-2/3 max-w-sm" />
        </div>
      )}
      {children}
    </Busy>
  );
}

/** A sheet panel with a heading and a few text lines. */
export function PanelSkeleton({ lines = 3, className, label }: { lines?: number; className?: string; label?: string }) {
  return (
    <Busy label={label} className={cn("panel tx-sheet flex flex-col gap-3 p-5 sm:p-6", className)}>
      <Skeleton className="h-5 w-2/5" />
      {range(lines).map((i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-3/5" : "w-full")} />
      ))}
    </Busy>
  );
}

/** Rows separated by hairlines, optionally with a square thumbnail (orders, addresses, notifications). */
export function ListSkeleton({ rows = 3, thumb = false, className, label }: { rows?: number; thumb?: boolean; className?: string; label?: string }) {
  return (
    <Busy label={label} className={cn("panel tx-sheet divide-y divide-foreground/[0.08] overflow-hidden", className)}>
      {range(rows).map((i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          {thumb && <Skeleton className="size-14 shrink-0 rounded-[8px]" />}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-6 w-20 shrink-0 rounded-chip" />
        </div>
      ))}
    </Busy>
  );
}

/** An admin table: header row plus body rows. */
export function TableSkeleton({ rows = 8, cols = 5, className, label }: { rows?: number; cols?: number; className?: string; label?: string }) {
  const template = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
  return (
    <Busy label={label} className={cn("overflow-hidden rounded-card border border-foreground/[0.08] bg-card", className)}>
      <div className="grid gap-4 border-b border-foreground/[0.08] bg-muted/50 px-4 py-3" style={template}>
        {range(cols).map((c) => (
          <Skeleton key={c} className="h-3 w-2/3" />
        ))}
      </div>
      {range(rows).map((r) => (
        <div key={r} className="grid items-center gap-4 border-b border-foreground/[0.06] px-4 py-4 last:border-b-0" style={template}>
          {range(cols).map((c) => (
            <Skeleton key={c} className={cn("h-3.5", c === 0 ? "w-4/5" : "w-1/2")} />
          ))}
        </div>
      ))}
    </Busy>
  );
}

/** A form: labelled fields and a submit button. */
export function FormSkeleton({ fields = 6, className, label }: { fields?: number; className?: string; label?: string }) {
  return (
    <Busy label={label} className={cn("flex flex-col gap-5", className)}>
      {range(fields).map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="h-11 w-full rounded-control" />
        </div>
      ))}
      <Skeleton className="mt-2 h-11 w-40 rounded-control" />
    </Busy>
  );
}

/** A detail page (order, customer): header panel, a row of facts, a 5-step tracker and a panel. */
export function DetailSkeleton({ className, label }: { className?: string; label?: string }) {
  return (
    <Busy label={label} className={cn("flex flex-col gap-5", className)}>
      <div className="panel tx-sheet flex flex-col gap-3 p-5 sm:p-6">
        <Skeleton className="h-6 w-1/2 max-w-xs" />
        <Skeleton className="h-3.5 w-1/3" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {range(4).map((i) => (
          <Skeleton key={i} className="h-16 rounded-card" />
        ))}
      </div>
      <div className="panel tx-sheet flex items-center justify-between gap-2 p-5 sm:p-6">
        {range(5).map((i) => (
          <React.Fragment key={i}>
            <Skeleton className="size-4 shrink-0 rounded-full" />
            {i < 4 && <Skeleton className="h-0.5 flex-1" />}
          </React.Fragment>
        ))}
      </div>
      <div className="panel tx-sheet flex flex-col gap-3 p-5 sm:p-6">
        <Skeleton className="h-5 w-2/5" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
    </Busy>
  );
}

/** Dashboard stat tiles. */
export function StatCardsSkeleton({ count = 4, className, label }: { count?: number; className?: string; label?: string }) {
  return (
    <Busy label={label} className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4", className)}>
      {range(count).map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-card border border-foreground/[0.08] bg-card p-4">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-7 w-2/3" />
        </div>
      ))}
    </Busy>
  );
}

/** A grid of square media tiles (admin media, gallery). */
export function MediaGridSkeleton({ count = 8, className, label }: { count?: number; className?: string; label?: string }) {
  return (
    <Busy label={label} className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", className)}>
      {range(count).map((i) => (
        <Skeleton key={i} className="aspect-square w-full rounded-card" />
      ))}
    </Busy>
  );
}

/** The sign-in card (AuthCard) while auth state resolves. */
export function AuthCardSkeleton({ className, label }: { className?: string; label?: string }) {
  return (
    <Busy label={label} className={cn("panel tx-sheet mx-auto flex w-full max-w-md flex-col gap-5 p-6 sm:p-9", className)}>
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-3.5 w-3/4" />
      {range(2).map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-12 w-full rounded-control" />
        </div>
      ))}
      <Skeleton className="h-11 w-full rounded-control" />
    </Busy>
  );
}

/* ── Route fallback ───────────────────────────────────────────────────────── */

/**
 * Suspense fallback while a page's code downloads. Paper page, a header-height
 * bar, a 140px title band and 8 product cards. The whole thing fades in only
 * after 150ms (.route-skeleton), so fast loads never flash it.
 */
export function RouteSkeleton() {
  return (
    <Busy label="Loading page" className="route-skeleton tx-paper min-h-dvh">
      <div className="h-[var(--sticky-top)] border-b border-foreground/[0.08] bg-background" />
      <div className="container-custom flex h-[140px] flex-col justify-center gap-3">
        <Skeleton className="h-2.5 w-24" />
        <Skeleton className="h-8 w-2/3 max-w-md" />
      </div>
      <div className="container-custom pb-16">
        <ProductGridSkeleton count={8} label="" />
      </div>
    </Busy>
  );
}
