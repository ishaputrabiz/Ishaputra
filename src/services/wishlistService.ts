import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export interface WishlistEntry {
  id: string;
  productId: string;
  addedAt?: Timestamp;
  updatedAt?: Timestamp;
}

const getWishlistCollection = (userId: string) => collection(db, 'users', userId, 'wishlist');

export const getUserWishlist = async (userId: string): Promise<WishlistEntry[]> => {
  const snapshot = await getDocs(query(getWishlistCollection(userId), orderBy('addedAt', 'desc')));
  return snapshot.docs.map((wishlistDoc) => ({
    id: wishlistDoc.id,
    ...wishlistDoc.data(),
  })) as WishlistEntry[];
};

export const subscribeToUserWishlist = (
  userId: string,
  callback: (wishlist: WishlistEntry[]) => void,
  onError?: (error: Error) => void,
) => {
  try {
    const wishlistQuery = query(getWishlistCollection(userId), orderBy('addedAt', 'desc'));

    return onSnapshot(
      wishlistQuery,
      (snapshot) => {
        callback(
          snapshot.docs.map((wishlistDoc) => ({
            id: wishlistDoc.id,
            ...wishlistDoc.data(),
          })) as WishlistEntry[],
        );
      },
      (error) => {
        console.error('Error subscribing to wishlist:', error);
        onError?.(error);
      },
    );
  } catch (error) {
    console.error('Error setting up wishlist subscription:', error);
    onError?.(error as Error);
    return () => {};
  }
};

export const addWishlistItem = async (userId: string, productId: string): Promise<void> => {
  await setDoc(
    doc(db, 'users', userId, 'wishlist', productId),
    {
      productId,
      addedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const removeWishlistItem = async (userId: string, productId: string): Promise<void> => {
  await deleteDoc(doc(db, 'users', userId, 'wishlist', productId));
};

export const mergeWishlistItems = async (userId: string, productIds: string[]): Promise<void> => {
  if (!productIds.length) return;

  const batch = writeBatch(db);
  productIds.forEach((productId) => {
    batch.set(
      doc(db, 'users', userId, 'wishlist', productId),
      {
        productId,
        addedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  await batch.commit();
};

export const clearUserWishlist = async (userId: string): Promise<void> => {
  const snapshot = await getDocs(getWishlistCollection(userId));
  if (snapshot.empty) return;

  const batch = writeBatch(db);
  snapshot.docs.forEach((wishlistDoc) => {
    batch.delete(wishlistDoc.ref);
  });
  await batch.commit();
};
