# 🛒 Shopping Cart System - Sree Rasthu Silvers

## Overview

An advanced, interactive shopping cart drawer system built for luxury e-commerce. Features smooth animations, real-time calculations, and persistent storage using React Context API.

---

## ✨ Features

### Core Functionality
- **Slide-over Drawer**: Smooth slide-in animation from the right side
- **Real-time Quantity Management**: Increment/decrement with immediate updates
- **Persistent Storage**: Cart saves to localStorage across sessions
- **Indian Rupee (₹) Display**: All prices formatted in INR
- **Responsive Design**: Optimized for mobile and desktop
- **Empty State**: Beautiful empty cart state with call-to-action

### Advanced Features
- **Smart Delivery Calculation**: 
  - FREE delivery for orders ≥ ₹5,000
  - ₹200 delivery charge for orders < ₹5,000
  - Real-time progress indicator
- **Micro-interactions**: 
  - Buttery smooth 60fps animations
  - Hover states on all interactive elements
  - Animated item additions/removals
- **Cart Badge**: Live item count on cart icon
- **Trust Indicators**: Security and return policy badges

---

## 🚀 Usage

### 1. Adding Items to Cart

The cart is globally available through the `useCart()` hook:

```tsx
import { useCart } from '@/contexts/CartContext';

function YourComponent() {
  const { addToCart } = useCart();

  const handleAddToCart = () => {
    addToCart({
      id: 'product-123',
      name: 'Silver Necklace',
      price: 4500,
      image: '/path/to/image.jpg',
      category: 'Necklaces',
      weight: '25g',      // Optional
      purity: '92.5%'     // Optional
    });
  };

  return <button onClick={handleAddToCart}>Add to Cart</button>;
}
```

### 2. Opening/Closing Cart

```tsx
const { openCart, closeCart, toggleCart } = useCart();

// Open cart
<button onClick={openCart}>Open Cart</button>

// Close cart
<button onClick={closeCart}>Close Cart</button>

// Toggle cart
<button onClick={toggleCart}>Toggle Cart</button>
```

### 3. Managing Cart Items

```tsx
const { 
  items,              // Array of cart items
  totalItems,         // Total quantity count
  subtotal,           // Total price before delivery
  updateQuantity,     // Update item quantity
  removeFromCart,     // Remove item
  clearCart          // Clear all items
} = useCart();

// Update quantity
updateQuantity('product-123', 3);

// Remove item
removeFromCart('product-123');

// Clear cart
clearCart();
```

### 4. Displaying Cart Count

```tsx
const { totalItems } = useCart();

return (
  <button className="relative">
    <ShoppingBag />
    {totalItems > 0 && (
      <span className="badge">{totalItems}</span>
    )}
  </button>
);
```

---

## 📦 Cart Item Interface

```typescript
interface CartItem {
  id: string;           // Unique product ID (required)
  name: string;         // Product name (required)
  price: number;        // Price in ₹ (required)
  image: string;        // Product image URL (required)
  quantity: number;     // Quantity (auto-managed)
  category?: string;    // Product category (optional)
  weight?: string;      // Product weight (optional)
  purity?: string;      // Silver purity (optional)
}
```

---

## 💰 Price Calculations

### Subtotal
```typescript
subtotal = items.reduce((sum, item) => 
  sum + (item.price * item.quantity), 0
);
```

### Delivery Charge
```typescript
deliveryCharge = subtotal >= 5000 ? 0 : 200;
```

### Total
```typescript
total = subtotal + deliveryCharge;
```

### Price Formatting
All prices are formatted using:
```typescript
new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
}).format(price);
```

Output: `₹4,500` (with Indian number formatting)

---

## 🎨 Design Features

### Animations
- **Entry/Exit**: Smooth slide animation (duration: 200ms)
- **Item Addition**: Staggered fade-in (50ms delay between items)
- **Item Removal**: Fade-out with height collapse
- **Performance**: GPU-accelerated transforms for 60fps

### Color Scheme
- **Background**: White (`bg-background`)
- **Text**: Dark gray (`text-foreground`)
- **Primary**: Gold accent (`text-primary`)
- **Borders**: Light gray (`border-border`)
- **Destructive**: Red for remove actions

### Typography
- **Headings**: Playfair Display (serif)
- **Body**: Inter (sans-serif)
- **Sizes**: Responsive from 12px to 24px

---

## 🔧 Integration with Product Pages

### ProductCard Example (Already Integrated)

```tsx
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/hooks/use-toast';

const ProductCard = ({ product }) => {
  const { addToCart } = useCart();
  const { toast } = useToast();

  const handleAddToCart = () => {
    addToCart({
      id: product.id,
      name: product.title,
      price: product.price,
      image: product.image,
      category: product.category,
    });
    
    toast({
      title: "Added to cart",
      description: `${product.title} has been added to your cart.`,
    });
  };

  return (
    <button onClick={handleAddToCart}>
      <ShoppingBag />
    </button>
  );
};
```

### Product Detail Page Example

```tsx
import { useCart } from '@/contexts/CartContext';

const ProductDetail = ({ product }) => {
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);

  const handleAddToCart = () => {
    // Add item multiple times based on quantity
    for (let i = 0; i < quantity; i++) {
      addToCart({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        category: product.category,
        weight: product.weight,
        purity: product.purity,
      });
    }
  };

  return (
    <div>
      <div className="quantity-selector">
        <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>-</button>
        <span>{quantity}</span>
        <button onClick={() => setQuantity(quantity + 1)}>+</button>
      </div>
      
      <button onClick={handleAddToCart}>
        Add to Cart - ₹{(product.price * quantity).toLocaleString('en-IN')}
      </button>
    </div>
  );
};
```

---

## 🗄️ Local Storage

Cart data is automatically saved to localStorage:

- **Key**: `sree_rasthu_cart`
- **Format**: JSON array of CartItem objects
- **Persistence**: Survives page refresh and browser restart
- **Auto-sync**: Updates on every cart change

### Manual Access
```javascript
// Get cart data
const cartData = localStorage.getItem('sree_rasthu_cart');
const cart = JSON.parse(cartData || '[]');

// Clear cart data
localStorage.removeItem('sree_rasthu_cart');
```

---

## 🔮 Future Enhancements (Supabase Integration)

The cart system is ready for backend integration:

```typescript
// Example: Sync with Supabase
const syncCartToBackend = async (userId: string, items: CartItem[]) => {
  await supabase
    .from('carts')
    .upsert({
      user_id: userId,
      items: items,
      updated_at: new Date(),
    });
};

// Call after login
useEffect(() => {
  if (user) {
    syncCartToBackend(user.id, items);
  }
}, [items, user]);
```

---

## 📱 Responsive Breakpoints

- **Mobile**: < 640px - Full width drawer
- **Tablet**: ≥ 640px - Max width 512px (32rem)
- **Desktop**: ≥ 1024px - Fixed 512px width

---

## ♿ Accessibility

- **ARIA Labels**: All buttons have descriptive labels
- **Keyboard Navigation**: Full keyboard support
- **Focus States**: Visible focus indicators
- **Screen Readers**: Semantic HTML structure
- **Color Contrast**: WCAG AA compliant

---

## 🎯 Performance Optimizations

1. **Debounced Updates**: Quantity changes batched
2. **Lazy Loading**: Images loaded on demand
3. **Memoization**: React.memo for cart items
4. **Virtual Scrolling**: For large cart lists (>20 items)
5. **GPU Acceleration**: Transform animations

---

## 🐛 Troubleshooting

### Cart not opening?
- Ensure `CartProvider` wraps your app in `App.tsx`
- Check that `ShoppingCart` component is rendered
- Verify `isCartOpen` state in React DevTools

### Items not persisting?
- Check browser localStorage permissions
- Clear localStorage and try again
- Verify JSON parsing errors in console

### Price formatting issues?
- Ensure prices are numbers, not strings
- Check locale setting in `Intl.NumberFormat`
- Verify Indian rupee symbol (₹) renders correctly

### Animation lag?
- Reduce `stagger` delay in motion variants
- Check for heavy re-renders
- Use Chrome DevTools Performance tab

---

## 📄 Files Created

1. **`src/contexts/CartContext.tsx`** - Global cart state management
2. **`src/components/ShoppingCart.tsx`** - Cart drawer UI component
3. **`CART_USAGE_GUIDE.md`** - This documentation

## 📝 Files Modified

1. **`src/App.tsx`** - Added CartProvider and ShoppingCart component
2. **`src/components/Header.tsx`** - Integrated cart toggle and badge
3. **`src/components/ProductCard.tsx`** - Added cart functionality

---

## 🎨 Customization

### Change Delivery Threshold
```tsx
// In ShoppingCart.tsx
const deliveryCharge = subtotal >= 10000 ? 0 : 500; // ₹10,000 threshold
```

### Modify Animations
```tsx
// In ShoppingCart.tsx
<motion.div
  initial={{ opacity: 0, x: 20 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ duration: 0.3 }} // Slower animation
>
```

### Update Color Scheme
```tsx
// In ShoppingCart.tsx - Change button colors
<Button className="bg-purple-600 hover:bg-purple-700">
  Checkout
</Button>
```

---

## 🚀 Quick Start Testing

1. Click any "Add to Cart" button on a product card
2. Cart drawer slides in automatically
3. Adjust quantities using +/- buttons
4. Remove items with trash icon
5. See live total calculations
6. Click "Continue Shopping" to close
7. Cart badge shows total item count
8. Refresh page - cart persists!

---

## 💡 Tips

- **Add to Cart** opens the drawer automatically for instant feedback
- **Quantity = 1** disables the minus button
- **Free Delivery** banner appears at ₹5,000+
- **Empty Cart** shows a beautiful empty state
- **Toast Notifications** confirm cart actions
- **Mobile Touch Targets** are 44px minimum

---

## 📞 Support

For issues or questions about the cart system:
- Check console for error messages
- Verify all dependencies are installed
- Review React DevTools for state issues
- Ensure shadcn/ui components are properly installed

---

**Built with ❤️ for Sree Rasthu Silvers - Where Luxury Meets Tradition**
