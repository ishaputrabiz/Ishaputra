import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button hierarchy (docs/ui-system.md):
 *  - default: the one filled copper action per view (same look as .btn-copper)
 *  - outline / line: secondary
 *  - ghost / link: tertiary
 *  - destructive: an outlined danger action in a flow; destructiveSolid only for
 *    the confirm button inside ConfirmDialog
 * Focus uses the global copper outline from src/index.css.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control transition-[transform,background-color,color,border-color,box-shadow,opacity] duration-press ease-out active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "border border-destructive/30 bg-transparent text-destructive hover:bg-destructive/10",
        destructiveSolid: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-transparent text-foreground hover:bg-muted",
        line: "border border-current bg-transparent hover:bg-foreground/[0.06]",
        secondary: "bg-muted text-foreground hover:bg-muted/70",
        ghost: "text-foreground hover:bg-muted",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline active:scale-100",
      },
      size: {
        default: "h-11 px-6 text-[11px] font-bold uppercase tracking-[0.2em]",
        sm: "h-9 px-4 text-xs font-semibold",
        lg: "h-12 px-8 text-[11px] font-bold uppercase tracking-[0.2em]",
        icon: "size-10 [&_svg]:size-5",
      },
    },
    compoundVariants: [
      // Tertiary actions read as text, not as tracked caps.
      { variant: "ghost", size: "default", className: "text-sm font-medium normal-case tracking-normal" },
      { variant: "link", size: "default", className: "text-sm font-medium normal-case tracking-normal" },
      { variant: "link", size: "sm", className: "h-auto px-0" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
