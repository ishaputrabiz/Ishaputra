import * as React from "react";

import { cn } from "@/lib/utils";

export interface AdminPageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  /** Optional plain label above the title (words only, no numbers). */
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** Buttons on the right: one filled <Button> at most, the rest outline or ghost. */
  actions?: React.ReactNode;
  /** Before the title, e.g. a back IconButton. */
  leading?: React.ReactNode;
  /** After the title: a count, a Live indicator, a status badge. */
  children?: React.ReactNode;
}

/**
 * The one header for every admin page: h1 in the heading font, a muted line
 * under it, actions on the right that wrap below on phones.
 *
 *   <AdminPageHeader title="Orders" description="Every order, newest first."
 *     leading={<IconButton label="Back" onClick={...}><ArrowLeft /></IconButton>}
 *     actions={<Button size="sm" variant="outline">Export</Button>}>
 *     <StatusBadge tone="success" label="Live" dot pulse />
 *   </AdminPageHeader>
 */
export function AdminPageHeader({ title, eyebrow, description, actions, leading, children, className, ...props }: AdminPageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-center justify-between gap-4 pb-6", className)} {...props}>
      {/* The back button sits beside the whole text column, so the description lines up under the title. */}
      <div className="flex min-w-0 items-start gap-3">
        {leading && (
          // 32px tall = the h1's first line, so the 40px button centres on the title.
          <div className={cn("flex h-8 shrink-0 items-center", eyebrow && "mt-[1.375rem]")}>{leading}</div>
        )}
        <div className="flex min-w-0 flex-col gap-1.5">
          {eyebrow && <p className="text-xs font-medium tracking-wide text-muted-foreground">{eyebrow}</p>}
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1
              className="text-2xl font-semibold tracking-tight text-foreground [text-wrap:balance]"
              style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
            >
              {title}
            </h1>
            {children}
          </div>
          {description && <p className="max-w-prose text-sm text-muted-foreground [text-wrap:pretty]">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export default AdminPageHeader;
