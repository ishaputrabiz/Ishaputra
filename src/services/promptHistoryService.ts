import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export type PromptCategory = 'product-model' | 'product-studio' | 'hero-section' | 'custom';

export interface PromptHistoryEntry {
  id: string;
  category: PromptCategory;
  prompt: string;
  inputs?: Record<string, string>;
  modelMode?: 'auto' | 'yes' | 'no';
  createdAt: Date;
}

const COLLECTION = 'promptHistory';

export async function savePromptToHistory(
  entry: Omit<PromptHistoryEntry, 'id' | 'createdAt'>
): Promise<string> {
  const docRef = await addDoc(collection(db, COLLECTION), {
    ...entry,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deletePromptFromHistory(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}

export function subscribePromptHistory(
  callback: (entries: PromptHistoryEntry[]) => void,
  max = 50
): () => void {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(
    q,
    (snap) => {
      const entries: PromptHistoryEntry[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const ts = data.createdAt as Timestamp | undefined;
        return {
          id: d.id,
          category: (data.category as PromptCategory) ?? 'custom',
          prompt: (data.prompt as string) ?? '',
          inputs: (data.inputs as Record<string, string>) ?? undefined,
          modelMode: (data.modelMode as 'auto' | 'yes' | 'no') ?? undefined,
          createdAt: ts?.toDate ? ts.toDate() : new Date(),
        };
      });
      callback(entries);
    },
    (err) => {
      console.error('[promptHistory] subscribe error:', err);
      callback([]);
    }
  );
}
