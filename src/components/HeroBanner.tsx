import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { subscribeToActiveBanners, Banner } from "@/services/bannerService";
import { useNavigate } from "react-router-dom";
import { SmartImage } from "@/components/ui/smart-image";
import { cldUrl } from "@/lib/cloudinaryUrl";

/**
 * Brand lines laid over the hero photos, one per slide in turn. Banner
 * artwork should therefore be photography without baked-in text.
 */
const HERO_LINES = [
  "Pure wellness\nfor a stronger you.",
  "Classical Ayurveda,\nmodern routine.",
  "Rooted in Ayurveda.\nBuilt for men.",
];

/**
 * Seamless looping hero carousel.
 *
 * Full-bleed: the photo runs edge to edge, capped at the viewport height.
 * The first slide is cloned at the end of the track so looping from the last
 * banner back to the first does not produce a visible reset.
 */
const HeroBanner = () => {
  const navigate = useNavigate();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [imagesReady, setImagesReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transitionsEnabled, setTransitionsEnabled] = useState(true);
  const preloadedImages = useRef<Map<string, HTMLImageElement>>(new Map());

  /**
   * URLs to warm before revealing the carousel.
   *
   * These must be the exact URLs the markup below requests, otherwise the
   * preload is a pure waste: it used to fetch the raw originals (~2.5 MB each,
   * ~10 MB total on the homepage) while the rendered <SmartImage> asked for the
   * transformed version separately, so every banner was paid for twice.
   */
  const getBannerImageSources = (banner: Banner) => {
    const mobileSource = banner.mobileImageUrl || banner.imageUrl;
    return [
      banner.imageUrl ? cldUrl(banner.imageUrl, 'hero') : null,
      mobileSource ? cldUrl(mobileSource, 'detail') : null,
    ].filter((value): value is string => Boolean(value));
  };

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

  useEffect(() => {
    if (banners.length === 0) {
      setImagesReady(true);
      return;
    }
    setImagesReady(false);
    let cancelled = false;
    const urls = [...new Set(banners.flatMap(getBannerImageSources))];
    if (urls.length === 0) {
      setImagesReady(true);
      return;
    }

    Promise.allSettled(
      urls.map((url) => {
        if (preloadedImages.current.has(url)) return Promise.resolve();
        return new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            preloadedImages.current.set(url, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        });
      })
    ).then(() => {
      if (!cancelled) setImagesReady(true);
    });

    const fallbackTimer = setTimeout(() => setImagesReady(true), 3000);
    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
    };
  }, [banners]);

  const handleBannerClick = (banner: Banner) => {
    if (!banner.redirectLink) return;
    if (banner.redirectLink.startsWith("http")) {
      window.open(banner.redirectLink, "_blank");
    } else {
      navigate(banner.redirectLink);
    }
  };

  const hasMultipleBanners = banners.length > 1;
  const displayBanners = useMemo(
    () => (hasMultipleBanners ? [...banners, banners[0]] : banners),
    [banners, hasMultipleBanners]
  );

  useEffect(() => {
    setCurrentIndex(0);
    setTransitionsEnabled(true);
  }, [banners.length]);

  useEffect(() => {
    if (!hasMultipleBanners || isPaused || loading || !imagesReady) return;

    const interval = window.setInterval(() => {
      setCurrentIndex((prev) => prev + 1);
    }, 4200);

    return () => window.clearInterval(interval);
  }, [hasMultipleBanners, isPaused, loading, imagesReady]);

  const jumpToSlide = (index: number) => {
    setTransitionsEnabled(true);
    setCurrentIndex(index);
  };

  const goToPrev = () => {
    if (!hasMultipleBanners) return;
    setIsPaused(true);
    setTransitionsEnabled(true);
    setCurrentIndex((prev) => {
      const realIdx = ((prev % banners.length) + banners.length) % banners.length;
      return realIdx === 0 ? banners.length - 1 : realIdx - 1;
    });
    window.setTimeout(() => setIsPaused(false), 4200);
  };

  const goToNext = () => {
    if (!hasMultipleBanners) return;
    setIsPaused(true);
    setTransitionsEnabled(true);
    setCurrentIndex((prev) => prev + 1);
    window.setTimeout(() => setIsPaused(false), 4200);
  };

  const touchStartXRef = useRef<number | null>(null);

  const handleTrackTransitionEnd = () => {
    if (!hasMultipleBanners || currentIndex < banners.length) return;

    setTransitionsEnabled(false);
    setCurrentIndex(0);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setTransitionsEnabled(true);
      });
    });
  };

  const activeDotIndex = banners.length === 0 ? 0 : currentIndex % banners.length;

  if (loading || !imagesReady) {
    return (
      <section className="tx-slate relative flex aspect-[4/5] items-center justify-center lg:aspect-auto lg:h-[min(84vh,56.25vw)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-highlight-soft" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-charcoal-foreground/60">Loading</span>
        </div>
      </section>
    );
  }

  if (banners.length === 0) {
    return (
      <section className="tx-slate tx-contour relative flex aspect-[4/5] items-center justify-center lg:aspect-auto lg:h-[min(84vh,56.25vw)]">
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <img src="/loading_white.png" alt="" className="h-16 w-auto" />
          <h2
            className="text-2xl md:text-4xl font-semibold text-charcoal-foreground"
            style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
          >
            Welcome to Ishaputra Botanicals
          </h2>
          <p className="text-sm md:text-base text-charcoal-foreground/65 max-w-md">
            Pure wellness for a stronger you. Our first rituals are on their way.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="relative overflow-hidden bg-background"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/*
        Desktop frame keeps the banners' own 16:9 shape, so nothing is ever
        cropped - the offer strip and the call-to-action sit near the bottom
        edge of the artwork and a wider frame eats them.

        1400px rather than the old 1120px: at 1120 the banner sat as a small
        island in the middle of anything above ~1500px wide. Going wider than
        this means cropping, so widen the artwork first - upload 2400x1000
        (desktop) and this frame can go edge to edge without losing anything.

        Phones keep their own 4:5 portrait crop from the mobile artwork.
      */}
      <div className="relative">
        <div
          className="relative overflow-hidden"
          onTouchStart={(e) => {
            touchStartXRef.current = e.touches[0]?.clientX ?? null;
            setIsPaused(true);
          }}
          onTouchEnd={(e) => {
            const startX = touchStartXRef.current;
            const endX = e.changedTouches[0]?.clientX ?? null;
            touchStartXRef.current = null;
            setIsPaused(false);
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
              transition: transitionsEnabled ? "transform 850ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
            }}
          >
            {displayBanners.map((banner, idx) => (
              <button
                type="button"
                key={`${banner.id || banner.imageUrl}-${idx}`}
                onClick={() => handleBannerClick(banner)}
                className="group/hero relative aspect-[4/5] w-full flex-shrink-0 cursor-pointer overflow-hidden bg-charcoal text-left lg:aspect-auto lg:h-[min(84vh,56.25vw)]"
                aria-label={`Hero banner ${((idx % banners.length) || 0) + 1}`}
              >
                <picture>
                  {/* A <source> wins over the <img> when its media query matches,
                      so it needs the same transform - an untransformed srcSet here
                      served multi-MB originals no matter what the <img> asked for. */}
                  <source
                    media="(max-width: 1023px)"
                    srcSet={cldUrl(banner.mobileImageUrl || banner.imageUrl, 'detail')}
                  />
                  <SmartImage
                    src={banner.imageUrl}
                    alt={`Hero banner ${((idx % banners.length) || 0) + 1}`}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-[2400ms] ease-out group-hover/hero:scale-[1.03]"
                    draggable={false}
                    preset="hero"
                    priority={idx === 0}
                  />
                </picture>
                {/* Legibility wash: rises from the bottom on phones, from the left on desktop */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/5 lg:bg-gradient-to-r lg:from-black/75 lg:via-black/30 lg:to-transparent" />
                <div className="absolute inset-x-0 bottom-0 px-6 pb-14 lg:inset-y-0 lg:right-auto lg:flex lg:w-[60%] lg:max-w-[820px] lg:flex-col lg:items-start lg:justify-end lg:px-16 lg:pb-24">
                  <p className="eyebrow-no text-white/70 [&_b]:text-highlight-soft">
                    <b>{String(((idx % banners.length) || 0) + 1).padStart(2, "0")}</b>
                    <span>Ishaputra Botanicals</span>
                  </p>
                  <h2
                    className="mt-4 whitespace-pre-line text-[32px] font-semibold leading-[1.02] text-white lg:text-[60px] xl:text-[68px]"
                    style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)", letterSpacing: "-0.03em" }}
                  >
                    {HERO_LINES[(idx % banners.length) % HERO_LINES.length]}
                  </h2>
                  <span className="btn-line mt-6 w-fit text-white transition-colors group-hover/hero:bg-white group-hover/hero:text-charcoal lg:mt-8">
                    Explore the range <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </button>
            ))}
          </div>

          {hasMultipleBanners && (
            <>
              <button
                type="button"
                onClick={goToPrev}
                aria-label="Previous banner"
                className="btn-round absolute right-20 bottom-8 z-10 hidden border-white/30 bg-black/25 text-white hover:!border-white hover:!text-white lg:inline-flex"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={goToNext}
                aria-label="Next banner"
                className="btn-round absolute right-8 bottom-8 z-10 hidden border-white/30 bg-black/25 text-white hover:!border-white hover:!text-white lg:inline-flex"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {hasMultipleBanners && (
            <div className="absolute bottom-5 left-6 z-10 flex items-center gap-2 lg:bottom-11 lg:left-auto lg:right-36">
              {banners.map((_, index) => (
                <button
                  key={`hero-dot-${index}`}
                  type="button"
                  onClick={() => jumpToSlide(index)}
                  className={`h-[2px] rounded-full transition-all duration-500 ${
                    activeDotIndex === index ? "w-10 bg-highlight-soft" : "w-5 bg-white/40 hover:bg-white/70"
                  }`}
                  aria-label={`Go to banner ${index + 1}`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default HeroBanner;
