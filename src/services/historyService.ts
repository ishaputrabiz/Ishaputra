import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

// History Types
export type HistoryActionType = 'view' | 'search' | 'add_to_cart' | 'remove_from_cart' | 'wishlist' | 'order' | 'login' | 'logout';

export interface HistoryEntry {
  id?: string;
  userId: string;
  type: HistoryActionType;
  productId?: string;
  productName?: string;
  action: string;
  metadata?: Record<string, any>;
  timestamp?: Date | Timestamp;
}

const HISTORY_COLLECTION = 'history';

// Add a history entry for a user
export const addHistoryEntry = async (
  userId: string,
  type: HistoryActionType,
  action: string,
  metadata?: Record<string, any>
): Promise<string> => {
  const entry: Omit<HistoryEntry, 'id'> = {
    userId,
    type,
    action,
    metadata,
    timestamp: serverTimestamp() as Timestamp,
  };

  const docRef = await addDoc(collection(db, HISTORY_COLLECTION), entry);
  return docRef.id;
};

// Track product view
export const trackProductView = async (
  userId: string,
  productId: string,
  productName: string
): Promise<void> => {
  await addHistoryEntry(userId, 'view', `Viewed product: ${productName}`, {
    productId,
    productName,
  });
};

// Track search
export const trackSearch = async (
  userId: string,
  searchQuery: string,
  resultsCount: number
): Promise<void> => {
  await addHistoryEntry(userId, 'search', `Searched for: ${searchQuery}`, {
    query: searchQuery,
    resultsCount,
  });
};

// Track add to cart
export const trackAddToCart = async (
  userId: string,
  productId: string,
  productName: string,
  quantity: number
): Promise<void> => {
  await addHistoryEntry(userId, 'add_to_cart', `Added to cart: ${productName}`, {
    productId,
    productName,
    quantity,
  });
};

// Track order
export const trackOrder = async (
  userId: string,
  orderId: string,
  orderTotal: number,
  itemsCount: number
): Promise<void> => {
  await addHistoryEntry(userId, 'order', `Placed order #${orderId}`, {
    orderId,
    orderTotal,
    itemsCount,
  });
};

// Get user history - ISOLATED TO SPECIFIC USER
export const getUserHistory = async (
  userId: string,
  limitCount = 50
): Promise<HistoryEntry[]> => {
  const q = query(
    collection(db, HISTORY_COLLECTION),
    where('userId', '==', userId),
    orderBy('timestamp', 'desc'),
    limit(limitCount)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as HistoryEntry));
};

// Get user history by type
export const getUserHistoryByType = async (
  userId: string,
  type: HistoryActionType,
  limitCount = 20
): Promise<HistoryEntry[]> => {
  const q = query(
    collection(db, HISTORY_COLLECTION),
    where('userId', '==', userId),
    where('type', '==', type),
    orderBy('timestamp', 'desc'),
    limit(limitCount)
  );

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as HistoryEntry));
};

// Get recently viewed products for a user
export const getRecentlyViewedProducts = async (
  userId: string,
  limitCount = 10
): Promise<HistoryEntry[]> => {
  return getUserHistoryByType(userId, 'view', limitCount);
};

// Get user's search history
export const getSearchHistory = async (
  userId: string,
  limitCount = 20
): Promise<HistoryEntry[]> => {
  return getUserHistoryByType(userId, 'search', limitCount);
};
