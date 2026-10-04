import * as React from "react";
import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";
import { IconButton, type IconButtonProps } from "@/components/ui/icon-button";

export interface WishlistToggleProps extends Omit<IconButtonProps, "label" | "onClick" | "children"> {
  /** Product name, used in the button's name: "Save Shilajit to wishlist". */
  name: string;
  saved: boolean;
  onToggle: () => void;
}

/**
 * The heart on product cards and the product page. Controlled: the parent owns
 * one useWishlist() (each instance syncs with Firestore, so never one per card)
 * and passes `saved` and `onToggle`. The name stays "Save {name} to wishlist";
 * `aria-pressed` carries the saved state.
 *
 *   const { isInWishlist, toggleWishlist } = useWishlist();
 *   <WishlistToggle name={p.title} saved={isInWishlist(p.id)} onToggle={() => toggleWishlist(p.id, p.title)} />
 */
export const WishlistToggle = React.forwardRef<HTMLButtonElement, WishlistToggleProps>(
  ({ name, saved, onToggle, variant = "solid", className, ...props }, ref) => (
    <IconButton
      ref={ref}
      // One constant name plus aria-pressed: screen readers announce
      // "Save X to wishlist, toggle button, pressed" when saved, rather than a
      // changing label that contradicts the pressed state.
      label={`Save ${name} to wishlist`}
      aria-pressed={saved}
      variant={variant}
      className={cn(saved && "text-primary", className)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      {...props}
    >
      <Heart
        aria-hidden="true"
        className={cn("transition-[fill,color] duration-hover ease-out", saved ? "fill-primary text-primary" : "fill-transparent")}
      />
    </IconButton>
  ),
);
WishlistToggle.displayName = "WishlistToggle";

export default WishlistToggle;
