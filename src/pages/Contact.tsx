import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Clock, Home, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "@/components/ui/notice";
import { AuthField } from "@/components/auth/AuthField";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BRAND } from "@/config/brand";
import { SITE_HOST } from "@/lib/siteUrl";
import { EASE_OUT, staggerDelay } from "@/lib/motion";
import { usePageMeta } from "@/hooks/usePageMeta";

type ContactField = "name" | "email" | "subject" | "message";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Entrance for blocks below the hero: 8px fade up, once, 240ms. */
const inView = (i = 0) => ({
  initial: { opacity: 0, y: 8 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 },
  transition: { duration: 0.24, ease: EASE_OUT, delay: staggerDelay(i) },
});

const Contact = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [errors, setErrors] = useState<Partial<Record<ContactField, string>>>({});
  const [opened, setOpened] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  usePageMeta({
    title: "Contact",
    description: `Questions about a product, an order or which routine suits you? Write to ${BRAND.name}.`,
  });

  useEffect(() => () => {
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
  }, []);

  const validate = () => {
    const next: Partial<Record<ContactField, string>> = {};
    if (!formData.name.trim()) next.name = "Enter your name.";
    if (!EMAIL_PATTERN.test(formData.email.trim())) next.email = "Enter a valid email address, like you@example.com.";
    if (!formData.subject.trim()) next.subject = "Add a subject so we know what it's about.";
    if (!formData.message.trim()) next.message = "Write your message.";
    setErrors(next);
    return next;
  };

  // Owner decision (AUTH-02): no backend. Open the visitor's email app with the
  // message filled in, addressed to the store, and say so on the page.
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found = validate();
    const first = (Object.keys(found) as ContactField[])[0];
    if (first) {
      requestAnimationFrame(() => document.getElementById(`contact-${first}`)?.focus());
      return;
    }
    const body = `${formData.message.trim()}\n\n${formData.name.trim()} <${formData.email.trim()}>`;
    const mailto = `mailto:${BRAND.email}?subject=${encodeURIComponent(formData.subject.trim())}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
    setOpened(true);
    setCooldown(true);
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current);
    cooldownTimer.current = setTimeout(() => setCooldown(false), 2000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const field = e.target.name as ContactField;
    setFormData({
      ...formData,
      [field]: e.target.value,
    });
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const phone = BRAND.phones[0];

  return (
    <>
      <Header />
      <main id="main" tabIndex={-1} className="min-h-screen tx-paper outline-none">
        {/* Hero */}
        <section className="relative flex h-[300px] items-center justify-center overflow-hidden md:h-[350px]">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://res.cloudinary.com/dcoimqij/image/upload/f_auto,q_auto,w_1600/v1790515862/ishaputrabotanicals/demo/pgwiragwuq2cgzz5fmkw.jpg')",
            }}
          />
          <div aria-hidden="true" className="absolute inset-0 bg-charcoal/55" />
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
            className="relative z-raised px-4 text-center text-charcoal-foreground"
          >
            <h1 className="on-photo font-heading text-4xl font-semibold tracking-tight [text-wrap:balance] md:text-6xl">
              Contact
            </h1>
            <nav aria-label="Breadcrumb" className="mt-4 flex items-center justify-center gap-1.5 text-xs text-charcoal-foreground/80">
              <Link
                to="/"
                className="inline-flex min-h-6 items-center gap-1 transition-colors duration-hover hover:text-charcoal-foreground"
              >
                <Home aria-hidden="true" className="size-3.5" /> Home
              </Link>
              <ChevronRight aria-hidden="true" className="size-3.5" />
              <span aria-current="page" className="text-charcoal-foreground">
                Contact
              </span>
            </nav>
          </motion.div>
        </section>

        {/* Get in touch */}
        <div className="container-custom py-14 md:py-24">
          <motion.div {...inView()} className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
            <h2 className="mb-5 font-heading text-3xl font-semibold tracking-tight text-foreground [text-wrap:balance] md:text-5xl">
              Get in touch
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground [text-wrap:pretty] md:text-lg">
              Questions about a product, your order or which routine suits you? Write to us and we&rsquo;ll reply by
              email.
            </p>
          </motion.div>

          {/* Contact details */}
          <div className="mb-14 grid gap-8 md:mb-20 md:grid-cols-3 md:gap-10">
            <motion.div {...inView(1)}>
              <div className="mb-3 flex items-center gap-3">
                <MapPin aria-hidden="true" className="size-5 shrink-0 text-primary" />
                <h3 className="font-heading text-xl font-semibold tracking-tight text-foreground">Address</h3>
              </div>
              <div className="pl-8 text-sm leading-relaxed text-muted-foreground md:text-base">
                {BRAND.addressLines.length > 0 ? (
                  BRAND.addressLines.map((line) => <p key={line}>{line}</p>)
                ) : (
                  <p>Online store, shipping across India</p>
                )}
              </div>
            </motion.div>

            <motion.div {...inView(2)}>
              <div className="mb-3 flex items-center gap-3">
                <Phone aria-hidden="true" className="size-5 shrink-0 text-primary" />
                <h3 className="font-heading text-xl font-semibold tracking-tight text-foreground">Contact us</h3>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pl-8 text-sm leading-relaxed md:text-base">
                {phone && (
                  <>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd>
                      <a
                        href={`tel:${phone.replace(/\s+/g, "")}`}
                        className="tabular-nums text-foreground underline-offset-4 transition-colors duration-hover hover:text-primary hover:underline"
                      >
                        {phone}
                      </a>
                    </dd>
                  </>
                )}
                {BRAND.email && (
                  <>
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="min-w-0 [overflow-wrap:anywhere]">
                      <a
                        href={`mailto:${BRAND.email}`}
                        className="text-foreground underline-offset-4 transition-colors duration-hover hover:text-primary hover:underline"
                      >
                        {BRAND.email}
                      </a>
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">Website</dt>
                <dd className="text-foreground">{SITE_HOST}</dd>
              </dl>
            </motion.div>

            <motion.div {...inView(3)}>
              <div className="mb-3 flex items-center gap-3">
                <Clock aria-hidden="true" className="size-5 shrink-0 text-primary" />
                <h3 className="font-heading text-xl font-semibold tracking-tight text-foreground">Opening hours</h3>
              </div>
              <div className="pl-8 text-sm leading-relaxed text-muted-foreground md:text-base">
                <p>{BRAND.hours}</p>
                <p>Online orders: any time</p>
              </div>
            </motion.div>
          </div>

          {/* Form and map */}
          <div className="mx-auto max-w-7xl">
            <h2 className="mb-8 text-center font-heading text-3xl font-semibold tracking-tight text-foreground [text-wrap:balance] md:mb-12 md:text-5xl">
              Send a message
            </h2>

            <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-10">
              <motion.div {...inView()}>
                <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <AuthField
                      id="contact-name"
                      label="Name"
                      name="name"
                      autoComplete="name"
                      placeholder="Your name"
                      value={formData.name}
                      onChange={handleChange}
                      error={errors.name}
                      required
                      className="bg-card/80"
                    />
                    <AuthField
                      id="contact-email"
                      label="Email"
                      type="email"
                      name="email"
                      autoComplete="email"
                      inputMode="email"
                      placeholder="you@example.com"
                      value={formData.email}
                      onChange={handleChange}
                      error={errors.email}
                      required
                      className="bg-card/80"
                    />
                  </div>

                  <AuthField
                    id="contact-subject"
                    label="Subject"
                    name="subject"
                    placeholder="Order, product or routine question"
                    value={formData.subject}
                    onChange={handleChange}
                    error={errors.subject}
                    required
                    className="bg-card/80"
                  />

                  <div className="flex flex-col gap-2">
                    <label
                      htmlFor="contact-message"
                      className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
                    >
                      Message
                    </label>
                    <Textarea
                      id="contact-message"
                      name="message"
                      placeholder="How can we help?"
                      value={formData.message}
                      onChange={handleChange}
                      rows={8}
                      required
                      aria-invalid={errors.message ? true : undefined}
                      aria-describedby={errors.message ? "contact-message-error" : undefined}
                      className="min-h-[180px] resize-none bg-card/80 px-3.5 py-3 text-base leading-relaxed md:text-sm"
                    />
                    {errors.message && (
                      <p id="contact-message-error" className="text-xs leading-snug text-destructive">
                        {errors.message}
                      </p>
                    )}
                  </div>

                  <Button type="submit" size="lg" className="w-full" disabled={cooldown}>
                    Send message
                  </Button>

                  {opened && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.24, ease: EASE_OUT }}
                    >
                      <Notice tone="info" title="Your email app should open with this message">
                        If it didn&rsquo;t, write to us at{" "}
                        <a href={`mailto:${BRAND.email}`} className="font-medium text-primary underline-offset-4 hover:underline">
                          {BRAND.email}
                        </a>
                        .
                      </Notice>
                    </motion.div>
                  )}
                </form>
              </motion.div>

              <motion.div {...inView(1)} className="panel relative h-[380px] overflow-hidden md:h-[460px] lg:h-[550px]">
                {BRAND.mapEmbedUrl ? (
                  <iframe
                    src={BRAND.mapEmbedUrl}
                    title="Map of Banjara Hills, Hyderabad"
                    className="map-embed h-full w-full border-0"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                ) : (
                  // No store location yet (online-only): same box, brand photo instead of a map.
                  <div className="relative h-full w-full">
                    <img
                      src="https://res.cloudinary.com/dcoimqij/image/upload/f_auto,q_auto,w_1200/v1790515743/ishaputrabotanicals/demo/cdcrb0q48xmdi9givh1x.jpg"
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div aria-hidden="true" className="photo-scrim absolute inset-0" />
                    <div className="absolute bottom-8 left-8 right-8">
                      <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-highlight-soft">{BRAND.tagline}</p>
                      <p className="on-photo font-heading text-2xl text-charcoal-foreground">Shipping across India</p>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default Contact;
