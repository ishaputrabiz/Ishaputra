import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { ShieldCheck, Headphones, Video, Award } from "lucide-react";

const features = [
  {
    id: 1,
    title: "Secure Checkout",
    description: "Pay safely with UPI, cards or netbanking via Razorpay.",
    icon: ShieldCheck,
  },
  {
    id: 2,
    title: "Ishaputra At Your Service",
    description: "Real people, replying within a day.",
    icon: Headphones,
  },
  {
    id: 3,
    title: "Video Consultation",
    description: "Talk to our wellness experts before you buy.",
    icon: Video,
  },
  {
    id: 4,
    title: "Rewards On Every Order",
    description: "Earn loyalty points to use on your next ritual.",
    icon: Award,
  },
];

const FeatureIcons = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });

  return (
    <section ref={ref} className="hidden md:block py-16 tx-sheet border-y border-foreground/[0.08]">
      <div className="container-custom">
        {/* Section eyebrow */}
        <div className="flex flex-col items-center mb-10">
          <p className="eyebrow-no eyebrow-center mb-3"><b>07</b><span>The Ishaputra promise</span></p>
          <h3 className="text-2xl lg:text-3xl font-semibold text-foreground" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
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
              className="group relative flex flex-col items-center text-center gap-5 px-5 pt-9 pb-8 rounded-[var(--radius-card)] bg-background/60 border border-foreground/[0.07] hover:-translate-y-1 hover:border-primary/35 hover:shadow-[var(--shadow-card-hover)] transition-all duration-300"
            >
              {/* Subtle top accent on hover */}
              <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <span className="absolute left-4 top-3.5 text-[10px] font-bold tracking-[0.18em] text-foreground/25 tabular-nums">{String(index + 1).padStart(2, "0")}</span>

              {/* Icon */}
              <div className="tx-slate relative w-14 h-14 rounded-[10px] flex items-center justify-center">
                <feature.icon className="w-6 h-6 text-highlight-soft" strokeWidth={1.4} />
                <span className="absolute -inset-1.5 rounded-[13px] border border-primary/35 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>

              {/* Content */}
              <div>
                <h4 className="text-[12px] font-bold uppercase text-foreground leading-tight mb-2 tracking-[0.12em]">
                  {feature.title}
                </h4>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
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
