import { useRef } from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import handmadeCrafting from "@/assets/handmade-crafting.jpg";

const SplitSection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });
  
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const imageY = useTransform(scrollYProgress, [0, 1], [50, -50]);

  return (
    <section ref={ref} className="py-16 md:py-24 overflow-hidden bg-background">
      <div className="container-custom">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          {/* Image */}
          <motion.div
            style={{ y: imageY }}
            className="relative"
          >
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.8 }}
              className="relative overflow-hidden"
            >
              <img
                src={handmadeCrafting}
                alt="Artisan handcrafting jewelry"
                className="w-full h-auto object-cover aspect-[4/5]"
                loading="lazy"
              />
            </motion.div>
          </motion.div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="lg:pl-8"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground block mb-4">
              OUR CHALLENGE TO DO BETTER
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold mb-6 text-foreground">
              All Of Our Jewellery Is Handmade.
            </h2>
            <p className="text-base text-muted-foreground mb-8 leading-relaxed">
              A gift they'll treasure forever. Olight created diamonds jewelry combines precious metals with laboratory grown diamonds to form captivating collections.
            </p>
            <motion.a
              href="#explore"
              className="inline-flex items-center gap-2 px-8 py-4 bg-foreground text-background text-sm font-medium uppercase tracking-wider rounded-full hover:bg-foreground/90 transition-colors"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Explore More
            </motion.a>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default SplitSection;
