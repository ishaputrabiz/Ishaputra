import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SmartImage } from "@/components/ui/smart-image";
import { cldUrl } from "@/lib/cloudinaryUrl";
import { BRAND } from "@/config/brand";
import { usePageMeta } from "@/hooks/usePageMeta";

/**
 * Photography for this page: Pexels stock (free for commercial use) until the
 * client's own shoot - sources in scripts/demo/credits.json (page-about-*).
 */
const CLD = "https://res.cloudinary.com/dcoimqij/image/upload";
const PHOTOS = {
  hero: `${CLD}/v1790515738/ishaputrabotanicals/demo/byd8pu2yr0ggnuzjjuki.jpg`,
  storyA: `${CLD}/v1790515740/ishaputrabotanicals/demo/sx0mm5t33bz08fvtoohs.jpg`,
  storyB: `${CLD}/v1790515741/ishaputrabotanicals/demo/wmlgtuuqefyx1cui5c4o.jpg`,
  collection: `${CLD}/v1790577312/ishaputrabotanicals/demo/u9hy798tpsm63hcgoenf.jpg`,
  craft: `${CLD}/v1790515743/ishaputrabotanicals/demo/cdcrb0q48xmdi9givh1x.jpg`,
  ritual: `${CLD}/v1790515745/ishaputrabotanicals/demo/rhcmvbepwkogypbc0kip.jpg`,
  energy: `${CLD}/v1790515728/ishaputrabotanicals/demo/xg0ugfrhcptxlhfaefnm.jpg`,
  hair: `${CLD}/v1790515729/ishaputrabotanicals/demo/qrro0cdf6uefdu2ahxbi.jpg`,
  skin: `${CLD}/v1790515731/ishaputrabotanicals/demo/ajzt8fes8lkwmlznvzgc.jpg`,
  grooming: `${CLD}/v1790515732/ishaputrabotanicals/demo/wsoazltiqroiesbta6bo.jpg`,
  classical: `${CLD}/v1790515747/ishaputrabotanicals/demo/hokj0a5c3ko3vpgfd1rg.jpg`,
  clean: `${CLD}/v1790515748/ishaputrabotanicals/demo/b0cge9lvkj8wbcqsyhg5.jpg`,
  daily: `${CLD}/v1790515749/ishaputrabotanicals/demo/j5hfmrkesbrjyjpba2ip.jpg`,
  men: `${CLD}/v1790515750/ishaputrabotanicals/demo/wxpbiqfpvnc8zvx6n6rt.jpg`,
};

/** The four ranges, each linked to its category page (owner decision AUTH-07). */
const RANGE = [
  {
    title: "Daily Strength",
    label: "Energy",
    description: "Shilajit, ashwagandha and classical rasayanas for steady, all-day energy.",
    image: PHOTOS.energy,
    to: "/category/energy-vitality",
  },
  {
    title: "Root Strength",
    label: "Hair",
    description: "Bhringraj, amla and rosemary to hold on to what you have and grow back more.",
    image: PHOTOS.hair,
    to: "/category/hair-care",
  },
  {
    title: "Clear Skin",
    label: "Skin",
    description: "Charcoal, neem and kumkumadi for clean, even, healthy-looking skin.",
    image: PHOTOS.skin,
    to: "/category/skin-care",
  },
  {
    title: "The Grooming Ritual",
    label: "Personal care",
    description: "Beard oils, body washes and deodorants with an earthy, woody edge.",
    image: PHOTOS.grooming,
    to: "/category/personal-care",
  },
];

const VALUES = [
  { name: "Classical formulas", role: "Recipes from the Ayurvedic texts", image: PHOTOS.classical },
  { name: "Clean ingredients", role: "Nothing you can't pronounce", image: PHOTOS.clean },
  { name: "Daily rituals", role: "Made to fit a busy day", image: PHOTOS.daily },
  { name: "Made for men", role: "Formats and scents men actually use", image: PHOTOS.men },
];

const About = () => {
  usePageMeta({
    title: "About us",
    description:
      "Ayurveda built for the modern man: classical herbs like shilajit, ashwagandha and bhringraj in clean, simple daily formats.",
  });

  return (
    <div className="min-h-screen tx-paper">
      <Header />
      <main id="main" tabIndex={-1} className="outline-none">
        {/* Hero */}
        <section className="relative h-[520px] overflow-hidden bg-charcoal md:h-[600px]">
          <img
            src={cldUrl(PHOTOS.hero, "hero")}
            alt="Ishaputra ingredients on dark stone"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-charcoal/85 via-charcoal/60 to-charcoal/25 md:via-charcoal/45 md:to-transparent"
          />
          <div className="container-custom relative flex h-full items-center">
            <div className="max-w-2xl text-charcoal-foreground">
              <h1 className="on-photo mb-6 font-heading text-4xl font-semibold leading-[1.02] tracking-tight [text-wrap:balance] md:text-6xl">
                Introducing
                <br />
                {BRAND.name}
              </h1>
              <p className="on-photo mb-8 max-w-xl text-base leading-relaxed text-charcoal-foreground/90 [text-wrap:pretty] md:text-lg">
                Ayurveda built for the modern man. We take classical formulations (shilajit, ashwagandha, bhringraj,
                kumkumadi) and make them simple to use every day, with clean ingredients and no fuss.
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-highlight-soft [text-wrap:balance]">
                {BRAND.tagline}
              </p>
            </div>
          </div>
        </section>

        {/* Our story */}
        <section className="py-16 md:py-24">
          <div className="container-custom">
            <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12">
              <div className="grid grid-cols-2 gap-4">
                <img
                  src={cldUrl(PHOTOS.storyA, "detail")}
                  alt="Himalayan shilajit resin"
                  loading="lazy"
                  className="w-full rounded-card shadow-panel"
                />
                <div className="pt-12">
                  <img
                    src={cldUrl(PHOTOS.storyB, "detail")}
                    alt="Bhringraj hair oil"
                    loading="lazy"
                    className="w-full rounded-card shadow-panel"
                  />
                </div>
              </div>
              <div>
                <h2 className="mb-6 font-heading text-3xl font-semibold tracking-tight text-foreground [text-wrap:balance] md:text-4xl">
                  Our story
                </h2>
                <div className="max-w-[62ch] space-y-4 leading-relaxed text-foreground/80 [text-wrap:pretty]">
                  <p>
                    {BRAND.shortName} started with a simple question: why does men&rsquo;s wellness either look clinical
                    or look like a temple shop? Ayurveda has some of the most time-tested herbs there are, but the way
                    they reach most men hasn&rsquo;t changed in decades.
                  </p>
                  <p>
                    So we rebuilt the shelf. Energy and vitality staples like shilajit and ashwagandha. Hair, skin and
                    beard care built on bhringraj, neem, saffron and cedarwood. Classical churnas and teas for everyday
                    balance.
                  </p>
                  <p>
                    Every product is made to fit into a real routine: a few drops at night, a capsule after breakfast,
                    a wash in the morning. Honest ingredients, clear directions, and packaging you&rsquo;ll want on your
                    shelf.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Collection banner */}
        <section className="relative h-[420px] overflow-hidden bg-charcoal md:h-[500px]">
          <img
            src={cldUrl(PHOTOS.collection, "hero")}
            alt="The Ishaputra range"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-charcoal/85 via-charcoal/55 to-charcoal/20 md:via-charcoal/40 md:to-transparent"
          />
          <div className="container-custom relative flex h-full items-center">
            <h2 className="on-photo max-w-xl font-heading text-3xl font-semibold leading-[1.05] tracking-tight text-charcoal-foreground [text-wrap:balance] md:text-5xl">
              Rooted in Ayurveda, built for everyday strength
            </h2>
          </div>
        </section>

        {/* Crafted */}
        <section className="relative my-16 h-[400px] overflow-hidden bg-charcoal md:my-24">
          <img
            src={cldUrl(PHOTOS.craft, "hero")}
            alt="Ishaputra bottles on a stone ledge"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-charcoal/85 via-charcoal/55 to-charcoal/20 md:via-charcoal/40 md:to-transparent"
          />
          <div className="container-custom relative flex h-full items-center">
            <div className="max-w-xl text-charcoal-foreground">
              <h2 className="on-photo mb-6 font-heading text-2xl font-semibold tracking-tight [text-wrap:balance] md:text-3xl">
                Classical formulations, made simple for every day
              </h2>
              <Link to="/products" className="btn-line text-charcoal-foreground">
                Shop now
              </Link>
            </div>
          </div>
        </section>

        {/* The range */}
        <section className="bg-muted py-16 md:py-24">
          <div className="container-custom">
            <div className="mx-auto mb-12 max-w-2xl text-center md:mb-16">
              <h2 className="mb-4 font-heading text-3xl font-semibold tracking-tight text-foreground [text-wrap:balance] md:text-4xl">
                The Ishaputra range
              </h2>
              <p className="text-muted-foreground [text-wrap:pretty]">
                Four rituals, one standard: herbs that work, in formats that fit a busy day.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {RANGE.map((item) => (
                <article
                  key={item.title}
                  className="group relative flex flex-col overflow-hidden rounded-card border border-foreground/[0.07] bg-card text-card-foreground shadow-panel transition-[transform,box-shadow,border-color] duration-hover ease-out hover:-translate-y-[3px] hover:border-primary/35"
                >
                  <div className="relative overflow-hidden">
                    <SmartImage
                      src={item.image}
                      alt=""
                      className="h-72 w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04] md:h-80"
                      preset="card"
                    />
                    <span className="tag-dark absolute left-3 top-3">{item.label}</span>
                  </div>
                  <div className="flex flex-1 flex-col p-5 md:p-6">
                    <h3 className="mb-2 font-heading text-lg font-semibold tracking-tight text-foreground">{item.title}</h3>
                    <p className="mb-5 text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">{item.description}</p>
                    <Link
                      to={item.to}
                      className="link-arrow mt-auto self-start after:absolute after:inset-0 after:content-['']"
                    >
                      See more products
                      <span className="sr-only">: {item.title}</span>
                      <ArrowRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Our approach */}
        <section className="py-16 md:py-24">
          <div className="container-custom">
            <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12">
              <img
                src={cldUrl(PHOTOS.ritual, "detail")}
                alt="A man in a charcoal shirt"
                loading="lazy"
                className="w-full rounded-card shadow-panel"
              />
              <div>
                <p className="eyebrow-no mb-4">Our approach</p>
                <h2 className="mb-6 font-heading text-3xl font-semibold tracking-tight text-foreground [text-wrap:balance] md:text-4xl">
                  Old wisdom, modern routine
                </h2>
                <p className="mb-8 max-w-[62ch] leading-relaxed text-foreground/80 [text-wrap:pretty]">
                  Ayurveda was always meant to be lived, not just believed. We keep the classical ingredients and drop
                  everything that makes them hard to use, so the ritual takes a minute and the results stay with you all
                  day.
                </p>
                <Link to="/products" className="btn-copper">
                  Explore more
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* What we stand for */}
        <section className="bg-muted py-16 md:py-24">
          <div className="container-custom">
            <h2 className="mb-12 text-center font-heading text-3xl font-semibold tracking-tight text-foreground [text-wrap:balance] md:mb-16 md:text-4xl">
              What we stand for
            </h2>
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {VALUES.map((value) => (
                <div key={value.name} className="text-center">
                  <div className="mb-5 overflow-hidden rounded-card">
                    <SmartImage src={value.image} alt="" className="h-72 w-full object-cover md:h-80" preset="card" />
                  </div>
                  <h3 className="mb-1.5 font-heading text-lg font-semibold tracking-tight text-foreground">{value.name}</h3>
                  <p className="text-sm text-muted-foreground">{value.role}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Our promise */}
        <section className="py-16 md:py-24">
          <div className="container-custom max-w-4xl text-center">
            <h2 className="mb-3 font-heading text-3xl font-semibold tracking-tight text-foreground [text-wrap:balance] md:text-4xl">
              Our promise
            </h2>
            <p className="mb-10 text-muted-foreground md:mb-12">One line we hold every product to</p>
            <figure className="panel tx-sheet p-8 md:p-12">
              <blockquote className="mx-auto mb-8 max-w-[44ch] font-heading text-xl leading-snug tracking-tight text-foreground [text-wrap:balance] md:text-2xl">
                &ldquo;{BRAND.tagline}. Herbs that have earned their place over centuries, in a form that fits the way
                you live now.&rdquo;
              </blockquote>
              <figcaption className="flex items-center justify-center gap-4">
                <Avatar className="h-14 w-14 bg-charcoal">
                  <AvatarImage src="/icon-192.png" alt="" />
                  <AvatarFallback className="bg-charcoal text-charcoal-foreground">IB</AvatarFallback>
                </Avatar>
                <div className="text-left">
                  <div className="font-semibold text-foreground">{BRAND.name}</div>
                  <div className="text-sm text-muted-foreground">Men&rsquo;s Ayurveda and botanical wellness</div>
                </div>
              </figcaption>
            </figure>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default About;
