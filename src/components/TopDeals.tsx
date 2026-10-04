import { useState, useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { UIProduct, adaptFirebaseArrayToUI } from "@/lib/productAdapter";
import useAutoScroll from "@/hooks/useAutoScroll";
import { SmartImage } from "@/components/ui/smart-image";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductRowSkeleton } from "@/components/skeletons";
import ProductCard from "@/components/ProductCard";
import Reveal from "@/components/Reveal";
import { formatINR } from "@/lib/format";
import { subscribeToActiveProductsByFlag } from '@/services/productCache';

const HEADING_FONT = { fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" };
const INERT = { inert: "" } as Record<string, string>;
const DEALS_LINK = "/products?tag=top-deals";

/** Panel shell shared by the loaded section and its skeleton, so both have the same size. */
const Panel = ({ children, busy }: { children: React.ReactNode; busy?: boolean }) => (
  <section className="py-8 md:py-12" aria-busy={busy || undefined}>
    <div className="container-custom">
      <div className="panel tx-sheet tx-contour overflow-hidden px-3 py-5 md:px-8 md:py-10">{children}</div>
    </div>
  </section>
);

const Header = ({ children }: { children?: React.ReactNode }) => (
  <div className="mb-4 flex items-end justify-between gap-3 px-1 md:mb-8 md:px-0">
    <div className="min-w-0">
      <p className="eyebrow-no mb-2 md:mb-3">Top deals</p>
      <h2
        className="text-xl font-semibold text-foreground [text-wrap:balance] md:text-3xl lg:text-4xl"
        style={HEADING_FONT}
      >
        Savings on our best rituals
      </h2>
    </div>
    {children}
  </div>
);

const TopDeals = () => {
  const reduceMotion = useReducedMotion();
  const [products, setProducts] = useState<UIProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const {
    scrollerRef: mobileScrollRef,
    scrollByPage: mobileScrollByPage,
    canScroll: canMobileDealsScroll,
  } = useAutoScroll({ speed: 0.5, resumeDelay: 2400, loop: true, direction: 1, loopItemCount: products.length });

  const mobileDealProducts =
    canMobileDealsScroll && products.length > 1 ? [...products, ...products] : products;

  // Desktop: featured product on left, rest on right with pagination.
  // Keep these derived values before early returns so the hook setup below is
  // always executed in the same order while data loads and after products arrive.
  const featuredProduct = products[0];
  const restProducts = products.slice(1);
  const desktopProducts = restProducts.length > 0 ? restProducts : products;
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const canDesktopDealsScroll = desktopProducts.length > 3;

  const scrollDesktopByPage = (dir: 'prev' | 'next') => {
    const node = desktopScrollRef.current;
    if (!node) return;
    const delta = Math.max(260, node.clientWidth * 0.82) * (dir === 'next' ? 1 : -1);
    node.scrollBy({ left: delta, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  // Desktop auto-loop: rotate the right-hand product page automatically so the
  // section feels alive. Pauses while the pointer is over the cards or keyboard
  // focus is inside them, after manual prev/next, in a hidden tab, and never
  // runs under reduced motion.
  const desktopHoverRef = useRef(false);
  const manualPauseUntilRef = useRef(0);
  const ROTATE_INTERVAL_MS = 4500;
  const RESUME_DELAY_MS = 6000;

  useEffect(() => {
    if (!canDesktopDealsScroll || reduceMotion) return;
    const interval = window.setInterval(() => {
      if (desktopHoverRef.current) return;
      if (document.visibilityState === 'hidden') return;
      if (Date.now() < manualPauseUntilRef.current) return;
      const node = desktopScrollRef.current;
      if (!node) return;
      const maxLeft = node.scrollWidth - node.clientWidth;
      if (node.scrollLeft >= maxLeft - 8) {
        node.scrollTo({ left: 0, behavior: 'smooth' });
      } else {
        scrollDesktopByPage('next');
      }
    }, ROTATE_INTERVAL_MS);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDesktopDealsScroll, reduceMotion]);

  const handleManualPage = (dir: 'prev' | 'next') => {
    manualPauseUntilRef.current = Date.now() + RESUME_DELAY_MS;
    scrollDesktopByPage(dir);
  };

  useEffect(() => {
    const unsubscribe = subscribeToActiveProductsByFlag('isTopDeal', (fbProducts) => {
      const uiProducts = adaptFirebaseArrayToUI(fbProducts);
      setProducts(uiProducts);
      setLoading(false);
    }, 10);

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <Panel busy>
        <span className="sr-only" role="status">Loading deals</span>
        <Header />
        <ProductRowSkeleton count={3} label="" itemClassName="h-[279px] w-[160px] overflow-hidden" className="pb-2 md:hidden" />
        <div className="hidden gap-5 md:flex" style={{ minHeight: 420 }}>
          <Skeleton className="w-[38%] rounded-card" />
          <div className="flex w-[62%] flex-col justify-between rounded-card border border-foreground/[0.06] p-6">
            <ProductRowSkeleton count={4} label="" className="p-1" itemClassName="h-[296px] w-[190px] overflow-hidden lg:h-[320px] lg:w-[205px]" />
            <div className="mt-5 flex gap-2 pt-3">
              <Skeleton className="size-10 rounded-full" />
              <Skeleton className="size-10 rounded-full" />
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  if (products.length === 0) return null;

  const hasDealPrice = featuredProduct.oldPrice && featuredProduct.oldPrice > featuredProduct.price;

  return (
    <Reveal>
      <Panel>
        {/* Header: one heading and one "View all" at every width; arrows on phones */}
        <Header>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label="Scroll deals left"
              onClick={() => mobileScrollByPage('prev')}
              disabled={!canMobileDealsScroll}
              className="btn-round md:hidden"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Scroll deals right"
              onClick={() => mobileScrollByPage('next')}
              disabled={!canMobileDealsScroll}
              className="btn-round md:hidden"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
            <Link to={DEALS_LINK} className="link-arrow ml-1.5 md:ml-0">
              View all <ChevronRight aria-hidden="true" className="hidden size-4 md:block" />
            </Link>
          </div>
        </Header>

        {/* ====== MOBILE: Horizontal scroll cards ====== */}
        <div className="md:hidden">
          <div
            ref={mobileScrollRef}
            className="flex gap-3 overflow-x-auto scrollbar-hide px-1 pb-2"
            style={{ WebkitOverflowScrolling: 'touch', scrollPaddingLeft: '8px' }}
          >
            {mobileDealProducts.map((product, index) => {
              const isLoopCopy = index >= products.length;
              return (
                <div
                  key={`${product.id}-${index}`}
                  className="w-[160px] flex-none"
                  aria-hidden={isLoopCopy || undefined}
                  {...(isLoopCopy ? INERT : {})}
                >
                  <ProductCard product={product} index={index} size="row" className="w-full" />
                </div>
              );
            })}
          </div>
        </div>

        {/* ====== DESKTOP: Split layout (featured banner + product cards) ====== */}
        <div className="hidden gap-5 md:flex" style={{ minHeight: 420 }}>
          {/* Left: deal of the week, the whole card links to the product */}
          <div className="group relative isolate flex w-[38%] flex-col justify-end overflow-hidden rounded-card bg-charcoal">
            <SmartImage
              src={featuredProduct.image}
              alt=""
              className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
              preset="detail"
            />
            <div aria-hidden="true" className="photo-scrim absolute inset-0 -z-10" />
            <span className="tag-dark absolute left-5 top-5">Deal of the week</span>
            <div className="p-8 text-charcoal-foreground">
              <h3 className="on-photo mb-2 text-2xl font-semibold [text-wrap:balance]" style={HEADING_FONT}>
                {featuredProduct.title}
              </h3>
              <p className="on-photo mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-xl font-bold tabular-nums">{formatINR(featuredProduct.price)}</span>
                {hasDealPrice && (
                  <span className="text-sm tabular-nums text-charcoal-foreground/75 line-through">
                    <span className="sr-only">Was </span>
                    {formatINR(featuredProduct.oldPrice as number)}
                  </span>
                )}
                {(featuredProduct.discount ?? 0) > 0 && (
                  <span className="chip-off !border-highlight-soft/60 !text-highlight-soft">{featuredProduct.discount}% off</span>
                )}
              </p>
              <Link
                to={`/product/${featuredProduct.id}`}
                className="btn-line w-fit text-charcoal-foreground after:absolute after:inset-0 after:content-[''] group-hover:bg-charcoal-foreground group-hover:text-charcoal"
              >
                Shop now<span className="sr-only">: {featuredProduct.title}</span>
              </Link>
            </div>
          </div>

          {/* Right: product cards */}
          <div
            className="flex w-[62%] flex-col justify-between rounded-card border border-foreground/[0.06] bg-background/40 p-6"
            onMouseEnter={() => { desktopHoverRef.current = true; }}
            onMouseLeave={() => { desktopHoverRef.current = false; }}
            onFocus={() => { desktopHoverRef.current = true; }}
            onBlur={(e) => {
              if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
              desktopHoverRef.current = false;
            }}
          >
            <div
              ref={desktopScrollRef}
              /*
                No `scroll-smooth` and no mandatory snap here.

                `scroll-behavior: smooth` animates EVERY scroll, including the
                user's own wheel and trackpad, which is what made this row
                feel heavy and laggy to drag - the arrows pass
                `behavior: 'smooth'` themselves, so nothing is lost. Mandatory
                snapping then pulled the row back to the nearest card after
                each programmatic page, producing a visible tug. Proximity
                snapping still tidies the resting position without fighting.
              */
              className="flex snap-x snap-proximity gap-4 overflow-x-auto scrollbar-hide p-1"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {desktopProducts.map((product, index) => (
                <div key={product.id} className="w-[190px] flex-none snap-start lg:w-[205px]">
                  <ProductCard product={product} index={index} size="row" className="w-full" />
                </div>
              ))}
            </div>

            {/* Bottom: navigation arrows */}
            <div className="mt-5 flex items-center gap-2 pt-3">
              <button
                type="button"
                onClick={() => handleManualPage('prev')}
                disabled={!canDesktopDealsScroll}
                aria-label="Previous deals"
                className="btn-round"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => handleManualPage('next')}
                disabled={!canDesktopDealsScroll}
                aria-label="Next deals"
                className="btn-round"
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
        </div>

        <style>{`
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>
      </Panel>
    </Reveal>
  );
};

export default TopDeals;
