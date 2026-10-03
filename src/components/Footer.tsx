import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { subscribeEmail } from "@/services/newsletterService";
import { LazyMount } from "@/components/ui/lazy-mount";
import {
  Facebook,
  Instagram,
  Youtube,
  Twitter,
  Linkedin,
  MessageCircle, // WhatsApp
  PinIcon,        // Pinterest substitute
  Send,           // Telegram substitute
  Camera,         // Snapchat substitute
  AtSign,         // Threads substitute
  MapPin,
  Phone,
  Mail,
  Clock,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import {
  subscribeFooterSettings,
  DEFAULT_FOOTER,
  type FooterSettings,
  type SocialPlatform,
} from "@/services/siteSettingsService";
import {
  subscribeToCategories,
  toSlug,
  DEFAULT_CATEGORIES,
  type Category,
} from "@/services/categoryService";

const SOCIAL_ICONS: Record<SocialPlatform, LucideIcon> = {
  facebook: Facebook,
  instagram: Instagram,
  youtube: Youtube,
  twitter: Twitter,
  linkedin: Linkedin,
  whatsapp: MessageCircle,
  pinterest: PinIcon,
  telegram: Send,
  snapchat: Camera,
  threads: AtSign,
};

const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  twitter: "X / Twitter",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  pinterest: "Pinterest",
  telegram: "Telegram",
  snapchat: "Snapchat",
  threads: "Threads",
};

/** Same slug rule the category service uses, so "Energy & Vitality" -> energy-vitality. */
const slugOf = (value: string) => toSlug(value.replace(/['’]/g, "").trim());

/**
 * Footer labels are free text from Admin > Footer. Each one resolves against the
 * live category tree: a category name opens its page, a subcategory name
 * ("Hair Oils") opens its parent filtered to it, and anything else falls back to
 * a product search, so no footer link can land on "Category not found".
 */
const resolveFooterHref = (name: string, categories: Category[]) => {
  const slug = slugOf(name);
  const label = name.trim().toLowerCase();
  for (const cat of categories) {
    if (cat.slug === slug || cat.name.trim().toLowerCase() === label) return `/category/${cat.slug}`;
  }
  for (const cat of categories) {
    const sub = (cat.subcategories || []).find(
      (s) => s.slug === slug || s.name.trim().toLowerCase() === label,
    );
    if (sub) return `/category/${cat.slug}?sub=${sub.slug}`;
  }
  return `/search-results?q=${encodeURIComponent(name.trim())}`;
};

/** Hours are typed by the admin; show ranges with words, not dashes. */
const tidyHours = (value: string) => value.replace(/\s*[–—]\s*/g, " to ");

const Footer = () => {
  const darkModeLogo = "/white_logo.png";
  const [settings, setSettings] = useState<FooterSettings>(DEFAULT_FOOTER);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES as Category[]);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterLoading, setNewsletterLoading] = useState(false);

  useEffect(() => {
    const unsub = subscribeFooterSettings(setSettings);
    return unsub;
  }, []);

  // Same query the category strip listens to, so Firestore serves both from one listener.
  useEffect(() => {
    const unsub = subscribeToCategories((cats) => {
      if (cats.length) setCategories(cats);
    });
    return unsub;
  }, []);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newsletterEmail.trim();
    if (!email) return;
    setNewsletterLoading(true);
    try {
      const result = await subscribeEmail(email);
      if (result === 'exists') {
        toast.info('This email is already subscribed.');
      } else {
        toast.success("You're on the list. New launches and member offers will reach your inbox.");
        setNewsletterEmail("");
      }
    } catch {
      toast.error("We couldn't subscribe you. Check the address and try again.");
    } finally {
      setNewsletterLoading(false);
    }
  };

  const activeSocials = (settings.socialLinks || []).filter((s) => s.active && s.url);
  const shopLinks = (settings.shopLinks || []).filter(Boolean);
  const categoryLinks = (settings.categoryLinks || []).filter(Boolean);

  return (
    <footer className="tx-slate relative overflow-hidden text-charcoal-foreground">
      {/* Decorative gold glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-highlight-soft/40 to-transparent" />

      {/* ── Newsletter strip ── */}
      <div className="relative border-b border-charcoal-foreground/10">
        <div className="container-custom py-10 md:py-12">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <p className="eyebrow-no on-dark mb-3">
                The Ishaputra Circle
              </p>
              <h2 className="text-2xl md:text-3xl font-serif font-semibold leading-tight text-balance">
                Be the first to discover new launches and private offers.
              </h2>
            </div>
            <form
              onSubmit={handleNewsletterSubmit}
              aria-busy={newsletterLoading || undefined}
              className="flex w-full max-w-lg md:ml-auto rounded-card bg-charcoal-foreground/[0.05] border border-charcoal-foreground/15 p-1.5 transition-[border-color,box-shadow] duration-hover ease-out focus-within:border-highlight-soft/70 focus-within:ring-2 focus-within:ring-highlight-soft/20"
            >
              <input
                type="email"
                name="email"
                required
                aria-label="Email address"
                autoComplete="email"
                inputMode="email"
                enterKeyHint="send"
                spellCheck={false}
                placeholder="Enter your email"
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base text-charcoal-foreground placeholder:text-charcoal-foreground/55 focus-visible:outline-none sm:px-4 md:text-sm"
              />
              <button
                type="submit"
                disabled={newsletterLoading}
                aria-label={newsletterLoading ? undefined : "Subscribe"}
                className="btn-copper flex-shrink-0 !px-4 md:!px-6 !py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className={newsletterLoading ? "" : "hidden sm:inline"}>
                  {newsletterLoading ? "Subscribing…" : "Subscribe"}
                </span>
                {!newsletterLoading && <ArrowRight aria-hidden="true" className="size-3.5" />}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="relative container-custom py-14 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-x-8 gap-y-10">
          {/* Brand & socials */}
          <div className="col-span-2">
            <img
              src={darkModeLogo}
              alt="Ishaputra Botanicals"
              width={165}
              height={48}
              loading="lazy"
              decoding="async"
              className="h-12 w-auto mb-5"
            />
            <p className="text-charcoal-foreground/65 text-sm leading-relaxed mb-6 max-w-sm text-pretty">
              {settings.brandTagline}
            </p>

            {activeSocials.length > 0 && (
              <div className="flex flex-wrap gap-2.5">
                {activeSocials.map((s) => {
                  const Icon = SOCIAL_ICONS[s.platform] || AtSign;
                  return (
                    <a
                      key={`${s.platform}-${s.url}`}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={SOCIAL_LABELS[s.platform]}
                      className="relative grid size-11 place-items-center rounded-full border border-charcoal-foreground/15 text-charcoal-foreground/80 transition-[transform,color,border-color] duration-press ease-out hover:border-highlight-soft hover:text-highlight-soft active:scale-[0.97]"
                    >
                      <Icon aria-hidden="true" className="size-[18px]" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/* Shop */}
          <div>
            <h2 className="mb-5 text-[11px] font-bold uppercase tracking-[0.22em] text-highlight-soft">Shop</h2>
            <ul className="-my-1 space-y-0.5">
              {shopLinks.map((name) => (
                <li key={name}>
                  <Link
                    to={resolveFooterHref(name, categories)}
                    className="inline-block py-1 text-sm text-charcoal-foreground/65 transition-colors duration-hover ease-out hover:text-charcoal-foreground"
                  >
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h2 className="mb-5 text-[11px] font-bold uppercase tracking-[0.22em] text-highlight-soft">Categories</h2>
            <ul className="-my-1 space-y-0.5">
              {categoryLinks.map((name) => (
                <li key={name}>
                  <Link
                    to={resolveFooterHref(name, categories)}
                    className="inline-block py-1 text-sm text-charcoal-foreground/65 transition-colors duration-hover ease-out hover:text-charcoal-foreground"
                  >
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Information */}
          <div>
            <h2 className="mb-5 text-[11px] font-bold uppercase tracking-[0.22em] text-highlight-soft">Information</h2>
            <ul className="-my-1 space-y-0.5">
              {[
                { name: "Privacy policy", path: "/privacy-policy" },
                { name: "Terms and conditions", path: "/terms-conditions" },
                { name: "Shipping policy", path: "/shipping-policy" },
                { name: "Cancellation and refunds", path: "/cancellation-refund-policy" },
              ].map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.path}
                    className="inline-block py-1 text-sm text-charcoal-foreground/65 transition-colors duration-hover ease-out hover:text-charcoal-foreground"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="col-span-2 md:col-span-1">
            <h2 className="mb-5 text-[11px] font-bold uppercase tracking-[0.22em] text-highlight-soft">Reach us</h2>
            <ul className="space-y-3 text-sm text-charcoal-foreground/65">
              {settings.addressLines?.length > 0 && (
                <li className="flex gap-2.5">
                  <MapPin aria-hidden="true" className="size-4 text-highlight-soft flex-shrink-0 mt-0.5" />
                  <span>
                    {settings.addressLines.map((line, i) => (
                      <span key={i} className="block leading-snug">{line}</span>
                    ))}
                  </span>
                </li>
              )}
              {settings.phones?.[0] && (
                <li className="flex gap-2.5">
                  <Phone aria-hidden="true" className="size-4 text-highlight-soft flex-shrink-0 mt-0.5" />
                  <a
                    href={`tel:${settings.phones[0].replace(/\s+/g, "")}`}
                    className="break-all transition-colors duration-hover ease-out hover:text-charcoal-foreground"
                  >
                    {settings.phones[0]}
                  </a>
                </li>
              )}
              {settings.emails?.[0] && (
                <li className="flex gap-2.5">
                  <Mail aria-hidden="true" className="size-4 text-highlight-soft flex-shrink-0 mt-0.5" />
                  <a
                    href={`mailto:${settings.emails[0]}`}
                    className="break-all transition-colors duration-hover ease-out hover:text-charcoal-foreground"
                  >
                    {settings.emails[0]}
                  </a>
                </li>
              )}
              {settings.businessHours && (
                <li className="flex gap-2.5">
                  <Clock aria-hidden="true" className="size-4 text-highlight-soft flex-shrink-0 mt-0.5" />
                  <span>{tidyHours(settings.businessHours)}</span>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Map */}
        {settings.mapEmbedUrl && (
          <LazyMount
            className="group mt-12 rounded-card overflow-hidden border border-charcoal-foreground/10"
            placeholder={<div className="h-[220px] w-full bg-charcoal-foreground/5" />}
          >
            <iframe
              src={settings.mapEmbedUrl}
              width="100%"
              height="220"
              style={{ border: 0 }}
              // Quiet monochrome inside the charcoal footer; full colour when the visitor reaches for it.
              className="block [filter:grayscale(1)_contrast(1.05)_brightness(0.82)] opacity-90 transition-[filter,opacity] duration-500 ease-out group-hover:[filter:none] group-hover:opacity-100 group-focus-within:[filter:none] group-focus-within:opacity-100 motion-reduce:transition-none"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Store Location"
            />
          </LazyMount>
        )}
      </div>

      {/* ── Bottom bar ── */}
      {/* Hollow wordmark, cropped by the bottom bar */}
      <div aria-hidden className="pointer-events-none relative container-custom select-none overflow-hidden">
        <p className="text-outline whitespace-nowrap text-center text-[15vw] font-bold uppercase leading-[0.8] opacity-25 md:text-[9.5vw] translate-y-[18%]" style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}>
          Ishaputra
        </p>
      </div>

      <div className="relative border-t border-charcoal-foreground/10 py-5">
        <div className="container-custom flex flex-col md:flex-row items-center justify-between gap-3 text-center text-xs text-charcoal-foreground/60">
          <p>
            © {new Date().getFullYear()}{" "}
            <span className="text-charcoal-foreground/80">{settings.copyrightSuffix || "Ishaputra Botanicals"}</span>. All rights reserved.
          </p>
          <p>
            Designed and developed by{" "}
            <a
              href="https://www.thedreamteamservices.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap text-charcoal-foreground/80 transition-colors duration-hover ease-out hover:text-charcoal-foreground"
            >
              DREAM TEAM SERVICES
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
