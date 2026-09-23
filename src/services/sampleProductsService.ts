import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { SAMPLE_PRODUCTS, type SampleProduct } from '@/data/sampleProducts';
import { createProduct, deleteProduct, generateSlug, type Product } from './productService';

/**
 * Add / remove the demo catalog from Admin > Products.
 *
 * Samples are ordinary product documents written through the same
 * createProduct() the product form uses, so every admin screen can edit or
 * delete them one by one. They also carry `isSample: true`, which is how
 * removeSampleProducts() finds them without touching real products.
 */

const sampleDocs = () => getDocs(query(collection(db, 'products'), where('isSample', '==', true)));

const toProduct = (s: SampleProduct): Omit<Product, 'id'> => ({
  name: s.name,
  slug: generateSlug(s.name),
  category: s.category,
  subcategory: s.subcategory,
  description: `${s.description}\n\nKey ingredients: ${s.keyIngredients}\n\nHow to use: ${s.howToUse}`,
  price: s.price,
  originalPrice: s.originalPrice,
  currency: 'INR',
  media: { images: [s.image], videos: [], thumbnail: s.image },
  inventory: { stock: 50, sku: '', weight: String(s.weightGrams), weightUnit: 'grams' },
  specifications: {
    material: '',
    purity: '',
    dimensions: s.size,
    keyIngredients: s.keyIngredients,
    howToUse: s.howToUse,
  },
  flags: {
    isActive: true,
    isFeatured: !!s.flags.isFeatured,
    isNewArrival: !!s.flags.isNewArrival,
    isBestSeller: !!s.flags.isBestSeller,
    isTopDeal: !!s.flags.isTopDeal,
    isTrendProduct: !!s.flags.isTrendProduct,
  },
  inactiveReason: null,
  isSample: true,
});

/** Adds any sample product not already in the store. Returns how many were added. */
export const addSampleProducts = async (adminId: string): Promise<number> => {
  const existing = new Set((await sampleDocs()).docs.map((d) => d.data().slug as string));
  let added = 0;
  for (const sample of SAMPLE_PRODUCTS) {
    if (existing.has(generateSlug(sample.name))) continue;
    await createProduct(toProduct(sample), adminId);
    added++;
  }
  return added;
};

/** Deletes every product marked as a sample. Returns how many were removed. */
export const removeSampleProducts = async (): Promise<number> => {
  const snap = await sampleDocs();
  for (const d of snap.docs) await deleteProduct(d.id);
  return snap.size;
};
