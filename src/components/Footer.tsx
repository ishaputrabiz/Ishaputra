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
} from "lucide-react";
import {
  subscribeFooterSettings,
  DEFAULT_FOOTER,
  type FooterSettings,
  type SocialPlatform,
} from "@/services/siteSettingsService";
import { useTheme } from "@/contexts/ThemeContext";

const SOCIAL_ICONS: Record<SocialPlatform, React.ComponentType<{ className?: string }>> = {
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

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Gifting, Pooja Items, Men's and Wedding are top-level categories in Firestore,
 * not subcategories of Articles/Jewellery. The old parent map sent them to
 * "/category/articles?sub=gifting", which filtered Articles by a subcategory no
 * product carries and always rendered an empty page.
 */
const buildCategoryHref = (name: string) => `/category/${toSlug(name)}`;

const Footer = () => {
  const lightModeLogo = "/black_logo.png";
  const darkModeLogo = "/white_logo.png";
  const [settings, setSettings] = useState<FooterSettings>(DEFAULT_FOOTER);
  const { resolvedTheme } = useTheme();
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterLoading, setNewsletterLoading] = useState(false);

  useEffect(() => {
    const unsub = subscribeFooterSettings(setSettings);
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
        toast.info('You are already subscribed!');
      } else {
        toast.success('Thank you for subscribing!');
        setNewsletterEmail("");
      }
    } catch {
      toast.error('Failed to subscribe. Please try again.');
    } finally {
      setNewsletterLoading(false);
    }
  };

  const activeSocials = (settings.socialLinks || []).filter((s) => s.active && s.url);
  const shopLinks = (settings.shopLinks || []).filter(Boolean);
  const categoryLinks = (settings.categoryLinks || []).filter(Boolean);

  return (
    <footer className="tx-slate relative text-white overflow-hidden">
      {/* Decorative gold glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-highlight-soft/40 to-transparent" />

      {/* ── Newsletter strip ── */}
      <div className="relative border-b border-white/10">
        <div className="container-custom py-10 md:py-12">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <p className="eyebrow-no on-dark mb-3">
                The Ishaputra Circle
              </p>
              <h3 className="text-2xl md:text-3xl font-serif font-semibold leading-tight">
                Be the first to discover new collections & private offers.
              </h3>
            </div>
            <form
              onSubmit={handleNewsletterSubmit}
              className="flex w-full max-w-lg md:ml-auto rounded-[8px] bg-white/5 backdrop-blur border border-white/15 p-1.5 focus-within:border-highlight-soft/70 transition-colors overflow-hidden"
            >
              <input
                type="email"
                required
                placeholder="Enter your email"
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none"
              />
              <button
                type="submit"
                disabled={newsletterLoading}
                className="btn-copper flex-shrink-0 !px-4 md:!px-6 !py-2.5 disabled:opacity-60"
              >
                <span className="hidden sm:inline">{newsletterLoading ? 'Subscribing…' : 'Subscribe'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
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
            <img src={darkModeLogo} alt="Ishaputra Botanicals" className="h-12 w-auto mb-5" />
            <p className="text-white/55 text-sm leading-relaxed mb-6 font-light max-w-sm">
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
                      className="group relative w-10 h-10 rounded-full grid place-items-center bg-white/5 border border-white/15 hover:border-primary hover:bg-primary hover:text-white transition-all"
                    >
                      <Icon className="w-4 h-4" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/* Shop */}
          <div>
            <h4 className="mb-5 text-[11px] font-bold uppercase tracking-[0.22em] text-highlight-soft">Shop</h4>
            <ul className="space-y-2.5">
              {shopLinks.map((name) => (
                <li key={name}>
                  <Link
                    to={`/shop/${toSlug(name)}`}
                    className="text-sm text-white/50 hover:text-white transition-colors font-light"
                  >
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h4 className="mb-5 text-[11px] font-bold uppercase tracking-[0.22em] text-highlight-soft">Categories</h4>
            <ul className="space-y-2.5">
              {categoryLinks.map((name) => (
                <li key={name}>
                  <Link
                    to={buildCategoryHref(name)}
                    className="text-sm text-white/50 hover:text-white transition-colors font-light"
                  >
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Information */}
          <div>
            <h4 className="mb-5 text-[11px] font-bold uppercase tracking-[0.22em] text-highlight-soft">Information</h4>
            <ul className="space-y-2.5">
              {[
                { name: "Privacy Policy", path: "/privacy-policy" },
                { name: "Terms & Conditions", path: "/terms-conditions" },
                { name: "Shipping Policy", path: "/shipping-policy" },
                { name: "Cancellation & Refund", path: "/cancellation-refund-policy" },
              ].map((link) => (
                <li key={link.name}>
                  <Link
                    to={link.path}
                    className="text-sm text-white/50 hover:text-white transition-colors font-light"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="col-span-2 md:col-span-1">
            <h4 className="mb-5 text-[11px] font-bold uppercase tracking-[0.22em] text-highlight-soft">Reach Us</h4>
            <ul className="space-y-3 text-sm text-white/55 font-light">
              {settings.addressLines?.length > 0 && (
                <li className="flex gap-2.5">
                  <MapPin className="w-4 h-4 text-highlight-soft flex-shrink-0 mt-0.5" />
                  <span>
                    {settings.addressLines.map((line, i) => (
                      <span key={i} className="block leading-snug">{line}</span>
                    ))}
                  </span>
                </li>
              )}
              {settings.phones?.[0] && (
                <li className="flex gap-2.5">
                  <Phone className="w-4 h-4 text-highlight-soft flex-shrink-0 mt-0.5" />
                  <a
                    href={`tel:${settings.phones[0].replace(/\s+/g, "")}`}
                    className="hover:text-white transition-colors break-all"
                  >
                    {settings.phones[0]}
                  </a>
                </li>
              )}
              {settings.emails?.[0] && (
                <li className="flex gap-2.5">
                  <Mail className="w-4 h-4 text-highlight-soft flex-shrink-0 mt-0.5" />
                  <a
                    href={`mailto:${settings.emails[0]}`}
                    className="hover:text-white transition-colors break-all"
                  >
                    {settings.emails[0]}
                  </a>
                </li>
              )}
              {settings.businessHours && (
                <li className="flex gap-2.5">
                  <Clock className="w-4 h-4 text-highlight-soft flex-shrink-0 mt-0.5" />
                  <span>{settings.businessHours}</span>
                </li>
              )}
            </ul>
          </div>
        </div>

        {/* Map */}
        {settings.mapEmbedUrl && (
          <LazyMount
            className="mt-12 rounded-[var(--radius-card)] overflow-hidden border border-white/10"
            placeholder={<div className="h-[220px] w-full bg-white/5" />}
          >
            <iframe
              src={settings.mapEmbedUrl}
              width="100%"
              height="220"
              style={{ border: 0, filter: "grayscale(40%) brightness(0.9)" }}
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

      <div className="relative border-t border-white/10 py-5">
        <div className="container-custom flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-white/40 font-light">
          <p>
            © {new Date().getFullYear()}{" "}
            <span className="text-white/65 font-normal">{settings.copyrightSuffix || "Ishaputra Botanicals"}</span>. All Rights Reserved.
          </p>
          <p>
            Designed & Developed by{" "}
            <a
              href="https://www.thedreamteamservices.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/65 hover:text-white transition-colors font-normal whitespace-nowrap"
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
