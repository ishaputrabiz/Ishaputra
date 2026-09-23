/**
 * CART SYSTEM - QUICK REFERENCE
 * =============================
 * 
 * This file contains quick examples for using the shopping cart system.
 * Copy and paste these examples into your components as needed.
 */

import { useState } from 'react';
import { useCart } from '@/contexts/CartContext';
import { useToast } from '@/hooks/use-toast';
import { ShoppingBag, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SmartImage } from "@/components/ui/smart-image";

// ===================================
// EXAMPLE 1: Simple Add to Cart Button
// ===================================
export const SimpleAddToCartButton = () => {
  const { addToCart } = useCart();
  const { toast } = useToast();

  const product = {
    id: 'silver-necklace-001',
    name: 'Elegant Silver Necklace',
    price: 4500,
    image: '/assets/products/necklace-1.jpg',
    category: 'Necklaces',
  };

  const handleClick = () => {
    addToCart(product);
    toast({
      title: '✨ Added to cart',
      description: `${product.name} added successfully!`,
    });
  };

  return (
    <Button onClick={handleClick}>
      <ShoppingBag className="w-4 h-4 mr-2" />
      Add to Cart - ₹{product.price.toLocaleString('en-IN')}
    </Button>
  );
};

// ===================================
// EXAMPLE 2: Add to Cart with Quantity Selector
// ===================================
export const AddToCartWithQuantity = () => {
  const { addToCart } = useCart();
  const { toast } = useToast();
  const [quantity, setQuantity] = useState(1);

  const product = {
    id: 'silver-ring-002',
    name: 'Diamond Silver Ring',
    price: 6500,
    image: '/assets/products/ring-1.jpg',
    category: 'Rings',
    weight: '15g',
    purity: '92.5%',
  };

  const handleAddToCart = () => {
    // Add the item multiple times based on quantity
    for (let i = 0; i < quantity; i++) {
      addToCart(product);
    }

    toast({
      title: `✨ Added ${quantity} item(s) to cart`,
      description: `${product.name}`,
    });

    // Reset quantity
    setQuantity(1);
  };

  return (
    <div className="space-y-4">
      {/* Quantity Selector */}
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium">Quantity:</span>
        <div className="flex items-center gap-2 border border-border rounded-full px-2 py-1">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="p-2 hover:bg-muted rounded-full"
            disabled={quantity <= 1}
          >
            <Minus className="w-4 h-4" />
          </button>
          <span className="min-w-[2rem] text-center font-medium">{quantity}</span>
          <button
            onClick={() => setQuantity(quantity + 1)}
            className="p-2 hover:bg-muted rounded-full"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Add to Cart Button */}
      <Button onClick={handleAddToCart} className="w-full">
        <ShoppingBag className="w-4 h-4 mr-2" />
        Add to Cart - ₹{(product.price * quantity).toLocaleString('en-IN')}
      </Button>
    </div>
  );
};

// ===================================
// EXAMPLE 3: Cart Icon with Badge
// ===================================
export const CartIconWithBadge = () => {
  const { toggleCart, totalItems } = useCart();

  return (
    <button
      onClick={toggleCart}
      className="relative p-2 hover:bg-muted rounded-full transition-colors"
      aria-label="Shopping cart"
    >
      <ShoppingBag className="w-6 h-6" />
      {totalItems > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center font-medium">
          {totalItems}
        </span>
      )}
    </button>
  );
};

// ===================================
// EXAMPLE 4: Mini Cart Summary
// ===================================
export const MiniCartSummary = () => {
  const { items, subtotal, totalItems, openCart } = useCart();

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Your cart is empty
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-4 space-y-4">
      <h3 className="font-semibold text-lg">Cart Summary</h3>
      
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Items</span>
          <span className="font-medium">{totalItems}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">₹{subtotal.toLocaleString('en-IN')}</span>
        </div>
      </div>

      <Button onClick={openCart} className="w-full">
        View Cart
      </Button>
    </div>
  );
};

// ===================================
// EXAMPLE 5: Cart Item List (Read-only)
// ===================================
export const CartItemsList = () => {
  const { items } = useCart();

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <div key={item.id} className="flex gap-4 border-b border-border pb-4">
          <SmartImage
            src={item.image}
            alt={item.name}
            className="w-16 h-16 object-cover rounded-lg" preset="thumb" />
          <div className="flex-1">
            <h4 className="font-medium">{item.name}</h4>
            <p className="text-sm text-muted-foreground">{item.category}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-semibold">
                ₹{(item.price * item.quantity).toLocaleString('en-IN')}
              </span>
              <span className="text-xs text-muted-foreground">
                × {item.quantity}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ===================================
// EXAMPLE 6: Programmatic Cart Control
// ===================================
export const ProgrammaticCartControl = () => {
  const { 
    openCart, 
    closeCart, 
    toggleCart, 
    clearCart,
    removeFromCart,
    updateQuantity 
  } = useCart();

  return (
    <div className="space-y-2">
      <Button onClick={openCart}>Open Cart</Button>
      <Button onClick={closeCart}>Close Cart</Button>
      <Button onClick={toggleCart}>Toggle Cart</Button>
      <Button onClick={clearCart} variant="destructive">
        Clear Cart
      </Button>
      
      {/* Remove specific item */}
      <Button onClick={() => removeFromCart('product-id')}>
        Remove Item
      </Button>
      
      {/* Update quantity */}
      <Button onClick={() => updateQuantity('product-id', 3)}>
        Set Quantity to 3
      </Button>
    </div>
  );
};

// ===================================
// EXAMPLE 7: Full Product Card with Cart
// ===================================
export const ProductCardWithCart = ({ product }) => {
  const { addToCart } = useCart();
  const { toast } = useToast();

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent parent click events
    
    addToCart({
      id: product.id,
      name: product.title,
      price: product.price,
      image: product.image,
      category: product.category,
    });
    
    toast({
      title: 'Added to cart',
      description: `${product.title} has been added to your cart.`,
    });
  };

  return (
    <div className="border border-border rounded-lg p-4 hover:shadow-lg transition-shadow">
      <SmartImage
        src={product.image}
        alt={product.title}
        className="w-full aspect-square object-cover rounded-lg mb-4" preset="card" />
      
      <h3 className="font-semibold text-lg mb-2">{product.title}</h3>
      <p className="text-sm text-muted-foreground mb-3">{product.category}</p>
      
      <div className="flex items-center justify-between">
        <span className="text-xl font-bold">
          ₹{product.price.toLocaleString('en-IN')}
        </span>
        
        <Button onClick={handleAddToCart} size="sm">
          <ShoppingBag className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

// ===================================
// USAGE NOTES
// ===================================
/*

1. IMPORT THE HOOK
   import { useCart } from '@/contexts/CartContext';

2. USE IN COMPONENT
   const { addToCart, items, totalItems, subtotal } = useCart();

3. ADD ITEM
   addToCart({
     id: 'unique-id',
     name: 'Product Name',
     price: 1234,
     image: '/path/to/image.jpg',
     category: 'Category Name',
   });

4. AVAILABLE METHODS
   - addToCart(item)
   - removeFromCart(id)
   - updateQuantity(id, quantity)
   - clearCart()
   - openCart()
   - closeCart()
   - toggleCart()

5. AVAILABLE STATE
   - items (CartItem[])
   - totalItems (number)
   - subtotal (number)
   - isCartOpen (boolean)

6. PRICE FORMATTING
   Always use: price.toLocaleString('en-IN')
   This ensures proper Indian Rupee formatting

7. TOAST NOTIFICATIONS
   Import and use toast for user feedback:
   const { toast } = useToast();
   toast({ title: "Success!", description: "Item added" });

*/
