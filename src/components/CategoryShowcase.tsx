import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { subscribeToShowcases, Showcase } from "@/services/showcaseService";
import { Loader2 } from "lucide-react";
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
    <section className="w-full py-8 md:py-16 bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(212,175,55,0.05)_100%)]">
      <div className="container-custom">
        {/* Section Title */}
        <div className="text-center mb-6 md:mb-10">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="h-px w-8 bg-primary/50" />
            <span className="text-[10px] uppercase tracking-[0.32em] text-primary/80 font-medium">Our Collections</span>
            <span className="h-px w-8 bg-primary/50" />
          </div>
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
            Curated for every moment
          </h2>
          <p className="text-sm text-muted-foreground mt-2 font-light">Explore curated collections crafted with passion</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-5 auto-rows-[220px] md:auto-rows-[190px]">
          {showcases.map((showcase, index) => {
            const isFirst = index === 0;
            const isSecond = index === 1;
            return (
              <motion.div
                key={showcase.id}
                className={`relative group overflow-hidden rounded-2xl md:rounded-[28px] border border-white/30 dark:border-border/60 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.35)] ${
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
                      <div className="mb-3 inline-flex w-fit rounded-full border border-white/20 bg-black/20 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-white/75">
                        {isFirst ? 'Collection Spotlight' : 'Curated Edit'}
                      </div>
                      <h3 
                        className={`font-semibold mb-0.5 transition-all duration-300 ${isFirst ? 'text-xl md:text-3xl' : 'text-base md:text-xl'}`}
                        style={{ fontFamily: "'Playfair Display', serif" }}
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
                        <span className="inline-block px-5 py-2 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 rounded-full text-xs font-medium shadow-lg">
                          Explore Collection
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
