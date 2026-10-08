/**
 * Number of WhatsApp conversations with unread customer messages, for the
 * admin sidebar badge. One listener on threads where unreadCount > 0
 * (single-field range query, no composite index needed), capped at 100 docs.
 */
import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';

export function useWhatsAppUnread(enabled: boolean) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const q = query(collection(db, 'whatsappThreads'), where('unreadCount', '>', 0), limit(100));
    return onSnapshot(
      q,
      (snap) => setCount(snap.size),
      () => setCount(0),
    );
  }, [enabled]);
  return count;
}
