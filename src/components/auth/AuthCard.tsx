import * as React from "react";

import { cn } from "@/lib/utils";

export interface AuthCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** The page's one h1 by default; use "h2" when the page already has one. */
  as?: "h1" | "h2";
  /** Links under the form ("New here? Create account"). */
  footer?: React.ReactNode;
}

/**
 * The card that holds sign-in, sign-up and password forms: a paper sheet with
 * faint contour rings, 448px wide, roomy padding from sm up.
 */
export const AuthCard = React.forwardRef<HTMLDivElement, AuthCardProps>(
  ({ title, description, as: Heading = "h1", footer, className, children, ...props }, ref) => (
    <div ref={ref} className={cn("panel tx-sheet tx-contour mx-auto w-full max-w-md p-6 sm:p-9", className)} {...props}>
      <div className="mb-6 flex flex-col gap-2">
        <Heading className="font-heading text-2xl font-semibold tracking-tight text-foreground [text-wrap:balance]">{title}</Heading>
        {description && <p className="text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">{description}</p>}
      </div>
      {children}
      {footer && <div className="mt-6 border-t border-foreground/[0.08] pt-5 text-center text-sm text-muted-foreground">{footer}</div>}
    </div>
  ),
);
AuthCard.displayName = "AuthCard";

export default AuthCard;
