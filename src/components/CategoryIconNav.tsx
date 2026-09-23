import { motion, AnimatePresence } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { useRef, useEffect, useState, useMemo } from "react";
import { 
  Gem, 
  Armchair, 
  BookOpen, 
  Gift, 
  Flame, 
  UserCircle,
  Heart,
  Home,
  Landmark,
  MoreHorizontal,
  ChevronRight
} from "lucide-react";
import { subscribeToCategories, Category } from "@/services/categoryService";

/**
 * Storefront category strip.
 *
 * This used to render a hardcoded list that re-pointed Gifting, Pooja Items,
 * Men's and Wedding at a *parent* category ("/category/articles?sub=gifting").
 * Those are real top-level categories in Firestore, and products saved under
 * them store `category: "Gifting"` - so the link led to a page that filtered
 * Articles by a subcategory nothing used, and every one of those tabs showed an
 * empty grid. The nav now renders whatever `categories` actually contains, so a
 * category the admin creates appears here and its link always resolves.
 */

/** Fallback order for the handful of categories that ship by default. */
const CATEGORY_ORDER = [
  'jewellery',
  'furniture',
  'articles',
  'gifting',
  'pooja-items',
  'mens',
  'wedding',
  'others',
];

const ICON_MAP: Record<string, any> = {
  jewellery: Gem,
  furniture: Armchair,
  articles: BookOpen,
  gifting: Gift,
  "pooja-items": Flame,
  "pooja items": Flame,
  mens: UserCircle,
  "men's": UserCircle,
  wedding: Heart,
  artifacts: Landmark,
  others: Home,
  more: MoreHorizontal,
};

const CategoryIconNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const [firebaseCategories, setFirebaseCategories] = useState<Category[]>([]);

  /**
   * Nav entries built from Firestore. Ordering puts the known defaults first
   * (so the strip keeps its familiar shape) and appends anything new after.
   */
  const categories = useMemo(
    () =>
      [...firebaseCategories]
        .sort((a, b) => {
          const ai = CATEGORY_ORDER.indexOf(a.slug);
          const bi = CATEGORY_ORDER.indexOf(b.slug);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        })
        .map((cat) => ({
          name: cat.name,
          slug: cat.slug,
          icon: ICON_MAP[cat.slug] || ICON_MAP[cat.name.toLowerCase()] || MoreHorizontal,
          href: `/category/${cat.slug}`,
          subcategories: cat.subcategories || [],
        })),
    [firebaseCategories],
  );
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [isMobileNavVisible, setIsMobileNavVisible] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const lastScrollYRef = useRef(0);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch categories from Firebase for subcategory data
  useEffect(() => {
    const unsub = subscribeToCategories((cats) => {
      setFirebaseCategories(cats);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const controlMobileNav = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY < 10) {
        setIsMobileNavVisible(true);
      } else if (currentScrollY > lastScrollYRef.current) {
        setIsMobileNavVisible(false);
      } else {
        setIsMobileNavVisible(true);
      }

      setIsScrolled(currentScrollY > 50);
      lastScrollYRef.current = currentScrollY;
    };

    window.addEventListener("scroll", controlMobileNav);
    return () => window.removeEventListener("scroll", controlMobileNav);
  }, []);

  const handleMouseEnter = (categoryName: string) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredCategory(categoryName);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredCategory(null);
    }, 150);
  };

  // Restore scroll position on mount
  useEffect(() => {
    const savedMobileScroll = sessionStorage.getItem('categoryMobileScrollPos');
    const savedDesktopScroll = sessionStorage.getItem('categoryDesktopScrollPos');
    
    if (savedMobileScroll && mobileScrollRef.current) {
      mobileScrollRef.current.scrollLeft = parseInt(savedMobileScroll);
    }
    if (savedDesktopScroll && desktopScrollRef.current) {
      desktopScrollRef.current.scrollLeft = parseInt(savedDesktopScroll);
    }
  }, [location.pathname]);

  // Save scroll position before navigation
  const handleCategoryClick = (href: string) => {
    if (href === "#") return;
    
    // Save current scroll positions
    if (mobileScrollRef.current) {
      sessionStorage.setItem('categoryMobileScrollPos', mobileScrollRef.current.scrollLeft.toString());
    }
    if (desktopScrollRef.current) {
      sessionStorage.setItem('categoryDesktopScrollPos', desktopScrollRef.current.scrollLeft.toString());
    }
    
    navigate(href);
  };

  return (
    <>
      {/* ====== MOBILE: Compact icon pills ====== */}
      <section 
        className={`lg:hidden sticky z-40 transition-all duration-500 ${
          isScrolled
            ? "bg-background/80 backdrop-blur-xl border-b border-border/40 shadow-[0_1px_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_rgba(255,255,255,0.05)]"
            : "bg-background border-b border-border/70"
        } ${
          isMobileNavVisible ? "top-[57px] opacity-100 translate-y-0" : "top-0 opacity-0 -translate-y-full pointer-events-none"
        }`}
      >
        <div ref={mobileScrollRef} className="flex gap-1.5 overflow-x-auto scrollbar-hide px-2.5 py-1.5">
          {categories.map((category, index) => {
            const isActive = location.pathname === category.href;
            const Icon = category.icon;
            return (
              <motion.a
                key={category.name}
                href={category.href}
                onClick={(e) => {
                  e.preventDefault();
                  handleCategoryClick(category.href);
                }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
                className={`group flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 min-w-fit flex-shrink-0 transition-all duration-200 ${
                  isActive
                    ? "border-primary/30 bg-primary/10 text-primary shadow-[0_8px_18px_-14px_rgba(131,39,41,0.65)]"
                    : "border-border/70 bg-background text-muted-foreground"
                }`}
              >
                <div className={`grid place-items-center rounded-full w-7 h-7 transition-colors duration-200 ${
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/80 group-hover:bg-muted/80"
                }`}>
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.7} />
                </div>
                <span className="text-[10px] font-medium whitespace-nowrap leading-none pr-0.5">
                  {category.name}
                </span>
              </motion.a>
            );
          })}
        </div>
      </section>

      {/* ====== DESKTOP: Clean horizontal nav with subcategory dropdown ====== */}
      <nav
        className={`hidden lg:block relative sticky top-[68px] z-40 transition-all duration-500 ${
          isScrolled
            ? "bg-background/80 backdrop-blur-xl border-b border-border/40 shadow-[0_1px_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_rgba(255,255,255,0.05)]"
            : "bg-background border-b border-border"
        }`}
      >
        <div className="max-w-[1440px] mx-auto px-8 lg:px-12">
          <div ref={desktopScrollRef} className="flex items-center justify-center gap-1 overflow-x-auto scrollbar-hide">
            {categories.map((category, index) => {
              const isActive = location.pathname === category.href;
              const Icon = category.icon;
              const categorySlug = category.slug;
              const subcategories = category.subcategories;
              const hasSubcategories = subcategories.length > 0;

              return (
                <div
                  key={category.name}
                  className="relative"
                  onMouseEnter={() => hasSubcategories && handleMouseEnter(category.name)}
                  onMouseLeave={handleMouseLeave}
                >
                  <motion.a
                    href={category.href}
                    onClick={(e) => {
                      e.preventDefault();
                      handleCategoryClick(category.href);
                    }}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className={`flex items-center gap-2 px-4 py-3 whitespace-nowrap text-[13px] font-medium transition-all duration-200 relative group border-b-2 ${
                      isActive
                        ? "text-primary border-primary"
                        : "text-muted-foreground hover:text-foreground border-transparent hover:border-border"
                    }`}
                  >
                    <Icon className={`w-4 h-4 transition-colors duration-200 ${
                      isActive ? "text-primary" : "text-muted-foreground/60 group-hover:text-muted-foreground"
                    }`} strokeWidth={1.5} />
                    <span>{category.name}</span>
                  </motion.a>

                  {/* Subcategory Dropdown */}
                  <AnimatePresence>
                    {hoveredCategory === category.name && hasSubcategories && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 z-50 min-w-[220px] bg-background border border-border rounded-xl shadow-xl py-2 mt-0"
                        onMouseEnter={() => handleMouseEnter(category.name)}
                        onMouseLeave={handleMouseLeave}
                      >
                        {subcategories.map((sub) => (
                          <div key={sub.slug}>
                            <button
                              onClick={() => {
                                setHoveredCategory(null);
                                navigate(`/category/${categorySlug}?sub=${sub.slug}`);
                              }}
                              className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors text-left"
                            >
                              <span>{sub.name}</span>
                              {sub.children && sub.children.length > 0 && (
                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </button>
                            {/* Sub-subcategories */}
                            {sub.children && sub.children.length > 0 && (
                              <div className="pl-4">
                                {sub.children.map((child) => (
                                  <button
                                    key={child.slug}
                                    onClick={() => {
                                      setHoveredCategory(null);
                                      navigate(`/category/${categorySlug}?sub=${sub.slug}&subsub=${child.slug}`);
                                    }}
                                    className="w-full px-4 py-2 text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-left"
                                  >
                                    {child.name}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </nav>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </>
  );
};

export default CategoryIconNav;
