/**
 * Motion presets for framer-motion (the import the codebase already uses; do
 * not switch to 'motion/react'). CSS twins: --ease-* and --dur-* in
 * src/index.css, Tailwind ease-out / duration-press ... duration-reveal.
 *
 * Rules (docs/ui-system.md): animate transform and opacity only; exits are
 * faster than entries; UI motion stays under 300ms; never animate a
 * keyboard-initiated or very frequent action. <MotionConfig reducedMotion="user">
 * at the app root turns transforms off for reduced-motion visitors and keeps
 * the opacity fades.
 */
import type { Transition } from 'framer-motion';

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

/** Seconds, matching the CSS --dur-* tokens. */
export const DUR = {
  press: 0.14,
  hover: 0.15,
  dropdown: 0.2,
  modal: 0.24,
  drawer: 0.3,
  exit: 0.18,
  reveal: 0.32,
} as const;

/** Content appearing in place: a toast-like card, a message, a swapped panel. */
export const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, transition: { duration: DUR.exit } },
  transition: { duration: DUR.modal, ease: EASE_OUT } as Transition,
};

/** Small things that pop into view: a badge, a check mark, a menu without Radix. */
export const pop = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96, transition: { duration: DUR.exit } },
  transition: { duration: DUR.dropdown, ease: EASE_OUT } as Transition,
};

/** Hand-built bottom sheet (prefer the Sheet/Drawer primitives). */
export const sheetBottom = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%', transition: { duration: DUR.exit, ease: EASE_OUT } },
  transition: { duration: DUR.drawer, ease: EASE_DRAWER } as Transition,
};

/** Hand-built side panel from the right (prefer the Sheet primitive). */
export const sheetRight = {
  initial: { x: '100%' },
  animate: { x: 0 },
  exit: { x: '100%', transition: { duration: DUR.exit, ease: EASE_OUT } },
  transition: { duration: DUR.drawer, ease: EASE_DRAWER } as Transition,
};

/** Scroll reveal for a whole section (use <Reveal>, never per product). */
export const reveal = {
  initial: { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.1 },
  transition: { duration: DUR.reveal, ease: EASE_OUT } as Transition,
};

/** Stagger for a list entering together: 40ms apart, capped at 8 items (320ms). */
export const staggerDelay = (i: number) => Math.min(Math.max(i, 0), 8) * 0.04;

/** Press feedback for motion.button: whileTap={tap}. */
export const tap = { scale: 0.97 } as const;
