# Shopping Cart Firebase Integration - Fix Progress

## Issue
Products added from shop pages and category pages were not appearing in the cart because these pages were using local cart state instead of the global Firebase-backed CartContext.

## Solution
Update all shop and category pages to use `CartContext` instead of local `useState` for cart management.

## Progress Status

### ✅ COMPLETED: Shop Pages (6/6)
All shop pages have been successfully updated:

1. ✅ ShopNecklaces.tsx
2. ✅ ShopRings.tsx
3. ✅ ShopBracelets.tsx
4. ✅ ShopEarrings.tsx
5. ✅ ShopPendants.tsx
6. ✅ ShopAnklets.tsx

**Changes Applied:**
- Added `import { useCart } from "@/contexts/CartContext"`
- Replaced `const [cart, setCart] = useState<CartItem[]>([])` with `const { addToCart: addToCartContext } = useCart()`
- Removed `interface CartItem` declarations
- Converted `addToCart` to async function using `addToCartContext`
- Removed unused cart calculations (`cartItemCount`, `cartTotal`)

### 🔄 IN PROGRESS: Category Pages (6/18)
CartItem interface removed and imports added, but state and functions still need updating:

**Completed (Interface + Import):**
1. ✅ DiamondRings.tsx
2. ✅ DiamondNecklaces.tsx
3. ✅ DiamondBracelets.tsx
4. ✅ GoldRings.tsx
5. ✅ GoldNecklaces.tsx
6. ✅ GoldBracelets.tsx

**Import Added Only (need interface removal + state update):**
7. ⏳ SilverNecklaces.tsx
8. ⏳ SilverBracelets.tsx
9. ⏳ GemstoneRings.tsx
10. ⏳ GemstoneNecklaces.tsx
11. ⏳ GemstoneBracelets.tsx
12. ⏳ PearlNecklaces.tsx
13. ⏳ PearlBracelets.tsx
14. ⏳ WeddingRings.tsx
15. ⏳ EngagementRings.tsx
16. ⏳ FashionRings.tsx
17. ⏳ CrossNecklaces.tsx
18. ⏳ BangleBracelets.tsx

## Remaining Tasks for Category Pages

For each of the remaining 12 category pages, apply these changes:

### 1. Remove CartItem Interface
**Find:**
```tsx
interface CartItem {
  product: UIProduct;
  quantity: number;
}
```
**Replace with:** (delete it completely)

### 2. Replace Cart State
**Find:**
```tsx
const [cart, setCart] = useState<CartItem[]>([]);
```
**Replace with:**
```tsx
const { addToCart: addToCartContext } = useCart();
```

### 3. Update addToCart Function
**Find:**
```tsx
const addToCart = (product: UIProduct) => {
  setCart((prev) => {
    const existingItem = prev.find((item) => item.product.id === product.id);
    if (existingItem) {
      showToast('Quantity updated in cart', 'success', product.title);
      return prev.map((item) =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
    } else {
      showToast('Added to cart', 'success', product.title);
      return [...prev, { product, quantity: 1 }];
    }
  });
};
```

**Replace with** (adjust category name for each file):
```tsx
const addToCart = async (product: UIProduct) => {
  try {
    await addToCartContext({
      id: product.id,
      name: product.title,
      price: product.price,
      image: product.image,
      category: 'CATEGORY_NAME', // e.g., 'Silver Necklaces', 'Gemstone Rings'
    });
    showToast('Added to cart', 'success', product.title);
  } catch (error) {
    console.error('Error adding to cart:', error);
    showToast('Failed to add to cart', 'error', product.title);
  }
};
```

### 4. Remove Cart Calculations
**Find and delete:**
```tsx
// Calculate cart totals
const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
```

## Category Names Reference
Use these exact category names when updating each file:

| File | Category Name |
|------|---------------|
| SilverNecklaces.tsx | 'Silver Necklaces' |
| SilverBracelets.tsx | 'Silver Bracelets' |
| GemstoneRings.tsx | 'Gemstone Rings' |
| GemstoneNecklaces.tsx | 'Gemstone Necklaces' |
| GemstoneBracelets.tsx | 'Gemstone Bracelets' |
| PearlNecklaces.tsx | 'Pearl Necklaces' |
| PearlBracelets.tsx | 'Pearl Bracelets' |
| WeddingRings.tsx | 'Wedding Rings' |
| EngagementRings.tsx | 'Engagement Rings' |
| FashionRings.tsx | 'Fashion Rings' |
| CrossNecklaces.tsx | 'Cross Necklaces' |
| BangleBracelets.tsx | 'Bangle Bracelets' |

## Testing Checklist
After all updates are complete:

- [ ] Test adding products from each shop page
- [ ] Test adding products from each category page
- [ ] Verify cart drawer opens with added items
- [ ] Check Firebase console for cart data
- [ ] Test cart persistence across page navigation
- [ ] Test cart syncing for logged-in users
- [ ] Verify guest cart migration to Firebase on login

## Expected Behavior After Fix
✅ Products added from any page should appear in the cart drawer  
✅ Cart badge in header should update in real-time  
✅ Cart should persist across page refreshes  
✅ Logged-in users' carts sync to Firebase  
✅ Guest carts migrate to Firebase on login
