/**
 * The store's own address, in one place.
 *
 * Used where the site has to name itself in text the customer reads - the
 * Privacy Policy and Terms pages. Everything technical (WhatsApp links, share
 * links, Open Graph tags) uses the address the page was actually opened on, so
 * it stays right on every deployment; only this human-facing name is fixed.
 *
 * Set VITE_SITE_URL on Vercel when the live domain changes. The default matches
 * the <link rel="canonical"> in index.html.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://sreerasthusilvers.com').replace(/\/+$/, '');

/** Without the scheme, for reading aloud in a sentence: "sreerasthusilvers.com". */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '');
