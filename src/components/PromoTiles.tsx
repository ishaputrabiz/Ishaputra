import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import promoHeart from "@/assets/promo-heart.jpg";
import promoRing from "@/assets/promo-ring.jpg";
import { SmartImage } from "@/components/ui/smart-image";

const tiles = [
  {
    id: 1,
    eyebrow: "FAVORITE ITEMS",
    title: "Add These To Your Style Roster.",
    subtitle: "Grab the deal right now! you can get extra 15% off this season.",
    cta: "Shop Now",
    image: promoHeart,
    gradient: "from-foreground/60 to-transparent",
    href: "/shop/necklaces",
  },
  {
    id: 2,
    title: "Unique Engagement Rings",
    subtitle: "From special antique diamonds to one of-a-kind colored gemstones",
    cta: "Shop Now",
    image: promoRing,
    gradient: "from-foreground/60 to-transparent",
    href: "/jewelry-collections",
  },
];

const PromoTiles = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const navigate = useNavigate();

  return (
    <section ref={ref} className="pb-8 md:pb-12 w-[100vw] ml-[calc(-50vw+50%)] overflow-hidden">
      <div className="w-full">
        <div className="grid md:grid-cols-2">
          {tiles.map((tile, index) => (
            <motion.div
              key={tile.id}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: index * 0.15 }}
              className="group relative overflow-hidden aspect-[4/3] md:aspect-[16/9] lg:aspect-[16/8] cursor-pointer min-h-[280px] md:min-h-[380px] lg:min-h-[420px]"
            >
              {/* Background Image */}
              <div className="absolute inset-0">
                <SmartImage
                  src={tile.image}
                  alt={tile.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" preset="card" />
                <div className={`absolute inset-0 bg-gradient-to-t ${tile.gradient}`} />
              </div>

              {/* Content */}
              <div className="relative z-10 h-full flex flex-col justify-end p-6 md:p-8">
                {tile.eyebrow && (
                  <span className="eyebrow text-primary-light mb-2">{tile.eyebrow}</span>
                )}
                <h3 className="heading-md text-primary-foreground mb-2">
                  {tile.title}
                </h3>
                <p className="body-md text-primary-foreground/80 mb-4 max-w-sm">
                  {tile.subtitle}
                </p>
                <button
                  onClick={() => navigate(tile.href)}
                  className="inline-flex items-center gap-2 text-primary-foreground font-medium text-sm tracking-wider uppercase group/link"
                >
                  {tile.cta}
                  <ArrowRight className="w-4 h-4 transition-transform group-hover/link:translate-x-1" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PromoTiles;
