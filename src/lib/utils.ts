import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge taught the custom theme keys from tailwind.config.ts, so a
 * caller's `rounded-full` replaces a primitive's `rounded-control`, `z-popover`
 * replaces `z-overlay`, `duration-modal` replaces `duration-press`, and so on.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      borderRadius: ["panel", "card", "control", "chip"],
      opacity: ["6", "7", "8", "11", "12", "18", "28", "42"],
    },
    classGroups: {
      z: [{ z: ["raised", "sticky", "header", "overlay", "drawer", "popover", "toast", "loader", "grain"] }],
      duration: [{ duration: ["press", "hover", "tooltip", "dropdown", "modal", "drawer", "exit", "reveal"] }],
      ease: [{ ease: ["drawer"] }],
      shadow: [{ shadow: ["panel"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
