import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Link } from "react-router-dom";
import unique from "@/assets/categories/unique.jpg";
import tide from "@/assets/categories/tide.jpg";
import organic from "@/assets/categories/organic.jpg";
import icons from "@/assets/categories/icons.jpg";
import { SmartImage } from "@/components/ui/smart-image";

const categories = [
  { id: 1, name: "One-Of-A-Kinds", subtitle: "BRACELETS", image: unique, link: "/shop/bracelets" },
  { id: 2, name: "High Tide Looks", subtitle: "RINGS", image: tide, link: "/shop/rings" },
  { id: 3, name: "New Organic Döme", subtitle: "EARRINGS", image: organic, link: "/shop/earrings" },
  { id: 4, name: "The Tiffany Icons", subtitle: "NECKLACES", image: icons, link: "/shop/necklaces" },
];

const CategoryGrid = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section ref={ref} className="section-padding">
      <div className="container-custom">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-6">
          {categories.map((category, index) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="aspect-[3/4]"
            >
              <Link
                to={category.link}
                className="group relative overflow-hidden rounded-lg md:rounded-xl h-full w-full cursor-pointer block"
              >
                {/* Background Image */}
                <div className="absolute inset-0 pointer-events-none">
                  <SmartImage
                    src={category.image}
                    alt={category.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" preset="card" />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent transition-colors group-hover:from-foreground/80" />
                </div>

                {/* Content */}
                <div className="relative z-10 h-full flex flex-col items-start justify-end p-3 md:p-6 pointer-events-none">
                  <p className="text-xs md:text-sm text-primary-foreground/80 font-medium tracking-wider mb-1">
                    {category.subtitle}
                  </p>
                  <h3 className="text-sm md:text-base lg:text-lg font-semibold text-primary-foreground transition-transform duration-300 group-hover:-translate-y-2">
                    {category.name}
                  </h3>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CategoryGrid;
