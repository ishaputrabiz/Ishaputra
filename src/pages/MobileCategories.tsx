import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import MobileBottomNav from '@/components/MobileBottomNav';
import type { Product } from '@/services/productService';
import { getActiveProductsCached, useCatalogRevision } from '@/services/productCache';
import { subscribeToCategories, type Category } from '@/services/categoryService';
import { SmartImage } from "@/components/ui/smart-image";
import { IconButton } from '@/components/ui/icon-button';
import { usePageMeta } from '@/hooks/usePageMeta';
import { EASE_OUT, staggerDelay } from '@/lib/motion';

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
  usePageMeta({ title: 'Shop by category', description: 'Browse every Ishaputra Botanicals collection.' });
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
    <div className="min-h-screen tx-paper" style={{ fontFamily: "var(--font-body)" }}>
      {/* Header */}
      <header className="sticky top-0 z-header border-b border-foreground/[0.08] bg-card">
        <div className="mx-auto flex h-14 items-center justify-between gap-3 px-2 sm:px-4 lg:max-w-3xl">
          <div className="flex min-w-0 items-center gap-1">
            <IconButton label="Go back" onClick={() => navigate('/')}>
              <ArrowLeft aria-hidden="true" />
            </IconButton>
            <h1
              className="truncate text-lg font-semibold text-foreground"
              style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
            >
              Shop by category
            </h1>
          </div>
          <img src="/black_logo.png" alt="Ishaputra Botanicals" className="mr-2 h-6 w-auto dark:hidden" />
          <img src="/white_logo.png" alt="Ishaputra Botanicals" className="mr-2 hidden h-6 w-auto dark:block" />
        </div>
      </header>

      {/* Main Content */}
      <main id="main" tabIndex={-1} className="mx-auto flex min-h-[calc(100dvh-57px)] lg:max-w-3xl">
        {/* Left rail - categories */}
        <nav aria-label="Categories" className="w-[84px] shrink-0 self-stretch border-r border-foreground/[0.08] bg-card">
          <ul>
            {mainCategories.map((category) => {
              const active = selectedCategory?.id === category.id;
              return (
                <li key={category.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedId(category.id)}
                    className={`focus-inset relative flex w-full flex-col items-center gap-1.5 px-1.5 py-3 transition-[background-color] duration-hover ease-out ${
                      active ? 'bg-primary/10 shadow-[inset_2px_0_0_hsl(var(--primary))]' : 'hover:bg-muted/60'
                    }`}
                  >
                    <span
                      className={`size-12 overflow-hidden rounded-full border-2 transition-[border-color] duration-hover ease-out ${
                        active ? 'border-primary' : 'border-foreground/[0.08]'
                      }`}
                    >
                      <SmartImage src={category.image} alt="" className="h-full w-full object-cover" preset="thumb" />
                    </span>
                    <span
                      className={`line-clamp-2 w-full text-center text-[11px] font-medium leading-tight [overflow-wrap:anywhere] ${
                        active ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      {category.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Right content - subcategories */}
        {selectedCategory && (
          <section aria-labelledby="category-heading" className="min-w-0 flex-1 p-4 sm:p-5">
            <h2
              id="category-heading"
              className="mb-4 text-lg font-semibold text-foreground [text-wrap:balance] sm:text-xl"
              style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
            >
              {selectedCategory.name}
            </h2>

            {/* Subcategory grid */}
            <ul className="grid grid-cols-3 gap-3 sm:gap-4">
              {selectedCategory.subcategories.map((subcategory, index) => (
                <motion.li
                  key={`${selectedCategory.id}-${subcategory.name}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, ease: EASE_OUT, delay: staggerDelay(index) }}
                >
                  <Link
                    to={subcategory.path}
                    className="group flex flex-col items-center rounded-card transition-transform duration-press ease-out active:scale-[0.97]"
                  >
                    <span className="tile-img mb-2 block aspect-[4/5] w-full overflow-hidden">
                      <SmartImage
                        src={subcategory.image}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-reveal ease-out group-hover:scale-[1.03]"
                        preset="card"
                      />
                    </span>
                    <span
                      title={subcategory.name}
                      className="line-clamp-2 w-full text-center text-[11px] font-medium leading-tight text-foreground [overflow-wrap:anywhere] sm:text-xs"
                    >
                      {subcategory.name}
                    </span>
                  </Link>
                </motion.li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <MobileBottomNav />
    </div>
  );
};

export default MobileCategories;
