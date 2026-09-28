import { motion } from "framer-motion";

const phrases = [
  "Pure Wellness For A Stronger You",
  "Rooted In Ayurveda",
  "Classical Formulations",
  "Clean Ingredients",
  "Made For Men",
  "Daily Rituals",
  "Modern Botanical Science",
  "Shilajit · Ashwagandha · Bhringraj",
];

const MarqueeBand = () => {
  // Duplicate phrases for seamless loop
  const duplicatedPhrases = [...phrases, ...phrases, ...phrases];

  return (
    <section className="tx-slate border-y border-highlight-soft/20 py-3.5 md:py-5 overflow-hidden">
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
              <span
                className={`text-sm md:text-lg font-semibold uppercase tracking-[0.14em] ${index % 2 ? "text-outline" : "text-charcoal-foreground/90"}`}
                style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
              >
                {phrase}
              </span>
              <span className="sep-diamond" />
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default MarqueeBand;
