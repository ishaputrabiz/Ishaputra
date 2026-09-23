import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  query, 
  orderBy,
  onSnapshot,
  Timestamp 
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { uploadImage } from '@/services/mediaStorage';

export interface Showcase {
  id?: string;
  title: string;
  subtitle: string;
  description: string;
  cta: string;
  imageUrl: string;
  order: number;
  status: 'active' | 'inactive';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const SHOWCASES_COLLECTION = 'showcases';

// Upload showcase image (JPG/PNG/WebP, max 500 KB - see mediaStorage)
export const uploadShowcaseImage = async (file: File): Promise<string> => {
  try {
    const result = await uploadImage(file, { category: 'showcases' });
    return result.url;
  } catch (error: any) {
    console.error('Error uploading showcase image:', error);
    throw new Error(error.message || 'Failed to upload image');
  }
};

// Intentionally keeps the file: the image field also accepts pasted URLs, so
// the same file may be in use elsewhere (a product photo, another showcase).
// Showcase images are few; an occasional leftover costs next to nothing.
export const deleteShowcaseImage = async (_imageUrl: string): Promise<void> => {};

// Get all showcases
export const getAllShowcases = async (): Promise<Showcase[]> => {
  try {
    const q = query(
      collection(db, SHOWCASES_COLLECTION),
      orderBy('order', 'asc')
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Showcase));
  } catch (error: any) {
    console.error('Error getting showcases:', error);
    throw new Error('Failed to load showcases');
  }
};

// Get active showcases only (for frontend display)
export const getActiveShowcases = async (): Promise<Showcase[]> => {
  try {
    const showcases = await getAllShowcases();
    return showcases.filter(showcase => showcase.status === 'active');
  } catch (error: any) {
    console.error('Error getting active showcases:', error);
    throw new Error('Failed to load showcases');
  }
};

// Subscribe to showcases (real-time updates)
export const subscribeToShowcases = (
  callback: (showcases: Showcase[]) => void,
  activeOnly: boolean = false
): (() => void) => {
  const q = query(
    collection(db, SHOWCASES_COLLECTION),
    orderBy('order', 'asc')
  );

  return onSnapshot(q, (snapshot) => {
    let showcases = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Showcase));

    if (activeOnly) {
      showcases = showcases.filter(showcase => showcase.status === 'active');
    }

    callback(showcases);
  }, (error) => {
    console.error('Error subscribing to showcases:', error);
    callback([]); // resolve with empty so loading stops
  });
};

// Create a new showcase
export const createShowcase = async (showcase: Omit<Showcase, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> => {
  try {
    const newShowcase = {
      ...showcase,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    const docRef = await addDoc(collection(db, SHOWCASES_COLLECTION), newShowcase);
    return docRef.id;
  } catch (error: any) {
    console.error('Error creating showcase:', error);
    throw new Error('Failed to create showcase');
  }
};

// Update a showcase
export const updateShowcase = async (
  id: string, 
  showcase: Partial<Omit<Showcase, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> => {
  try {
    const docRef = doc(db, SHOWCASES_COLLECTION, id);
    await updateDoc(docRef, {
      ...showcase,
      updatedAt: Timestamp.now()
    });
  } catch (error: any) {
    console.error('Error updating showcase:', error);
    throw new Error('Failed to update showcase');
  }
};

// Delete a showcase
export const deleteShowcase = async (id: string, imageUrl: string): Promise<void> => {
  try {
    // Delete image from storage
    await deleteShowcaseImage(imageUrl);
    
    // Delete document from Firestore
    await deleteDoc(doc(db, SHOWCASES_COLLECTION, id));
  } catch (error: any) {
    console.error('Error deleting showcase:', error);
    throw new Error('Failed to delete showcase');
  }
};

// Toggle showcase status
export const toggleShowcaseStatus = async (id: string, currentStatus: 'active' | 'inactive'): Promise<void> => {
  try {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    await updateShowcase(id, { status: newStatus });
  } catch (error: any) {
    console.error('Error toggling showcase status:', error);
    throw new Error('Failed to toggle showcase status');
  }
};
