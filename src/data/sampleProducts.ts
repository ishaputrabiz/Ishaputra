/**
 * Demo catalog for a new store, added and removed from Admin > Products.
 *
 * Photos are AI-generated placeholders (Pollinations) hosted on the store's
 * Cloudinary account; the prompts are in client-assets/generated/. Every
 * product is saved with `isSample: true`, so "Remove sample products" deletes
 * exactly these and nothing the owner added. Replace with real products
 * before launch.
 */

export interface SampleProduct {
  name: string;
  category: string;
  subcategory: string;
  price: number;
  originalPrice: number;
  /** Shown as "Size" on the product page. */
  size: string;
  weightGrams: number;
  description: string;
  keyIngredients: string;
  howToUse: string;
  image: string;
  flags: {
    isFeatured?: boolean;
    isNewArrival?: boolean;
    isBestSeller?: boolean;
    isTopDeal?: boolean;
    isTrendProduct?: boolean;
  };
}

const CLD = 'https://res.cloudinary.com/dcoimqij/image/upload';

export const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    name: 'Himalayan Shilajit Resin',
    category: 'Energy & Vitality',
    subcategory: 'Shilajit',
    price: 1499,
    originalPrice: 1899,
    size: '20 g',
    weightGrams: 60,
    description:
      'Purified Himalayan shilajit resin for daily energy and stamina. Sourced above 16,000 ft, lab-tested for purity, and packed in a light-proof glass jar.',
    keyIngredients: 'Purified shilajit resin (fulvic acid ≥ 60%)',
    howToUse: 'Dissolve a pea-sized portion in warm water or milk once a day.',
    image: `${CLD}/v1790155516/products/gyoucz5th50n1rbape8n.jpg`,
    flags: { isFeatured: true, isBestSeller: true, isTrendProduct: true },
  },
  {
    name: 'Ashwagandha KSM-66 Capsules',
    category: 'Energy & Vitality',
    subcategory: 'Capsules',
    price: 899,
    originalPrice: 1099,
    size: '60 capsules',
    weightGrams: 90,
    description:
      'High-strength ashwagandha root extract for calm focus, recovery and everyday resilience. One capsule a day fits any routine.',
    keyIngredients: 'Ashwagandha root extract KSM-66 (600 mg)',
    howToUse: 'One capsule daily after a meal, with water.',
    image: `${CLD}/v1790155528/products/rmdhotviokenmcdlpivn.jpg`,
    flags: { isBestSeller: true, isTopDeal: true },
  },
  {
    name: 'Bhringraj Hair Strength Oil',
    category: 'Hair Care',
    subcategory: 'Hair Oils',
    price: 549,
    originalPrice: 699,
    size: '200 ml',
    weightGrams: 260,
    description:
      'A slow-infused blend of bhringraj, amla and cold-pressed sesame oil that nourishes the scalp and strengthens hair from the root.',
    keyIngredients: 'Bhringraj, amla, brahmi, cold-pressed sesame oil',
    howToUse: 'Massage into the scalp 2-3 times a week. Leave for an hour or overnight, then wash.',
    image: `${CLD}/v1790155529/products/durkrcav5ebhcldq2vqg.jpg`,
    flags: { isFeatured: true, isTopDeal: true },
  },
  {
    name: 'Rosemary & Brahmi Scalp Serum',
    category: 'Hair Care',
    subcategory: 'Hair Serums',
    price: 699,
    originalPrice: 849,
    size: '50 ml',
    weightGrams: 110,
    description:
      'A lightweight, non-greasy serum with rosemary and brahmi that refreshes the scalp and supports thicker-looking hair.',
    keyIngredients: 'Rosemary extract, brahmi, redensyl, caffeine',
    howToUse: 'Apply 6-8 drops to a dry scalp each night and massage in. Do not rinse.',
    image: `${CLD}/v1790155533/products/pmnojlvzoafh8jspqkdf.jpg`,
    flags: { isNewArrival: true, isTrendProduct: true },
  },
  {
    name: 'Activated Charcoal Face Wash',
    category: 'Skin Care',
    subcategory: 'Face Wash',
    price: 399,
    originalPrice: 499,
    size: '100 ml',
    weightGrams: 130,
    description:
      'A deep-cleansing gel with activated charcoal and neem that lifts oil and city grime without drying out the skin.',
    keyIngredients: 'Activated charcoal, neem, tea tree, aloe vera',
    howToUse: 'Lather with water, massage onto the face for 30 seconds, rinse. Use morning and night.',
    image: `${CLD}/v1790155532/products/ova7qwkxgjwk5gbss9gq.jpg`,
    flags: { isBestSeller: true, isTrendProduct: true },
  },
  {
    name: 'Kumkumadi Saffron Face Serum',
    category: 'Skin Care',
    subcategory: 'Face Serums',
    price: 799,
    originalPrice: 999,
    size: '30 ml',
    weightGrams: 90,
    description:
      'A classic kumkumadi formula with saffron and niacinamide that evens out skin tone and restores a healthy glow.',
    keyIngredients: 'Saffron, niacinamide, manjistha, licorice',
    howToUse: 'Pat 3-4 drops onto clean skin at night.',
    image: `${CLD}/v1790155533/products/d5w6qukot0eit5ydjzzi.jpg`,
    flags: { isFeatured: true, isNewArrival: true },
  },
  {
    name: 'Vetiver & Sandalwood Body Wash',
    category: 'Personal Care',
    subcategory: 'Body Wash',
    price: 449,
    originalPrice: 549,
    size: '250 ml',
    weightGrams: 300,
    description:
      'A cooling, woody body wash with vetiver and sandalwood that cleanses without stripping and leaves a clean, earthy scent.',
    keyIngredients: 'Vetiver, sandalwood oil, coconut-based cleansers',
    howToUse: 'Work into a lather on wet skin, then rinse.',
    image: `${CLD}/v1790155536/products/zbcee52ei7a1eogsoxyx.jpg`,
    flags: { isBestSeller: true, isTopDeal: true },
  },
  {
    name: 'Cedarwood Beard Growth Oil',
    category: 'Personal Care',
    subcategory: 'Beard Care',
    price: 499,
    originalPrice: 649,
    size: '30 ml',
    weightGrams: 80,
    description:
      'A blend of cedarwood, bhringraj and argan oil that softens the beard, calms itch and keeps patchy areas nourished.',
    keyIngredients: 'Cedarwood oil, bhringraj, argan oil, vitamin E',
    howToUse: 'Rub 4-5 drops between your palms and work through the beard and skin beneath.',
    image: `${CLD}/v1790155530/products/imaldwrw3ykwmcob1iut.jpg`,
    flags: { isFeatured: true, isTrendProduct: true },
  },
  {
    name: 'Triphala Churna',
    category: 'Ayurvedic Essentials',
    subcategory: 'Churnas',
    price: 299,
    originalPrice: 349,
    size: '100 g',
    weightGrams: 130,
    description:
      'The classic three-fruit blend of amla, haritaki and bibhitaki for daily digestion and gentle detox, stone-ground in small batches.',
    keyIngredients: 'Amla, haritaki, bibhitaki',
    howToUse: 'Mix one teaspoon in warm water and drink before bed.',
    image: `${CLD}/v1790155534/products/c32ncfpmc9e38pqnhjoe.jpg`,
    flags: { isNewArrival: true },
  },
  {
    name: 'Tulsi Ginger Immunity Tea',
    category: 'Ayurvedic Essentials',
    subcategory: 'Herbal Teas',
    price: 349,
    originalPrice: 399,
    size: '50 g',
    weightGrams: 90,
    description:
      'A warming loose-leaf infusion of holy basil, ginger and black pepper. Caffeine-free, for a daily reset.',
    keyIngredients: 'Tulsi, ginger, black pepper, cinnamon',
    howToUse: 'Steep one teaspoon in hot water for 4-5 minutes.',
    image: `${CLD}/v1790155536/products/pytx5cxmakjn0mkplba0.jpg`,
    flags: { isNewArrival: true },
  },
];
