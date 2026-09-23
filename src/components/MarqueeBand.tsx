import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

const phrases = [
  "The Iconic Collection",
  "Color In Your Look",
  "Elegant And Everlasting",
  "Handcrafted Jewelry",
  "Timeless Beauty",
  "Premium Quality",
  "Exclusive Designs",
  "925 Pure Silver",
];

const MarqueeBand = () => {
  // Duplicate phrases for seamless loop
  const duplicatedPhrases = [...phrases, ...phrases, ...phrases];

  return (
    <section className="py-3 md:py-4 bg-primary overflow-hidden">
      <div className="relative">
        <motion.div
          className="flex items-center gap-10 whitespace-nowrap"
          animate={{
            x: [0, -100 * phrases.length],
          }}
          transition={{
            x: {
              repeat: Infinity,
              repeatType: "loop",
              duration: 35,
              ease: "linear",
            },
          }}
        >
          {duplicatedPhrases.map((phrase, index) => (
            <div key={index} className="flex items-center gap-10">
              <span className="text-sm md:text-base font-light text-white/90 tracking-[0.15em] uppercase">
                {phrase}
              </span>
              <Sparkles className="w-3.5 h-3.5 text-white/50 flex-shrink-0" />
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default MarqueeBand;
