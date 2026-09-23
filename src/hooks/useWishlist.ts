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

const WISHLIST_STORAGE_KEY = 'sree_rasthu_wishlist';
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

export const useWishlist = () => {
  const { user } = useAuth();
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const mergedLocalWishlistRef = useRef<string | null>(null);
  // Tracks whether THIS hook instance just broadcast a change so the matching
  // self-broadcast handler can skip redundant re-syncs.
  const selfBroadcastRef = useRef(false);

  const storageKey = getWishlistStorageKey(user?.uid);

  const setWishlistIfChanged = useCallback((next: string[]) => {
    setWishlist((prev) => (sameWishlist(prev, next) ? prev : next));
  }, []);

  const syncWishlist = useCallback(() => {
    setWishlistIfChanged(getWishlistFromStorage(storageKey));
  }, [storageKey, setWishlistIfChanged]);

  const updateWishlistCache = useCallback((nextWishlist: string[], shouldBroadcast = true) => {
    saveWishlistToStorage(storageKey, nextWishlist);
    setWishlistIfChanged(nextWishlist);
    if (shouldBroadcast) {
      selfBroadcastRef.current = true;
      broadcastWishlistUpdate();
    }
  }, [storageKey, setWishlistIfChanged]);

  const persistWishlist = useCallback((nextWishlist: string[]) => {
    updateWishlistCache(nextWishlist, true);
  }, [updateWishlistCache]);

  const rollbackWishlist = useCallback((previousWishlist: string[]) => {
    updateWishlistCache(previousWishlist, true);
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
      toast({
        title: "Login Required",
        description: "Please login or signup to add items to your wishlist",
        variant: "destructive",
      });
      return false;
    }

    if (wishlist.includes(productId)) {
      return false;
    }

    const previousWishlist = [...wishlist];
    const nextWishlist = [...wishlist, productId];
    persistWishlist(nextWishlist);

    void addWishlistItemRemote(user.uid, productId).catch((error) => {
      console.error('Error adding wishlist item to Firestore:', error);
      rollbackWishlist(previousWishlist);
      toast({
        title: 'Wishlist Sync Failed',
        description: 'The item was not saved to your account. Please try again.',
        variant: 'destructive',
      });
    });

    toast({
      title: "Added to Wishlist",
      description: productTitle || "Product added to your wishlist",
    });
    return true;
  }, [persistWishlist, rollbackWishlist, user, wishlist]);

  const removeFromWishlist = useCallback((productId: string, productTitle?: string) => {
    const previousWishlist = [...wishlist];
    const nextWishlist = wishlist.filter(id => id !== productId);
    persistWishlist(nextWishlist);

    if (user) {
      void removeWishlistItemRemote(user.uid, productId).catch((error) => {
        console.error('Error removing wishlist item from Firestore:', error);
        rollbackWishlist(previousWishlist);
        toast({
          title: 'Wishlist Sync Failed',
          description: 'The item could not be removed from your account. Please try again.',
          variant: 'destructive',
        });
      });
    }

    toast({
      title: "Removed from Wishlist",
      description: productTitle || "Product removed from your wishlist",
      variant: "default",
    });
    return true;
  }, [persistWishlist, rollbackWishlist, user, wishlist]);

  const toggleWishlist = useCallback((productId: string, productTitle?: string) => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please login or signup to add items to your wishlist",
        variant: "destructive",
      });
      return;
    }

    const isInWishlist = wishlist.includes(productId);
    if (isInWishlist) {
      removeFromWishlist(productId, productTitle);
    } else {
      addToWishlist(productId, productTitle);
    }
  }, [user, wishlist, addToWishlist, removeFromWishlist]);

  const isInWishlist = useCallback((productId: string) => {
    return wishlist.includes(productId);
  }, [wishlist]);

  const clearWishlist = useCallback(() => {
    const previousWishlist = [...wishlist];
    persistWishlist([]);

    if (user) {
      void clearUserWishlist(user.uid).catch((error) => {
        console.error('Error clearing wishlist from Firestore:', error);
        rollbackWishlist(previousWishlist);
      });
    }
  }, [persistWishlist, rollbackWishlist, user, wishlist]);

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
