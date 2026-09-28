import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { ArrowRight } from "lucide-react";
// Shown only until the admin sets a "collection-wide" home banner.
const collectionFallback =
  "https://res.cloudinary.com/dcoimqij/image/upload/v1790577310/ishaputrabotanicals/demo/vy5xnu9fvciboqxylemt.jpg";
import {
  subscribeHomeBanners,
  type HomeBanner,
} from "@/services/homeContentService";
import { SmartImage } from "@/components/ui/smart-image";

const FALLBACK: HomeBanner = {
  slot: "collection-wide",
  eyebrow: "Rooted in Ayurveda",
  title: "Built for the modern man",
  subtitle: "Classical formulations, clean ingredients, made for everyday strength.",
  ctaLabel: "Shop the range",
  ctaLink: "/products",
  imageUrl: collectionFallback,
  active: true,
  order: 0,
};

const CollectionBanner = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });
  const [banner, setBanner] = useState<HomeBanner>(FALLBACK);

  useEffect(() => {
    const unsub = subscribeHomeBanners((all) => {
      const found = all.find((b) => b.slot === "collection-wide" && b.active);
      setBanner(found || FALLBACK);
    }, "collection-wide");
    return unsub;
  }, []);

  return (
    <section ref={ref} className="w-full py-6 md:py-10">
      <div className="container-custom">
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8 }}
          className="relative overflow-hidden rounded-[var(--radius-panel)] bg-charcoal"
        >
          <SmartImage
            src={banner.imageUrl}
            alt={banner.title}
            className="w-full h-[300px] md:h-[420px] object-cover" preset="hero" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
          <div className="absolute inset-0 flex items-center">
            <div className="px-8 md:px-14">
              <div className="max-w-lg">
                {banner.eyebrow && (
                  <p className="eyebrow-no on-dark mb-4">
                    {banner.eyebrow}
                  </p>
                )}
                <h2 className="text-2xl md:text-4xl font-semibold leading-tight mb-3 text-white font-serif">
                  {banner.title}
                </h2>
                {banner.subtitle && (
                  <p className="text-sm text-white/70 mb-6 font-light max-w-sm">
                    {banner.subtitle}
                  </p>
                )}
                <Link
                  to={banner.ctaLink}
                  className="btn-copper"
                >
                  {banner.ctaLabel} <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CollectionBanner;
