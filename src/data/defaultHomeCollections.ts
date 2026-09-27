import type { HomeCollection } from "@/services/homeContentService";

/**
 * "Our Collections" cards shown only when Admin > Home Collections is empty or
 * Firestore can't be reached. Pexels stock photos (free for commercial use) on
 * the store's own Cloudinary - TODO(client): swap for the brand's own photos.
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
    imageUrl: "https://res.cloudinary.com/dcoimqij/image/upload/v1790515728/ishaputrabotanicals/demo/xg0ugfrhcptxlhfaefnm.jpg",
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
    imageUrl: "https://res.cloudinary.com/dcoimqij/image/upload/v1790515729/ishaputrabotanicals/demo/qrro0cdf6uefdu2ahxbi.jpg",
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
    imageUrl: "https://res.cloudinary.com/dcoimqij/image/upload/v1790515731/ishaputrabotanicals/demo/ajzt8fes8lkwmlznvzgc.jpg",
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
    imageUrl: "https://res.cloudinary.com/dcoimqij/image/upload/v1790515732/ishaputrabotanicals/demo/wsoazltiqroiesbta6bo.jpg",
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
    imageUrl: "https://res.cloudinary.com/dcoimqij/image/upload/v1790515735/ishaputrabotanicals/demo/ttwceal4ellcnauyphyo.jpg",
    tint: "from-charcoal/85 via-charcoal/30 to-transparent",
    active: true,
    order: 4,
  },
];
