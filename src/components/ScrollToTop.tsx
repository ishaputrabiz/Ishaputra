import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const STORAGE_KEY = 'scrollPositions';

function loadPositions(): Map<string, number> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    return new Map(JSON.parse(raw) as [string, number][]);
  } catch {
    return new Map();
  }
}

function savePositions(map: Map<string, number>) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...map.entries()]));
  } catch {
    // sessionStorage may be unavailable — silently fail
  }
}

/**
 * Smart scroll behavior:
 *  - On forward (PUSH / REPLACE) navigation -> scroll to top.
 *  - On back/forward (POP) navigation -> restore the previously saved scroll
 *    position for that path using sessionStorage so positions survive
 *    component re-mounts.
 *
 * Key mechanism: history.pushState and popstate are intercepted to capture the
 * CORRECT scroll position BEFORE the DOM changes (which would otherwise clamp
 * window.scrollY to the new shorter page height). A lock prevents the scroll
 * event listener from overwriting the correct saved value during the transition.
 */
export default function ScrollToTop() {
  const { pathname, search } = useLocation();
  const navType = useNavigationType();
  const positionsRef = useRef<Map<string, number>>(loadPositions());
  // When true, the scroll event listener skips saving (navigation in progress).
  const lockRef = useRef(false);
  /**
   * Key of the route currently on screen.
   *
   * On popstate the browser has already swapped window.location to the incoming
   * URL, so we cannot read the outgoing key from it - we need this ref. It must
   * track EVERY navigation, not just POP: a version that only updated inside the
   * popstate handler went stale after any forward navigation, so going back
   * saved the product page's scroll position under the category page's key and
   * wiped it.
   */
  const currentKeyRef = useRef(`${pathname}${search}`);

  useEffect(() => {
    currentKeyRef.current = `${pathname}${search}`;
  }, [pathname, search]);

  // Disable the browser's built-in scroll restoration so we control it.
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);

  // Persist scroll position of the current page while the user scrolls.
  // The lock prevents spurious saves during navigation transitions where the
  // browser clamps scrollY due to the new page being shorter.
  useEffect(() => {
    const key = `${pathname}${search}`;
    const handleScroll = () => {
      if (lockRef.current) return;
      positionsRef.current.set(key, window.scrollY);
      savePositions(positionsRef.current);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [pathname, search]);

  // Intercept history mutations to snapshot scroll BEFORE the DOM changes.
  // This captures the correct scrollY for the page being left, before the
  // incoming route renders a shorter page that would clamp window.scrollY.
  useEffect(() => {
    const snapshotAndLock = (key: string) => {
      positionsRef.current.set(key, window.scrollY);
      savePositions(positionsRef.current);
      lockRef.current = true;
    };

    const origPush = history.pushState.bind(history) as typeof history.pushState;
    const origReplace = history.replaceState.bind(history) as typeof history.replaceState;

    history.pushState = function (...args: Parameters<typeof history.pushState>) {
      snapshotAndLock(window.location.pathname + window.location.search);
      return origPush(...args);
    };

    history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
      snapshotAndLock(window.location.pathname + window.location.search);
      return origReplace(...args);
    };

    // For back/forward (POP): popstate fires before React re-renders, so
    // currentKeyRef still holds the outgoing route.
    const handlePopstate = () => {
      snapshotAndLock(currentKeyRef.current);
    };
    window.addEventListener('popstate', handlePopstate);

    return () => {
      history.pushState = origPush;
      history.replaceState = origReplace;
      window.removeEventListener('popstate', handlePopstate);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Decide where to scroll on navigation.
  useEffect(() => {
    const key = `${pathname}${search}`;

    if (navType === 'POP') {
      // Reload positions from storage in case they were written by another tab
      // or after a page reload.
      const stored = loadPositions();
      stored.forEach((v, k) => positionsRef.current.set(k, v));

      const saved = positionsRef.current.get(key) ?? 0;
      if (saved <= 0) {
        lockRef.current = false;
        return;
      }

      // Attempt 1 — immediate (in case content is already rendered)
      const tryScroll = () => {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: Math.min(saved, maxScroll), left: 0, behavior: 'auto' });
      };

      requestAnimationFrame(tryScroll);
      // Attempt 2 — after 200 ms (lazy images/skeleton content)
      const t1 = setTimeout(tryScroll, 200);
      // Attempt 3 — after 700 ms (slow Firebase reads / heavy grids), then unlock
      const t2 = setTimeout(() => {
        tryScroll();
        lockRef.current = false;
      }, 700);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        lockRef.current = false;
      };
    } else {
      // PUSH / REPLACE: scroll to top, then unlock
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      const t = setTimeout(() => { lockRef.current = false; }, 100);
      return () => {
        clearTimeout(t);
        lockRef.current = false;
      };
    }
  }, [pathname, search, navType]);

  return null;
}

