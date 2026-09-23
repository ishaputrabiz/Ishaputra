import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import MobileBottomNav from '@/components/MobileBottomNav';
import type { Product } from '@/services/productService';
import { getActiveProductsCached, useCatalogRevision } from '@/services/productCache';
import logo from '@/assets/dark.png';
import { SmartImage } from "@/components/ui/smart-image";

// Define main categories with their subcategories
const mainCategories = [
  {
    id: 'jewelry',
    name: 'Jewelry',
    icon: '💎',
    image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=100&h=100&fit=crop',
    subcategories: [
      { name: 'Silver Rings', image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=200&h=200&fit=crop', path: '/shop/rings' },
      { name: 'Silver Chains', image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=200&h=200&fit=crop', path: '/shop/necklaces' },
      { name: 'Silver Earrings', image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=200&h=200&fit=crop', path: '/shop/earrings' },
      { name: 'Silver Bangles', image: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=200&h=200&fit=crop', path: '/shop/bracelets' },
      { name: 'Silver Necklaces', image: 'https://images.unsplash.com/photo-1599643477877-530eb83abc8e?w=200&h=200&fit=crop', path: '/shop/necklaces' },
      { name: 'Silver Pendants', image: 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?w=200&h=200&fit=crop', path: '/shop/pendants' },
      { name: 'Silver Anklets', image: 'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=200&h=200&fit=crop', path: '/shop/anklets' },
      { name: 'Silver Bracelets', image: 'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=200&h=200&fit=crop', path: '/shop/bracelets' },
      { name: 'Temple Jewelry', image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=200&h=200&fit=crop', path: '/jewelry' },
    ]
  },
  {
    id: 'furniture',
    name: 'Furniture',
    icon: '🪑',
    image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=100&h=100&fit=crop',
    subcategories: [
      { name: 'Silver Chairs', image: 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=200&h=200&fit=crop', path: '/furniture/royal-silver-chairs' },
      { name: 'Silver Tables', image: 'https://images.unsplash.com/photo-1499933374294-4584851497cc?w=200&h=200&fit=crop', path: '/furniture/royal-silver-tables' },
      { name: 'Silver Swings', image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=200&h=200&fit=crop', path: '/furniture/silver-swing-jhoola' },
      { name: 'Silver Cradles', image: 'https://images.unsplash.com/photo-1544457070-4cd773b4d71e?w=200&h=200&fit=crop', path: '/furniture/silver-cradles' },
      { name: 'Silver Thrones', image: 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=200&h=200&fit=crop', path: '/furniture/silver-thrones' },
      { name: 'Decorative Items', image: 'https://images.unsplash.com/photo-1499933374294-4584851497cc?w=200&h=200&fit=crop', path: '/furniture/antique-silver-decor' },
    ]
  },
  {
    id: 'articles',
    name: 'Articles',
    icon: '🏺',
    image: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=100&h=100&fit=crop',
    subcategories: [
      { name: 'Pooja Items', image: 'https://images.unsplash.com/photo-1532635241-17e820acc59f?w=200&h=200&fit=crop', path: '/articles/pooja-items' },
      { name: 'Gift Articles', image: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=200&h=200&fit=crop', path: '/articles/gift-articles' },
      { name: 'Silver Lamps', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop', path: '/articles/silver-lamps' },
      { name: 'Silver Plates', image: 'https://images.unsplash.com/photo-1532635241-17e820acc59f?w=200&h=200&fit=crop', path: '/articles/silver-plates' },
      { name: 'Silver Idols', image: 'https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=200&h=200&fit=crop', path: '/articles/silver-idols' },
      { name: 'Silver Vessels', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop', path: '/articles/silver-vessels' },
    ]
  },
  {
    id: 'other',
    name: 'Other Products',
    icon: '✨',
    image: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=100&h=100&fit=crop',
    subcategories: [
      { name: 'Silver Coins', image: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=200&h=200&fit=crop', path: '/other-products/silver-coins' },
      { name: 'Silver Bars', image: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=200&h=200&fit=crop', path: '/other-products/silver-bars' },
      { name: 'Silver Utensils', image: 'https://images.unsplash.com/photo-1584990347449-a2d4c2c044b9?w=200&h=200&fit=crop', path: '/other-products/silver-utensils' },
      { name: 'Baby Items', image: 'https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=200&h=200&fit=crop', path: '/other-products/baby-items' },
      { name: 'Antique Silver', image: 'https://images.unsplash.com/photo-1610375461246-83df859d849d?w=200&h=200&fit=crop', path: '/other-products/antique-silver' },
      { name: 'Custom Orders', image: 'https://images.unsplash.com/photo-1584990347449-a2d4c2c044b9?w=200&h=200&fit=crop', path: '/other-products/custom-orders' },
    ]
  },
  {
    id: 'decor',
    name: 'Home Decor',
    icon: '🏠',
    image: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=100&h=100&fit=crop',
    subcategories: [
      { name: 'Wall Decor', image: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=200&h=200&fit=crop', path: '/home-decor/wall-decor' },
      { name: 'Photo Frames', image: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=200&h=200&fit=crop', path: '/home-decor/photo-frames' },
      { name: 'Showpieces', image: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=200&h=200&fit=crop', path: '/home-decor/showpieces' },
      { name: 'Candle Stands', image: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=200&h=200&fit=crop', path: '/home-decor/candle-stands' },
      { name: 'Flower Vases', image: 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=200&h=200&fit=crop', path: '/home-decor/flower-vases' },
    ]
  },
  {
    id: 'gifts',
    name: 'Gifts',
    icon: '🎁',
    image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=100&h=100&fit=crop',
    subcategories: [
      { name: 'Wedding Gifts', image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=200&h=200&fit=crop', path: '/gifts/wedding-gifts' },
      { name: 'Birthday Gifts', image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=200&h=200&fit=crop', path: '/gifts/birthday-gifts' },
      { name: 'Festival Gifts', image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=200&h=200&fit=crop', path: '/gifts/festival-gifts' },
      { name: 'Corporate Gifts', image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=200&h=200&fit=crop', path: '/gifts/corporate-gifts' },
      { name: 'Return Gifts', image: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=200&h=200&fit=crop', path: '/gifts/return-gifts' },
    ]
  },
];

const MobileCategories = () => {
  /** Changes when an admin publishes; re-reads the catalog below. */
  const catalogRevision = useCatalogRevision();

  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState(() => {
    const savedId = sessionStorage.getItem('selectedCategoryId');
    if (savedId) {
      const found = mainCategories.find(c => c.id === savedId);
      if (found) return found;
    }
    return mainCategories[0];
  });
  const [products, setProducts] = useState<Product[]>([]);

  // Persist selected category so back navigation restores it
  useEffect(() => {
    sessionStorage.setItem('selectedCategoryId', selectedCategory.id);
  }, [selectedCategory]);

  // Load products to show actual product images if available
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const allProducts = await getActiveProductsCached();
        setProducts(allProducts);
      } catch (error) {
        console.error('Error loading products:', error);
      }
    };
    loadProducts();
      // Re-runs when an admin publishes a new catalog, so a price change
      // reaches this screen without the visitor reloading it.
  }, [catalogRevision]);

  // Get product image for subcategory if available
  const getSubcategoryImage = (subcategoryName: string, defaultImage: string) => {
    const product = products.find(p => 
      p.name?.toLowerCase().includes(subcategoryName.toLowerCase().replace('silver ', '')) ||
      p.subcategory?.toLowerCase().includes(subcategoryName.toLowerCase().replace('silver ', ''))
    );
    return product?.media?.thumbnail || product?.media?.images?.[0] || defaultImage;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 pb-20" style={{ fontFamily: "'Poppins', sans-serif" }}>
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-zinc-900 z-40 px-4 py-3 flex items-center justify-between border-b border-gray-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/')}
            className="p-1"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-zinc-300" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "'Poppins', sans-serif" }}>Top Categories</h1>
        </div>
        <img 
          src={logo} 
          alt="Sreerasthu Silvers" 
          className="h-6 w-auto"
        />
      </div>

      {/* Main Content */}
      <div className="flex">
        {/* Left Sidebar - Categories */}
        <div className="w-20 bg-white dark:bg-zinc-900 border-r border-gray-100 dark:border-zinc-800 min-h-[calc(100vh-120px)]">
          {mainCategories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedCategory(category)}
              className={`w-full py-3 px-2 flex flex-col items-center gap-1 transition-all ${
                selectedCategory.id === category.id
                  ? 'bg-red-50'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className={`w-12 h-12 rounded-full overflow-hidden border-2 ${
                selectedCategory.id === category.id
                  ? 'border-red-500'
                  : 'border-gray-200'
              }`}>
                <SmartImage 
                  src={category.image} 
                  alt={category.name}
                  className="w-full h-full object-cover" preset="card" />
              </div>
              <span className={`text-[10px] text-center leading-tight font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-full ${
                selectedCategory.id === category.id
                  ? 'text-red-600'
                  : 'text-gray-600'
              }`} style={{ fontFamily: "'Poppins', sans-serif" }}>
                {category.name.length > 10 ? category.name.slice(0, 10) + '...' : category.name}
              </span>
            </button>
          ))}
        </div>

        {/* Right Content - Subcategories */}
        <div className="flex-1 p-4">
          {/* Category Title */}
          <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100 mb-4" style={{ fontFamily: "'Poppins', sans-serif" }}>{selectedCategory.name}</h2>

          {/* Subcategory Grid */}
          <div className="grid grid-cols-3 gap-3">
            {selectedCategory.subcategories.map((subcategory, index) => (
              <motion.button
                key={subcategory.name}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => navigate(subcategory.path)}
                className="flex flex-col items-center"
              >
                <div className="w-full aspect-[4/5] rounded-xl overflow-hidden bg-gray-100 dark:bg-zinc-800 mb-2 shadow-sm">
                  <SmartImage
                    src={getSubcategoryImage(subcategory.name, subcategory.image)}
                    alt={subcategory.name}
                    className="w-full h-full object-cover" preset="card" />
                </div>
                <span className="text-xs text-gray-700 dark:text-zinc-300 text-center font-medium truncate w-full" style={{ fontFamily: "'Poppins', sans-serif" }}>
                  {subcategory.name.length > 12 ? subcategory.name.slice(0, 12) + '...' : subcategory.name}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      <MobileBottomNav />
    </div>
  );
};

export default MobileCategories;
