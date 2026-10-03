import { ShieldCheck, Headphones, Video, Award } from "lucide-react";
import Reveal from "@/components/Reveal";

/**
 * TODO(client): "replying within a day" and "wellness experts" are placeholders
 * until the client confirms the support reply time and who runs video consultations.
 */
const features = [
  {
    id: 1,
    title: "Secure checkout",
    description: "Pay safely with UPI, cards or netbanking via Razorpay.",
    icon: ShieldCheck,
  },
  {
    id: 2,
    title: "Real support",
    description: "Real people, replying within a day.",
    icon: Headphones,
  },
  {
    id: 3,
    title: "Video consultation",
    description: "Talk to our wellness experts before you buy.",
    icon: Video,
  },
  {
    id: 4,
    title: "Rewards on every order",
    description: "Earn loyalty points to use on your next ritual.",
    icon: Award,
  },
];

const FeatureIcons = () => (
  <section className="tx-sheet hidden border-y border-foreground/[0.08] py-12 md:block md:py-20">
    <Reveal className="container-custom">
      <h2
        className="mb-10 text-center text-2xl font-semibold text-foreground [text-wrap:balance] lg:text-3xl"
        style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
      >
        Crafted around you
      </h2>

      <ul className="grid grid-cols-4 gap-6">
        {features.map((feature) => (
          <li
            key={feature.id}
            className="group relative flex flex-col items-center gap-5 rounded-card border border-foreground/[0.07] bg-background/60 px-5 pb-8 pt-9 text-center transition-[transform,border-color,box-shadow] [transition-duration:220ms] ease-out hover:-translate-y-1 hover:border-primary/35 hover:shadow-[var(--shadow-card-hover)]"
          >
            {/* Subtle top accent on hover */}
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 transition-opacity [transition-duration:220ms] group-hover:opacity-100" />

            {/* Icon */}
            <div className="tx-slate relative flex size-14 items-center justify-center rounded-card">
              <feature.icon aria-hidden="true" className="size-6 text-highlight-soft" />
              <span aria-hidden="true" className="absolute -inset-1.5 rounded-[16px] border border-primary/35 opacity-0 transition-opacity [transition-duration:220ms] group-hover:opacity-100" />
            </div>

            {/* Content */}
            <div>
              <h3 className="mb-2 text-[12px] font-bold uppercase leading-tight tracking-[0.12em] text-foreground">
                {feature.title}
              </h3>
              <p className="text-[13px] leading-relaxed text-muted-foreground [text-wrap:pretty]">
                {feature.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Reveal>
  </section>
);

export default FeatureIcons;
