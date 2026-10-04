import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import {
  addWishlistItem as addWishlistItemRemote,
  clearUserWishlist,
  mergeWishlistItems,
  removeWishlistItem as removeWishlistItemRemote,
  subscribeToUserWishlist,
} from '@/services/wishlistService';
import { BRAND } from '@/config/brand';

const WISHLIST_STORAGE_KEY = BRAND.storageKeys.wishlist;
const WISHLIST_UPDATED_EVENT = 'wishlist-updated';

interface WishlistItem {
  productId: string;
  addedAt: number;
}

const getWishlistStorageKey = (userId?: string | null) =>
  userId ? `${WISHLIST_STORAGE_KEY}:${userId}` : `${WISHLIST_STORAGE_KEY}:guest`;

const getWishlistFromStorage = (storageKey: string): string[] => {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const items: WishlistItem[] = JSON.parse(stored);
      return items.map(item => item.productId);
    }
  } catch (error) {
    console.error('Error reading wishlist from storage:', error);
  }
  return [];
};

const saveWishlistToStorage = (storageKey: string, productIds: string[]) => {
  try {
    const items: WishlistItem[] = productIds.map(productId => ({
      productId,
      addedAt: Date.now()
    }));
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch (error) {
    console.error('Error saving wishlist to storage:', error);
  }
};

const broadcastWishlistUpdate = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(WISHLIST_UPDATED_EVENT));
  }
};

/**
 * Compare two product-id arrays for set equality (order-insensitive). Used to
 * suppress redundant `setWishlist` calls that would otherwise cause the heart
 * icon to "flash" twice on a single toggle (optimistic update + broadcast +
 * Firestore snapshot all writing the same array).
 */
const sameWishlist = (a: string[], b: string[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const id of b) {
    if (!set.has(id)) return false;
  }
  return true;
};

const showSignInToast = () => {
  toast({
    title: 'Sign in to save to your wishlist',
    description: 'Your wishlist is kept with your account.',
    variant: 'destructive',
  });
};

export const useWishlist = () => {
  const { user } = useAuth();
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const mergedLocalWishlistRef = useRef<string | null>(null);
  // Tracks whether THIS hook instance just broadcast a change so the matching
  // self-broadcast handler can skip redundant re-syncs.
  const selfBroadcastRef = useRef(false);

  const storageKey = getWishlistStorageKey(user?.uid);

  // The latest wishlist, updated synchronously on every change. Mutations read
  // it (instead of the `wishlist` captured by the render that created them) so
  // several calls in one tick, such as checkout's "Move all to wishlist", each
  // build on the previous one instead of overwriting it with a stale copy.
  const wishlistRef = useRef<string[]>([]);

  const setWishlistIfChanged = useCallback((next: string[]) => {
    if (!sameWishlist(wishlistRef.current, next)) wishlistRef.current = next;
    setWishlist((prev) => (sameWishlist(prev, next) ? prev : next));
  }, []);

  const syncWishlist = useCallback(() => {
    setWishlistIfChanged(getWishlistFromStorage(storageKey));
  }, [storageKey, setWishlistIfChanged]);

  /**
   * Write the wishlist to storage and state. Pass a function to derive the
   * next list from the latest one (functional update), or an array to set it.
   */
  const updateWishlistCache = useCallback((
    update: string[] | ((current: string[]) => string[]),
    shouldBroadcast = true,
  ) => {
    const nextWishlist = typeof update === 'function' ? update(wishlistRef.current) : update;
    saveWishlistToStorage(storageKey, nextWishlist);
    setWishlistIfChanged(nextWishlist);
    if (shouldBroadcast) {
      selfBroadcastRef.current = true;
      broadcastWishlistUpdate();
    }
  }, [storageKey, setWishlistIfChanged]);

  const persistWishlist = useCallback((update: string[] | ((current: string[]) => string[])) => {
    updateWishlistCache(update, true);
  }, [updateWishlistCache]);

  useEffect(() => {
    syncWishlist();
  }, [syncWishlist]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === storageKey) {
        syncWishlist();
      }
    };

    const handleWishlistUpdated = () => {
      // Skip the broadcast we triggered ourselves — `updateWishlistCache`
      // already called `setWishlistIfChanged` on this instance, so re-reading
      // localStorage here would just produce a redundant render and cause the
      // wishlist heart to flicker.
      if (selfBroadcastRef.current) {
        selfBroadcastRef.current = false;
        return;
      }
      syncWishlist();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(WISHLIST_UPDATED_EVENT, handleWishlistUpdated);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(WISHLIST_UPDATED_EVENT, handleWishlistUpdated);
    };
  }, [storageKey, syncWishlist]);

  useEffect(() => {
    if (!user) {
      mergedLocalWishlistRef.current = null;
      setIsLoaded(true);
      syncWishlist();
      return;
    }

    setIsLoaded(false);

    const cachedWishlist = getWishlistFromStorage(storageKey);
    if (cachedWishlist.length) {
      setWishlistIfChanged(cachedWishlist);
    }

    const unsubscribe = subscribeToUserWishlist(
      user.uid,
      (remoteWishlist) => {
        const remoteProductIds = remoteWishlist.map((item) => item.productId);
        const localProductIds = getWishlistFromStorage(storageKey);

        if (mergedLocalWishlistRef.current !== user.uid) {
          mergedLocalWishlistRef.current = user.uid;

          const missingLocalItems = localProductIds.filter((productId) => !remoteProductIds.includes(productId));
          if (missingLocalItems.length) {
            const mergedWishlist = Array.from(new Set([...remoteProductIds, ...localProductIds]));
            updateWishlistCache(mergedWishlist, false);
            setIsLoaded(true);
            void mergeWishlistItems(user.uid, missingLocalItems).catch((error) => {
              console.error('Error merging local wishlist into Firestore:', error);
            });
            return;
          }
        }

        updateWishlistCache(remoteProductIds, false);
        setIsLoaded(true);
      },
      (error) => {
        console.error('Error syncing wishlist from Firestore:', error);
        syncWishlist();
        setIsLoaded(true);
      },
    );

    return () => unsubscribe();
  }, [storageKey, syncWishlist, updateWishlistCache, user]);

  const addToWishlist = useCallback((productId: string, productTitle?: string) => {
    if (!user) {
      showSignInToast();
      return false;
    }

    if (wishlistRef.current.includes(productId)) {
      return false;
    }

    persistWishlist((current) => (current.includes(productId) ? current : [...current, productId]));

    void addWishlistItemRemote(user.uid, productId).catch((error) => {
      console.error('Error adding wishlist item to Firestore:', error);
      // Undo only this item, so other changes made meanwhile are kept.
      persistWishlist((current) => current.filter((id) => id !== productId));
      toast({
        title: 'Could not save to your wishlist',
        description: 'Check your connection and try again.',
        variant: 'destructive',
      });
    });

    toast({
      title: 'Saved to wishlist',
      description: productTitle,
    });
    return true;
  }, [persistWishlist, user]);

  const removeFromWishlist = useCallback((productId: string, productTitle?: string) => {
    if (!wishlistRef.current.includes(productId)) {
      return false;
    }

    persistWishlist((current) => current.filter((id) => id !== productId));

    if (user) {
      void removeWishlistItemRemote(user.uid, productId).catch((error) => {
        console.error('Error removing wishlist item from Firestore:', error);
        // Put back only this item, so other changes made meanwhile are kept.
        persistWishlist((current) => (current.includes(productId) ? current : [...current, productId]));
        toast({
          title: 'Could not remove from your wishlist',
          description: 'Check your connection and try again.',
          variant: 'destructive',
        });
      });
    }

    toast({
      title: 'Removed from wishlist',
      description: productTitle,
      action: user
        ? { label: 'Undo', onClick: () => { addToWishlistRef.current(productId, productTitle); } }
        : undefined,
    });
    return true;
  }, [persistWishlist, user]);

  // Lets the Undo action call the newest addToWishlist after re-renders.
  const addToWishlistRef = useRef(addToWishlist);
  addToWishlistRef.current = addToWishlist;

  const toggleWishlist = useCallback((productId: string, productTitle?: string) => {
    if (!user) {
      showSignInToast();
      return;
    }

    if (wishlistRef.current.includes(productId)) {
      removeFromWishlist(productId, productTitle);
    } else {
      addToWishlist(productId, productTitle);
    }
  }, [user, addToWishlist, removeFromWishlist]);

  const isInWishlist = useCallback((productId: string) => {
    return wishlist.includes(productId);
  }, [wishlist]);

  const clearWishlist = useCallback(() => {
    const previousWishlist = [...wishlistRef.current];
    persistWishlist([]);

    if (user) {
      void clearUserWishlist(user.uid).catch((error) => {
        console.error('Error clearing wishlist from Firestore:', error);
        persistWishlist(previousWishlist);
      });
    }
  }, [persistWishlist, user]);

  return {
    wishlist,
    isLoaded,
    addToWishlist,
    removeFromWishlist,
    toggleWishlist,
    isInWishlist,
    clearWishlist,
    wishlistCount: wishlist.length,
  };
};
