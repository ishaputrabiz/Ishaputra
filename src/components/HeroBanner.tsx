import { useEffect, useMemo, useRef, useState, type FocusEvent, type TransitionEvent } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { subscribeToActiveBanners, Banner } from "@/services/bannerService";
import { SmartImage } from "@/components/ui/smart-image";
import { IconButton } from "@/components/ui/icon-button";
import { CarouselDots } from "@/components/ui/carousel-dots";
import { HeroSkeleton } from "@/components/skeletons";
import { cldUrl } from "@/lib/cloudinaryUrl";
import { cn } from "@/lib/utils";

/**
 * Brand lines laid over the hero photos, one per slide in turn. Banner
 * artwork should therefore be photography without baked-in text.
 */
const HERO_LINES = [
  "Pure wellness\nfor a stronger you.",
  "Classical Ayurveda,\nmodern routine.",
  "Rooted in Ayurveda.\nBuilt for men.",
];

/** Time each slide stays on screen before the next one. */
const SLIDE_MS = 4200;
/** After a click on an arrow or a dot, wait this long before autoplay resumes. */
const RESUME_MS = 4200;
/** Movement on screen: strong ease-in-out (--ease-in-out). */
const SLIDE_TRANSITION = "transform 650ms cubic-bezier(0.77, 0, 0.175, 1)";
const SLIDE_SIZE = "aspect-[4/5] md:aspect-[4/3] lg:aspect-auto lg:h-[min(84vh,56.25vw)]";
const MOBILE_QUERY = "(max-width: 1023px)";
const INERT = { inert: "" } as Record<string, string>;

/** The one image this viewport will ask for: the 900px phone crop or the 1600px desktop banner. */
const visibleSource = (banner: Banner, isMobile: boolean) =>
  isMobile ? cldUrl(banner.mobileImageUrl || banner.imageUrl, "detail") : cldUrl(banner.imageUrl, "hero");

const idle = (cb: () => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(cb, { timeout: 2000 });
  else window.setTimeout(cb, 300);
};

/**
 * Seamless looping hero carousel.
 *
 * Full-bleed: the photo runs edge to edge, capped at the viewport height.
 * The first slide is cloned at the end of the track so looping from the last
 * banner back to the first does not produce a visible reset.
 *
 * Slide 1 renders as soon as the banners arrive (its image is the page's LCP,
 * fetched eagerly at high priority); the other slides warm up in idle time once
 * it has loaded. Autoplay waits for slide 1, pauses on hover, on keyboard focus
 * inside, while off screen or in a hidden tab, and never runs under reduced
 * motion. Only the slide on screen can be focused or read.
 */
const HeroBanner = () => {
  const reduceMotion = useReducedMotion();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstSlideReady, setFirstSlideReady] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transitionsEnabled, setTransitionsEnabled] = useState(true);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [touching, setTouching] = useState(false);
  const [holdAfterClick, setHoldAfterClick] = useState(false);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const resumeTimerRef = useRef<number | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const warmedRef = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeToActiveBanners(
      (activeBanners) => {
        setBanners(activeBanners);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading banners:", error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Autoplay waits for slide 1's image, with a fallback so a slow or failed
  // image never stops the carousel for good.
  useEffect(() => {
    if (banners.length === 0) return;
    const fallback = window.setTimeout(() => setFirstSlideReady(true), 3000);
    return () => window.clearTimeout(fallback);
  }, [banners]);

  // Once slide 1 is in, warm the other slides at the size this screen uses.
  useEffect(() => {
    if (!firstSlideReady || warmedRef.current || banners.length < 2) return;
    warmedRef.current = true;
    idle(() => {
      const isMobile = window.matchMedia(MOBILE_QUERY).matches;
      banners.slice(1).forEach((banner) => {
        const src = visibleSource(banner, isMobile);
        if (!src) return;
        const img = new Image();
        img.decoding = "async";
        img.src = src;
      });
    });
  }, [firstSlideReady, banners]);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading, banners.length]);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => () => {
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
  }, []);

  const count = banners.length;
  const hasMultipleBanners = count > 1;
  const displayBanners = useMemo(
    () => (hasMultipleBanners ? [...banners, banners[0]] : banners),
    [banners, hasMultipleBanners]
  );

  useEffect(() => {
    setCurrentIndex(0);
    setTransitionsEnabled(true);
  }, [count]);

  const autoplay =
    hasMultipleBanners &&
    firstSlideReady &&
    !reduceMotion &&
    !hovered &&
    !focusWithin &&
    !touching &&
    !holdAfterClick &&
    inView &&
    pageVisible;

  // One timeout per slide, so every slide gets its full time after any change.
  useEffect(() => {
    if (!autoplay) return;
    const timer = window.setTimeout(() => {
      setTransitionsEnabled(true);
      setCurrentIndex((prev) => prev + 1);
    }, SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [autoplay, currentIndex]);

  /** A click on an arrow or dot holds autoplay; it resumes RESUME_MS later (if the pointer is away and nothing has focus). */
  const holdAutoplay = () => {
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    setHoldAfterClick(true);
    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null;
      setHoldAfterClick(false);
    }, RESUME_MS);
  };

  const realIndex = count === 0 ? 0 : currentIndex % count;

  const jumpToSlide = (index: number) => {
    holdAutoplay();
    setTransitionsEnabled(true);
    setCurrentIndex(index);
  };

  const goToPrev = () => {
    if (!hasMultipleBanners) return;
    holdAutoplay();
    if (realIndex > 0) {
      setTransitionsEnabled(true);
      setCurrentIndex(realIndex - 1);
      return;
    }
    if (reduceMotion) {
      setCurrentIndex(count - 1);
      return;
    }
    // From slide 1: jump without animation to the clone at the end (it looks
    // identical), then slide back one, so the move is a single step.
    setTransitionsEnabled(false);
    setCurrentIndex(count);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setTransitionsEnabled(true);
        setCurrentIndex(count - 1);
      });
    });
  };

  const goToNext = () => {
    if (!hasMultipleBanners) return;
    holdAutoplay();
    if (reduceMotion) {
      // No transition runs, so the clone reset would never fire.
      setCurrentIndex((realIndex + 1) % count);
      return;
    }
    setTransitionsEnabled(true);
    setCurrentIndex((prev) => Math.min(prev + 1, count));
  };

  const handleTrackTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    // Image zooms and button colours bubble up here too; only the track counts.
    if (event.target !== event.currentTarget || event.propertyName !== "transform") return;
    if (!hasMultipleBanners || currentIndex < count) return;

    setTransitionsEnabled(false);
    setCurrentIndex(0);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setTransitionsEnabled(true);
      });
    });
  };

  // Keyboard focus pauses; a mouse click that leaves focus on an arrow does not.
  const handleFocus = (event: FocusEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    setFocusWithin(typeof target.matches === "function" && target.matches(":focus-visible"));
  };
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setFocusWithin(false);
  };

  if (loading) {
    return <HeroSkeleton label="Loading banners" />;
  }

  if (count === 0) {
    return (
      <section className={cn("tx-slate tx-contour relative flex items-center justify-center", SLIDE_SIZE)}>
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <img src="/loading_white.png" alt="" className="h-16 w-auto" />
          <h1
            className="text-2xl font-semibold text-charcoal-foreground [text-wrap:balance] md:text-4xl"
            style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
          >
            Welcome to Ishaputra Botanicals
          </h1>
          <p className="max-w-md text-sm text-charcoal-foreground/80 md:text-base">
            Pure wellness for a stronger you. Our first rituals are on their way.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      aria-roledescription="carousel"
      aria-label="Highlights"
      className="relative bg-background"
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {/*
        Desktop frame keeps the banners' own 16:9 shape, so nothing is ever
        cropped. Tablets get a 4:3 frame so the line and the call to action sit
        above the fold; phones keep their own 4:5 portrait crop from the mobile
        artwork.
      */}
      <div
        className="relative overflow-clip"
        onTouchStart={(e) => {
          touchStartXRef.current = e.touches[0]?.clientX ?? null;
          setTouching(true);
        }}
        onTouchEnd={(e) => {
          const startX = touchStartXRef.current;
          const endX = e.changedTouches[0]?.clientX ?? null;
          touchStartXRef.current = null;
          setTouching(false);
          if (startX !== null && endX !== null) {
            const dx = endX - startX;
            if (Math.abs(dx) > 40) {
              if (dx < 0) goToNext();
              else goToPrev();
            }
          }
        }}
      >
        <div
          className="flex"
          onTransitionEnd={handleTrackTransitionEnd}
          style={{
            transform: `translate3d(-${currentIndex * 100}%, 0, 0)`,
            transition: transitionsEnabled ? SLIDE_TRANSITION : "none",
          }}
        >
          {displayBanners.map((banner, idx) => {
            const isClone = idx === count;
            const isActive = idx === currentIndex;
            const Heading = idx === 0 ? "h1" : "h2";
            const line = HERO_LINES[(idx % count) % HERO_LINES.length];
            const link = banner.redirectLink?.trim();
            const ctaClass =
              "btn-line mt-6 w-fit text-charcoal-foreground after:absolute after:inset-0 after:content-[''] group-hover/hero:bg-charcoal-foreground group-hover/hero:text-charcoal md:mt-7 lg:mt-8";
            const cta = (
              <>
                Explore the range <ArrowRight aria-hidden="true" className="size-3.5" />
              </>
            );

            return (
              <div
                key={`${banner.id || banner.imageUrl}-${idx}`}
                aria-hidden={isActive ? undefined : true}
                {...(isActive ? {} : INERT)}
                role="group"
                aria-roledescription="slide"
                aria-label={isClone ? undefined : `${(idx % count) + 1} of ${count}`}
                className={cn(
                  "group/hero relative isolate flex w-full flex-shrink-0 flex-col justify-end overflow-hidden bg-charcoal",
                  SLIDE_SIZE,
                )}
              >
                <picture>
                  {/* A <source> wins over the <img> when its media query matches,
                      so it needs the same transform: an untransformed srcSet here
                      served multi-MB originals no matter what the <img> asked for. */}
                  <source media={MOBILE_QUERY} srcSet={cldUrl(banner.mobileImageUrl || banner.imageUrl, "detail")} />
                  <SmartImage
                    src={banner.imageUrl}
                    alt=""
                    className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-500 ease-out group-hover/hero:scale-[1.03]"
                    draggable={false}
                    preset="hero"
                    priority={idx === 0}
                    onLoad={idx === 0 ? () => setFirstSlideReady(true) : undefined}
                  />
                </picture>
                {/* Legibility scrim: rises from the bottom on phones and tablets, from the left on desktop */}
                <div aria-hidden="true" className="photo-scrim lg:photo-scrim-side absolute inset-0 -z-10" />

                <div className="px-6 pb-16 md:px-10 md:pb-16 lg:w-[60%] lg:max-w-[820px] lg:px-16 lg:pb-24">
                  <Heading
                    className="on-photo whitespace-pre-line text-[32px] font-semibold leading-[1.04] text-charcoal-foreground md:text-[44px] lg:text-[60px] xl:text-[68px]"
                    style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)", letterSpacing: "-0.03em" }}
                  >
                    {line}
                  </Heading>
                  {link ? (
                    /^https?:\/\//i.test(link) ? (
                      <a href={link} target="_blank" rel="noopener noreferrer" className={ctaClass}>
                        {cta}
                      </a>
                    ) : (
                      <Link to={link} className={ctaClass}>
                        {cta}
                      </Link>
                    )
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        {hasMultipleBanners && (
          <>
            <CarouselDots
              count={count}
              active={realIndex}
              onSelect={jumpToSlide}
              itemLabel="banner"
              label="Choose banner"
              tone="onDark"
              className="absolute bottom-4 left-5 z-raised md:left-9 lg:bottom-10 lg:left-auto lg:right-36"
            />
            <IconButton
              label="Previous banner"
              variant="onPhoto"
              onClick={goToPrev}
              className="absolute bottom-8 right-20 z-raised hidden border border-charcoal-foreground/25 lg:inline-flex"
            >
              <ChevronLeft aria-hidden="true" />
            </IconButton>
            <IconButton
              label="Next banner"
              variant="onPhoto"
              onClick={goToNext}
              className="absolute bottom-8 right-8 z-raised hidden border border-charcoal-foreground/25 lg:inline-flex"
            >
              <ChevronRight aria-hidden="true" />
            </IconButton>
          </>
        )}
      </div>
    </section>
  );
};

export default HeroBanner;
