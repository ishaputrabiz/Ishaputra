/**
 * The store's identity and contact details, in one place.
 *
 * Everything customer-facing that names the business reads from here: footer
 * and support defaults, invoice header, checkout, WhatsApp messages, share
 * text. Admin can still override the footer and support details at runtime
 * (siteSettings in Firestore); these are the defaults.
 *
 * Leave a field empty ('' or []) until the client confirms it - the footer and
 * contact blocks hide empty fields instead of showing a placeholder.
 *
 * Not importable from api/*.ts (those files must stay standalone): the brand
 * name is repeated in api/media.ts, api/whatsapp-send.ts and
 * api/send-call-notification.ts.
 */
export const BRAND = {
  name: 'Ishaputra Botanicals',
  shortName: 'Ishaputra',
  /** TODO(client): registered business name for invoices and policies. */
  legalName: 'Ishaputra Botanicals',
  tagline: 'Pure wellness for a stronger you',
  description:
    "Premium men's Ayurveda and botanical wellness - energy, hair, skin and personal care, made with classical herbs and modern science.",

  /** TODO(client): the live domain. Until then VITE_SITE_URL (or this) is used. */
  siteUrl: 'https://ishaputra.com',

  /**
   * TODO(client): DUMMY contact details (only "Hyderabad" is confirmed).
   * Replace every value before launch. Empty values are hidden on the site.
   */
  email: 'hello@ishaputra.com',
  phones: ['+91 98765 43210'] as string[],
  /** Empty until the real number arrives: the Enquire button would message whoever owns a dummy number. */
  whatsapp: '',
  addressLines: ['Road No. 12, Banjara Hills', 'Hyderabad, Telangana 500034'] as string[],
  hours: 'Mon – Sat · 10:00 AM – 7:00 PM',
  /** City-level map until the client shares a store location (no API key needed). */
  mapEmbedUrl: 'https://www.google.com/maps/embed?origin=mfe&pb=!1m2!2m1!1sBanjara+Hills,+Hyderabad',
  /** Left empty on purpose: a made-up GSTIN must never print on an invoice. */
  gstin: '',
  /** Decides IGST vs CGST+SGST on invoices (Hyderabad → Telangana, code 36). */
  state: 'Telangana',
  stateCode: '36',

  social: {
    instagram: '',
    facebook: '',
    youtube: '',
  },

  /** localStorage keys - prefixed per store so two stores on one device don't share state. */
  storageKeys: {
    theme: 'ishaputra-theme',
    searchHistory: 'ishaputra_search_history',
  },
} as const;
