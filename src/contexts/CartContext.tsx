import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { doc, setDoc, getDoc, onSnapshot, updateDoc, deleteField } from 'firebase/firestore';
import { db, auth } from '@/config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { getProduct } from '@/services/productService';
import { fetchLiveProductInfo } from '@/services/livePricing';
import { useCatalogRevision } from '@/services/productCache';

// Cart Item Interface
export interface CartItem {
  id: string;
  name: string;
  price: number;
  /** Real MRP / original price, when the product genuinely has one (> price). */
  originalPrice?: number;
  image: string;
  quantity: number;
  stock?: number;
  category?: string;
  weight?: string;
  purity?: string;
}

// Cart Context Interface
interface CartContextType {
  items: CartItem[];
  /**
   * Lines that can no longer be bought, keyed by product id, with the reason.
   * Derived from live product data and never saved into the cart itself.
   */
  unavailable: Record<string, string>;
  isCartOpen: boolean;
  addToCart: (item: Omit<CartItem, 'quantity'>, quantity?: number) => boolean;
  removeFromCart: (id: string) => Promise<void>;
  updateQuantity: (id: string, quantity: number) => boolean;
  /** Re-price a line against the live catalogue (see `preflightCart`). */
  updateCartPrice: (id: string, price: number) => void;
  clearCart: () => Promise<void>;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  totalItems: number;
  subtotal: number;
  loading: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

// Local storage key for guest users
const CART_STORAGE_KEY = 'sree_rasthu_cart';

const buildStockMessage = (productName: string, availableStock: number) => {
  if (availableStock <= 0) {
    return `${productName} is currently out of stock.`;
  }

  if (availableStock === 1) {
    return `Only 1 left in stock for ${productName}.`;
  }

  return `Only ${availableStock} left in stock for ${productName}.`;
};

// Helper: save items to localStorage
const saveToLocalStorage = (cartItems: CartItem[]) => {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
  } catch (e) {
    console.error('localStorage save error:', e);
  }
};

// Helper: load items from localStorage
const loadFromLocalStorage = (): CartItem[] => {
  try {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

const hydrateCartItemsWithStock = async (cartItems: CartItem[]): Promise<CartItem[]> => {
  const missingStockIds = Array.from(
    new Set(
      cartItems
        .filter((item) => typeof item.stock !== 'number')
        .map((item) => item.id)
    )
  );

  if (!missingStockIds.length) {
    return cartItems;
  }

  const stockById = new Map<string, number>();

  await Promise.all(
    missingStockIds.map(async (productId) => {
      try {
        const product = await getProduct(productId);
        if (typeof product?.inventory?.stock === 'number') {
          stockById.set(productId, product.inventory.stock);
        }
      } catch (error) {
        console.warn('Failed to hydrate cart stock for product:', productId, error);
      }
    })
  );

  if (!stockById.size) {
    return cartItems;
  }

  return cartItems.map((item) => (
    typeof item.stock === 'number' || !stockById.has(item.id)
      ? item
      : { ...item, stock: stockById.get(item.id) }
  ));
};

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => loadFromLocalStorage());
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const firebaseSyncRef = useRef(false);
  const pendingOpRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!items.some((item) => typeof item.stock !== 'number')) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const hydratedItems = await hydrateCartItemsWithStock(items);

      if (cancelled) {
        return;
      }

      const changed = hydratedItems.some((item, index) => item.stock !== items[index]?.stock);
      if (!changed) {
        return;
      }

      setItems(hydratedItems);

      if (currentUserId) {
        try {
          const cartRef = doc(db, 'carts', currentUserId);
          const itemsRecord = Object.fromEntries(hydratedItems.map((item) => [item.id, item]));
          await setDoc(cartRef, {
            items: itemsRecord,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch (error) {
          console.error('Failed to persist hydrated cart stock:', error);
        }
      } else {
        saveToLocalStorage(hydratedItems);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items, currentUserId]);

  /**
   * Keep cart prices honest.
   *
   * Every `addToCart` call site passes the product's *stored* price, which is
   * the wrong number for a silver-priced item: the product card quotes the live
   * rate per gram, and /api/create-order charges that same live figure. The
   * cart sat in between with a third, stale value, and the payment was then
   * refused for "Order total mismatch". Admin price edits drifted the same way.
   *
   * Re-pricing here - once per distinct set of products in the cart, not on
   * every quantity tweak - means the cart, the product page and the server all
   * quote the same number, whatever the call site passed in.
   */
  const idsKey = items.map((i) => i.id).sort().join(',');
  /**
   * Cart lines that can no longer be bought.
   *
   * A product that sold out (and so was hidden) or was taken down stays in any
   * cart it was already in. Before this the cart kept showing it as normal and
   * the customer only found out at the very end, when the pre-payment check
   * refused them. Flagging it as the cart loads lets them remove it first.
   */
  const [unavailable, setUnavailable] = useState<Record<string, string>>({});
  // Re-check whenever the catalog republishes - which every sale does - so a
  // piece that sells out while it sits in someone's cart is flagged live.
  const catalogRevision = useCatalogRevision();

  useEffect(() => {
    if (!idsKey) {
      setUnavailable({});
      return;
    }
    let cancelled = false;

    void (async () => {
      const live = await fetchLiveProductInfo(idsKey.split(','));
      if (cancelled || live.size === 0) return;

      const flagged: Record<string, string> = {};
      for (const [id, info] of live) {
        // Only definite answers count: an unreadable product is left alone
        // rather than wrongly flagged on a network blip.
        if (!info.exists || !info.isActive) flagged[id] = 'No longer available';
        else if (info.stock <= 0) flagged[id] = 'Out of stock';
      }
      setUnavailable(flagged);

      setItems((prev) => {
        let changed = false;
        const next = prev.map((item) => {
          const info = live.get(item.id);
          // A rupee of drift is rounding; more is a real change worth showing.
          if (!info || !info.exists || Math.abs(info.price - item.price) <= 1) return item;
          changed = true;
          return { ...item, price: info.price };
        });
        if (!changed) return prev;

        // Persist so the corrected price survives a reload, and so the figure
        // the customer agreed to is the one stored against their cart.
        if (currentUserId) {
          const cartRef = doc(db, 'carts', currentUserId);
          const itemsRecord = Object.fromEntries(next.map((item) => [item.id, item]));
          void setDoc(cartRef, {
            items: itemsRecord,
            updatedAt: new Date().toISOString(),
          }, { merge: true }).catch((error) => {
            console.error('Failed to persist re-priced cart:', error);
          });
        } else {
          saveToLocalStorage(next);
        }
        return next;
      });
    })();

    return () => { cancelled = true; };
  }, [idsKey, currentUserId, catalogRevision]);

  // Listen to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUserId(user?.uid || null);
      setAuthResolved(true);

      // Guest cart migration removed — add-to-cart now requires auth
    });
    return () => unsubscribe();
  }, []);

  // Firebase real-time listener for logged-in users
  useEffect(() => {
    if (!currentUserId) return;

    setLoading(true);
    firebaseSyncRef.current = true;

    const cartRef = doc(db, 'carts', currentUserId);
    const unsubscribe = onSnapshot(
      cartRef,
      (snapshot) => {
        // Skip snapshot updates while a local operation is in progress
        if (pendingOpRef.current) return;
        if (snapshot.exists()) {
          const data = snapshot.data();
          const cartItems: CartItem[] = data.items ? Object.values(data.items) : [];
          setItems(cartItems);
        } else {
          setItems([]);
        }
        setLoading(false);
      },
      (error: any) => {
        console.error('Firebase cart listener error:', error?.code, error?.message);
        // Fall back to localStorage if Firebase fails
        firebaseSyncRef.current = false;
        setItems(loadFromLocalStorage());
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
      firebaseSyncRef.current = false;
    };
  }, [currentUserId]);

  // Persist to localStorage whenever items change (for guest users & as fallback)
  useEffect(() => {
    if (!currentUserId) {
      saveToLocalStorage(items);
    }
  }, [items, currentUserId]);

  // ─── ADD TO CART ───
  // Always update local state immediately (optimistic), then sync to Firebase
  const addToCart = (item: Omit<CartItem, 'quantity'>, quantity = 1) => {
    const existing = items.find((cartItem) => cartItem.id === item.id);
    const availableStock = typeof item.stock === 'number' ? item.stock : existing?.stock;
    const requestedQuantity = (existing?.quantity || 0) + quantity;

    if (typeof availableStock === 'number' && requestedQuantity > availableStock) {
      toast({
        title: 'Stock limit reached',
        description: buildStockMessage(item.name, availableStock),
        variant: 'destructive',
      });
      return false;
    }

    setItems((prev) => {
      const current = prev.find((cartItem) => cartItem.id === item.id);
      if (current) {
        return prev.map((cartItem) =>
          cartItem.id === item.id
            ? {
                ...cartItem,
                quantity: cartItem.quantity + quantity,
                stock: typeof item.stock === 'number' ? item.stock : cartItem.stock,
              }
            : cartItem
        );
      }

      return [...prev, { ...item, quantity, stock: item.stock }];
    });

    if (currentUserId) {
      void (async () => {
        try {
          const cartRef = doc(db, 'carts', currentUserId);
          const cartSnap = await getDoc(cartRef);

          let updatedItems: Record<string, CartItem> = {};
          if (cartSnap.exists()) {
            updatedItems = cartSnap.data().items || {};
          }

          if (updatedItems[item.id]) {
            updatedItems[item.id].quantity += quantity;
            if (typeof item.stock === 'number') {
              updatedItems[item.id].stock = item.stock;
            }
          } else {
            updatedItems[item.id] = { ...item, quantity, stock: item.stock };
          }

          await setDoc(cartRef, {
            items: updatedItems,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch (error: any) {
          console.error('Firebase sync failed for addToCart:', error?.code);
          saveToLocalStorage(items);
        }
      })();
    }

    return true;
  };

  // ─── REMOVE FROM CART ───
  const removeFromCart = async (id: string) => {
    // Block onSnapshot from overwriting during this operation
    pendingOpRef.current = true;
    
    // Optimistic local update
    setItems((prev) => prev.filter((item) => item.id !== id));

    if (currentUserId) {
      try {
        const cartRef = doc(db, 'carts', currentUserId);
        await updateDoc(cartRef, {
          [`items.${id}`]: deleteField(),
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Firebase sync failed for removeFromCart:', error);
      } finally {
        pendingOpRef.current = false;
      }
    } else {
      pendingOpRef.current = false;
    }
  };

  // ─── UPDATE QUANTITY ───
  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      void removeFromCart(id);
      return true;
    }

    const existing = items.find((item) => item.id === id);
    if (existing && typeof existing.stock === 'number' && quantity > existing.stock) {
      toast({
        title: 'Stock limit reached',
        description: buildStockMessage(existing.name, existing.stock),
        variant: 'destructive',
      });
      return false;
    }

    // Block onSnapshot from overwriting during this operation
    pendingOpRef.current = true;

    // Optimistic local update
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item))
    );

    if (currentUserId) {
      void (async () => {
        try {
          const cartRef = doc(db, 'carts', currentUserId);
          const cartSnap = await getDoc(cartRef);
          if (cartSnap.exists()) {
            const updatedItems = { ...cartSnap.data().items };
            if (updatedItems[id]) {
              updatedItems[id].quantity = quantity;
              await setDoc(cartRef, {
                items: updatedItems,
                updatedAt: new Date().toISOString(),
              }, { merge: true });
            }
          }
        } catch (error) {
          console.error('Firebase sync failed for updateQuantity:', error);
        } finally {
          pendingOpRef.current = false;
        }
      })();
    } else {
      pendingOpRef.current = false;
    }

    return true;
  };

  // ─── UPDATE PRICE ───
  /**
   * Bring a line's price back in line with the live product.
   *
   * Cart lines store the price from the moment the item was added, so an admin
   * price edit (or a move in the silver rate) left the cart quoting a figure the
   * server would never charge - /api/create-order re-prices from Firestore and
   * refused the payment with "Order total mismatch". Checkout now re-checks
   * before taking payment and calls this so the customer sees the real total.
   */
  const updateCartPrice = (id: string, price: number) => {
    pendingOpRef.current = true;

    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, price } : item))
    );

    if (currentUserId) {
      void (async () => {
        try {
          const cartRef = doc(db, 'carts', currentUserId);
          const cartSnap = await getDoc(cartRef);
          if (cartSnap.exists()) {
            const updatedItems = { ...cartSnap.data().items };
            if (updatedItems[id]) {
              updatedItems[id].price = price;
              await setDoc(cartRef, {
                items: updatedItems,
                updatedAt: new Date().toISOString(),
              }, { merge: true });
            }
          }
        } catch (error) {
          console.error('Firebase sync failed for updateCartPrice:', error);
        } finally {
          pendingOpRef.current = false;
        }
      })();
    } else {
      pendingOpRef.current = false;
    }
  };

  // ─── CLEAR CART ───
  const clearCart = async () => {
    setItems([]);

    if (currentUserId) {
      try {
        const cartRef = doc(db, 'carts', currentUserId);
        await setDoc(cartRef, {
          items: {},
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Firebase sync failed for clearCart:', error);
      }
    }
  };

  // Cart drawer controls
  const openCart = () => setIsCartOpen(true);
  const closeCart = () => setIsCartOpen(false);
  const toggleCart = () => setIsCartOpen((prev) => !prev);

  // Calculate totals
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const value: CartContextType = {
    items,
    unavailable,
    isCartOpen,
    addToCart,
    removeFromCart,
    updateQuantity,
    updateCartPrice,
    clearCart,
    openCart,
    closeCart,
    toggleCart,
    totalItems,
    subtotal,
    loading,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

// Custom hook to use cart context
export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
