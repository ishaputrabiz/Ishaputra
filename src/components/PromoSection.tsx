import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import useAutoScroll from "@/hooks/useAutoScroll";
import { DEFAULT_HOME_COLLECTIONS } from "@/data/defaultHomeCollections";
import { subscribeHomeCollections, HomeCollection } from "@/services/homeContentService";
import { SmartImage } from "@/components/ui/smart-image";
import Reveal from "@/components/Reveal";

interface CollectionCard {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaLink: string;
  imageUrl: string;
  /** Tailwind gradient classes for the overlay tint per card. */
  tint: string;
}

const INERT = { inert: "" } as Record<string, string>;

const toCard = (i: Pick<HomeCollection, "title" | "subtitle" | "ctaLabel" | "ctaLink" | "imageUrl" | "tint">): CollectionCard => ({
  title: i.title,
  subtitle: i.subtitle || "",
  ctaLabel: i.ctaLabel || "Explore",
  ctaLink: i.ctaLink || "/",
  imageUrl: i.imageUrl,
  tint: i.tint || "from-charcoal/85 via-charcoal/30 to-transparent",
});

const PromoSection = () => {
  const [remoteItems, setRemoteItems] = useState<HomeCollection[] | null>(null);

  useEffect(() => {
    const unsub = subscribeHomeCollections((items) => {
      const active = items.filter((i) => i.active !== false);
      setRemoteItems(active);
    });
    return unsub;
  }, []);

  const cards: CollectionCard[] =
    remoteItems && remoteItems.length > 0 ? remoteItems.map(toCard) : DEFAULT_HOME_COLLECTIONS.map(toCard);
  const { scrollerRef, scrollByPage, canScroll } = useAutoScroll({
    speed: 0.45,
    resumeDelay: 2600,
    loop: true,
    direction: 1,
    loopItemCount: cards.length,
  });
  const loopingCards = canScroll && cards.length > 1 ? [...cards, ...cards] : cards;

  return (
    <Reveal>
      <section className="relative w-full py-12 md:py-20">
        <div className="container-custom">
          {/* Header */}
          <div className="mb-6 flex items-end justify-between gap-4 px-1 md:mb-10 md:px-0">
            <div>
              <h2
                className="text-2xl font-semibold text-foreground [text-wrap:balance] md:text-4xl"
                style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
              >
                Our collections
              </h2>
              {/* Deliberately not a count: collections are switched on and off in
                  Admin > Home Collections as stock arrives. */}
              <p className="mt-2 hidden max-w-xl text-sm text-muted-foreground md:block">
                The ranges that keep you strong every day.
              </p>
            </div>

            {/* Arrow controls */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                aria-label="Scroll collections left"
                onClick={() => scrollByPage("prev")}
                disabled={!canScroll}
                className="btn-round md:!size-11"
              >
                <ChevronLeft aria-hidden="true" className="size-4 md:size-5" />
              </button>
              <button
                type="button"
                aria-label="Scroll collections right"
                onClick={() => scrollByPage("next")}
                disabled={!canScroll}
                className="btn-round md:!size-11"
              >
                <ChevronRight aria-hidden="true" className="size-4 md:size-5" />
              </button>
            </div>
          </div>

          {/* Scroller */}
          <div className="relative">
            <div
              ref={scrollerRef}
              className={`collections-scroller flex gap-4 overflow-x-auto scrollbar-hide px-1 pb-3 md:gap-6 md:px-2 ${
                // Two or three collections don't fill the row; centred they look
                // composed rather than left over.
                cards.length <= 3 ? "md:justify-center" : ""
              }`}
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {loopingCards.map((card, idx) => {
                const isLoopCopy = idx >= cards.length;
                return (
                  <div
                    key={`${card.title}-${idx}`}
                    aria-hidden={isLoopCopy || undefined}
                    {...(isLoopCopy ? INERT : {})}
                    className="group relative isolate aspect-[4/5] w-[78vw] flex-shrink-0 overflow-hidden rounded-card border border-foreground/[0.08] bg-charcoal shadow-[var(--shadow-panel)] sm:w-[58vw] md:aspect-[3/4] md:w-[420px] lg:w-[460px]"
                  >
                    <SmartImage
                      src={card.imageUrl}
                      alt=""
                      className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                      preset="hero"
                    />
                    <div aria-hidden="true" className={`absolute inset-0 -z-10 bg-gradient-to-t ${card.tint}`} />
                    <div aria-hidden="true" className="photo-scrim absolute inset-0 -z-10" />

                    <div className="absolute inset-x-0 bottom-0 p-5 text-charcoal-foreground md:p-7 lg:p-8">
                      <h3
                        className="on-photo mb-2 text-xl font-semibold leading-tight [text-wrap:balance] md:text-2xl lg:text-[26px]"
                        style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
                      >
                        {card.title}
                      </h3>
                      {card.subtitle && (
                        <p className="on-photo mb-4 max-w-[280px] text-xs leading-relaxed text-charcoal-foreground/85 [text-wrap:pretty] md:text-sm">
                          {card.subtitle}
                        </p>
                      )}
                      <Link
                        to={card.ctaLink}
                        className="btn-line text-charcoal-foreground hover:!bg-charcoal-foreground hover:text-charcoal"
                      >
                        {card.ctaLabel}
                        <ArrowRight aria-hidden="true" className="size-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <style>{`
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>
      </section>
    </Reveal>
  );
};

export default PromoSection;
