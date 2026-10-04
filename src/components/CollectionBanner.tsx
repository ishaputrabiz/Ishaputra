import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  subscribeHomeBanners,
  type HomeBanner,
} from "@/services/homeContentService";
import { SmartImage } from "@/components/ui/smart-image";
import Reveal from "@/components/Reveal";

// Shown only until the admin sets a "collection-wide" home banner.
const collectionFallback =
  "https://res.cloudinary.com/dcoimqij/image/upload/v1790577310/ishaputrabotanicals/demo/vy5xnu9fvciboqxylemt.jpg";

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

/**
 * Wide photo banner near the foot of the home page. The banner's eyebrow field
 * is no longer shown: the home page keeps eyebrows on three sections only.
 */
const CollectionBanner = () => {
  const [banner, setBanner] = useState<HomeBanner>(FALLBACK);

  useEffect(() => {
    const unsub = subscribeHomeBanners((all) => {
      const found = all.find((b) => b.slot === "collection-wide" && b.active);
      setBanner(found || FALLBACK);
    }, "collection-wide");
    return unsub;
  }, []);

  return (
    <section className="w-full py-8 md:py-12">
      <div className="container-custom">
        <Reveal className="relative isolate overflow-hidden rounded-panel bg-charcoal">
          <SmartImage
            src={banner.imageUrl}
            alt=""
            className="h-[300px] w-full object-cover md:h-[420px]"
            preset="hero"
          />
          <div aria-hidden="true" className="photo-scrim-side absolute inset-0" />
          <div className="absolute inset-0 flex items-center">
            <div className="max-w-lg px-8 text-charcoal-foreground md:px-14">
              <h2 className="on-photo mb-3 font-serif text-2xl font-semibold leading-tight [text-wrap:balance] md:text-4xl">
                {banner.title}
              </h2>
              {banner.subtitle && (
                <p className="on-photo mb-6 max-w-sm text-sm text-charcoal-foreground/85 [text-wrap:pretty]">
                  {banner.subtitle}
                </p>
              )}
              <Link to={banner.ctaLink} className="btn-copper">
                {banner.ctaLabel} <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export default CollectionBanner;
