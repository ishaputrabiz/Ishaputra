import { motion } from "framer-motion";
import { useInView } from "framer-motion";
import { useRef } from "react";
import { Gem } from "lucide-react";

const AboutSection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <section
      ref={ref}
      className="relative py-20 md:py-28 lg:py-32 bg-background overflow-hidden"
    >
      {/* Decorative Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Left Lantern Decoration */}
        <div className="absolute left-0 top-0 bottom-0 w-64 md:w-80 lg:w-96 opacity-30">
          <svg
            viewBox="0 0 200 600"
            className="h-full w-full"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Decorative lantern pattern - left */}
            <path
              d="M100 50 L100 100 M80 100 L120 100 L130 150 L140 300 L130 350 L120 400 L80 400 L70 350 L60 300 L70 150 L80 100"
              stroke="url(#goldGradient)"
              strokeWidth="1.5"
              fill="none"
            />
            <ellipse cx="100" cy="300" rx="35" ry="80" fill="url(#lanternGlow)" />
            <path
              d="M100 420 L100 500 M90 440 Q100 460 110 440"
              stroke="url(#goldGradient)"
              strokeWidth="1.5"
            />
            {/* Diamond shapes */}
            <path d="M100 520 L110 540 L100 560 L90 540 Z" stroke="url(#goldGradient)" strokeWidth="1" fill="none" />
            <path d="M100 570 L105 580 L100 590 L95 580 Z" stroke="url(#goldGradient)" strokeWidth="1" fill="none" />
            <defs>
              <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#D4A853" />
                <stop offset="50%" stopColor="#C9A227" />
                <stop offset="100%" stopColor="#B8860B" />
              </linearGradient>
              <radialGradient id="lanternGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFD700" stopOpacity="0.6" />
                <stop offset="70%" stopColor="#FFA500" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#FF8C00" stopOpacity="0" />
              </radialGradient>
            </defs>
          </svg>
        </div>

        {/* Right Lantern Decoration */}
        <div className="absolute right-0 top-0 bottom-0 w-64 md:w-80 lg:w-96 opacity-30">
          <svg
            viewBox="0 0 200 600"
            className="h-full w-full"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Decorative lantern pattern - right */}
            <path
              d="M100 50 L100 100 M80 100 L120 100 L130 150 L140 300 L130 350 L120 400 L80 400 L70 350 L60 300 L70 150 L80 100"
              stroke="url(#goldGradient2)"
              strokeWidth="1.5"
              fill="none"
            />
            <ellipse cx="100" cy="300" rx="35" ry="80" fill="url(#lanternGlow2)" />
            <path
              d="M100 420 L100 500 M90 440 Q100 460 110 440"
              stroke="url(#goldGradient2)"
              strokeWidth="1.5"
            />
            {/* Diamond shapes */}
            <path d="M100 520 L110 540 L100 560 L90 540 Z" stroke="url(#goldGradient2)" strokeWidth="1" fill="none" />
            <path d="M100 570 L105 580 L100 590 L95 580 Z" stroke="url(#goldGradient2)" strokeWidth="1" fill="none" />
            <defs>
              <linearGradient id="goldGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#D4A853" />
                <stop offset="50%" stopColor="#C9A227" />
                <stop offset="100%" stopColor="#B8860B" />
              </linearGradient>
              <radialGradient id="lanternGlow2" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFD700" stopOpacity="0.6" />
                <stop offset="70%" stopColor="#FFA500" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#FF8C00" stopOpacity="0" />
              </radialGradient>
            </defs>
          </svg>
        </div>

        {/* Subtle sparkle dots */}
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-primary/20 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="container-custom relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          {/* Diamond Icon */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="mb-6"
          >
            <Gem className="w-12 h-12 mx-auto text-primary" strokeWidth={1.5} />
          </motion.div>

          {/* Heading */}
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-3xl md:text-4xl lg:text-5xl font-heading font-medium leading-tight mb-6"
          >
            Jewellery From The
            <br />
            World's Finest Designers
          </motion.h2>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-base md:text-lg text-muted-foreground leading-relaxed mb-8 max-w-2xl mx-auto"
          >
            We believe in the power of jewelry — to tell a story, celebrate a moment,
            create or continue a tradition. There's a wonder in wearing something
            made from the earth. Each Sreerasthu Silvers piece is crafted with ethically sourced
            precious metals to reflect our commitment to human rights and
            environmental sustainability.
          </motion.p>

          {/* CTA Link */}
          <motion.a
            href="#about"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="inline-block text-foreground font-medium tracking-wide border-b-2 border-foreground pb-1 hover:text-primary hover:border-primary transition-colors"
          >
            More About Us
          </motion.a>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;
