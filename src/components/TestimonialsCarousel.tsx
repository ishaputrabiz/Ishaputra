import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { subscribeToTestimonials, Testimonial } from "@/services/testimonialService";
import { SmartImage } from "@/components/ui/smart-image";

/**
 * "What our clients say" - one dark chapter in an otherwise cream page.
 *
 * Built to look finished with a single quote, because a young shop has a
 * single quote: one large editorial testimonial on the left, and on the right
 * the promises the shop can actually prove. Extra testimonials turn it into a
 * slow carousel rather than changing the layout.
 *
 * People are shown as a gold monogram unless a real photo was uploaded for
 * them. The stock-face presets that used to fill this space belong to
 * strangers, not to customers.
 */

const ROTATE_MS = 7000;

/**
 * Only claims the shop already makes elsewhere: the purity in the logo, the
 * warranty badge on every product page, and the two windows written into the
 * shipping and refund policies. Shipping is not free by default, so it is the
 * delivery time that is promised here.
 */
const PROMISES: Array<{ value: string; label: string }> = [
  { value: "92.5", label: "Hallmarked sterling silver" },
  { value: "2 yrs", label: "Warranty on every piece" },
  { value: "7 days", label: "Returns from delivery" },
  { value: "3–7 days", label: "Delivery across India" },
];

const initialOf = (name: string) => (name || "").trim().charAt(0).toUpperCase() || "S";

/** A real uploaded photo is shown; the stock-face presets are not people we know. */
const realPhoto = (t: Testimonial) =>
  t.avatarType !== "avatar" && t.avatarUrl && /^https?:\/\//.test(t.avatarUrl) ? t.avatarUrl : null;

const Stars = ({ rating }: { rating: number }) => (
  <div className="flex items-center gap-1" aria-label={`${rating} out of 5`}>
    {[...Array(5)].map((_, i) => (
      <Star
        key={i}
        className={`w-3.5 h-3.5 ${i < rating ? "fill-[#e8c56a] text-[#e8c56a]" : "fill-white/10 text-white/10"}`}
      />
    ))}
  </div>
);

const TestimonialsCarousel = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.15 });
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const unsub = subscribeToTestimonials((data) => {
      setTestimonials(data);
      setHasLoaded(true);
    }, true);
    return unsub;
  }, []);

  const count = testimonials.length;
  const go = useCallback(
    (step: number) => setIndex((i) => (count ? (i + step + count) % count : 0)),
    [count],
  );

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setInterval(() => go(1), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [count, paused, isInView, go]);

  if (!count) return null;

  // The section renders nothing until the testimonials arrive, so the in-view
  // observer has no element to watch at mount and never fires. Once the data is
  // here the section is on screen anyway, so that is the cue to reveal it.
  const shown = isInView || hasLoaded;
  const active = testimonials[Math.min(index, count - 1)];
  const photo = realPhoto(active);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden bg-[#2a1216] py-16 md:py-24"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* gold light from the top-left, deep shadow bottom-right */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.22)_0%,transparent_62%)] blur-2xl" />
      <div className="pointer-events-none absolute -bottom-52 -right-24 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(0,0,0,0.55)_0%,transparent_65%)] blur-2xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#d4af37]/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#d4af37]/40 to-transparent" />

      <div className="container-custom relative">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={shown ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-10 md:mb-14"
        >
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] text-[#d4af37]">
            <span className="h-px w-8 bg-[#d4af37]/60" /> Testimonials
          </span>
          <h2 className="mt-3 font-serif text-3xl leading-tight text-white md:text-[2.75rem]">
            What our clients say
          </h2>
          <p className="mt-2 max-w-md text-sm font-light text-white/55">
            Hear from our happy customers across India.
          </p>
        </motion.div>

        <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
          {/* ── the quote ── */}
          <motion.figure
            initial={{ opacity: 0, y: 24 }}
            animate={shown ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="relative lg:col-span-7"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -top-16 -left-5 z-0 select-none font-serif text-[9rem] leading-none text-[#d4af37]/12 md:-top-24 md:-left-8 md:text-[13rem]"
            >
              &ldquo;
            </span>

            <AnimatePresence mode="wait">
              <motion.div
                key={active.id || `t-${index}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.45 }}
                className="relative z-10"
              >
                <Stars rating={active.rating} />

                <blockquote className="mt-5 font-serif text-2xl font-light leading-[1.45] text-white md:text-[2rem] md:leading-[1.4]">
                  {active.title}
                </blockquote>

                {active.quote && (
                  <p className="mt-4 max-w-xl text-sm font-light leading-relaxed text-white/60 md:text-base">
                    {active.quote}
                  </p>
                )}

                <figcaption className="mt-8 flex items-center gap-4">
                  {photo ? (
                    <SmartImage
                      src={photo}
                      alt={active.author}
                      preset="thumb"
                      className="h-12 w-12 rounded-full object-cover ring-1 ring-[#d4af37]/50"
                    />
                  ) : (
                    <span className="grid h-12 w-12 place-items-center rounded-full border border-[#d4af37]/45 bg-[#d4af37]/10 font-serif text-lg text-[#e8c56a]">
                      {initialOf(active.author)}
                    </span>
                  )}
                  <span>
                    <span className="block text-sm font-medium tracking-wide text-white">{active.author}</span>
                    <span className="block text-[11px] uppercase tracking-[0.22em] text-white/40">{active.role}</span>
                  </span>
                </figcaption>
              </motion.div>
            </AnimatePresence>

            {count > 1 && (
              <div className="mt-9 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Previous testimonial"
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/70 transition hover:border-[#d4af37]/60 hover:text-[#e8c56a]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Next testimonial"
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-white/70 transition hover:border-[#d4af37]/60 hover:text-[#e8c56a]"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="flex items-center gap-1.5" role="tablist" aria-label="Testimonials">
                  {testimonials.map((t, i) => (
                    <button
                      key={t.id || `dot-${i}`}
                      type="button"
                      role="tab"
                      aria-selected={i === index}
                      aria-label={`Testimonial ${i + 1}`}
                      onClick={() => setIndex(i)}
                      className={`h-1 rounded-full transition-all duration-300 ${
                        i === index ? "w-7 bg-[#d4af37]" : "w-1.5 bg-white/25 hover:bg-white/50"
                      }`}
                    />
                  ))}
                </span>
                <span className="ml-auto font-serif text-xs text-white/35">
                  {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
                </span>
              </div>
            )}
          </motion.figure>

          {/* ── what we promise, next to what they said ── */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={shown ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="lg:col-span-5"
          >
            <div className="rounded-[26px] border border-[#d4af37]/20 bg-white/[0.03] p-6 backdrop-blur-sm md:p-8">
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#d4af37]/80">Why they come back</p>
              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-7">
                {PROMISES.map((p) => (
                  <div key={p.label}>
                    <dt className="font-serif text-2xl text-white md:text-[1.75rem]">{p.value}</dt>
                    <dd className="mt-1 text-[11px] uppercase tracking-[0.16em] leading-relaxed text-white/45">
                      {p.label}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-7 border-t border-white/10 pt-5 text-xs font-light leading-relaxed text-white/45">
                Every piece is hand-finished in our own workshop and checked for purity before it is packed.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default TestimonialsCarousel;
