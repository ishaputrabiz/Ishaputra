import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";

interface LoadingScreenProps {
  onComplete?: () => void;
}

// Public-folder logos provided by the user
const LIGHT_MODE_LOGO = "/loading_black.png"; // dark logo on light bg
const DARK_MODE_LOGO = "/loading_white.png";  // light logo on dark bg

const MIN_MS = 1000; // always show for at least this long

const LoadingScreen = ({ onComplete }: LoadingScreenProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const { resolvedTheme } = useTheme();
  const { loading: authLoading } = useAuth();
  const isDark = resolvedTheme === "dark";
  const logoSrc = isDark ? DARK_MODE_LOGO : LIGHT_MODE_LOGO;

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

  // Minimum timer — always at least MIN_MS
  useEffect(() => {
    const t = setTimeout(() => {
      minDone.current = true;
      tryComplete();
    }, MIN_MS);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auth readiness — whenever auth finishes loading, check if we can dismiss
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
          className={`fixed inset-0 z-[9999] flex items-center justify-center md:hidden ${
            isDark ? "bg-[#0a0a0a]" : "bg-[#FBF8F3]"
          }`}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.5, ease: [0.76, 0, 0.24, 1] }}
        >
          {/* Soft luxury radial backdrop */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background: isDark
                ? "radial-gradient(circle at 50% 50%, rgba(212,175,55,0.08), transparent 60%)"
                : "radial-gradient(circle at 50% 50%, rgba(212,175,55,0.12), transparent 60%)",
            }}
          />

          {/* Animated gold ring pulse behind the logo */}
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 260,
              height: 260,
              border: "1px solid rgba(212,175,55,0.35)",
            }}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: [0.7, 1.15, 0.95], opacity: [0, 0.6, 0] }}
            transition={{ duration: 2.4, ease: "easeOut", repeat: Infinity }}
          />
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 200,
              height: 200,
              border: "1px solid rgba(212,175,55,0.25)",
            }}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [0.6, 1.1, 0.9], opacity: [0, 0.5, 0] }}
            transition={{ duration: 2.4, ease: "easeOut", repeat: Infinity, delay: 0.4 }}
          />

          {/* Centered logo */}
          <motion.div
            className="relative flex flex-col items-center justify-center"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.img
              src={logoSrc}
              alt="Sreerasthu Silvers"
              className="w-44 h-auto object-contain drop-shadow-[0_8px_30px_rgba(212,175,55,0.25)]"
              animate={{
                filter: [
                  "drop-shadow(0 0 0px rgba(212,175,55,0.0))",
                  "drop-shadow(0 0 18px rgba(212,175,55,0.45))",
                  "drop-shadow(0 0 0px rgba(212,175,55,0.0))",
                ],
              }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Thin shimmer line */}
            <motion.div
              className="mt-6 h-[2px] w-32 overflow-hidden rounded-full"
              style={{
                background: isDark
                  ? "linear-gradient(90deg, transparent, rgba(212,175,55,0.6), transparent)"
                  : "linear-gradient(90deg, transparent, rgba(180,140,40,0.7), transparent)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LoadingScreen;

