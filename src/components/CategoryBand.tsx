import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const CategoryBand = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <section
      ref={ref}
      className="relative py-20 lg:py-32 overflow-hidden"
      style={{
        background: "linear-gradient(135deg, hsl(var(--secondary)) 0%, hsl(var(--muted)) 100%)",
      }}
    >
      {/* Decorative SVG Pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg className="absolute top-0 left-0 w-64 h-64 text-primary" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="20" fill="none" stroke="currentColor" strokeWidth="0.5" />
        </svg>
        <svg className="absolute bottom-0 right-0 w-64 h-64 text-primary" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" strokeWidth="0.5" />
          <circle cx="50" cy="50" r="20" fill="none" stroke="currentColor" strokeWidth="0.5" />
        </svg>
      </div>

      <div className="container-custom relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center"
        >
          <p className="body-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
            We believe in the power of jewelry — to tell a story, celebrate a moment, create or continue a tradition.
          </p>
          <h2 className="heading-lg mb-8 max-w-3xl mx-auto">
            Jewellery From The World's Finest Designers
          </h2>
          <motion.a
            href="#about"
            className="btn-primary"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            More About Us
          </motion.a>
        </motion.div>
      </div>
    </section>
  );
};

export default CategoryBand;
