import { motion } from "framer-motion";

const phrases = [
  "Earn Loyalty Points On Every Order",
  "Delivery Across India",
  "Secure Razorpay Checkout",
  "Pure Wellness For A Stronger You",
];

const FreeShippingBand = () => {
  const duplicatedPhrases = [...phrases, ...phrases, ...phrases];

  return (
    <section className="hidden md:block py-3.5 tx-sheet border-y border-foreground/[0.08] overflow-hidden">
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
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/70">
                {phrase}
              </span>
              <span className="sep-diamond !bg-primary/70" />
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default FreeShippingBand;
