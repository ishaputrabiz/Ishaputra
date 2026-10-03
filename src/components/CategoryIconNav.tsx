import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useRef, useEffect, useState, useMemo } from "react";
import {
  Zap,
  Droplet,
  Sparkles,
  ShowerHead,
  FlaskConical,
  MoreHorizontal,
  ChevronRight
} from "lucide-react";
import { subscribeToCategories, Category } from "@/services/categoryService";
import { useScrollChrome } from "@/components/MobileHeader";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

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
  'energy-vitality',
  'hair-care',
  'skin-care',
  'personal-care',
  'ayurvedic-essentials',
];

const ICON_MAP: Record<string, any> = {
  'energy-vitality': Zap,
  'hair-care': Droplet,
  'skin-care': Sparkles,
  'personal-care': ShowerHead,
  'ayurvedic-essentials': FlaskConical,
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
  const [loaded, setLoaded] = useState(false);
  const { hidden: isMobileNavHidden, scrolled: isScrolled } = useScrollChrome();
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Set when Escape closes a dropdown, so focus going back to its link does not reopen it. */
  const escapedRef = useRef<string | null>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  // Fetch categories from Firebase for subcategory data
  useEffect(() => {
    const unsub = subscribeToCategories((cats) => {
      setFirebaseCategories(cats);
      setLoaded(true);
    });
    return unsub;
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

  const skeletonPills = (
    <>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className="h-[42px] w-[112px] shrink-0 rounded-control bg-foreground/[0.05] animate-pulse motion-reduce:animate-none"
        />
      ))}
    </>
  );

  return (
    <>
      {/* ====== MOBILE: compact icon pills ====== */}
      <nav
        aria-label="Categories"
        aria-busy={!loaded || undefined}
        className={cn(
          "lg:hidden sticky top-[57px] z-sticky border-b transition-[transform,opacity,background-color,box-shadow,border-color] ease-out",
          isScrolled
            ? "bg-background/90 backdrop-blur-xl border-border/40 shadow-[0_1px_0_hsl(var(--foreground)/0.05)]"
            : "bg-background border-border/70",
          isMobileNavHidden
            ? "-translate-y-full opacity-0 pointer-events-none duration-exit"
            : "translate-y-0 opacity-100 duration-[220ms]",
        )}
      >
        <div
          ref={mobileScrollRef}
          className="flex min-h-[54px] items-center gap-1.5 overflow-x-auto scrollbar-hide px-2.5 py-1.5"
        >
          {!loaded && skeletonPills}
          {categories.map((category) => {
            const isActive = location.pathname === category.href;
            const Icon = category.icon;
            return (
              <a
                key={category.name}
                href={category.href}
                aria-current={isActive ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  handleCategoryClick(category.href);
                }}
                className={cn(
                  "group flex h-[42px] min-w-fit flex-shrink-0 items-center gap-2 rounded-control border pl-[6px] pr-3 transition-[transform,background-color,border-color,color] duration-press ease-out active:scale-[0.97]",
                  isActive
                    ? "border-primary/45 bg-primary/10 text-primary"
                    : "border-foreground/10 bg-card/60 text-foreground/80 hover:border-foreground/20",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-7 place-items-center rounded-chip transition-colors duration-hover",
                    isActive ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/80",
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="whitespace-nowrap text-xs font-medium leading-none">
                  {category.name}
                </span>
              </a>
            );
          })}
        </div>
      </nav>

      {/* ====== DESKTOP: horizontal nav with subcategory dropdown ====== */}
      <nav
        aria-label="Categories"
        aria-busy={!loaded || undefined}
        className={cn(
          "hidden lg:block sticky top-[68px] z-sticky border-b transition-[background-color,box-shadow,border-color] duration-hover ease-out",
          isScrolled
            ? "bg-background/90 backdrop-blur-xl border-border/40 shadow-[0_1px_0_hsl(var(--foreground)/0.05)]"
            : "bg-background border-border",
        )}
      >
        <div className="max-w-[1440px] mx-auto px-8 lg:px-12">
          {/* No overflow here: an overflow-x scroller also clips vertically, which hid
              the subcategory dropdown. Extra categories wrap to a second row instead. */}
          <div
            ref={desktopScrollRef}
            className="flex min-h-[46px] flex-wrap items-center justify-center gap-x-1"
          >
            {!loaded &&
              Array.from({ length: 5 }, (_, i) => (
                <span
                  key={i}
                  aria-hidden="true"
                  className="mx-4 h-3 w-28 shrink-0 rounded-chip bg-foreground/[0.06] animate-pulse motion-reduce:animate-none"
                />
              ))}
            {categories.map((category) => {
              const isActive = location.pathname === category.href;
              const Icon = category.icon;
              const categorySlug = category.slug;
              const subcategories = category.subcategories;
              const hasSubcategories = subcategories.length > 0;
              const isOpen = hoveredCategory === category.name && hasSubcategories;
              const menuId = `cat-menu-${categorySlug}`;

              return (
                <div
                  key={category.name}
                  className="relative"
                  onMouseEnter={() => hasSubcategories && handleMouseEnter(category.name)}
                  onMouseLeave={handleMouseLeave}
                  onFocus={() => {
                    if (!hasSubcategories || escapedRef.current === category.name) return;
                    handleMouseEnter(category.name);
                  }}
                  onBlur={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                    escapedRef.current = null;
                    setHoveredCategory((cur) => (cur === category.name ? null : cur));
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Escape" || !isOpen) return;
                    e.stopPropagation();
                    escapedRef.current = category.name;
                    setHoveredCategory(null);
                    linkRefs.current[category.name]?.focus();
                  }}
                >
                  <a
                    ref={(el) => {
                      linkRefs.current[category.name] = el;
                    }}
                    href={category.href}
                    aria-current={isActive ? "page" : undefined}
                    aria-expanded={hasSubcategories ? isOpen : undefined}
                    aria-controls={isOpen ? menuId : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      handleCategoryClick(category.href);
                    }}
                    className={cn(
                      "focus-inset group relative flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3.5 text-[11px] font-semibold uppercase leading-4 tracking-[0.16em] transition-[color,border-color] duration-hover ease-out",
                      isActive
                        ? "border-primary text-primary"
                        : "border-transparent text-foreground/70 hover:border-primary/40 hover:text-foreground",
                      isOpen && !isActive && "border-primary/40 text-foreground",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn(
                        "size-4 transition-colors duration-hover",
                        isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                      )}
                    />
                    <span>{category.name}</span>
                  </a>

                  {/* Subcategory dropdown */}
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        id={menuId}
                        initial={{ opacity: 0, transform: "translateY(4px)" }}
                        animate={{ opacity: 1, transform: "translateY(0px)", transition: { duration: 0.2, ease: EASE_OUT } }}
                        exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } }}
                        style={{ transformOrigin: "top left" }}
                        className="tx-paper panel rounded-card absolute left-0 top-full z-popover mt-px min-w-[240px] py-1.5"
                        onMouseEnter={() => handleMouseEnter(category.name)}
                        onMouseLeave={handleMouseLeave}
                      >
                        <ul>
                          {subcategories.map((sub) => (
                            <li key={sub.slug}>
                              <Link
                                to={`/category/${categorySlug}?sub=${sub.slug}`}
                                onClick={() => setHoveredCategory(null)}
                                className="focus-inset flex w-full items-center justify-between px-5 py-2.5 text-left text-sm text-foreground transition-colors duration-hover hover:bg-accent hover:text-primary"
                              >
                                <span>{sub.name}</span>
                                {sub.children && sub.children.length > 0 && (
                                  <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
                                )}
                              </Link>
                              {/* Sub-subcategories */}
                              {sub.children && sub.children.length > 0 && (
                                <ul className="pl-4">
                                  {sub.children.map((child) => (
                                    <li key={child.slug}>
                                      <Link
                                        to={`/category/${categorySlug}?sub=${sub.slug}&subsub=${child.slug}`}
                                        onClick={() => setHoveredCategory(null)}
                                        className="focus-inset block w-full px-4 py-2 text-left text-[13px] text-muted-foreground transition-colors duration-hover hover:bg-accent hover:text-foreground"
                                      >
                                        {child.name}
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
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
