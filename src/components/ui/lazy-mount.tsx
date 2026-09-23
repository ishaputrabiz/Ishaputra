import { useEffect, useRef, useState, type ReactNode } from 'react';

interface LazyMountProps {
  children: ReactNode;
  /** How far ahead of the viewport to start mounting. */
  rootMargin?: string;
  /** Reserves layout space so mounting doesn't shift the page. */
  placeholder?: ReactNode;
  className?: string;
}

/**
 * Renders `children` only once the element scrolls near the viewport.
 *
 * `loading="lazy"` is not enough for third-party embeds: Chrome's lazy-loading
 * threshold is generous on fast connections, so a Google Maps iframe sitting in
 * the site footer still pulled ~1.7 MB of Maps JS on every page load. Gating on
 * a real IntersectionObserver means it costs nothing until someone actually
 * scrolls to it.
 */
export const LazyMount = ({
  children,
  rootMargin = '200px',
  placeholder = null,
  className,
}: LazyMountProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;

    // Without IntersectionObserver, render immediately rather than never.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={ref} className={className}>
      {visible ? children : placeholder}
    </div>
  );
};

export default LazyMount;
