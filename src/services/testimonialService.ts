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
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { uploadImage } from '@/services/mediaStorage';

export interface Testimonial {
  id?: string;
  title: string;
  quote: string;
  author: string;
  role: string;
  rating: number; // 1–5
  avatarType: 'upload' | 'url' | 'avatar';
  avatarUrl: string; // cloudinary URL, external URL, or built-in avatar key
  order: number;
  status: 'active' | 'inactive';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const COLLECTION = 'testimonials';

// Upload avatar (JPG/PNG/WebP, max 500 KB - see mediaStorage)
export const uploadTestimonialAvatar = async (file: File): Promise<string> => {
  const result = await uploadImage(file, { category: 'testimonials' });
  return result.url;
};

export const getAllTestimonials = async (): Promise<Testimonial[]> => {
  const q = query(collection(db, COLLECTION), orderBy('order', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Testimonial));
};

export const subscribeToTestimonials = (
  callback: (t: Testimonial[]) => void,
  activeOnly = false
): (() => void) => {
  const q = query(collection(db, COLLECTION), orderBy('order', 'asc'));
  return onSnapshot(q, (snap) => {
    let data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Testimonial));
    if (activeOnly) data = data.filter((t) => t.status === 'active');
    callback(data);
  });
};

export const createTestimonial = async (
  t: Omit<Testimonial, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...t,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return ref.id;
};

export const updateTestimonial = async (
  id: string,
  t: Partial<Omit<Testimonial, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> => {
  await updateDoc(doc(db, COLLECTION, id), { ...t, updatedAt: Timestamp.now() });
};

export const deleteTestimonial = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTION, id));
};
