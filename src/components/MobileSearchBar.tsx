import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EASE_OUT } from "@/lib/motion";

const CATEGORIES = [
  "shilajit",
  "ashwagandha",
  "hair oil",
  "hair serum",
  "face wash",
  "face serum",
  "beard oil",
  "body wash",
  "deodorant",
  "herbal tea",
];

const STATIC_PLACEHOLDER = "Search shilajit, hair oil and more";

const MobileSearchBar = () => {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || !document.hidden,
  );

  // The word ticker is a loop: pause it off screen and in a background tab.
  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    const el = buttonRef.current;
    let io: IntersectionObserver | undefined;
    if (el && "IntersectionObserver" in window) {
      io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
      io.observe(el);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, []);

  const ticking = !reduceMotion && pageVisible && onScreen;

  useEffect(() => {
    if (!ticking) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % CATEGORIES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [ticking]);

  return (
    <div className="lg:hidden bg-background px-4 pt-1 pb-2">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => navigate("/search")}
        aria-label="Search products"
        className="flex h-[46px] w-full items-center gap-2.5 rounded-control bg-muted px-4 text-left transition-[transform,background-color] duration-press ease-out hover:bg-foreground/[0.07] active:scale-[0.97]"
      >
        <Search aria-hidden="true" className="size-5 flex-shrink-0 text-foreground/80" />

        {reduceMotion ? (
          <span aria-hidden="true" className="min-w-0 truncate text-sm text-foreground/70">
            {STATIC_PLACEHOLDER}
          </span>
        ) : (
          <span aria-hidden="true" className="flex min-w-0 flex-1 items-center text-sm text-foreground/70">
            <span className="mr-1 flex-shrink-0 whitespace-nowrap">Search for</span>
            <span className="relative h-5 min-w-0 flex-1 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={currentIndex}
                  initial={{ opacity: 0, transform: "translateY(6px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  exit={{ opacity: 0, transform: "translateY(-6px)" }}
                  transition={{ duration: 0.22, ease: EASE_OUT }}
                  className="absolute left-0 top-0 whitespace-nowrap leading-5"
                >
                  {CATEGORIES[currentIndex]}
                </motion.span>
              </AnimatePresence>
            </span>
          </span>
        )}
      </button>
    </div>
  );
};

export default MobileSearchBar;
