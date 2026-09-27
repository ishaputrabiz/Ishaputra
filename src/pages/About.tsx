import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowRight } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SmartImage } from "@/components/ui/smart-image";
import { cldUrl } from "@/lib/cloudinaryUrl";
import { BRAND } from "@/config/brand";

/**
 * Photography for this page. Placeholders from the demo shoot
 * (scripts/demo/content.mjs) - TODO(client): replace with real brand photos.
 */
const CLD = "https://res.cloudinary.com/dcoimqij/image/upload";
const PHOTOS = {
  hero: `${CLD}/v1790164427/ishaputrabotanicals/demo/zurdxwuvf6utvs9nj4fb.jpg`,
  storyA: `${CLD}/v1790163572/ishaputrabotanicals/demo/lvsrpcrgiysg8ehwduoh.jpg`,
  storyB: `${CLD}/v1790163707/ishaputrabotanicals/demo/sxtyv3ru1xmfsceene3p.jpg`,
  collection: `${CLD}/v1790165192/ishaputrabotanicals/demo/jvogchddy0d1mgp0iztu.jpg`,
  craft: `${CLD}/v1790164203/ishaputrabotanicals/demo/skwawcwe23osyuspv5hf.jpg`,
  ritual: `${CLD}/v1790164336/ishaputrabotanicals/demo/v0icvwhgxokaw8qwdq8y.jpg`,
  energy: `${CLD}/v1790164697/ishaputrabotanicals/demo/mzsqqseyinqtbimvzvwh.jpg`,
  hair: `${CLD}/v1790165392/ishaputrabotanicals/demo/vnhhjaoazpge7at8qadp.jpg`,
  skin: `${CLD}/v1790164877/ishaputrabotanicals/demo/entvt3xwysxtaxhmfxtd.jpg`,
  grooming: `${CLD}/v1790165011/ishaputrabotanicals/demo/cxq4o0gbhhnc38kmwxtc.jpg`,
  classical: `${CLD}/v1790164561/ishaputrabotanicals/demo/h9woaemeoyehjp5r5yqx.jpg`,
  clean: `${CLD}/v1790164652/ishaputrabotanicals/demo/t8qvwu2cqpeo20qpnuj1.jpg`,
  daily: `${CLD}/v1790164112/ishaputrabotanicals/demo/eet2job6gsjv0tvfksat.jpg`,
  men: `${CLD}/v1790164158/ishaputrabotanicals/demo/t0dcjxkmvbmceoldji0f.jpg`,
};

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      {/* Hero Section */}
      <section className="relative h-[600px] bg-gradient-to-r from-zinc-900 to-zinc-800 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={cldUrl(PHOTOS.hero, "hero")}
            alt="Ishaputra ingredients on dark stone"
            className="w-full h-full object-cover opacity-50"
          />
        </div>
        <div className="relative container mx-auto px-4 h-full flex items-center">
          <div className="max-w-2xl text-white">
            <h1 className="text-5xl md:text-6xl font-light mb-6">
              Introducing
              <br />
              <span className="font-serif">{BRAND.name}</span>
            </h1>
            <p className="text-lg mb-8 leading-relaxed opacity-90">
              Ayurveda built for the modern man. We take classical formulations - shilajit,
              ashwagandha, bhringraj, kumkumadi - and make them simple to use every day, with clean
              ingredients and no fuss.
            </p>
            <div className="flex items-center gap-4">
              <div className="text-sm uppercase tracking-[0.3em] text-highlight-soft">{BRAND.tagline}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Story Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <img
                  src={cldUrl(PHOTOS.storyA, "detail")}
                  alt="Himalayan shilajit resin"
                  className="w-full rounded-lg shadow-lg"
                />
              </div>
              <div className="pt-12">
                <img
                  src={cldUrl(PHOTOS.storyB, "detail")}
                  alt="Bhringraj hair oil"
                  className="w-full rounded-lg shadow-lg"
                />
              </div>
            </div>
            <div>
              <h2 className="text-4xl font-light mb-6">Our Story</h2>
              <div className="space-y-4 text-foreground/80 leading-relaxed">
                <p>
                  {BRAND.shortName} started with a simple question: why does men's wellness either look
                  clinical or look like a temple shop? Ayurveda has some of the most time-tested herbs
                  there are, but the way they reach most men hasn't changed in decades.
                </p>
                <p>
                  So we rebuilt the shelf. Energy and vitality staples like shilajit and ashwagandha.
                  Hair, skin and beard care built on bhringraj, neem, saffron and cedarwood. Classical
                  churnas and teas for everyday balance.
                </p>
                <p>
                  Every product is made to fit into a real routine - a few drops at night, a capsule
                  after breakfast, a wash in the morning. Honest ingredients, clear directions, and
                  packaging you'll want on your shelf.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Collection Banner */}
      <section className="relative h-[500px] bg-muted overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={cldUrl(PHOTOS.collection, "hero")}
            alt="The Ishaputra range"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-charcoal/85 via-charcoal/40 to-transparent" />
        </div>
        <div className="relative container mx-auto px-4 h-full flex items-center">
          <div className="max-w-xl">
            <div className="text-sm uppercase tracking-wider mb-4 text-highlight-soft">
              ISHAPUTRA COLLECTION
            </div>
            <h2 className="text-5xl font-light text-charcoal-foreground mb-2">
              Rooted in Ayurveda
            </h2>
            <h2 className="text-5xl font-light text-charcoal-foreground mb-2">
              Built for
            </h2>
            <h2 className="text-5xl font-light text-charcoal-foreground">Everyday Strength</h2>
          </div>
        </div>
      </section>

      {/* Crafted Section */}
      <section className="relative h-[400px] bg-muted overflow-hidden my-20">
        <div className="absolute inset-0">
          <img
            src={cldUrl(PHOTOS.craft, "hero")}
            alt="Ishaputra bottles on a stone ledge"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-charcoal/80 to-transparent" />
        </div>
        <div className="relative container mx-auto px-4 h-full flex items-center">
          <div className="max-w-xl">
            <h3 className="text-3xl font-light text-charcoal-foreground mb-6">
              Classical Formulations, Made Simple for Every Day
            </h3>
            <Button className="bg-card text-foreground hover:bg-muted">
              Shop Now
            </Button>
          </div>
        </div>
      </section>

      {/* The Range Section */}
      <section className="py-20 px-4 bg-muted">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-light mb-4">The Ishaputra Range</h2>
            <p className="text-muted-foreground">
              Four rituals, one standard: herbs that work, in formats that fit a busy day.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: "Daily Strength",
                subtitle: "ENERGY",
                description: "Shilajit, ashwagandha and classical rasayanas for steady, all-day energy.",
                image: PHOTOS.energy,
              },
              {
                title: "Root Strength",
                subtitle: "HAIR",
                description: "Bhringraj, amla and rosemary to hold on to what you have and grow back more.",
                image: PHOTOS.hair,
              },
              {
                title: "Clear Skin",
                subtitle: "SKIN",
                description: "Charcoal, neem and kumkumadi for clean, even, healthy-looking skin.",
                image: PHOTOS.skin,
              },
              {
                title: "The Grooming Ritual",
                subtitle: "PERSONAL CARE",
                description: "Beard oils, body washes and deodorants with an earthy, woody edge.",
                image: PHOTOS.grooming,
              },
            ].map((item, index) => (
              <Card key={index} className="group cursor-pointer border-0 shadow-lg hover:shadow-xl transition-shadow">
                <div className="relative overflow-hidden rounded-t-lg">
                  <SmartImage
                    src={item.image}
                    alt={item.title}
                    className="w-full h-80 object-cover group-hover:scale-105 transition-transform duration-300" preset="card" />
                  <div className="absolute top-4 left-4 bg-background/90 dark:bg-card/90 px-3 py-1 rounded text-sm font-medium">
                    {item.subtitle}
                  </div>
                </div>
                <CardContent className="p-6">
                  <h3 className="text-xl font-light mb-3">{item.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{item.description}</p>
                  <Button variant="link" className="p-0 h-auto font-normal">
                    See More Products <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Our Approach Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="relative">
              <img
                src={cldUrl(PHOTOS.ritual, "detail")}
                alt="A man in a charcoal shirt"
                className="w-full rounded-lg shadow-2xl"
              />
            </div>
            <div>
              <div className="text-sm uppercase tracking-wider mb-4 text-muted-foreground">
                OUR APPROACH
              </div>
              <h2 className="text-4xl font-light mb-6">
                Old Wisdom, Modern Routine.
              </h2>
              <p className="text-foreground/80 leading-relaxed mb-8">
                Ayurveda was always meant to be lived, not just believed. We keep the classical
                ingredients and drop everything that makes them hard to use - so the ritual takes a
                minute, and the results stay with you all day.
              </p>
              <Button className="bg-foreground text-background hover:bg-foreground/90">
                Explore More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* What We Stand For Section */}
      <section className="py-20 px-4 bg-muted">
        <div className="container mx-auto">
          <h2 className="text-4xl font-light text-center mb-16">What We Stand For</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { name: "Classical Formulas", role: "Recipes from the Ayurvedic texts", image: PHOTOS.classical },
              { name: "Clean Ingredients", role: "Nothing you can't pronounce", image: PHOTOS.clean },
              { name: "Daily Rituals", role: "Made to fit a busy day", image: PHOTOS.daily },
              { name: "Made for Men", role: "Formats and scents men actually use", image: PHOTOS.men },
            ].map((member, index) => (
              <div key={index} className="text-center group">
                <div className="relative mb-6 overflow-hidden rounded-2xl">
                  <SmartImage
                    src={member.image}
                    alt={member.name}
                    className="w-full h-80 object-cover group-hover:scale-105 transition-transform duration-300" preset="card" />
                </div>
                <h3 className="text-xl font-medium mb-2">{member.name}</h3>
                <p className="text-muted-foreground text-sm">{member.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Brand Promise Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-light mb-4">Our Promise</h2>
          <p className="text-muted-foreground mb-12">
            One line we hold every product to
          </p>
          <div className="bg-gradient-to-br from-muted to-background p-12 rounded-2xl shadow-lg">
            <p className="text-lg italic text-foreground/80 mb-8 leading-relaxed">
              "{BRAND.tagline}. Herbs that have earned their place over centuries, in a form that
              fits the way you live now."
            </p>
            <div className="flex items-center justify-center gap-4">
              <Avatar className="h-16 w-16 bg-charcoal">
                <AvatarImage src="/icon-192.png" />
                <AvatarFallback>IB</AvatarFallback>
              </Avatar>
              <div className="text-left">
                <div className="font-medium">{BRAND.name}</div>
                <div className="text-sm text-muted-foreground">Men's Ayurveda &amp; Botanical Wellness</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default About;
