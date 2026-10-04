import { motion, useReducedMotion } from "framer-motion";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { subscribeToShowcases, Showcase } from "@/services/showcaseService";
import { subscribeToCategories, DEFAULT_CATEGORIES, type Category } from "@/services/categoryService";
import { ArrowRight } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { Skeleton } from "@/components/ui/skeleton";
import { reveal, staggerDelay } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Showcase subtitles are category slugs ("personal-care"), so they link straight to the category. */
const getCategoryLink = (subtitle: string): string => `/category/${subtitle.toLowerCase().trim()}`;

/**
 * The category's own name ("Energy & Vitality"), so the caption matches the
 * category strip and footer; falls back to "personal-care" -> "personal care".
 */
const displayName = (subtitle: string, categories: Pick<Category, "name" | "slug">[]) => {
  const slug = subtitle.toLowerCase().trim();
  return categories.find((c) => c.slug === slug)?.name ?? subtitle.replace(/-/g, " ").trim();
};

const GRID = "grid grid-cols-1 gap-3 md:grid-cols-12 md:auto-rows-[190px] md:gap-5";
const SPANS = ["md:col-span-7 md:row-span-2", "md:col-span-5 md:row-span-1", "md:col-span-5 md:row-span-1"];

const SectionHeader = () => (
  <div className="mb-6 text-center md:mb-10">
    <p className="eyebrow-no eyebrow-center mb-3">Shop by concern</p>
    <h2
      className="text-2xl font-semibold text-foreground [text-wrap:balance] md:text-3xl lg:text-4xl"
      style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
    >
      Built for every routine
    </h2>
    <p className="mt-2 text-sm text-muted-foreground">Rituals for energy, hair, skin and grooming</p>
  </div>
);

const CategoryShowcase = () => {
  const [showcases, setShowcases] = useState<Showcase[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Pick<Category, "name" | "slug">[]>(DEFAULT_CATEGORIES);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const unsubscribe = subscribeToCategories((cats) => {
      if (cats.length > 0) setCategories(cats);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Subscribe to active showcases only
    const unsubscribe = subscribeToShowcases((data) => {
      setShowcases(data);
      setLoading(false);
    }, true); // true = active only

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <section aria-busy="true" className="tx-contour w-full py-12 md:py-20">
        <span className="sr-only" role="status">Loading</span>
        <div className="container-custom">
          <SectionHeader />
          <div className={GRID}>
            {SPANS.map((span, i) => (
              <Skeleton
                key={span + i}
                className={cn("rounded-card", span, i === 0 ? "min-h-[360px] md:min-h-0" : "min-h-[220px] md:min-h-0")}
              />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (showcases.length === 0) return null;

  return (
    <section className="tx-contour w-full py-12 md:py-20">
      <div className="container-custom">
        <SectionHeader />

        <div className={GRID}>
          {showcases.map((showcase, index) => {
            const isFirst = index === 0;
            return (
              <motion.div
                key={showcase.id}
                className={cn(
                  "group relative overflow-hidden rounded-card border border-foreground/[0.08] bg-charcoal shadow-[var(--shadow-panel)]",
                  SPANS[Math.min(index, 2)],
                )}
                initial={reduceMotion ? false : reveal.initial}
                whileInView={reveal.whileInView}
                viewport={reveal.viewport}
                transition={{ ...reveal.transition, delay: staggerDelay(index) }}
              >
                <Link to={getCategoryLink(showcase.subtitle)} className="focus-inset block h-full rounded-card">
                  <div className={cn("relative md:h-full md:min-h-0", isFirst ? "min-h-[360px]" : "min-h-[220px]")}>
                    <SmartImage
                      src={showcase.imageUrl}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                      preset="hero"
                    />

                    <div aria-hidden="true" className="photo-scrim absolute inset-0" />

                    {/* Content */}
                    <div className="absolute inset-0 flex flex-col justify-end p-5 text-charcoal-foreground md:p-6 lg:p-8">
                      <div className={cn(!isFirst && "lg:pr-52")}>
                        <h3
                          className={cn(
                            "on-photo mb-1 font-semibold [text-wrap:balance]",
                            isFirst ? "text-xl md:text-3xl" : "text-base md:text-xl",
                          )}
                          style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
                        >
                          {showcase.title}
                        </h3>

                        <p
                          className={cn(
                            "on-photo uppercase tracking-[0.2em] text-charcoal-foreground/80",
                            isFirst ? "text-[10px] md:text-xs" : "text-[10px] md:text-[11px]",
                          )}
                        >
                          {displayName(showcase.subtitle, categories)}
                        </p>

                        {/* Description: large card only, revealed on hover or keyboard focus (pointer
                            devices). Its height is always reserved, so nothing shifts. */}
                        {isFirst && showcase.description && (
                          <div className="mt-3 hidden max-w-md translate-y-2 opacity-0 transition-[opacity,transform] [transition-duration:220ms] ease-out group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 lg:block">
                            <p className="on-photo line-clamp-2 text-sm leading-relaxed text-charcoal-foreground/85">
                              {showcase.description}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Call to action, bottom right on desktop: fades in on hover or focus. */}
                      <span
                        aria-hidden="true"
                        className="btn-line absolute bottom-6 right-6 hidden translate-y-2 text-charcoal-foreground opacity-0 transition-[opacity,transform] [transition-duration:220ms] ease-out group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100 lg:bottom-8 lg:right-8 lg:inline-flex"
                      >
                        Explore collection <ArrowRight className="size-3.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default CategoryShowcase;
