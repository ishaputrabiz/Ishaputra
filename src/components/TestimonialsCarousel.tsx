import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { subscribeToTestimonials, Testimonial } from "@/services/testimonialService";
import { SmartImage } from "@/components/ui/smart-image";
import { CarouselDots } from "@/components/ui/carousel-dots";
import Reveal from "@/components/Reveal";
import { DUR, EASE_OUT } from "@/lib/motion";

/**
 * "What our customers say" - one dark chapter in an otherwise cream page.
 *
 * Built to look finished with a single quote, because a young shop has a
 * single quote: one large editorial testimonial on the left, and on the right
 * the promises the shop can actually prove. Extra testimonials turn it into a
 * slow carousel rather than changing the layout.
 *
 * People are shown as a gold monogram unless a real photo was uploaded for
 * them. The stock-face presets that used to fill this space belong to
 * strangers, not to customers. Seeded demo reviews (demo: true) carry a visible
 * "Sample review" label and no star rating until the client replaces them.
 */

const ROTATE_MS = 7000;

/**
 * Promises, not statistics. TODO(client): confirm the reply time ("24 h") and
 * the 7-day return window against Customer Support settings and the refund
 * policy; both are placeholders until the client signs them off.
 */
const PROMISES: Array<{ value: string; label: string }> = [
  { value: "24 h", label: "Support reply time" },
  { value: "Razorpay", label: "Secure checkout" },
  { value: "7 days", label: "Returns from delivery" },
  { value: "3-7 days", label: "Delivery across India" },
];

const initialOf = (name: string) => (name || "").trim().charAt(0).toUpperCase() || "S";

/** A real uploaded photo is shown; the stock-face presets are not people we know. */
const realPhoto = (t: Testimonial) =>
  t.avatarType !== "avatar" && t.avatarUrl && /^https?:\/\//.test(t.avatarUrl) ? t.avatarUrl : null;

const Stars = ({ rating }: { rating: number }) => (
  <div className="flex items-center gap-1" role="img" aria-label={`Rated ${rating} out of 5`}>
    {[...Array(5)].map((_, i) => (
      <Star
        key={i}
        aria-hidden="true"
        className={`size-3.5 ${i < rating ? "fill-highlight-soft text-highlight-soft" : "fill-charcoal-foreground/10 text-charcoal-foreground/20"}`}
      />
    ))}
  </div>
);

const SECTION_CLASS = "tx-slate relative overflow-hidden py-12 md:py-20";

const TestimonialsCarousel = () => {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.15 });
  const reduceMotion = useReducedMotion();
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    const unsub = subscribeToTestimonials((data) => {
      setTestimonials(data);
      setHasLoaded(true);
    }, true);
    return unsub;
  }, []);

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const count = testimonials.length;
  const go = useCallback(
    (step: number) => setIndex((i) => (count ? (i + step + count) % count : 0)),
    [count],
  );

  // Rotation stops on hover, on keyboard focus inside, off screen, in a hidden
  // tab and under reduced motion.
  const paused = hovered || focusWithin;
  const rotating = count > 1 && !paused && !reduceMotion && inView && pageVisible;

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => go(1), ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [rotating, index, go]);

  // Reserve the space while loading so nothing below jumps when the quotes arrive.
  if (!hasLoaded) {
    return (
      <section ref={ref} aria-busy="true" className={`${SECTION_CLASS} min-h-[58rem] md:min-h-[61.5rem] lg:min-h-[42.25rem] xl:min-h-[39.5rem]`}>
        <span className="sr-only" role="status">Loading reviews</span>
      </section>
    );
  }
  if (!count) return null;

  const active = testimonials[Math.min(index, count - 1)];
  const photo = realPhoto(active);
  const isSample = active.demo === true;

  const handleFocus = (event: FocusEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    setFocusWithin(typeof target.matches === "function" && target.matches(":focus-visible"));
  };
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setFocusWithin(false);
  };

  return (
    <section
      ref={ref}
      className={SECTION_CLASS}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHovered(false)}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {/* gold light from the top-left, deep shadow bottom-right */}
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-52 -right-24 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,hsl(var(--charcoal)/0.7)_0%,transparent_65%)] blur-2xl" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-highlight-soft/40 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-highlight-soft/25 to-transparent" />

      <Reveal className="container-custom relative">
        <div className="mb-10 md:mb-14">
          <p className="eyebrow-no on-dark">Testimonials</p>
          <h2 className="mt-3 font-serif text-3xl leading-tight text-charcoal-foreground [text-wrap:balance] md:text-[2.75rem]">
            What our customers say
          </h2>
        </div>

        <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
          {/* ── the quote ── */}
          <figure className="relative lg:col-span-7">
            {/* Watermark quote mark, top right of the quote so it never collides with the tag or stars. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-8 right-0 z-0 select-none font-serif text-[8rem] leading-none text-highlight-soft/10 md:-top-12 md:text-[11rem]"
            >
              &ldquo;
            </span>

            {/* Height reserved for the longest likely quote, so rotating never moves the page. */}
            <div className="relative z-raised min-h-[16.5rem] md:min-h-[15.5rem]" aria-live={paused ? "polite" : "off"}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={active.id || `t-${index}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: DUR.exit } }}
                  transition={{ duration: DUR.modal, ease: EASE_OUT }}
                >
                  {isSample ? (
                    <span className="tag-dark !bg-charcoal-foreground/10 !tracking-[0.14em]">Sample review, replace before launch</span>
                  ) : (
                    <Stars rating={active.rating} />
                  )}

                  <blockquote className="mt-5">
                    <p className="font-serif text-2xl font-light leading-[1.45] text-charcoal-foreground [text-wrap:pretty] md:text-[2rem] md:leading-[1.4]">
                      {active.title}
                    </p>
                    {active.quote && (
                      <p className="mt-4 max-w-xl text-sm leading-relaxed text-charcoal-foreground/75 [text-wrap:pretty] md:text-base">
                        {active.quote}
                      </p>
                    )}
                  </blockquote>

                  <figcaption className="mt-8 flex items-center gap-4">
                    {photo ? (
                      <SmartImage
                        src={photo}
                        alt=""
                        preset="thumb"
                        className="size-12 rounded-full object-cover ring-1 ring-highlight/50"
                      />
                    ) : (
                      <span aria-hidden="true" className="grid size-12 place-items-center rounded-full border border-highlight/45 bg-highlight/10 font-serif text-lg text-highlight-soft">
                        {initialOf(active.author)}
                      </span>
                    )}
                    <span>
                      <span className="block text-sm font-medium tracking-wide text-charcoal-foreground">{active.author}</span>
                      <span className="block text-[11px] uppercase tracking-[0.22em] text-charcoal-foreground/65">{active.role}</span>
                    </span>
                  </figcaption>
                </motion.div>
              </AnimatePresence>
            </div>

            {count > 1 && (
              <div className="mt-9 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Previous testimonial"
                  className="btn-round !border-charcoal-foreground/20 !bg-charcoal-foreground/5 !text-charcoal-foreground"
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Next testimonial"
                  className="btn-round !border-charcoal-foreground/20 !bg-charcoal-foreground/5 !text-charcoal-foreground"
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </button>
                <CarouselDots
                  count={count}
                  active={Math.min(index, count - 1)}
                  onSelect={setIndex}
                  itemLabel="testimonial"
                  label="Choose testimonial"
                  tone="onDark"
                  className="ml-1"
                />
              </div>
            )}
          </figure>

          {/* ── what we promise, next to what they said ── */}
          <div className="lg:col-span-5">
            <div className="rounded-panel border border-charcoal-foreground/10 bg-charcoal-foreground/[0.03] p-6 md:p-8">
              <h3 className="text-sm font-semibold text-charcoal-foreground">What we promise</h3>
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-7">
                {PROMISES.map((p) => (
                  <div key={p.label} className="flex flex-col-reverse">
                    <dt className="mt-1 text-[11px] uppercase leading-relaxed tracking-[0.16em] text-charcoal-foreground/65">
                      {p.label}
                    </dt>
                    <dd className="font-serif text-2xl font-semibold tabular-nums text-highlight-soft md:text-[1.75rem]">{p.value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-7 border-t border-charcoal-foreground/10 pt-5 text-xs leading-relaxed text-charcoal-foreground/65">
                Classical Ayurvedic formulations, made simple for the modern man's daily routine.
              </p>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
};

export default TestimonialsCarousel;
