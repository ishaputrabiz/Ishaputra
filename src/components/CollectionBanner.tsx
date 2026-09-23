import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import collectionFallback from "@/assets/collection-banner.jpg";
import {
  subscribeHomeBanners,
  type HomeBanner,
} from "@/services/homeContentService";
import { SmartImage } from "@/components/ui/smart-image";

const FALLBACK: HomeBanner = {
  slot: "collection-wide",
  eyebrow: "SREERASTHU SILVERS COLLECTION",
  title: "Shop The Latest Jewellery",
  subtitle: "Exceptional Handcrafted Design to Enhance the Magnificent Glow",
  ctaLabel: "Shop Now",
  ctaLink: "/category/jewellery",
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
          className="relative overflow-hidden rounded-2xl"
        >
          <SmartImage
            src={banner.imageUrl}
            alt={banner.title}
            className="w-full h-[300px] md:h-[420px] object-cover" preset="hero" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
          <div className="absolute inset-0 flex items-center">
            <div className="px-8 md:px-14">
              <div className="max-w-lg">
                {banner.eyebrow && (
                  <span className="text-[10px] uppercase tracking-[0.2em] text-white/60 block mb-3 font-medium">
                    {banner.eyebrow}
                  </span>
                )}
                <h2 className="text-xl md:text-3xl font-semibold mb-3 text-white font-serif">
                  {banner.title}
                </h2>
                {banner.subtitle && (
                  <p className="text-sm text-white/70 mb-6 font-light max-w-sm">
                    {banner.subtitle}
                  </p>
                )}
                <Link
                  to={banner.ctaLink}
                  className="inline-flex items-center px-7 py-3 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 text-xs font-semibold tracking-wide rounded-full hover:bg-primary hover:text-white transition-colors"
                >
                  {banner.ctaLabel}
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
