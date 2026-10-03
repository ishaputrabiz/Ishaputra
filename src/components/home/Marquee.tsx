import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

interface MarqueeProps {
  /** One copy of the content. It is rendered twice so the loop has no seam. */
  children: ReactNode;
  /** Travel speed in pixels per second. */
  speed?: number;
  className?: string;
  /** Classes for each copy (gap between items, alignment). */
  copyClassName?: string;
}

/**
 * Endless horizontal strip for text bands.
 *
 * Two identical copies sit on a w-max track that moves from 0 to -50% (one
 * copy's width) and repeats, so the restart is invisible. It is a CSS
 * animation (the `.marquee` keyframes in index.css), so it stays smooth while
 * the main thread is busy. It pauses while off screen or in a hidden tab, and
 * stands still under reduced motion. The second copy is hidden from screen
 * readers and from the keyboard.
 */
export const Marquee = ({ children, speed = 40, className, copyClassName }: MarqueeProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [duration, setDuration] = useState(40);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  // Duration follows the width of one copy, so the speed stays the same
  // whatever the phrases and the font size.
  useEffect(() => {
    const copy = copyRef.current;
    if (!copy || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const width = copy.getBoundingClientRect().width;
      if (width > 0) setDuration(Math.max(12, width / speed));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(copy);
    return () => observer.disconnect();
  }, [speed]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)));
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const running = !reduceMotion && inView && pageVisible;

  return (
    <div ref={rootRef} className={cn("overflow-hidden", className)}>
      <div
        className={cn("flex w-max", !reduceMotion && "marquee")}
        style={{ animationDuration: `${duration}s`, animationPlayState: running ? "running" : "paused" }}
      >
        <div ref={copyRef} className={cn("flex shrink-0 items-center", copyClassName)}>
          {children}
        </div>
        <div aria-hidden="true" {...({ inert: "" } as Record<string, string>)} className={cn("flex shrink-0 items-center", copyClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Marquee;
