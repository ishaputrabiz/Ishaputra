import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import MobileBottomNav from '@/components/MobileBottomNav';
import type { Product } from '@/services/productService';
import { getActiveProductsCached, useCatalogRevision } from '@/services/productCache';
import { subscribeToCategories, type Category } from '@/services/categoryService';
import { SmartImage } from "@/components/ui/smart-image";

/** Shown until a category or subcategory has a product photo to borrow. */
const FALLBACK_IMAGE = '/icon-192.png';

interface NavSubcategory {
  name: string;
  path: string;
  image: string;
}

interface NavCategory {
  id: string;
  name: string;
  image: string;
  subcategories: NavSubcategory[];
}

const firstPhoto = (products: Product[]) => {
  const p = products.find((x) => x.media?.thumbnail || x.media?.images?.[0]);
  return p?.media?.thumbnail || p?.media?.images?.[0] || '';
};

const MobileCategories = () => {
  /** Changes when an admin publishes; re-reads the catalog below. */
  const catalogRevision = useCatalogRevision();

  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState(() => sessionStorage.getItem('selectedCategoryId') || '');

  // The store's own categories (Admin > Categories), so this screen always matches the catalog.
  useEffect(() => subscribeToCategories(setCategories), []);

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

  const mainCategories: NavCategory[] = useMemo(
    () =>
      categories.map((c) => {
        const inCategory = products.filter((p) => p.category === c.name);
        const categoryImage = firstPhoto(inCategory) || FALLBACK_IMAGE;
        const subcategories = (c.subcategories || []).map((s) => ({
          name: s.name,
          path: `/category/${c.slug}?sub=${s.slug}`,
          image: firstPhoto(inCategory.filter((p) => p.subcategory === s.name)) || categoryImage,
        }));
        return {
          id: c.slug,
          name: c.name,
          image: categoryImage,
          subcategories: subcategories.length
            ? subcategories
            : [{ name: `All ${c.name}`, path: `/category/${c.slug}`, image: categoryImage }],
        };
      }),
    [categories, products],
  );

  const selectedCategory = mainCategories.find((c) => c.id === selectedId) || mainCategories[0];

  // Persist selected category so back navigation restores it
  useEffect(() => {
    if (selectedCategory) sessionStorage.setItem('selectedCategoryId', selectedCategory.id);
  }, [selectedCategory]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 pb-20" style={{ fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <div className="sticky top-0 bg-white dark:bg-zinc-900 z-40 px-4 py-3 flex items-center justify-between border-b border-gray-100 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-zinc-300" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-zinc-100" style={{ fontFamily: "var(--font-body)" }}>Top Categories</h1>
        </div>
        <img src="/black_logo.png" alt="Ishaputra Botanicals" className="h-6 w-auto dark:hidden" />
        <img src="/white_logo.png" alt="Ishaputra Botanicals" className="h-6 w-auto hidden dark:block" />
      </div>

      {/* Main Content */}
      <div className="flex">
        {/* Left Sidebar - Categories */}
        <div className="w-20 bg-white dark:bg-zinc-900 border-r border-gray-100 dark:border-zinc-800 min-h-[calc(100vh-120px)]">
          {mainCategories.map((category) => (
            <button
              key={category.id}
              onClick={() => setSelectedId(category.id)}
              className={`w-full py-3 px-2 flex flex-col items-center gap-1 transition-all ${
                selectedCategory?.id === category.id
                  ? 'bg-primary/10'
                  : 'hover:bg-gray-50 dark:hover:bg-zinc-800'
              }`}
            >
              <div className={`w-12 h-12 rounded-full overflow-hidden border-2 ${
                selectedCategory?.id === category.id
                  ? 'border-primary'
                  : 'border-gray-200 dark:border-zinc-700'
              }`}>
                <SmartImage
                  src={category.image}
                  alt={category.name}
                  className="w-full h-full object-cover" preset="card" />
              </div>
              <span className={`text-[10px] text-center leading-tight font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-full ${
                selectedCategory?.id === category.id
                  ? 'text-primary'
                  : 'text-gray-600 dark:text-zinc-400'
              }`} style={{ fontFamily: "var(--font-body)" }}>
                {category.name.length > 10 ? category.name.slice(0, 10) + '...' : category.name}
              </span>
            </button>
          ))}
        </div>

        {/* Right Content - Subcategories */}
        {selectedCategory && (
          <div className="flex-1 p-4">
            {/* Category Title */}
            <h2 className="text-lg font-semibold text-gray-900 dark:text-zinc-100 mb-4" style={{ fontFamily: "var(--font-body)" }}>{selectedCategory.name}</h2>

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
                      src={subcategory.image}
                      alt={subcategory.name}
                      className="w-full h-full object-cover" preset="card" />
                  </div>
                  <span className="text-xs text-gray-700 dark:text-zinc-300 text-center font-medium truncate w-full" style={{ fontFamily: "var(--font-body)" }}>
                    {subcategory.name.length > 12 ? subcategory.name.slice(0, 12) + '...' : subcategory.name}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        )}
      </div>

      <MobileBottomNav />
    </div>
  );
};

export default MobileCategories;
