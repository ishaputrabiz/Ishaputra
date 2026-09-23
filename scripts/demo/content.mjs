/**
 * Demo content for the preview store: what `scripts/seed-demo.mjs` writes.
 *
 * Client-specific. For a new client, rewrite STYLE, CATEGORIES and the lists
 * below; the seed script itself stays the same. Every image has a prompt for
 * the AI generator and a target size; generated URLs are cached in
 * `scripts/demo/images.json` so re-running the seed doesn't regenerate them.
 */

/** Appended to every image prompt so the whole set shares one art direction. */
export const STYLE =
  "premium men's wellness brand photography, matte black and charcoal tones, warm rust copper rim light, " +
  'cream accents, subtle film grain, minimal, contemporary, editorial, sharp focus, no text, no logo, ' +
  'no mandala, no yoga, no orange gradient';

/** Written to `categories/<slug>`. Not demo data: these are the store's starting categories. */
export const CATEGORIES = [
  { name: 'Energy & Vitality', slug: 'energy-vitality', subs: ['Capsules', 'Powders', 'Shilajit'] },
  { name: 'Hair Care', slug: 'hair-care', subs: ['Hair Oils', 'Shampoos', 'Hair Serums'] },
  { name: 'Skin Care', slug: 'skin-care', subs: ['Face Wash', 'Face Serums', 'Moisturisers'] },
  { name: 'Personal Care', slug: 'personal-care', subs: ['Body Wash', 'Deodorants', 'Beard Care'] },
  { name: 'Ayurvedic Essentials', slug: 'ayurvedic-essentials', subs: ['Churnas', 'Herbal Teas', 'Immunity'] },
];

// Home rows pick products by flag: T = isTopDeal, B = isBestSeller, F = isFeatured,
// N = isNewArrival, R = isTrendProduct. Each flag is on 6-7 products so every row fills.
export const PRODUCTS = [
  {
    name: 'Himalayan Shilajit Resin',
    category: 'Energy & Vitality', subcategory: 'Shilajit',
    price: 1499, originalPrice: 1999, stock: 40, weight: '20', flags: 'TBF',
    description: 'Pure Himalayan shilajit resin, purified the traditional way. A pea-sized portion in warm water or milk each morning supports stamina, strength and recovery.',
    specs: { 'net quantity': '20 g', 'key ingredient': 'Purified shilajit (fulvic acid 60%+)', 'how to use': '300-500 mg daily in warm water or milk' },
    prompt: 'small matte black glass jar with brushed copper lid, open, dark glossy shilajit resin inside, raw resin chunk beside it, on dark slate stone',
  },
  {
    name: 'Ashwagandha KSM-66 Capsules',
    category: 'Energy & Vitality', subcategory: 'Capsules',
    price: 799, originalPrice: 999, stock: 60, weight: '60', flags: 'BNR',
    description: 'High-potency KSM-66 ashwagandha root extract for calm energy, better sleep and everyday stress resilience.',
    specs: { 'net quantity': '60 capsules', 'key ingredient': 'KSM-66 ashwagandha root extract 600 mg', 'how to use': '1 capsule twice daily after meals' },
    prompt: 'matte charcoal supplement bottle, a few beige herbal capsules spilled in front, dried ashwagandha roots, on dark wooden surface',
  },
  {
    name: 'Bhringraj Hair Strength Oil',
    category: 'Hair Care', subcategory: 'Hair Oils',
    price: 549, originalPrice: 699, stock: 50, weight: '100', flags: 'TFN',
    description: 'A slow-infused blend of bhringraj, amla and rosemary in cold-pressed sesame oil to strengthen roots and reduce hair fall.',
    specs: { 'net quantity': '100 ml', 'key ingredients': 'Bhringraj, amla, rosemary, sesame oil', 'how to use': 'Massage into scalp, leave 1 hour or overnight, then wash' },
    prompt: 'amber glass bottle of herbal hair oil with black cap, a drop of golden oil, on dark stone',
  },
  {
    name: 'Onion & Amla Anti-Hairfall Shampoo',
    category: 'Hair Care', subcategory: 'Shampoos',
    price: 449, originalPrice: 549, stock: 70, weight: '250', flags: 'BR',
    description: 'Sulphate-free shampoo with red onion and amla that cleans without stripping and leaves hair thicker and stronger.',
    specs: { 'net quantity': '250 ml', 'key ingredients': 'Red onion extract, amla, biotin', 'suitable for': 'All hair types' },
    prompt: 'tall matte black squeeze bottle of shampoo with copper cap, water droplets, on wet dark slate',
  },
  {
    name: 'Rosemary Redensyl Hair Serum',
    category: 'Hair Care', subcategory: 'Hair Serums',
    price: 899, originalPrice: 1099, stock: 35, weight: '50', flags: 'FNT',
    description: 'Lightweight leave-in serum with 3% Redensyl and rosemary oil to support new growth along the hairline and crown.',
    specs: { 'net quantity': '50 ml', 'key ingredients': '3% Redensyl, rosemary oil, caffeine', 'how to use': '1 ml on dry scalp every night' },
    prompt: 'black glass dropper bottle of hair serum with copper collar, dropper resting beside it, single rosemary sprig, on charcoal stone',
  },
  {
    name: 'Charcoal & Neem Face Wash',
    category: 'Skin Care', subcategory: 'Face Wash',
    price: 349, originalPrice: 449, stock: 80, weight: '100', flags: 'TBR',
    description: 'Activated charcoal and neem pull out oil and grime for a deep, non-drying clean. Made for oily and acne-prone skin.',
    specs: { 'net quantity': '100 ml', 'key ingredients': 'Activated charcoal, neem, tea tree', 'skin type': 'Oily, acne-prone' },
    prompt: 'matte black face wash tube standing upright, swirl of dark grey charcoal foam beside it, on dark concrete',
  },
  {
    name: 'Kumkumadi Night Face Serum',
    category: 'Skin Care', subcategory: 'Face Serums',
    price: 999, originalPrice: 1299, stock: 30, weight: '30', flags: 'FBN',
    description: 'The classical Kumkumadi oil, made lighter for men\'s skin. Saffron and sandalwood work overnight on dullness and uneven tone.',
    specs: { 'net quantity': '30 ml', 'key ingredients': 'Saffron, sandalwood, manjistha', 'how to use': '3-4 drops on clean skin at night' },
    prompt: 'dark amber glass serum bottle with black dropper, a few saffron threads, on black marble with warm copper light',
  },
  {
    name: 'Vetiver & Cedar Body Wash',
    category: 'Personal Care', subcategory: 'Body Wash',
    price: 499, originalPrice: 599, stock: 55, weight: '250', flags: 'NRT',
    description: 'An energising shower gel with an earthy vetiver and cedarwood scent. Cleans deep, rinses clean, never leaves skin tight.',
    specs: { 'net quantity': '250 ml', 'key ingredients': 'Vetiver, cedarwood, aloe vera', 'fragrance': 'Woody, earthy' },
    prompt: 'charcoal grey pump bottle of body wash with copper pump, cedar wood block beside it, on dark stone, soft steam',
  },
  {
    name: 'Oud & Vetiver Natural Deodorant',
    category: 'Personal Care', subcategory: 'Deodorants',
    price: 399, originalPrice: 499, stock: 90, weight: '150', flags: 'BTF',
    description: 'Aluminium-free deodorant spray with oud and vetiver. Long-lasting freshness without harsh chemicals.',
    specs: { 'net quantity': '150 ml', 'key ingredients': 'Oud, vetiver, witch hazel', 'fragrance': 'Oud, smoky wood' },
    prompt: 'matte black aluminium deodorant spray can with copper band, on dark slate, dramatic side light',
  },
  {
    name: 'Cedarwood Beard Growth Oil',
    category: 'Personal Care', subcategory: 'Beard Care',
    price: 599, originalPrice: 749, stock: 45, weight: '30', flags: 'NRB',
    description: 'Softens coarse beard hair and supports fuller growth with cedarwood, jojoba and bhringraj.',
    specs: { 'net quantity': '30 ml', 'key ingredients': 'Cedarwood, jojoba, bhringraj, argan', 'how to use': '4-5 drops daily, comb through' },
    prompt: 'matte black glass dropper bottle of beard oil with minimal copper label, wooden beard comb beside it, on dark charcoal stone slab',
  },
  {
    name: 'Triphala Churna',
    category: 'Ayurvedic Essentials', subcategory: 'Churnas',
    price: 299, originalPrice: 349, stock: 100, weight: '100', flags: 'RF',
    description: 'The classic three-fruit blend of amla, haritaki and bibhitaki for daily digestion and gentle detox.',
    specs: { 'net quantity': '100 g', 'key ingredients': 'Amla, haritaki, bibhitaki', 'how to use': '1 teaspoon with warm water at bedtime' },
    prompt: 'matte black tin jar with copper lid, brown herbal powder in a small dark stone bowl with a brass spoon, dried amla fruit',
  },
  {
    name: 'Tulsi Ginger Immunity Tea',
    category: 'Ayurvedic Essentials', subcategory: 'Herbal Teas',
    price: 349, originalPrice: 399, stock: 65, weight: '50', flags: 'NT',
    description: 'A warming blend of holy basil, ginger and black pepper. Caffeine-free, 25 pyramid tea bags.',
    specs: { 'net quantity': '25 tea bags', 'key ingredients': 'Tulsi, ginger, black pepper, cinnamon', 'caffeine': 'None' },
    prompt: 'dark ceramic tea cup of herbal tea with steam, black tea tin with copper lid, fresh ginger root, on dark wood',
  },
];

/** Hero carousel (`banners`). Desktop 16:9, mobile 4:5. Images only; the section shows no text. */
export const HERO_BANNERS = [
  {
    link: '/category/energy-vitality',
    prompt: 'wide cinematic still life, row of matte black and amber glass wellness bottles on a long dark stone ledge, dramatic copper light from the left, deep shadows, lots of empty dark space on the right',
  },
  {
    link: '/category/hair-care',
    prompt: 'wide cinematic shot, confident bearded Indian man in his thirties in a charcoal linen shirt, warm copper side light, dark textured background, looking away from camera',
  },
  {
    link: '/products',
    prompt: 'wide overhead flat lay on black slate, raw shilajit resin, ashwagandha roots, saffron threads, copper bowl, amber glass dropper bottle, arranged with generous negative space',
  },
];

/** Category showcase tiles (`showcases`). */
export const SHOWCASES = [
  {
    title: 'Daily Strength', subtitle: 'energy-vitality', cta: 'Shop Energy',
    description: 'Shilajit, ashwagandha and classical rasayanas for steady, all-day energy.',
    prompt: 'dark moody still life, raw shilajit resin on black stone with a copper spoon, warm rim light',
  },
  {
    title: 'The Grooming Ritual', subtitle: 'personal-care', cta: 'Shop Grooming',
    description: 'Beard oils, body washes and deodorants with an earthy, woody edge.',
    prompt: 'dark moody still life, beard oil bottle, wooden comb and a folded charcoal towel on dark stone, copper light',
  },
  {
    title: 'Root Strength', subtitle: 'hair-care', cta: 'Shop Hair Care',
    description: 'Bhringraj, amla and rosemary to hold on to what you have and grow back more.',
    prompt: 'dark moody still life, amber hair oil bottle with bhringraj herbs and amla fruit on black slate, warm light',
  },
];

/** "Our Collections" cards (`homeCollections`), portrait 3:4. */
export const COLLECTIONS = [
  { eyebrow: 'Energy', title: 'Energy & Vitality', subtitle: 'Shilajit, ashwagandha and more for daily strength.', link: '/category/energy-vitality', prompt: 'portrait still life, black jar of shilajit resin with copper lid on dark stone, vertical composition' },
  { eyebrow: 'Hair', title: 'Hair Care', subtitle: 'Oils, shampoos and serums that fight hair fall.', link: '/category/hair-care', prompt: 'portrait still life, amber hair oil bottle and wooden comb on dark wood, vertical composition' },
  { eyebrow: 'Skin', title: 'Skin Care', subtitle: 'Clean, clear skin with Ayurvedic actives.', link: '/category/skin-care', prompt: 'portrait still life, black face wash tube and serum bottle on black marble, vertical composition' },
  { eyebrow: 'Grooming', title: 'Personal Care', subtitle: 'Body, beard and daily grooming essentials.', link: '/category/personal-care', prompt: 'portrait still life, charcoal body wash bottle and cedar wood block on dark stone, soft steam, vertical composition' },
  { eyebrow: 'Ayurveda', title: 'Ayurvedic Essentials', subtitle: 'Classical churnas and herbal teas.', link: '/category/ayurvedic-essentials', prompt: 'portrait still life, herbal powder in a dark stone bowl with brass spoon and a steaming tea cup, vertical composition' },
];

/** Wide banner near the bottom of the home page (`homeBanners`, slot collection-wide). */
export const COLLECTION_BANNER = {
  eyebrow: 'Rooted in Ayurveda',
  title: 'Built for the modern man',
  subtitle: 'Classical formulations, clean ingredients, made for everyday strength.',
  ctaLabel: 'Shop the range',
  ctaLink: '/products',
  prompt: 'ultra wide panoramic still life, matte black and amber wellness bottles lined up on a dark stone ledge, copper light, empty dark space on the left',
};

/** Placeholder reviews so the section shows in the preview. Removed with the rest of the demo data. */
export const TESTIMONIALS = [
  { title: 'Real energy, no crash', quote: 'Two weeks on the shilajit and I no longer need a second coffee in the afternoon.', author: 'Arjun M.', role: 'Bengaluru', rating: 5 },
  { title: 'Hair fall is down', quote: 'The bhringraj oil and the serum together made a visible difference in about a month.', author: 'Rahul S.', role: 'Hyderabad', rating: 5 },
  { title: 'Finally, grooming that feels premium', quote: 'The beard oil smells like cedar, not perfume. Packaging looks great on the shelf too.', author: 'Vikram R.', role: 'Pune', rating: 4 },
];
