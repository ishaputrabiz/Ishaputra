import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SmartImage } from "@/components/ui/smart-image";

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      {/* Hero Section */}
      <section className="relative h-[600px] bg-gradient-to-r from-zinc-900 to-zinc-800 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/src/assets/hero-jewelry.jpg"
            alt="Hero Background"
            className="w-full h-full object-cover opacity-50"
          />
        </div>
        <div className="relative container mx-auto px-4 h-full flex items-center">
          <div className="max-w-2xl text-white">
            <h1 className="text-5xl md:text-6xl font-light mb-6">
              Introducing
              <br />
              <span className="font-serif">The New Era of Sree Rasthu</span>
            </h1>
            <p className="text-lg mb-8 leading-relaxed opacity-90">
              Sree Rasthu is building the world's most progressive jewelry platform – a place
              connecting the dots between old school craftsmanship and new ways of
              thinking. Through our online platform, we connect you with the most creative
              independent jewellers from around the globe.
            </p>
            <div className="flex items-center gap-4">
              <div className="font-script text-3xl">Aartham</div>
              <div className="text-sm opacity-75">— Founder</div>
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
                  src="/src/assets/promo-necklace.jpg"
                  alt="Jewelry craftsmanship"
                  className="w-full rounded-lg shadow-lg"
                />
              </div>
              <div className="pt-12">
                <img
                  src="/src/assets/promo-earrings.jpg"
                  alt="Model wearing jewelry"
                  className="w-full rounded-lg shadow-lg"
                />
              </div>
            </div>
            <div>
              <h2 className="text-4xl font-light mb-6">Our Story</h2>
              <div className="space-y-4 text-foreground/80 leading-relaxed">
                <p>
                  Jewelry is a form of personal adornment that has been worn by humans for
                  thousands of years. It is typically made from precious metals such as gold, silver,
                  and platinum, as well as precious stones such as diamonds, rubies, emeralds, and
                  sapphires.
                </p>
                <p>
                  Jewelry can take many forms, including as a form of self-expression, as a symbol of wealth or status, as a religious or cultural symbol, or as
                  a way to enhance one's personal appearance. When buying jewelry, it's
                  important to consider factors such as the quality of the materials, the design of
                  the piece, and the reputation of the jeweler.
                </p>
                <p>
                  It's also important to care for jewelry properly to keep it looking its best, such as by storing it in a safe
                  place, avoiding exposure to chemicals and moisture, and cleaning it regularly.
                  Jewelry has been used throughout history for a variety of purposes, including as a
                  symbol of wealth and social status, as a form of religious or cultural expression, and
                  as a way to enhance one's personal appearance. In many cultures, jewelry is also
                  used as a form of protection against evil or harmful forces.
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
            src="/src/assets/collection-banner.jpg"
            alt="Collection Banner"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative container mx-auto px-4 h-full flex items-center">
          <div className="max-w-xl">
            <div className="text-sm uppercase tracking-wider mb-4 text-muted-foreground">
              SREE RASTHU COLLECTION
            </div>
            <h2 className="text-5xl font-light text-foreground mb-2">
              Discover Your Signature
            </h2>
            <h2 className="text-5xl font-light text-foreground mb-2">
              Sparkle with New
            </h2>
            <h2 className="text-5xl font-light text-foreground">Collection</h2>
          </div>
        </div>
      </section>

      {/* Handcrafted Design Section */}
      <section className="relative h-[400px] bg-muted overflow-hidden my-20">
        <div className="absolute inset-0">
          <img
            src="/src/assets/handmade-crafting.jpg"
            alt="Handcrafted Design"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative container mx-auto px-4 h-full flex items-center">
          <div className="max-w-xl">
            <h3 className="text-3xl font-light text-foreground mb-6">
              Exceptional Handcrafted Design to Enhance The Magnificent Glow
            </h3>
            <Button className="bg-card text-foreground hover:bg-muted">
              Shop Now
            </Button>
          </div>
        </div>
      </section>

      {/* The Finishing Touch Section */}
      <section className="py-20 px-4 bg-muted">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-light mb-4">The Finishing Touch</h2>
            <p className="text-muted-foreground">
              Our collections represent an assemblage of diverse jewelry pieces united by a common theme.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                title: "One-Of-A-Kinds",
                subtitle: "RINGS",
                description: "Featuring unique and hand-sourced gemstones from all over the world.",
                image: "/src/assets/promo-ring.jpg"
              },
              {
                title: "High Tide Looks",
                subtitle: "NECKLACES",
                description: "Featuring unique and hand-sourced gemstones from all over the world.",
                image: "/src/assets/promo-necklace.jpg"
              },
              {
                title: "New Organic Dôme",
                subtitle: "EARRINGS",
                description: "From solid gold studs to diamond jewelry, browse our most-loved pieces.",
                image: "/src/assets/promo-earrings.jpg"
              },
              {
                title: "The Tiffany Icons",
                subtitle: "NECKLACES",
                description: "The Flora Necklace is a symbol of serenity, in alignment with the pace of nature.",
                image: "/src/assets/promo-heart.jpg"
              }
            ].map((item, index) => (
              <Card key={index} className="group cursor-pointer border-0 shadow-lg hover:shadow-xl transition-shadow">
                <div className="relative overflow-hidden rounded-t-lg">
                  <SmartImage
                    src={item.image}
                    alt={item.title}
                    className="w-full h-80 object-cover group-hover:scale-105 transition-transform duration-300" preset="thumb" />
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

      {/* Handmade Jewelry Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="relative">
              <img
                src="/src/assets/handmade-section.jpg"
                alt="Handmade Jewelry"
                className="w-full rounded-lg shadow-2xl"
              />
            </div>
            <div>
              <div className="text-sm uppercase tracking-wider mb-4 text-muted-foreground">
                OUR CHALLENGE TO DO BETTER
              </div>
              <h2 className="text-4xl font-light mb-6">
                All Of Our Jewellery Is Handmade.
              </h2>
              <p className="text-foreground/80 leading-relaxed mb-8">
                A gift they'll treasure forever, Olight created diamonds jewelry
                combines precious metals with laboratory-grown diamonds to
                form captivating collections.
              </p>
              <Button className="bg-foreground text-background hover:bg-foreground/90">
                Explore More
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Our Team Section */}
      <section className="py-20 px-4 bg-muted">
        <div className="container mx-auto">
          <h2 className="text-4xl font-light text-center mb-16">Our Team</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                name: "Aartham",
                role: "CEO - Founder",
                image: "/src/assets/avatars/avatar-1.jpg"
              },
              {
                name: "Priya Sharma",
                role: "CEO - Founder",
                image: "/src/assets/avatars/avatar-2.jpg"
              },
              {
                name: "Rajesh Kumar",
                role: "Supervisor",
                image: "/src/assets/avatars/avatar-3.jpg"
              },
              {
                name: "Lakshmi Devi",
                role: "Designer",
                image: "/src/assets/avatars/avatar-1.jpg"
              }
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

      {/* Testimonials Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h2 className="text-4xl font-light mb-4">What Our Clients Say</h2>
          <p className="text-muted-foreground mb-12">
            Adorn Yourself in Glamour: Find Your Perfect Piece Today
          </p>
          <div className="bg-gradient-to-br from-muted to-background p-12 rounded-2xl shadow-lg">
            <p className="text-lg italic text-foreground/80 mb-8 leading-relaxed">
              "Monttuc claim to offer the finest diamond jewellery you can buy direct
              from the maker. I did my research, compared specifications with some of
              the big brands and now I will never walk into a store again."
            </p>
            <div className="flex items-center justify-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src="/src/assets/avatars/avatar-1.jpg" />
                <AvatarFallback>MJ</AvatarFallback>
              </Avatar>
              <div className="text-left">
                <div className="font-medium">Mark Jance</div>
                <div className="text-sm text-muted-foreground">Alexandra Janetus</div>
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
