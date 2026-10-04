import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

export interface UseAutoScrollOptions {
  /** Pixels per frame; ~0.5 is a slow drift, ~1.4 a brisker glide. */
  speed?: number;
  /** Resume auto-scroll after this many ms of inactivity. */
  resumeDelay?: number;
  /** Reverse direction once each edge is reached so the row "ping-pongs". */
  pingPong?: boolean;
  /** Seamless infinite loop. Assumes content is duplicated; resets scrollLeft past half scrollWidth invisibly. */
  loop?: boolean;
  /** Initial direction: 1 = left→right (scrollLeft increases). */
  direction?: 1 | -1;
  /** Original card count before the consumer duplicates items for seamless looping. */
  loopItemCount?: number;
  /** Pixels to advance when the consumer calls scrollByPage() with a card width fallback. */
  pageStep?: number;
  /** Disable the loop entirely. Reduced motion, an off-screen row and a hidden tab also stop it. */
  enabled?: boolean;
}

export interface UseAutoScrollReturn {
  scrollerRef: React.RefObject<HTMLDivElement>;
  pause: () => void;
  resume: () => void;
  scrollByPage: (dir: "prev" | "next") => void;
  isPaused: boolean;
  canScroll: boolean;
}

/**
 * Smooth horizontal auto-scroll for any overflow-x container.
 * - Pauses on pointer/touch interaction and resumes after `resumeDelay`.
 * - Ping-pongs at edges so a short list still feels alive.
 * - Exposes prev/next handlers wired to the same pause logic so arrow buttons
 *   feel natural alongside the auto motion.
 * - The drift only runs while it can be seen: never under prefers-reduced-motion,
 *   and the frame loop stops while the row is off screen or the tab is hidden.
 *   Arrows (scrollByPage) keep working in every case.
 * - Keyboard focus inside the row pauses it until focus leaves.
 */
export function useAutoScroll(opts: UseAutoScrollOptions = {}): UseAutoScrollReturn {
  const {
    speed = 0.55,
    resumeDelay = 2200,
    pingPong = true,
    loop = false,
    direction = 1,
    loopItemCount = 0,
    pageStep,
    enabled = true,
  } = opts;

  const scrollerRef = useRef<HTMLDivElement>(null);
  /**
   * The position we intend, kept as a float.
   *
   * `scrollLeft` is read back rounded, so `el.scrollLeft += 0.5` every frame
   * threw the fraction away each time: the row advanced 0px, then 1px, then
   * 0px, which is exactly the stutter this carousel had. Keeping the true
   * position here and assigning it outright makes the motion continuous.
   */
  const posRef = useRef(0);
  /** Last value we wrote, so a change we did not make is the user scrolling. */
  const appliedRef = useRef(0);
  /** Layout metrics, refreshed on resize/mutation instead of every frame. */
  const metricsRef = useRef({ hasLoopCopies: false, logicalMax: 0, max: 0, resetPoint: 0 });
  const [isPaused, setIsPaused] = useState(false);
  const dirRef = useRef<1 | -1>(direction);
  const rafRef = useRef<number | null>(null);
  const elementPollRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null);
  const [canScroll, setCanScroll] = useState(false);
  /** Mirror of `canScroll` for the animation loop, which must not re-bind. */
  const canScrollRef = useRef(false);
  /** Set when the user (or an arrow) may have moved the row; the loop re-reads scrollLeft once. */
  const needsSyncRef = useRef(true);
  const reduceMotion = useReducedMotion();
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState !== "hidden"
  );
  /** The drift runs only when all of these hold. Measuring and arrows do not depend on it. */
  const autoplay = enabled && !reduceMotion && inView && pageVisible;

  const getScrollMetrics = useCallback(
    (el: HTMLDivElement) => {
      const hasLoopCopies = loop && loopItemCount > 0 && el.children.length > loopItemCount;
      const logicalScrollWidth = hasLoopCopies ? el.scrollWidth / 2 : el.scrollWidth;
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      const logicalMax = Math.max(0, logicalScrollWidth - el.clientWidth);

      return {
        hasLoopCopies,
        logicalMax,
        max,
        resetPoint: hasLoopCopies ? el.scrollWidth / 2 : max,
      };
    },
    [loop, loopItemCount]
  );

  const clearResumeTimer = () => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  };

  const pause = useCallback(() => {
    pausedRef.current = true;
    setIsPaused(true);
    clearResumeTimer();
  }, []);

  const resume = useCallback(() => {
    clearResumeTimer();
    resumeTimerRef.current = window.setTimeout(() => {
      needsSyncRef.current = true;
      pausedRef.current = false;
      setIsPaused(false);
    }, resumeDelay);
  }, [resumeDelay]);

  const measureScrollability = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || !enabled) {
      setCanScroll(false);
      return false;
    }

    const metrics = getScrollMetrics(el);
    metricsRef.current = metrics;
    const nextCanScroll = metrics.logicalMax > 2;
    canScrollRef.current = nextCanScroll;
    setCanScroll((prev) => (prev === nextCanScroll ? prev : nextCanScroll));

    if (!nextCanScroll) {
      clearResumeTimer();
      if (pausedRef.current) {
        pausedRef.current = false;
        setIsPaused(false);
      }
      dirRef.current = direction;
      if (Math.abs(el.scrollLeft) > 0.5) {
        el.scrollLeft = 0;
      }
    }

    return nextCanScroll;
  }, [direction, enabled, getScrollMetrics]);

  /** One measure per frame at most, however many observers fire. */
  const measureFrameRef = useRef<number | null>(null);
  const scheduleMeasure = useCallback(() => {
    if (measureFrameRef.current !== null) return;
    measureFrameRef.current = window.requestAnimationFrame(() => {
      measureFrameRef.current = null;
      measureScrollability();
    });
  }, [measureScrollability]);

  const scrollByPage = useCallback(
    (dir: "prev" | "next") => {
      const el = scrollerRef.current;
      if (!el || !canScroll) return;
      const step = pageStep ?? Math.max(160, Math.round(el.clientWidth * 0.85));
      if (loop) {
        const { hasLoopCopies, max, resetPoint } = getScrollMetrics(el);
        const target = dir === "next" ? el.scrollLeft + step : el.scrollLeft - step;
        if (hasLoopCopies && resetPoint > 0) {
          // For looped content (duplicated), allow seamless wrap on manual nav too.
          if (target < 0) {
            el.scrollLeft = target + resetPoint;
            el.scrollBy({ left: 0, behavior: "auto" });
            el.scrollBy({ left: -step, behavior: "smooth" });
          } else if (target > max) {
            el.scrollLeft = target - resetPoint;
            el.scrollBy({ left: 0, behavior: "auto" });
            el.scrollBy({ left: step, behavior: "smooth" });
          } else {
            el.scrollBy({ left: dir === "next" ? step : -step, behavior: "smooth" });
          }
        } else {
          let wrappedTarget = target;
          if (target < 0) {
            wrappedTarget = max;
          } else if (target > max) {
            wrappedTarget = 0;
          }
          el.scrollTo({ left: wrappedTarget, behavior: "smooth" });
        }
      } else {
        el.scrollBy({ left: dir === "next" ? step : -step, behavior: "smooth" });
      }
      needsSyncRef.current = true;
      pause();
      resume();
    },
    [canScroll, getScrollMetrics, pageStep, pause, resume, loop]
  );

  useEffect(() => {
    if (!enabled) {
      measureScrollability();
      return;
    }

    const waitForScroller = () => {
      if (scrollerRef.current) {
        setScrollerEl((prev) => (prev === scrollerRef.current ? prev : scrollerRef.current));
        measureScrollability();
        return;
      }
      elementPollRef.current = requestAnimationFrame(waitForScroller);
    };

    waitForScroller();

    return () => {
      if (elementPollRef.current !== null) {
        cancelAnimationFrame(elementPollRef.current);
      }
    };
  }, [enabled, measureScrollability]);

  useEffect(() => {
    const el = scrollerEl;
    if (!el) return;

    measureScrollability();

    const resizeObserver = new ResizeObserver(() => {
      scheduleMeasure();
    });
    resizeObserver.observe(el);

    // Cards added or removed. Direct children only: image loads and badge
    // changes deeper down never change the row's scroll width.
    const mutationObserver = new MutationObserver(() => {
      scheduleMeasure();
    });
    mutationObserver.observe(el, { childList: true });

    const handleWindowResize = () => {
      scheduleMeasure();
    };
    window.addEventListener("resize", handleWindowResize);

    // Run the drift only while the row is (nearly) on screen.
    let intersectionObserver: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      intersectionObserver = new IntersectionObserver(
        (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
        { rootMargin: "100px" }
      );
      intersectionObserver.observe(el);
    } else {
      setInView(true);
    }

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      intersectionObserver?.disconnect();
      window.removeEventListener("resize", handleWindowResize);
      if (measureFrameRef.current !== null) {
        cancelAnimationFrame(measureFrameRef.current);
        measureFrameRef.current = null;
      }
    };
  }, [measureScrollability, scheduleMeasure, scrollerEl]);

  // A hidden tab never animates.
  useEffect(() => {
    const handleVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Pause on touch, pointer, hover and keyboard focus; the loop re-reads the
  // position once afterwards instead of reading scrollLeft every frame.
  useEffect(() => {
    if (!enabled || !scrollerEl) return;

    const markUserScroll = () => {
      needsSyncRef.current = true;
    };
    const handlePointerDown = () => {
      needsSyncRef.current = true;
      pause();
    };
    const handlePointerUp = () => {
      resume();
    };
    const handleMouseEnter = () => {
      pause();
    };
    const handleMouseLeave = () => {
      resume();
    };
    const handleFocusIn = () => {
      needsSyncRef.current = true;
      pause();
    };
    const handleFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && scrollerEl.contains(event.relatedTarget)) return;
      resume();
    };

    scrollerEl.addEventListener("pointerdown", handlePointerDown, { passive: true });
    scrollerEl.addEventListener("pointerup", handlePointerUp, { passive: true });
    scrollerEl.addEventListener("pointercancel", handlePointerUp, { passive: true });
    scrollerEl.addEventListener("touchstart", handlePointerDown, { passive: true });
    scrollerEl.addEventListener("touchend", handlePointerUp, { passive: true });
    scrollerEl.addEventListener("wheel", markUserScroll, { passive: true });
    scrollerEl.addEventListener("mouseenter", handleMouseEnter);
    scrollerEl.addEventListener("mouseleave", handleMouseLeave);
    scrollerEl.addEventListener("focusin", handleFocusIn);
    scrollerEl.addEventListener("focusout", handleFocusOut);

    return () => {
      clearResumeTimer();
      scrollerEl.removeEventListener("pointerdown", handlePointerDown);
      scrollerEl.removeEventListener("pointerup", handlePointerUp);
      scrollerEl.removeEventListener("pointercancel", handlePointerUp);
      scrollerEl.removeEventListener("touchstart", handlePointerDown);
      scrollerEl.removeEventListener("touchend", handlePointerUp);
      scrollerEl.removeEventListener("wheel", markUserScroll);
      scrollerEl.removeEventListener("mouseenter", handleMouseEnter);
      scrollerEl.removeEventListener("mouseleave", handleMouseLeave);
      scrollerEl.removeEventListener("focusin", handleFocusIn);
      scrollerEl.removeEventListener("focusout", handleFocusOut);
    };
  }, [enabled, pause, resume, scrollerEl]);

  useEffect(() => {
    if (!autoplay || !scrollerEl) return;

    /**
     * Re-measure only when the layout could actually have changed.
     *
     * This used to run on every frame, and it reads `scrollWidth` and
     * `clientWidth` - two forced synchronous layouts per frame, on top of the
     * one the scroll write already costs. The ResizeObserver and
     * MutationObserver above already tell us when the row changes, so the loop
     * can just read the cached numbers. scrollLeft is read back only after the
     * user or an arrow moved the row (needsSyncRef).
     */
    let lastTs = performance.now();
    needsSyncRef.current = true;

    const tick = (ts: number) => {
      const el = scrollerEl;
      const dt = Math.min(ts - lastTs, 50); // a backgrounded tab must not lurch
      lastTs = ts;

      if (!pausedRef.current && canScrollRef.current) {
        // The user (wheel, touch, a smooth scrollByPage) may have moved it
        // since our last write, so follow them rather than yanking it back.
        if (needsSyncRef.current) {
          posRef.current = el.scrollLeft;
          needsSyncRef.current = false;
        }

        // ~60fps baseline, scaled by elapsed time so motion stays steady.
        posRef.current += speed * (dt / 16.67) * dirRef.current;

        const { hasLoopCopies, max, resetPoint } = metricsRef.current;
        if (loop) {
          if (hasLoopCopies && resetPoint > 0) {
            // Seamless infinite loop: consumer renders a second copy of the content.
            if (posRef.current >= resetPoint) {
              posRef.current -= resetPoint;
            } else if (posRef.current <= 0) {
              posRef.current += resetPoint;
            }
          } else if (dirRef.current >= 0 && posRef.current >= max - 0.5) {
            posRef.current = 0;
          } else if (dirRef.current < 0 && posRef.current <= 0.5) {
            posRef.current = max;
          }
        } else if (pingPong) {
          if (posRef.current >= max - 0.5) {
            posRef.current = max;
            dirRef.current = -1;
          } else if (posRef.current <= 0.5) {
            posRef.current = 0;
            dirRef.current = 1;
          }
        } else if (posRef.current >= max - 0.5) {
          posRef.current = 0;
        }

        // Kept as the original write. The rows carry scroll-behavior: smooth
        // (index.css), which swallows it, so on screen the rows stay still, as
        // they always have. The owner kept today's behaviour (2026-10-04); a
        // visible drift would need behavior: 'instant' here and their OK.
        el.scrollLeft = posRef.current;
        appliedRef.current = posRef.current;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [autoplay, loop, scrollerEl, speed, pingPong]);

  // Direction resets only when the caller changes it, not every time the loop restarts.
  useEffect(() => {
    dirRef.current = direction;
  }, [direction]);

  return { scrollerRef, pause, resume, scrollByPage, isPaused, canScroll };
}

export default useAutoScroll;
