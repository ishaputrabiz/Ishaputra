import Marquee from "@/components/home/Marquee";

const phrases = [
  "Pure wellness for a stronger you",
  "Rooted in Ayurveda",
  "Classical formulations",
  "Clean ingredients",
  "Made for men",
  "Daily rituals",
  "Modern botanical science",
  "Shilajit, ashwagandha and bhringraj",
];

/** The page's one moving band: charcoal stone, copper lettering, solid and hollow in turn. */
const MarqueeBand = () => (
  <section className="tx-slate border-y border-highlight-soft/20 py-3.5 md:py-5">
    <Marquee speed={45} copyClassName="gap-10 pr-10">
      {phrases.map((phrase, index) => (
        <div key={phrase} className="flex items-center gap-10">
          <span
            className={`whitespace-nowrap text-sm font-semibold uppercase tracking-[0.14em] md:text-lg ${
              index % 2 ? "text-outline" : "text-charcoal-foreground/90"
            }`}
            style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
          >
            {phrase}
          </span>
          <span aria-hidden="true" className="sep-diamond" />
        </div>
      ))}
    </Marquee>
  </section>
);

export default MarqueeBand;
