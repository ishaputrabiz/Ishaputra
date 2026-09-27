import type { HomeCollection } from "@/services/homeContentService";

/**
 * "Our Collections" cards shown only when Admin > Home Collections is empty or
 * Firestore can't be reached. Images are the demo shoot on the store's own
 * Cloudinary (TODO(client): swap for real brand photos).
 */
export const DEFAULT_HOME_COLLECTIONS: Array<
  Omit<HomeCollection, "id" | "createdAt" | "updatedAt">
> = [
  {
    eyebrow: "Energy",
    title: "Energy & Vitality",
    subtitle: "Shilajit, ashwagandha and more for daily strength.",
    ctaLabel: "Shop Energy",
    ctaLink: "/category/energy-vitality",
    imageUrl: "https://res.cloudinary.com/dcoimqij/image/upload/v1790164697/ishaputrabotanicals/demo/mzsqqseyinqtbimvzvwh.jpg",
    tint: "from-charcoal/85 via-charcoal/30 to-transparent",
    active: true,
    order: 0,
  },
  {
    eyebrow: "Hair",
    title: "Hair Care",
    subtitle: "Oils, shampoos and serums that fight hair fall.",
    ctaLabel: "Shop Hair",
    ctaLink: "/category/hair-care",
    imageUrl: "https://res.cloudinary.com/dcoimqij/image/upload/v1790165392/ishaputrabotanicals/demo/vnhhjaoazpge7at8qadp.jpg",
    tint: "from-charcoal/85 via-charcoal/30 to-transparent",
    active: true,
    order: 1,
  },
  {
    eyebrow: "Skin",
    title: "Skin Care",
    subtitle: "Clean, clear skin with Ayurvedic actives.",
    ctaLabel: "Shop Skin",
    ctaLink: "/category/skin-care",
    imageUrl: "https://res.cloudinary.com/dcoimqij/image/upload/v1790164877/ishaputrabotanicals/demo/entvt3xwysxtaxhmfxtd.jpg",
    tint: "from-charcoal/85 via-charcoal/30 to-transparent",
    active: true,
    order: 2,
  },
  {
    eyebrow: "Grooming",
    title: "Personal Care",
    subtitle: "Body, beard and daily grooming essentials.",
    ctaLabel: "Shop Grooming",
    ctaLink: "/category/personal-care",
    imageUrl: "https://res.cloudinary.com/dcoimqij/image/upload/v1790165011/ishaputrabotanicals/demo/cxq4o0gbhhnc38kmwxtc.jpg",
    tint: "from-charcoal/85 via-charcoal/30 to-transparent",
    active: true,
    order: 3,
  },
  {
    eyebrow: "Ayurveda",
    title: "Ayurvedic Essentials",
    subtitle: "Classical churnas and herbal teas.",
    ctaLabel: "Shop Ayurveda",
    ctaLink: "/category/ayurvedic-essentials",
    imageUrl: "https://res.cloudinary.com/dcoimqij/image/upload/v1790165147/ishaputrabotanicals/demo/vacajxhdpis057fc0chf.jpg",
    tint: "from-charcoal/85 via-charcoal/30 to-transparent",
    active: true,
    order: 4,
  },
];
