import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export interface SpinnerProps {
  /** Pixels. 16 inside buttons (the default). */
  size?: number;
  className?: string;
  /** Announce a busy state ("Saving"). Leave empty inside a button whose text already says it. */
  label?: string;
}

/**
 * The only spinner, and only inside buttons. Anything that loads a page or a
 * block of content shows a skeleton of its final layout instead
 * (src/components/skeletons).
 */
export function Spinner({ size = 16, className, label }: SpinnerProps) {
  return (
    <>
      <Loader2
        aria-hidden="true"
        width={size}
        height={size}
        className={cn("shrink-0 animate-spin [animation-duration:0.9s] [stroke-width:1.5]", className)}
      />
      {label && (
        <span role="status" className="sr-only">
          {label}
        </span>
      )}
    </>
  );
}

export default Spinner;
