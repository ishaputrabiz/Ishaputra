# 🧪 TESTING THE FIREBASE CART - Step by Step

## 📋 Pre-Flight Check

Before testing, open your **Browser Console** (`F12` or `Ctrl+Shift+I`) to see detailed logs.

---

## 🎯 TEST 1: Guest User (localStorage)

### Steps:
1. **Make sure you're logged OUT**
2. Open browser console
3. Click "Add to Cart" on any product
4. **Watch console logs:**
   ```
   👻 Loading cart from localStorage (guest)
   🛒 Adding to cart: Product Name
   ✨ Added new item: Product Name
   💾 Saved to localStorage: 1 items
   ```
5. **Cart should:**
   - ✅ Open automatically
   - ✅ Show the item
   - ✅ Display correct price in ₹
   - ✅ Show quantity controls (+/-)

6. **Add same item again:**
   ```
   🛒 Adding to cart: Product Name
   ➕ Incremented quantity for: Product Name
   💾 Saved to localStorage: 1 items
   ```
   - ✅ Quantity should increase to 2
   - ✅ Price should double

7. **Refresh the page:**
   ```
   👻 Loading cart from localStorage (guest)
   📦 Loaded 1 items from localStorage
   ```
   - ✅ Cart items still there
   - ✅ No data lost

---

## 🎯 TEST 2: Logged-In User (Firebase)

### Steps:
1. **Log in to your account**
2. Console shows:
   ```
   🔐 Auth state changed: abc123xyz (your user ID)
   👤 Loading cart from Firebase for user: abc123xyz
   ```

3. **If you had guest items:**
   ```
   📦 Migrating guest cart to Firebase: 1 items
   ✅ Guest cart migrated successfully
   ```

4. **Add a new item:**
   ```
   🛒 Adding to cart: New Product
   ✨ Added new item: New Product
   ✅ Firebase cart updated successfully
   🔄 Firebase cart updated: 2 items
   ```

5. **Check Firestore Console:**
   - Go to Firebase Console → Firestore Database
   - Look for collection: `carts`
   - Find your document: `{userId}`
   - See your items stored!

---

## 🎯 TEST 3: Real-Time Sync

### Steps:
1. **Stay logged in**
2. **Open TWO browser tabs** with your app
3. **In Tab 1:** Add an item
   ```
   🛒 Adding to cart: Item A
   ✅ Firebase cart updated successfully
   ```
4. **In Tab 2:** Watch console
   ```
   🔄 Firebase cart updated: 3 items
   ```
   - ✅ Cart automatically updates in Tab 2!
   - ✅ No refresh needed!

---

## 🎯 TEST 4: Quantity Controls

### Steps:
1. Open cart
2. Click **+** button on an item
   ```
   🔢 Updating quantity for product-123 to 3
   ✅ Quantity updated in Firebase
   🔄 Firebase cart updated: 3 items
   ```
   - ✅ Quantity increases
   - ✅ Subtotal updates
   - ✅ Total updates

3. Click **-** button
   ```
   🔢 Updating quantity for product-123 to 2
   ✅ Quantity updated in Firebase
   ```
   - ✅ Quantity decreases

4. Click **-** when quantity is 1
   ```
   🗑️ Removing from cart: product-123
   ✅ Item removed from Firebase
   ```
   - ✅ Item completely removed

---

## 🎯 TEST 5: Remove Items

### Steps:
1. Click **trash icon** on an item
   ```
   🗑️ Removing from cart: product-456
   ✅ Item removed from Firebase
   🔄 Firebase cart updated: 2 items
   ```
   - ✅ Item disappears with animation
   - ✅ Subtotal updates
   - ✅ Item count badge updates

---

## 🎯 TEST 6: Clear Cart

### Steps:
1. In your code, call `clearCart()`
   ```javascript
   const { clearCart } = useCart();
   clearCart();
   ```
2. Console shows:
   ```
   🧹 Clearing cart
   ✅ Firebase cart cleared
   🔄 Firebase cart updated: 0 items
   ```
   - ✅ All items removed
   - ✅ Empty state appears

---

## 🎯 TEST 7: Price Calculations

### Test Subtotal:
- Item A: ₹2,000 × 2 = ₹4,000
- Item B: ₹3,000 × 1 = ₹3,000
- **Subtotal: ₹7,000** ✅

### Test Delivery:
- If subtotal ≥ ₹5,000: **FREE** ✅
- If subtotal < ₹5,000: **₹200** ✅

### Test Total:
- Subtotal + Delivery = Total ✅

### Test Formatting:
- ₹7,000 (not $7,000.00) ✅
- ₹12,345 (not $12,345.00) ✅

---

## 🎯 TEST 8: Error Handling

### Force an error:
1. Disconnect internet
2. Try to add item
   ```
   🛒 Adding to cart: Product
   ❌ Error adding to cart: [Firebase Error]
   ```
3. User sees alert: "Failed to add item to cart. Please try again."
4. ✅ No app crash
5. ✅ Graceful error message

---

## 🎯 TEST 9: Cross-Device Sync

### Steps:
1. Log in on **Computer**
2. Add items to cart
3. Log in on **Phone** with same account
4. Open cart
5. ✅ Same items appear!
6. Add item on phone
7. Check computer
8. ✅ New item appears automatically!

---

## 🎯 TEST 10: Login/Logout Flow

### Test A: Guest → Login
1. Start as guest
2. Add 2 items (localStorage)
3. Log in
   ```
   📦 Migrating guest cart to Firebase: 2 items
   ✅ Guest cart migrated successfully
   ```
4. ✅ Items now in Firebase
5. ✅ localStorage cleared

### Test B: Logout → Login
1. Log out
   ```
   🔐 Auth state changed: Guest
   👻 Loading cart from localStorage (guest)
   📦 Loaded 0 items from localStorage
   ```
2. Cart is empty (localStorage is fresh)
3. Log back in
   ```
   🔐 Auth state changed: abc123xyz
   👤 Loading cart from Firebase for user: abc123xyz
   🔄 Firebase cart updated: 2 items
   ```
4. ✅ Items reappear from Firebase!

---

## 📊 EXPECTED CONSOLE LOG PATTERNS

### Adding First Item (Guest):
```
👻 Loading cart from localStorage (guest)
🛒 Adding to cart: Silver Necklace
✨ Added new item: Silver Necklace
💾 Saved to localStorage: 1 items
```

### Adding First Item (Logged-In):
```
👤 Loading cart from Firebase for user: abc123
🛒 Adding to cart: Silver Ring
✨ Added new item: Silver Ring
✅ Firebase cart updated successfully
🔄 Firebase cart updated: 1 items
```

### Incrementing Quantity:
```
🛒 Adding to cart: Silver Ring
➕ Incremented quantity for: Silver Ring
✅ Firebase cart updated successfully
🔄 Firebase cart updated: 1 items
```

### Removing Item:
```
🗑️ Removing from cart: product-123
✅ Item removed from Firebase
🔄 Firebase cart updated: 0 items
```

---

## ✅ SUCCESS CHECKLIST

- [ ] Guest can add items (localStorage)
- [ ] Items persist on page refresh (guest)
- [ ] Logged-in user can add items (Firebase)
- [ ] Guest cart migrates to Firebase on login
- [ ] Real-time sync works across tabs
- [ ] Quantity controls work (+ and -)
- [ ] Remove item works (trash icon)
- [ ] Subtotal calculates correctly
- [ ] Delivery charge shows correctly
- [ ] Total price is accurate
- [ ] Indian Rupee (₹) formatting works
- [ ] Loading state appears briefly
- [ ] Empty state shows when cart is empty
- [ ] Cart badge shows correct item count
- [ ] Console logs are detailed and helpful
- [ ] No errors in console
- [ ] Cross-device sync works (if logged in)
- [ ] Toast notifications appear on add/remove
- [ ] Cart opens automatically when item added

---

## 🐛 TROUBLESHOOTING

### Cart not opening?
**Check console:**
```
🛒 Adding to cart: Product Name
✨ Added new item: Product Name
```
If you see this but cart doesn't open, check `isCartOpen` state.

### Items not appearing?
**Check console:**
```
👤 Loading cart from Firebase for user: abc123
🔄 Firebase cart updated: 0 items
```
If it says 0 items but you added some, check Firestore rules.

### Firebase permission error?
**Console shows:**
```
❌ Firebase listener error: Missing or insufficient permissions
```
**Solution:** Add Firestore security rules (see FIREBASE_CART_FIX.md)

### Items not persisting?
**For guests:** Check if localStorage is enabled
**For logged-in:** Check Firebase connection and internet

### Real-time not working?
**Check:** Are you logged in with the same account in both tabs?
**Console should show:** `🔄 Firebase cart updated: X items`

---

## 🎉 ALL TESTS PASSED?

If all tests pass:
- ✅ Cart is fully functional
- ✅ Firebase integration works
- ✅ Real-time sync is active
- ✅ Error handling is solid
- ✅ Ready for production!

**You're good to go! 🚀**
