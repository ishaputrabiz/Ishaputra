import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Icon-only button. Round, 40px on mouse devices and 44px on touch, with an
 * invisible 4px ring of extra hit area. The label is required: it becomes the
 * accessible name (and the tooltip text when `tooltip` is set).
 */
const iconButtonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center rounded-full transition-[transform,background-color,color,border-color,opacity] duration-press ease-out after:absolute after:-inset-1 after:rounded-full after:content-[''] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        ghost: "text-foreground/80 hover:bg-muted hover:text-foreground aria-pressed:text-primary",
        solid: "border border-foreground/10 bg-card text-foreground shadow-sm hover:border-primary/40 hover:text-primary",
        onPhoto: "bg-charcoal/55 text-charcoal-foreground backdrop-blur-sm hover:bg-charcoal/75",
      },
      size: {
        default: "size-11 [@media(pointer:fine)]:size-10 [&_svg]:size-5",
        sm: "size-9 [&_svg]:size-4 after:-inset-1.5",
        lg: "size-12 [&_svg]:size-6",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "default",
    },
  },
);

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label">,
    VariantProps<typeof iconButtonVariants> {
  /** What the button does, e.g. "Close", "Open menu", "Add Shilajit to cart". */
  label: string;
  /** Show the label as a tooltip on hover/focus. true uses `label`; a string overrides the text. */
  tooltip?: boolean | string;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  /** Render the child (e.g. a <Link>) instead of a <button>. */
  asChild?: boolean;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, tooltip, tooltipSide = "bottom", variant, size, asChild = false, className, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const button = (
      <Comp
        ref={ref}
        aria-label={label}
        type={asChild ? undefined : (type ?? "button")}
        className={cn(iconButtonVariants({ variant, size }), className)}
        {...props}
      />
    );
    if (!tooltip) return button;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side={tooltipSide}>{typeof tooltip === "string" ? tooltip : label}</TooltipContent>
      </Tooltip>
    );
  },
);
IconButton.displayName = "IconButton";

export { IconButton, iconButtonVariants };
export default IconButton;
