import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

export interface AuthCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** The page's one h1 by default; use "h2" when the page already has one. */
  as?: "h1" | "h2";
  /** The back control above the title, in the same place on every auth screen. Use <AuthBackLink />. */
  back?: React.ReactNode;
  /** Links under the form ("New here? Create account"). */
  footer?: React.ReactNode;
}

/**
 * The card that holds sign-in, sign-up and password forms: a paper sheet with
 * faint contour rings, 448px wide, roomy padding from sm up.
 */
export const AuthCard = React.forwardRef<HTMLDivElement, AuthCardProps>(
  ({ title, description, as: Heading = "h1", back, footer, className, children, ...props }, ref) => (
    <div ref={ref} className={cn("panel tx-sheet tx-contour mx-auto w-full max-w-md p-6 sm:p-9", className)} {...props}>
      {back}
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

/**
 * The page main for every auth screen: cards start at the same top edge
 * (not vertically centred), so moving between sign in, sign up and reset
 * keeps the card still.
 */
export const AUTH_MAIN_CLASS = "flex flex-1 items-start justify-center px-4 py-10 outline-none md:py-14";

const BACK_CLASS =
  "-ml-2 mb-4 inline-flex h-10 items-center gap-1.5 rounded-control px-2 text-muted-foreground transition-[color,transform] duration-press ease-out hover:text-foreground active:scale-[0.97]";

export interface AuthBackLinkProps {
  /** Go to this route. Without it, go back in history, or to `fallback` when this is the first page of the visit. */
  to?: string;
  fallback?: string;
  label?: string;
}

/** The back control at the top of an auth card. Same look and place on every auth screen. */
export function AuthBackLink({ to, fallback = "/", label = "Back" }: AuthBackLinkProps) {
  const navigate = useNavigate();
  const content = (
    <>
      <ArrowLeft aria-hidden="true" className="size-4" />
      <span className="text-[11px] font-bold uppercase tracking-[0.18em]">{label}</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} className={BACK_CLASS}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={BACK_CLASS}
      onClick={() => {
        // React Router keeps an index in history.state; 0 means this page opened the visit.
        const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
        if (idx > 0) navigate(-1);
        else navigate(fallback);
      }}
    >
      {content}
    </button>
  );
}

export default AuthCard;
