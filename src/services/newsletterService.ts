import {
  collection,
  doc,
  setDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

const COL = 'newsletterSubscriptions';

export interface NewsletterSubscription {
  id: string;
  email: string;
  subscribedAt: Timestamp;
}

/**
 * Subscribe an email. Returns 'new' if added, 'exists' if already subscribed.
 *
 * The document id IS the email, so a repeat is detected by Firestore refusing
 * to overwrite it - there is no read. The previous version queried the whole
 * collection for a matching address before writing, which only worked because
 * the database allowed anyone to read the full subscriber list; under real
 * security rules a visitor can create their own entry and read nothing.
 */
export async function subscribeEmail(email: string): Promise<'new' | 'exists'> {
  const normalised = email.trim().toLowerCase();
  try {
    await setDoc(doc(db, COL, normalised), {
      email: normalised,
      subscribedAt: serverTimestamp(),
    });
    return 'new';
  } catch (error) {
    // The rules allow creating an entry but never changing one, so a second
    // subscribe with the same address is refused - which means "already in".
    if ((error as { code?: string })?.code === 'permission-denied') return 'exists';
    throw error;
  }
}

/** Realtime listener for admin — returns all subscriptions newest-first. */
export function listenNewsletterSubscriptions(
  onChange: (subs: NewsletterSubscription[]) => void
): Unsubscribe {
  const q = query(collection(db, COL), orderBy('subscribedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    onChange(
      snap.docs.map((d) => ({ id: d.id, ...d.data() } as NewsletterSubscription))
    );
  });
}
