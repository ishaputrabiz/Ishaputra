import * as React from "react";
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";

import { reveal } from "@/lib/motion";

export interface RevealProps extends Omit<HTMLMotionProps<"div">, "initial" | "whileInView" | "viewport" | "transition"> {
  /** Seconds before this section starts (rarely needed; never stagger products). */
  delay?: number;
}

/**
 * Scroll reveal for a whole section: fades up 12px over 320ms the first time
 * 10% of it is on screen. Wrap section panels, never individual products.
 * Under reduced motion it renders in place with no animation.
 *
 *   <Reveal><section>...</section></Reveal>
 */
export const Reveal = React.forwardRef<HTMLDivElement, RevealProps>(({ delay = 0, children, ...props }, ref) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      initial={reduceMotion ? false : reveal.initial}
      whileInView={reveal.whileInView}
      viewport={reveal.viewport}
      transition={delay ? { ...reveal.transition, delay } : reveal.transition}
      {...props}
    >
      {children}
    </motion.div>
  );
});
Reveal.displayName = "Reveal";

export default Reveal;
