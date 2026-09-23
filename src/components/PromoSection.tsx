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
          tint: i.tint || "from-[#2a1810]/85 via-[#2a1810]/30 to-transparent",
        }))
      : DEFAULT_HOME_COLLECTIONS.map((i) => ({
          eyebrow: i.eyebrow || "Curated",
          title: i.title,
          subtitle: i.subtitle || "",
          ctaLabel: i.ctaLabel || "Explore",
          ctaLink: i.ctaLink || "/",
          imageUrl: i.imageUrl,
          tint: i.tint || "from-[#2a1810]/85 via-[#2a1810]/30 to-transparent",
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
      {/* ambient gold/maroon glow */}
      <div className="pointer-events-none absolute inset-x-0 top-10 h-48 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.14)_0%,rgba(212,175,55,0)_70%)] blur-3xl" />

      <div className="container-custom">
        {/* Header */}
        <div className="mb-6 md:mb-10 flex items-end justify-between gap-4 px-1 md:px-0">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.55 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="h-px w-8 bg-primary/50" />
              <span className="text-[10px] uppercase tracking-[0.32em] text-primary/80 font-medium">
                The Sreerasthu Edit
              </span>
            </div>
            <h2
              className="text-2xl md:text-4xl font-semibold text-foreground"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              Our Collections
            </h2>
            {/* Deliberately not a count: collections are switched on and off in
                Admin > Home Collections as stock arrives. */}
            <p className="hidden md:block text-sm text-muted-foreground mt-2 max-w-xl font-light">
              One atelier, many stories. Glide through the collections we are
              hand-finishing right now.
            </p>
          </motion.div>

          {/* Arrow controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              aria-label="Scroll collections left"
              onClick={() => scrollByPage("prev")}
              disabled={!canScroll}
              className="w-9 h-9 md:w-11 md:h-11 rounded-full border border-border/70 bg-background/80 dark:bg-zinc-900/80 backdrop-blur flex items-center justify-center hover:bg-primary hover:text-white hover:border-primary transition-colors shadow-sm disabled:cursor-default disabled:opacity-40"
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
                className="group relative flex-shrink-0 w-[78vw] sm:w-[58vw] md:w-[420px] lg:w-[460px] aspect-[4/5] md:aspect-[3/4] rounded-[28px] overflow-hidden border border-white/40 dark:border-white/5 shadow-[0_24px_60px_-30px_rgba(60,30,10,0.55)] dark:shadow-[0_28px_70px_-32px_rgba(0,0,0,0.85)]"
              >
                <SmartImage
                  src={card.imageUrl}
                  alt={card.title}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1200ms] ease-out group-hover:scale-[1.06]" preset="hero" />
                <div className={`absolute inset-0 bg-gradient-to-t ${card.tint}`} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

                {/* gold corner accent */}
                <div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full bg-white/15 dark:bg-white/10 backdrop-blur-md border border-white/25 px-2.5 py-1 text-[9px] uppercase tracking-[0.22em] text-white font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_rgba(255,200,80,0.9)]" />
                  Curated
                </div>

                <div className="absolute inset-x-0 bottom-0 p-5 md:p-7 lg:p-8">
                  <span className="block text-[10px] uppercase tracking-[0.28em] text-white/75 font-medium mb-2">
                    {card.eyebrow}
                  </span>
                  <h3
                    className="text-white text-xl md:text-2xl lg:text-[26px] font-semibold leading-tight mb-2"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    {card.title}
                  </h3>
                  <p className="text-white/75 text-xs md:text-sm font-light leading-relaxed mb-4 max-w-[280px]">
                    {card.subtitle}
                  </p>
                  <Link
                    to={card.ctaLink}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-zinc-100 text-gray-900 text-[11px] md:text-xs font-semibold tracking-wide rounded-full hover:bg-primary hover:text-white transition-colors shadow-md"
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
