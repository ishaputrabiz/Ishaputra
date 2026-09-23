import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  onSnapshot,
  Timestamp 
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { uploadImage } from '@/services/mediaStorage';

export interface Banner {
  id?: string;
  imageUrl: string;
  mobileImageUrl?: string;
  redirectLink: string;
  order: number;
  status: 'active' | 'inactive';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const BANNERS_COLLECTION = 'banners';

// Upload banner image (JPG/PNG/WebP, max 500 KB - see mediaStorage)
export const uploadBannerImage = async (file: File): Promise<string> => {
  try {
    const result = await uploadImage(file, { category: 'banners' });
    return result.url;
  } catch (error) {
    console.error('Error uploading banner image:', error);
    throw error;
  }
};

// Create new banner
export const createBanner = async (bannerData: Omit<Banner, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, BANNERS_COLLECTION), {
      ...bannerData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating banner:', error);
    throw error;
  }
};

// Update existing banner
export const updateBanner = async (id: string, bannerData: Partial<Banner>): Promise<void> => {
  try {
    const bannerRef = doc(db, BANNERS_COLLECTION, id);
    await updateDoc(bannerRef, {
      ...bannerData,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating banner:', error);
    throw error;
  }
};

// Delete banner
export const deleteBanner = async (id: string, imageUrl: string): Promise<void> => {
  try {
    // Delete from Firestore
    const bannerRef = doc(db, BANNERS_COLLECTION, id);
    await deleteDoc(bannerRef);
    // Note: Cloudinary images are managed via Cloudinary dashboard if needed
  } catch (error) {
    console.error('Error deleting banner:', error);
    throw error;
  }
};

// Get all banners (for admin)
export const getAllBanners = async (): Promise<Banner[]> => {
  try {
    const bannersQuery = query(
      collection(db, BANNERS_COLLECTION),
      orderBy('order', 'asc')
    );
    const snapshot = await getDocs(bannersQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Banner));
  } catch (error) {
    console.error('Error fetching banners:', error);
    throw error;
  }
};

// Get active banners (for homepage)
export const getActiveBanners = async (): Promise<Banner[]> => {
  try {
    const bannersQuery = query(
      collection(db, BANNERS_COLLECTION),
      where('status', '==', 'active'),
      orderBy('order', 'asc')
    );
    const snapshot = await getDocs(bannersQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Banner));
  } catch (error) {
    console.error('Error fetching active banners:', error);
    throw error;
  }
};

// Real-time listener for active banners
export const subscribeToActiveBanners = (
  callback: (banners: Banner[]) => void,
  onError?: (error: Error) => void
) => {
  const bannersQuery = query(
    collection(db, BANNERS_COLLECTION),
    where('status', '==', 'active'),
    orderBy('order', 'asc')
  );

  return onSnapshot(
    bannersQuery,
    (snapshot) => {
      const banners = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as Banner));
      callback(banners);
    },
    (error) => {
      console.error('Error in banner subscription:', error);
      onError?.(error);
    }
  );
};
