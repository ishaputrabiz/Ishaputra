import * as React from "react";

import { cn } from "@/lib/utils";

export interface CarouselDotsProps {
  count: number;
  /** Index of the slide on screen. */
  active: number;
  onSelect: (index: number) => void;
  /** What a slide is, for the button names: "Show slide 2 of 4". */
  itemLabel?: string;
  /** Name of the whole control. */
  label?: string;
  /** 'onDark' for photos and charcoal bands. */
  tone?: "default" | "onDark";
  /** Extra control placed after the dots, e.g. a pause/play IconButton. */
  children?: React.ReactNode;
  className?: string;
}

/**
 * Slide indicators: 24px square buttons, each holding a 2px bar. The active
 * bar fills from the left (240ms). aria-current marks the slide on screen.
 */
export function CarouselDots({
  count,
  active,
  onSelect,
  itemLabel = "slide",
  label = "Choose slide",
  tone = "default",
  children,
  className,
}: CarouselDotsProps) {
  if (count < 2) return null;
  const track = tone === "onDark" ? "bg-charcoal-foreground/35" : "bg-foreground/20";
  const fill = tone === "onDark" ? "bg-charcoal-foreground" : "bg-primary";

  return (
    <div role="group" aria-label={label} className={cn("flex items-center gap-0.5", className)}>
      {Array.from({ length: count }, (_, i) => {
        const current = i === active;
        return (
          <button
            key={i}
            type="button"
            aria-label={`Show ${itemLabel} ${i + 1} of ${count}`}
            aria-current={current ? "true" : undefined}
            onClick={() => onSelect(i)}
            className="group/dot inline-flex size-6 items-center justify-center rounded-chip"
          >
            <span aria-hidden="true" className={cn("relative h-0.5 w-4 overflow-hidden rounded-full", track)}>
              <span
                className={cn(
                  "absolute inset-0 origin-left rounded-full transition-transform duration-[240ms] ease-out",
                  fill,
                  current ? "scale-x-100" : "scale-x-0 group-hover/dot:scale-x-[0.35]",
                )}
              />
            </span>
          </button>
        );
      })}
      {children}
    </div>
  );
}

export default CarouselDots;
