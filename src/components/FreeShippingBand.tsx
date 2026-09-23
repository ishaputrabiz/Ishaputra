import { motion } from "framer-motion";
import { Gem } from "lucide-react";

const phrases = [
  "Free Shipping Over ₹20,000 For Members",
  "Free Shipping Over ₹20,000 For Members",
  "Free Shipping Over ₹20,000 For Members",
  "Free Shipping Over ₹20,000 For Members",
];

const FreeShippingBand = () => {
  const duplicatedPhrases = [...phrases, ...phrases, ...phrases];

  return (
    <section className="hidden md:block py-3.5 bg-primary/10 border-y border-primary/10 overflow-hidden">
      <div className="relative">
        <motion.div
          className="flex items-center gap-12 whitespace-nowrap"
          animate={{
            x: [0, -100 * phrases.length],
          }}
          transition={{
            x: {
              repeat: Infinity,
              repeatType: "loop",
              duration: 25,
              ease: "linear",
            },
          }}
        >
          {duplicatedPhrases.map((phrase, index) => (
            <div key={index} className="flex items-center gap-12">
              <span className="text-sm font-light text-primary tracking-wide">
                {phrase}
              </span>
              <Gem className="w-3.5 h-3.5 text-primary/50 flex-shrink-0" />
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default FreeShippingBand;
