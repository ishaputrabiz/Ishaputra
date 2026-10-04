import { useEffect } from 'react';
import { BRAND } from '@/config/brand';
import { SITE_URL } from '@/lib/siteUrl';

export interface PageMeta {
  /** Page name. Printed as "{title} | Ishaputra Botanicals" unless it already names the brand. */
  title?: string;
  /** One or two sentences for search results and link previews. */
  description?: string;
  /** Path of the page's canonical URL, e.g. '/products'. Joined to SITE_URL. Defaults to the current path. */
  canonicalPath?: string;
  /** Absolute URL, or a site path such as '/og-image.jpg'. */
  image?: string;
  /** Keep the page out of search results (account, checkout, admin, search results). */
  noindex?: boolean;
  /** One JSON-LD object (Product, BreadcrumbList, Organization ...). */
  jsonLd?: Record<string, unknown> | null;
}

const JSON_LD_ID = 'page-meta-jsonld';

/** The values index.html shipped with, captured once so every page can restore them. */
let defaults: { title: string; description: string; ogTitle: string; ogDescription: string; image: string } | null = null;

function captureDefaults() {
  if (defaults) return defaults;
  defaults = {
    title: document.title,
    description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? '',
    ogTitle: document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content ?? document.title,
    ogDescription: document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content ?? '',
    image: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? '',
  };
  return defaults;
}

function setMeta(attr: 'name' | 'property', key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (href === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setJsonLd(data: Record<string, unknown> | null | undefined) {
  document.getElementById(JSON_LD_ID)?.remove();
  if (!data) return;
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = JSON_LD_ID;
  script.text = JSON.stringify(data);
  document.head.appendChild(script);
}

const absolute = (urlOrPath: string) => (/^https?:\/\//i.test(urlOrPath) ? urlOrPath : `${SITE_URL}${urlOrPath.startsWith('/') ? '' : '/'}${urlOrPath}`);

/**
 * Title, description, canonical URL, Open Graph tags, robots and one JSON-LD
 * block for the current page. Everything returns to the index.html defaults
 * when the page unmounts, so a page that sets nothing shows the site defaults.
 *
 *   usePageMeta({ title: product.name, description, canonicalPath: `/product/${id}`, image, jsonLd });
 */
export function usePageMeta({ title, description, canonicalPath, image, noindex, jsonLd }: PageMeta) {
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : '';

  useEffect(() => {
    const base = captureDefaults();
    const fullTitle = title ? (title.includes(BRAND.name) ? title : `${title} | ${BRAND.name}`) : base.title;
    const desc = description || base.description;
    const path = canonicalPath ?? window.location.pathname;
    const url = `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
    const img = image ? absolute(image) : base.image;

    document.title = fullTitle;
    setMeta('name', 'description', desc);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', url);
    if (img) setMeta('property', 'og:image', img);
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', desc);
    if (img) setMeta('name', 'twitter:image', img);
    setMeta('name', 'robots', noindex ? 'noindex, nofollow' : null);
    setCanonical(noindex ? null : url);
    setJsonLd(jsonLd);

    return () => {
      document.title = base.title;
      setMeta('name', 'description', base.description);
      setMeta('property', 'og:title', base.ogTitle);
      setMeta('property', 'og:description', base.ogDescription);
      setMeta('property', 'og:url', null);
      if (base.image) setMeta('property', 'og:image', base.image);
      setMeta('name', 'twitter:title', null);
      setMeta('name', 'twitter:description', null);
      if (base.image) setMeta('name', 'twitter:image', base.image);
      setMeta('name', 'robots', null);
      setCanonical(null);
      setJsonLd(null);
    };
    // jsonLd is compared by value (jsonLdKey) so an inline object does not re-run this every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, canonicalPath, image, noindex, jsonLdKey]);
}

export default usePageMeta;
