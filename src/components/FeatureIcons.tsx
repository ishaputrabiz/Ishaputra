import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Package, Headphones, CalendarCheck, Gift } from "lucide-react";

const features = [
  {
    id: 1,
    title: "Complimentary Shipping",
    description: "Free shipping & returns on orders over ₹10,000.",
    icon: Package,
  },
  {
    id: 2,
    title: "Sreerasthu At Your Service",
    description: "Our client care experts are always here to help.",
    icon: Headphones,
  },
  {
    id: 3,
    title: "Book an Appointment",
    description: "In-store or virtual appointments available.",
    icon: CalendarCheck,
  },
  {
    id: 4,
    title: "The Iconic Box",
    description: "Every purchase wrapped in our signature packaging.",
    icon: Gift,
  },
];

const FeatureIcons = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section ref={ref} className="hidden md:block py-14 bg-gradient-to-b from-background via-background to-muted/30 border-y border-border">
      <div className="container-custom">
        {/* Section eyebrow */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-px w-8 bg-primary/50" />
            <span className="text-[10px] uppercase tracking-[0.32em] text-primary/80 font-medium">
              The Sreerasthu Promise
            </span>
            <span className="h-px w-8 bg-primary/50" />
          </div>
          <h3 className="text-2xl lg:text-3xl font-semibold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
            Crafted around you
          </h3>
        </div>

        <div className="grid grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.id}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative flex flex-col items-center text-center gap-4 px-5 py-7 rounded-2xl bg-card border border-border/60 hover:border-primary/30 hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)] transition-all duration-300"
            >
              {/* Subtle top accent on hover */}
              <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* Icon */}
              <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                <feature.icon className="w-6 h-6 text-primary" strokeWidth={1.4} />
                <span className="absolute inset-0 rounded-full ring-1 ring-primary/10 ring-offset-2 ring-offset-card opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>

              {/* Content */}
              <div>
                <h4 className="text-sm font-semibold text-foreground leading-tight mb-1.5 tracking-wide">
                  {feature.title}
                </h4>
                <p className="text-[11.5px] text-muted-foreground leading-relaxed font-light">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeatureIcons;
