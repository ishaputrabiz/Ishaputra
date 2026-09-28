import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { subscribeToShowcases, Showcase } from "@/services/showcaseService";
import { ArrowRight, Loader2 } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";

const CategoryShowcase = () => {
  const [showcases, setShowcases] = useState<Showcase[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to active showcases only
    const unsubscribe = subscribeToShowcases((data) => {
      setShowcases(data);
      setLoading(false);
    }, true); // true = active only

    return () => unsubscribe();
  }, []);

  const handleCardClick = (id: string) => {
    // On mobile, toggle the active state
    setActiveCard(activeCard === id ? null : id);
  };

  // Build category link from subtitle (e.g., "RINGS" -> "/shop/rings")
  const getCategoryLink = (subtitle: string): string => {
    const category = subtitle.toLowerCase().trim();
    return `/shop/${category}`;
  };

  // Don't render if loading or no showcases
  if (loading || showcases.length === 0) {
    return null;
  }

  return (
    <section className="tx-contour w-full py-8 md:py-16">
      <div className="container-custom">
        {/* Section Title */}
        <div className="text-center mb-6 md:mb-10">
          <p className="eyebrow-no eyebrow-center mb-3"><b>06</b><span>Shop by concern</span></p>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-foreground" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
            Built for every routine
          </h2>
          <p className="text-sm text-muted-foreground mt-2 font-light">Rituals for energy, hair, skin and grooming</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-5 auto-rows-[220px] md:auto-rows-[190px]">
          {showcases.map((showcase, index) => {
            const isFirst = index === 0;
            const isSecond = index === 1;
            return (
              <motion.div
                key={showcase.id}
                className={`relative group overflow-hidden rounded-[var(--radius-card)] border border-foreground/[0.08] bg-charcoal shadow-[var(--shadow-panel)] ${
                  isFirst
                    ? 'md:col-span-7 md:row-span-2'
                    : isSecond
                      ? 'md:col-span-5 md:row-span-1'
                      : 'md:col-span-5 md:row-span-1'
                } ${activeCard === showcase.id ? 'active' : ''}`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <Link 
                  to={getCategoryLink(showcase.subtitle)}
                  className="block cursor-pointer h-full"
                  onClick={() => handleCardClick(showcase.id!)}
                >
                  <div className={`relative h-full ${isFirst ? 'min-h-[360px] md:min-h-[420px]' : 'min-h-[220px]'}`}>
                    <SmartImage
                      src={showcase.imageUrl}
                      alt={showcase.title}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 lg:group-hover:scale-105" preset="hero" />
                    
                    <div className={`absolute inset-0 bg-gradient-to-t from-black/75 via-black/18 to-transparent transition-all duration-300 lg:group-hover:from-black/82`} />
                    
                    {/* Content */}
                    <div className="absolute inset-0 flex flex-col justify-end p-4 md:p-8 text-white">
                      <p className="eyebrow-no on-dark mb-3 w-fit">
                        <b>{String(index + 1).padStart(2, '0')}</b>{isFirst ? 'Collection spotlight' : 'Curated edit'}
                      </p>
                      <h3 
                        className={`font-semibold mb-0.5 transition-all duration-300 ${isFirst ? 'text-xl md:text-3xl' : 'text-base md:text-xl'}`}
                        style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
                      >
                        {showcase.title}
                      </h3>
                      
                      <p className={`uppercase tracking-[0.2em] text-white/70 font-light ${isFirst ? 'text-[10px] md:text-xs' : 'text-[9px] md:text-[11px]'}`}>
                        {showcase.subtitle}
                      </p>
                      
                      {/* Description - on hover/tap */}
                      <p className={`text-xs text-white/80 leading-relaxed overflow-hidden transition-all duration-300 ${
                        activeCard === showcase.id 
                          ? 'max-h-20 opacity-100 mt-2' 
                          : 'max-h-0 opacity-0 lg:group-hover:max-h-20 lg:group-hover:opacity-100 lg:group-hover:mt-3'
                      }`}>
                        {showcase.description}
                      </p>

                      {/* Shop button on hover */}
                      <div className={`overflow-hidden transition-all duration-300 ${
                        activeCard === showcase.id 
                          ? 'max-h-12 opacity-100 mt-3' 
                          : 'max-h-0 opacity-0 lg:group-hover:max-h-12 lg:group-hover:opacity-100 lg:group-hover:mt-4'
                      }`}>
                        <span className="btn-line text-white">
                          Explore collection <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
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
