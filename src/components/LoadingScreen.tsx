import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { EASE_OUT } from "@/lib/motion";

interface LoadingScreenProps {
  onComplete?: () => void;
}

// Monogram, built by scripts/build-logo-assets.mjs
const LIGHT_MODE_LOGO = "/loading_black.png"; // deep bronze, for the cream background
const DARK_MODE_LOGO = "/loading_white.png";  // bright bronze, for charcoal

const MIN_MS = 700; // always show for at least this long (owner decision, 2026-10-04)

const LoadingScreen = ({ onComplete }: LoadingScreenProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const { resolvedTheme } = useTheme();
  const { loading: authLoading } = useAuth();
  const isDark = resolvedTheme === "dark";
  const logoSrc = isDark ? DARK_MODE_LOGO : LIGHT_MODE_LOGO;
  const reduceMotion = useReducedMotion();

  // Track both conditions via refs so effects can cross-check without stale closures
  const minDone = useRef(false);
  const authDone = useRef(!authLoading);
  const completed = useRef(false);

  const tryComplete = () => {
    if (completed.current) return;
    if (minDone.current && authDone.current) {
      completed.current = true;
      setIsLoading(false);
      onComplete?.();
    }
  };

  // Minimum timer: always at least MIN_MS
  useEffect(() => {
    const t = setTimeout(() => {
      minDone.current = true;
      tryComplete();
    }, MIN_MS);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth readiness: whenever auth finishes loading, check if we can dismiss
  useEffect(() => {
    if (!authLoading) {
      authDone.current = true;
      tryComplete();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]);

  return (
    <AnimatePresence>
      {isLoading && (
        <motion.div
          role="status"
          aria-label="Loading Ishaputra Botanicals"
          className={`fixed inset-0 z-loader flex items-center justify-center md:hidden ${
            isDark ? "bg-charcoal" : "bg-cream"
          }`}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.28, ease: EASE_OUT } }}
        >
          {/* Warm copper glow behind the mark */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle at 50% 44%, hsl(var(--primary)/${isDark ? 0.16 : 0.1}), transparent 58%)`,
            }}
          />

          <div className="relative flex flex-col items-center">
            {/* Monogram, unveiled from the base up */}
            <motion.div
              className="relative"
              initial={reduceMotion ? false : { clipPath: "inset(100% 0 0 0)", opacity: 0.4 }}
              animate={{ clipPath: "inset(0% 0 0 0)", opacity: 1 }}
              transition={{ duration: 0.6, ease: EASE_OUT }}
            >
              <img src={logoSrc} alt="" className="h-40 w-auto object-contain" />
              {/* One band of copper light sweeping across the metal, masked to the logo shape */}
              {!reduceMotion && (
                <motion.div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    WebkitMaskImage: `url(${logoSrc})`,
                    maskImage: `url(${logoSrc})`,
                    WebkitMaskSize: "contain",
                    maskSize: "contain",
                    WebkitMaskRepeat: "no-repeat",
                    maskRepeat: "no-repeat",
                    WebkitMaskPosition: "center",
                    maskPosition: "center",
                    backgroundImage:
                      "linear-gradient(105deg, transparent 35%, hsl(var(--charcoal-foreground) / 0.85) 50%, transparent 65%)",
                    backgroundSize: "250% 100%",
                  }}
                  initial={{ backgroundPosition: "130% 0" }}
                  animate={{ backgroundPosition: ["130% 0", "-30% 0"] }}
                  transition={{ duration: 0.9, ease: [0.77, 0, 0.175, 1], delay: 0.3 }}
                />
              )}
            </motion.div>

            {/* Tagline settles into place */}
            <motion.p
              aria-hidden="true"
              className={`mt-7 text-[10px] font-semibold uppercase tracking-[0.32em] ${isDark ? "text-charcoal-foreground/70" : "text-muted-foreground"}`}
              initial={reduceMotion ? false : { opacity: 0, transform: "translateY(6px)" }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              transition={{ duration: 0.4, delay: 0.2, ease: EASE_OUT }}
            >
              Pure wellness for a stronger you
            </motion.p>

            {/* Copper progress line */}
            <div aria-hidden="true" className={`mt-6 h-[2px] w-28 overflow-hidden rounded-full ${isDark ? "bg-charcoal-foreground/10" : "bg-foreground/10"}`}>
              <motion.div
                className="h-full w-1/2 rounded-full bg-primary"
                initial={{ x: "-100%" }}
                animate={reduceMotion ? { x: "50%" } : { x: ["-100%", "200%"] }}
                transition={reduceMotion ? { duration: 0 } : { duration: 1.2, ease: "easeInOut", repeat: Infinity }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LoadingScreen;

