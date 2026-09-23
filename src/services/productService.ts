import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { invalidateProductCache } from './productCache';
import { requestCatalogRefresh } from './catalogPublisher';
import { deleteMedia } from './mediaStorage';
import { isManagedImageUrl } from '@/lib/mediaUrl';
import type { ProductDeliveryConfig } from './siteSettingsService';

// Product Types
export interface ProductMedia {
  images: string[];
  videos: string[];
  thumbnail: string;
}

export interface ProductInventory {
  stock: number;
  sku: string;
  weight: string;
  weightUnit: 'grams' | 'kgs';
}

export interface ProductSpecifications {
  material: string;
  purity: string;
  dimensions: string;
  [key: string]: string;
}

/**
 * Why a product is hidden from the storefront, when the system hid it.
 *
 * Only set by automatic rules, never by the admin's own Active switch, so the
 * system can tell "sold out, bring it back when restocked" apart from "the
 * owner took this down on purpose" - and never undo the second one.
 */
export type InactiveReason = 'outOfStock' | 'noImages';

export interface ProductFlags {
  isActive: boolean;
  isFeatured: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  isTopDeal?: boolean;
  isTrendProduct?: boolean;
}

export interface ProductSEO {
  metaTitle: string;
  metaDescription: string;
}

export interface Product {
  id?: string;
  name: string;
  slug: string;
  /** Scanned/typed product barcode (EAN, UPC, Code128...). Unique per product. */
  barcode?: string;
  category: string;
  subcategory?: string;
  subSubcategory?: string;
  description: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  currency: string;
  media: ProductMedia;
  inventory: ProductInventory;
  specifications: ProductSpecifications;
  flags: ProductFlags;
  seo?: ProductSEO;
  /**
   * Per-product delivery override. Absent => the product follows the universal
   * charge in /admin/commerce-settings. See `computeItemDeliveryCharge`.
   */
  delivery?: ProductDeliveryConfig;
  /** Set only when a rule (not the admin) hid the product. See InactiveReason. */
  inactiveReason?: InactiveReason | null;
  rating?: number;
  reviewCount?: number;
  createdAt?: Date | Timestamp;
  updatedAt?: Date | Timestamp;
  createdBy?: string;
}

const PRODUCTS_COLLECTION = 'products';

// Generate SKU automatically
const generateSKU = (category: string, productId: string): string => {
  const categoryPrefix = category.substring(0, 3).toUpperCase();
  const idSuffix = productId.substring(0, 8).toUpperCase();
  return `${categoryPrefix}-${idSuffix}`;
};

// Create a new product
export const createProduct = async (product: Omit<Product, 'id'>, adminId: string): Promise<string> => {
  console.log('productService: Creating product:', product);
  const docRef = await addDoc(collection(db, PRODUCTS_COLLECTION), {
    ...product,
    createdBy: adminId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  console.log('productService: Product created with ID:', docRef.id);
  
  // Auto-generate SKU after product is created
  const autoSKU = generateSKU(product.category, docRef.id);
  console.log('productService: Generated SKU:', autoSKU);
  
  await updateDoc(docRef, {
    'inventory.sku': autoSKU,
  });
  
  console.log('productService: Product SKU updated');

  invalidateProductCache();
  requestCatalogRefresh([docRef.id]);
  return docRef.id;
};

// Update a product
export const updateProduct = async (productId: string, updates: Partial<Product>): Promise<void> => {
  const productRef = doc(db, PRODUCTS_COLLECTION, productId);
  await updateDoc(productRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
  invalidateProductCache();
  requestCatalogRefresh([productId]);
};

// Delete a product
export const deleteProduct = async (productId: string): Promise<void> => {
  const ref = doc(db, PRODUCTS_COLLECTION, productId);
  const snap = await getDoc(ref);
  await deleteDoc(ref);
  invalidateProductCache();
  requestCatalogRefresh([productId]);
  // Background: the product is gone either way; cleanup only frees storage.
  void releaseProductImages(snap.data()?.media?.images || []);
};

/**
 * Delete stored photo files that no product references any more.
 *
 * A URL can sit on two products (the Paste URL box accepts any link), so each
 * one is checked with an array-contains query before its file is removed.
 * Only files uploaded through /api/media are candidates; external links and
 * legacy Cloudinary URLs are ignored.
 */
export const releaseProductImages = async (urls: string[]): Promise<void> => {
  const candidates = [...new Set(urls.filter(isManagedImageUrl))];
  const inUse = await Promise.all(
    candidates.map(async (url) => {
      try {
        const users = await getDocs(
          query(collection(db, PRODUCTS_COLLECTION), where('media.images', 'array-contains', url), limit(1)),
        );
        return !users.empty;
      } catch (err) {
        console.warn('[media] could not check image usage, keeping file:', err);
        return true;
      }
    }),
  );
  const orphaned = candidates.filter((_, i) => !inUse[i]);
  if (orphaned.length) await deleteMedia(orphaned);
};

// Get a single product by ID
export const getProduct = async (productId: string): Promise<Product | null> => {
  const docSnap = await getDoc(doc(db, PRODUCTS_COLLECTION, productId));
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as Product;
  }
  return null;
};

// Get all products (admin view - includes inactive)
export const getAllProducts = async (): Promise<Product[]> => {
  const querySnapshot = await getDocs(
    query(collection(db, PRODUCTS_COLLECTION), orderBy('createdAt', 'desc'))
  );
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Product));
};

// Get active products only (public view)
export const getActiveProducts = async (): Promise<Product[]> => {
  const querySnapshot = await getDocs(
    query(
      collection(db, PRODUCTS_COLLECTION),
      where('flags.isActive', '==', true)
    )
  );
  const products = querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Product));
  // Sort by createdAt in client
  products.sort((a, b) => {
    const aTime = a.createdAt as any;
    const bTime = b.createdAt as any;
    if (!aTime || !bTime) return 0;
    return bTime.seconds - aTime.seconds;
  });
  return products;
};

// Get featured products
export const getFeaturedProducts = async (limitCount = 8): Promise<Product[]> => {
  const querySnapshot = await getDocs(
    query(
      collection(db, PRODUCTS_COLLECTION),
      where('flags.isActive', '==', true),
      where('flags.isFeatured', '==', true),
      limit(limitCount)
    )
  );
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Product));
};

// Get products by category
export const getProductsByCategory = async (category: string): Promise<Product[]> => {
  const querySnapshot = await getDocs(
    query(
      collection(db, PRODUCTS_COLLECTION),
      where('flags.isActive', '==', true),
      where('category', '==', category)
    )
  );
  const products = querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Product));
  // Sort by createdAt in client
  products.sort((a, b) => {
    const aTime = a.createdAt as any;
    const bTime = b.createdAt as any;
    if (!aTime || !bTime) return 0;
    return bTime.seconds - aTime.seconds;
  });
  return products;
};

// Get products by subcategory
export const getProductsBySubcategory = async (subcategory: string): Promise<Product[]> => {
  try {
    console.log('Fetching products for subcategory:', subcategory);
    const querySnapshot = await getDocs(
      query(
        collection(db, PRODUCTS_COLLECTION),
        where('flags.isActive', '==', true),
        where('subcategory', '==', subcategory)
      )
    );
    console.log('Found products:', querySnapshot.size);
    const products = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Product));
    // Sort by createdAt in client
    products.sort((a, b) => {
      const aTime = a.createdAt as any;
      const bTime = b.createdAt as any;
      if (!aTime || !bTime) return 0;
      return bTime.seconds - aTime.seconds;
    });
    return products;
  } catch (error) {
    console.error('Error fetching products by subcategory:', error);
    throw error;
  }
};

// Real-time listener for products by subcategory
export const subscribeToProductsBySubcategory = (
  subcategory: string,
  callback: (products: Product[]) => void
) => {
  console.log('Setting up real-time listener for subcategory:', subcategory);
  const q = query(
    collection(db, PRODUCTS_COLLECTION),
    where('flags.isActive', '==', true),
    where('subcategory', '==', subcategory)
  );

  return onSnapshot(q, (querySnapshot) => {
    console.log('Real-time update received:', querySnapshot.size, 'products');
    const products = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Product));
    
    // Sort by createdAt
    products.sort((a, b) => {
      const aTime = a.createdAt as any;
      const bTime = b.createdAt as any;
      if (!aTime || !bTime) return 0;
      return bTime.seconds - aTime.seconds;
    });
    
    callback(products);
  }, (error) => {
    console.error('[productService] SubcategorySubscription error:', error);
    callback([]);
  });
};

// Get best sellers
export const getBestSellers = async (limitCount = 8): Promise<Product[]> => {
  const querySnapshot = await getDocs(
    query(
      collection(db, PRODUCTS_COLLECTION),
      where('flags.isActive', '==', true),
      where('flags.isBestSeller', '==', true),
      limit(limitCount)
    )
  );
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Product));
};

// Get new arrivals
export const getNewArrivals = async (limitCount = 8): Promise<Product[]> => {
  const querySnapshot = await getDocs(
    query(
      collection(db, PRODUCTS_COLLECTION),
      where('flags.isActive', '==', true),
      where('flags.isNewArrival', '==', true),
      limit(limitCount)
    )
  );
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Product));
};

// Toggle product visibility
export const toggleProductVisibility = async (productId: string, isActive: boolean): Promise<void> => {
  await updateProduct(productId, { flags: { isActive } as ProductFlags });
};

// Real-time products listener
export const subscribeToProducts = (
  callback: (products: Product[]) => void,
  activeOnly = true
) => {
  const q = activeOnly
    ? query(
        collection(db, PRODUCTS_COLLECTION),
        where('flags.isActive', '==', true),
        orderBy('createdAt', 'desc')
      )
    : query(collection(db, PRODUCTS_COLLECTION), orderBy('createdAt', 'desc'));

  return onSnapshot(q, (querySnapshot) => {
    const products = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Product));
    callback(products);
  }, (error) => {
    console.error('[productService] Subscription error:', error);
    callback([]); // resolve with empty so loading stops
  });
};

// Real-time best sellers listener
export const subscribeToBestSellers = (
  callback: (products: Product[]) => void,
  limitCount = 10
) => {
  const q = query(
    collection(db, PRODUCTS_COLLECTION),
    where('flags.isActive', '==', true),
    where('flags.isBestSeller', '==', true),
    limit(limitCount)
  );

  return onSnapshot(q, (querySnapshot) => {
    const products = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Product));
    callback(products);
  }, (error) => {
    console.error('[productService] BestSellers subscription error:', error);
    callback([]);
  });
};

// Real-time top deals listener
export const subscribeToTopDeals = (
  callback: (products: Product[]) => void,
  limitCount = 10
) => {
  const q = query(
    collection(db, PRODUCTS_COLLECTION),
    where('flags.isActive', '==', true),
    where('flags.isTopDeal', '==', true),
    limit(limitCount)
  );

  return onSnapshot(q, (querySnapshot) => {
    const products = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Product));
    callback(products);
  }, (error) => {
    console.error('[productService] TopDeals subscription error:', error);
    callback([]);
  });
};

// Real-time featured products listener
export const subscribeToFeatured = (
  callback: (products: Product[]) => void,
  limitCount = 10
) => {
  const q = query(
    collection(db, PRODUCTS_COLLECTION),
    where('flags.isActive', '==', true),
    where('flags.isFeatured', '==', true),
    limit(limitCount)
  );

  return onSnapshot(q, (querySnapshot) => {
    const products = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Product));
    callback(products);
  }, (error) => {
    console.error('[productService] Featured subscription error:', error);
    callback([]);
  });
};

// Real-time new arrivals listener
export const subscribeToNewArrivals = (
  callback: (products: Product[]) => void,
  limitCount = 10
) => {
  const q = query(
    collection(db, PRODUCTS_COLLECTION),
    where('flags.isActive', '==', true),
    where('flags.isNewArrival', '==', true),
    limit(limitCount)
  );

  return onSnapshot(q, (querySnapshot) => {
    const products = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Product));
    callback(products);
  }, (error) => {
    console.error('[productService] NewArrivals subscription error:', error);
    callback([]);
  });
};

// Real-time trend products listener
export const subscribeToTrendProducts = (
  callback: (products: Product[]) => void,
  limitCount = 10
) => {
  const q = query(
    collection(db, PRODUCTS_COLLECTION),
    where('flags.isActive', '==', true),
    where('flags.isTrendProduct', '==', true),
    limit(limitCount)
  );

  return onSnapshot(q, (querySnapshot) => {
    const products = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Product));
    callback(products);
  }, (error) => {
    console.error('[productService] TrendProducts subscription error:', error);
    callback([]);
  });
};

// Generate slug from name
export const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};
