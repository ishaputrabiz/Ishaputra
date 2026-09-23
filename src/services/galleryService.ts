import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { uploadImage } from './mediaStorage';

export interface GalleryImage {
  id?: string;
  imageUrl: string;
  alt: string;
  order: number;
  status: 'active' | 'inactive';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const COLLECTION_NAME = 'gallery';

// Upload gallery image (JPG/PNG/WebP, max 500 KB - see mediaStorage)
export const uploadGalleryImage = async (file: File): Promise<string> => {
  const result = await uploadImage(file, { category: 'gallery' });
  return result.url;
};

// Get all gallery images (with optional status filter)
export const getAllGalleryImages = async (activeOnly: boolean = false): Promise<GalleryImage[]> => {
  try {
    let q = query(collection(db, COLLECTION_NAME), orderBy('order', 'asc'));
    
    if (activeOnly) {
      q = query(
        collection(db, COLLECTION_NAME),
        where('status', '==', 'active'),
        orderBy('order', 'asc')
      );
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as GalleryImage[];
  } catch (error) {
    console.error('Error fetching gallery images:', error);
    throw new Error('Failed to fetch gallery images');
  }
};

// Real-time subscription to gallery images
export const subscribeToGalleryImages = (
  callback: (images: GalleryImage[]) => void,
  activeOnly: boolean = false
): (() => void) => {
  let q = query(collection(db, COLLECTION_NAME), orderBy('order', 'asc'));

  if (activeOnly) {
    q = query(
      collection(db, COLLECTION_NAME),
      where('status', '==', 'active'),
      orderBy('order', 'asc')
    );
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const images = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as GalleryImage[];
      callback(images);
    },
    (error) => {
      console.error('Error subscribing to gallery images:', error);
      callback([]);
    }
  );
};

// Create new gallery image
export const createGalleryImage = async (
  imageData: Omit<GalleryImage, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...imageData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    return docRef.id;
  } catch (error) {
    console.error('Error creating gallery image:', error);
    throw new Error('Failed to create gallery image');
  }
};

// Update gallery image
export const updateGalleryImage = async (
  id: string,
  imageData: Partial<Omit<GalleryImage, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, {
      ...imageData,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('Error updating gallery image:', error);
    throw new Error('Failed to update gallery image');
  }
};

// Delete gallery image
export const deleteGalleryImage = async (id: string): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting gallery image:', error);
    throw new Error('Failed to delete gallery image');
  }
};
