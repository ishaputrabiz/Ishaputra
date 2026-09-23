import type { HomeCollection } from "@/services/homeContentService";

export const DEFAULT_HOME_COLLECTIONS: Array<
  Omit<HomeCollection, "id" | "createdAt" | "updatedAt">
> = [
  {
    eyebrow: "Sacred Silver",
    title: "Pooja Items",
    subtitle: "Devotional silverware for daily rituals.",
    ctaLabel: "Shop Pooja",
    ctaLink: "/category/pooja-items",
    // Our own photo: the Unsplash one that used to be here 404s now, and these
    // defaults are what shows when Firestore can't be reached - so they must not
    // depend on anything outside our own storage.
    imageUrl:
      "https://images.sreerasthusilvers.com/products/2026/09/m3bd50a1a721a43e3accf0a3b.jpg",
    tint: "from-[#2a1810]/88 via-[#2a1810]/35 to-transparent",
    active: true,
    order: 0,
  },
  {
    eyebrow: "Curated Gifting",
    title: "Gift Items",
    subtitle: "Memorable silver tokens for every occasion.",
    ctaLabel: "Find a Gift",
    ctaLink: "/category/gifting",
    imageUrl:
      "https://images.unsplash.com/photo-1549421263-6064833b071b?auto=format&fit=crop&w=1200&q=80",
    tint: "from-[#3a2418]/85 via-[#3a2418]/30 to-transparent",
    active: true,
    order: 1,
  },
  {
    eyebrow: "Studio Edit",
    title: "Our Articles",
    subtitle: "Sculptural decor pieces, quietly luxurious.",
    ctaLabel: "Discover Articles",
    ctaLink: "/category/articles",
    imageUrl:
      "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80",
    tint: "from-[#3b2417]/80 via-[#3b2417]/30 to-transparent",
    active: true,
    order: 2,
  },
  {
    eyebrow: "Heirloom Living",
    title: "Our Furniture",
    subtitle: "Sterling silver heirlooms for the modern home.",
    ctaLabel: "Browse Furniture",
    ctaLink: "/category/furniture",
    imageUrl:
      "https://images.unsplash.com/photo-1540574163026-643ea20ade25?auto=format&fit=crop&w=1200&q=80",
    tint: "from-[#1f2937]/80 via-[#1f2937]/30 to-transparent",
    active: true,
    order: 3,
  },
  {
    eyebrow: "Heritage Craft",
    title: "Our Jewellery Collection",
    subtitle: "Hand-finished silver in modern silhouettes.",
    ctaLabel: "Explore Jewellery",
    ctaLink: "/category/jewellery",
    imageUrl:
      "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=1200&q=80",
    tint: "from-[#3a1d20]/85 via-[#3a1d20]/35 to-transparent",
    active: true,
    order: 4,
  },
];