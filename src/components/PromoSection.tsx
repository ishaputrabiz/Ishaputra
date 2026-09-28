import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import useAutoScroll from "@/hooks/useAutoScroll";
import { DEFAULT_HOME_COLLECTIONS } from "@/data/defaultHomeCollections";
import { subscribeHomeCollections, HomeCollection } from "@/services/homeContentService";
import { SmartImage } from "@/components/ui/smart-image";

interface CollectionCard {
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaLink: string;
  imageUrl: string;
  /** Tailwind gradient classes for the overlay tint per card. */
  tint: string;
}

const PromoSection = () => {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.15 });
  const [remoteItems, setRemoteItems] = useState<HomeCollection[] | null>(null);

  useEffect(() => {
    const unsub = subscribeHomeCollections((items) => {
      const active = items.filter((i) => i.active !== false);
      setRemoteItems(active);
    });
    return unsub;
  }, []);

  const sourceCards: CollectionCard[] =
    remoteItems && remoteItems.length > 0
      ? remoteItems.map((i) => ({
          eyebrow: i.eyebrow || "Curated",
          title: i.title,
          subtitle: i.subtitle || "",
          ctaLabel: i.ctaLabel || "Explore",
          ctaLink: i.ctaLink || "/",
          imageUrl: i.imageUrl,
          tint: i.tint || "from-charcoal/85 via-charcoal/30 to-transparent",
        }))
      : DEFAULT_HOME_COLLECTIONS.map((i) => ({
          eyebrow: i.eyebrow || "Curated",
          title: i.title,
          subtitle: i.subtitle || "",
          ctaLabel: i.ctaLabel || "Explore",
          ctaLink: i.ctaLink || "/",
          imageUrl: i.imageUrl,
          tint: i.tint || "from-charcoal/85 via-charcoal/30 to-transparent",
        }));
  const cards = sourceCards;
  const { scrollerRef, scrollByPage, canScroll } = useAutoScroll({
    speed: 0.45,
    resumeDelay: 2600,
    loop: true,
    direction: 1,
    loopItemCount: cards.length,
  });
  const loopingCards = canScroll && cards.length > 1 ? [...cards, ...cards] : cards;

  return (
    <section ref={ref} className="relative w-full py-12 md:py-20">
      <div className="container-custom">
        {/* Header */}
        <div className="mb-6 md:mb-10 flex items-end justify-between gap-4 px-1 md:px-0">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.55 }}
          >
            <p className="eyebrow-no mb-3"><b>08</b><span>The Ishaputra edit</span></p>
            <h2
              className="text-2xl md:text-4xl font-semibold text-foreground"
              style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
            >
              Our Collections
            </h2>
            {/* Deliberately not a count: collections are switched on and off in
                Admin > Home Collections as stock arrives. */}
            <p className="hidden md:block text-sm text-muted-foreground mt-2 max-w-xl font-light">
              Five rituals, one standard. Glide through the ranges that keep
              you strong every day.
            </p>
          </motion.div>

          {/* Arrow controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              aria-label="Scroll collections left"
              onClick={() => scrollByPage("prev")}
              disabled={!canScroll}
              className="btn-round !h-9 !w-9 md:!h-11 md:!w-11"
            >
              <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            <button
              type="button"
              aria-label="Scroll collections right"
              onClick={() => scrollByPage("next")}
              disabled={!canScroll}
              className="w-9 h-9 md:w-11 md:h-11 rounded-full border border-border/70 bg-background/80 dark:bg-zinc-900/80 backdrop-blur flex items-center justify-center hover:bg-primary hover:text-white hover:border-primary transition-colors shadow-sm disabled:cursor-default disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
        </div>

        {/* Scroller */}
        <div className="relative">
          <div
            ref={scrollerRef}
            className={`collections-scroller flex gap-4 md:gap-6 overflow-x-auto scrollbar-hide pb-3 px-1 md:px-2 ${
              // Two or three collections don't fill the row; centred they look
              // composed rather than left over.
              cards.length <= 3 ? "md:justify-center" : ""
            }`}
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {loopingCards.map((card, idx) => (
              <motion.div
                key={`${card.title}-${idx}`}
                initial={{ opacity: 0, y: 24 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.55, delay: Math.min(idx * 0.06, 0.4) }}
                className="group relative flex-shrink-0 w-[78vw] sm:w-[58vw] md:w-[420px] lg:w-[460px] aspect-[4/5] md:aspect-[3/4] rounded-[var(--radius-card)] overflow-hidden border border-foreground/[0.08] bg-charcoal shadow-[var(--shadow-panel)]"
              >
                <SmartImage
                  src={card.imageUrl}
                  alt={card.title}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.06]" preset="hero" />
                <div className={`absolute inset-0 bg-gradient-to-t ${card.tint}`} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

                {/* gold corner accent */}
                <div className="tag-dark absolute top-4 right-4">
                  No. {String((idx % cards.length) + 1).padStart(2, "0")}
                </div>

                <div className="absolute inset-x-0 bottom-0 p-5 md:p-7 lg:p-8">
                  <span className="eyebrow-no on-dark mb-3">
                    {card.eyebrow}
                  </span>
                  <h3
                    className="text-white text-xl md:text-2xl lg:text-[26px] font-semibold leading-tight mb-2"
                    style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
                  >
                    {card.title}
                  </h3>
                  <p className="text-white/75 text-xs md:text-sm font-light leading-relaxed mb-4 max-w-[280px]">
                    {card.subtitle}
                  </p>
                  <Link
                    to={card.ctaLink}
                    className="btn-line text-white hover:bg-white hover:text-charcoal"
                  >
                    {card.ctaLabel}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
};

export default PromoSection;
