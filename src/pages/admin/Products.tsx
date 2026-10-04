import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  MoreVertical,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Filter,
  Package,
  LayoutGrid,
  List,
  ScanLine,
  X,
  CircleCheck,
  CircleX,
  ImageOff,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { IconButton } from '@/components/ui/icon-button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { Notice } from '@/components/ui/notice';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { formatINR, plural } from '@/lib/format';
import { getAllProducts, deleteProduct, updateProduct, Product } from '@/services/productService';
import {
  subscribeToCategories,
  healDuplicateCategories,
  Category,
} from '@/services/categoryService';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { SmartImage } from "@/components/ui/smart-image";
import BarcodeScannerDialog from '@/components/admin/BarcodeScannerDialog';
import { useHardwareScanner } from '@/hooks/useHardwareScanner';
import { describeError } from '@/lib/errorMessage';
import { matchesTaxon } from '@/lib/taxonomy';

/**
 * One dropdown row: name on the left, how many products it holds on the right -
 * the same "name + count" read the storefront category filters give.
 */
type StatusFilter = 'all' | 'active' | 'inactive' | 'soldOut' | 'noImages';

const stockOf = (p: Product) => Number(p.inventory?.stock ?? 0);
const hasImages = (p: Product) => (p.media?.images?.length ?? 0) > 0;

/**
 * Which filter tab a product belongs to. The tabs overlap on purpose: a
 * sold-out product is also hidden, and both views should list it.
 */
const inStatus = (p: Product, f: StatusFilter): boolean => {
  switch (f) {
    case 'active': return Boolean(p.flags?.isActive);
    case 'inactive': return !p.flags?.isActive;
    case 'soldOut': return stockOf(p) <= 0;
    case 'noImages': return !hasImages(p);
    default: return true;
  }
};

/**
 * What the card badge says. "Inactive" alone gave no clue whether the owner
 * hid a piece, it sold out, or it had no photo - three very different to-dos.
 */
const statusBadge = (p: Product): { label: string; tone: StatusTone; icon: LucideIcon } => {
  if (p.flags?.isActive && stockOf(p) > 0) return { label: 'Live', tone: 'success', icon: CircleCheck };
  if (stockOf(p) <= 0) return { label: 'Sold out · hidden', tone: 'danger', icon: CircleX };
  if (!hasImages(p)) return { label: 'No photo · hidden', tone: 'warning', icon: ImageOff };
  return { label: 'Hidden', tone: 'neutral', icon: EyeOff };
};

const STATUS_TABS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Live' },
  { value: 'inactive', label: 'Hidden' },
  { value: 'soldOut', label: 'Sold out' },
  { value: 'noImages', label: 'No photos' },
];

const FilterOption = ({ label, count }: { label: string; count: number }) => (
  <span className="flex w-full items-center justify-between gap-3">
    <span className={count === 0 ? 'text-muted-foreground' : undefined}>{label}</span>
    <span
      className={`rounded-chip px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
        count === 0 ? 'bg-muted text-muted-foreground' : 'bg-muted text-foreground'
      }`}
    >
      {count}
    </span>
  </span>
);

const Products = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // The admin header search sends people here as /admin/products?q=...
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  useEffect(() => {
    setSearchQuery(urlQuery);
  }, [urlQuery]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  // The menu trigger that opened the delete dialog, to get focus back on cancel.
  const confirmReturnRef = useRef<HTMLElement | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [categories, setCategories] = useState<Category[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');
  // Sub levels are held as slugs, matched with matchesTaxon - see the filter effect.
  const [subcategoryFilter, setSubcategoryFilter] = useState('all');
  const [subSubcategoryFilter, setSubSubcategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [scannerOpen, setScannerOpen] = useState(false);

  /**
   * Find a product by scanning, with no dialog and no camera.
   *
   * The counter has a corded scanner, so the fastest possible flow is: stand on
   * this page, scan the tag, see the product. Disabled while the camera dialog
   * is open, which does its own listening.
   */
  const handleScannedCode = (code: string) => {
    setSearchQuery(code);
    const hit = products.find((p) => (p.barcode || '').trim() === code.trim());
    toast({
      title: hit ? 'Product found' : 'No product with that barcode',
      description: hit ? hit.name : code,
      variant: hit ? undefined : 'destructive',
    });
  };

  useHardwareScanner({ onScan: handleScannedCode, enabled: !scannerOpen });
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchProducts();
    // Admin screens are the only place with write access, so this is where the
    // duplicate category documents left by the old seeding get merged away.
    healDuplicateCategories();
    const unsub = subscribeToCategories(setCategories);
    return unsub;
  }, []);

  /**
   * The "Filters" button next to the search box used to be inert, so the only
   * way to see one category's products was to type its name into search - and
   * that also matched every product whose *name* contained the word. Search now
   * also matches SKU and barcode so a scanned code finds its product.
   */
  const matchesSearch = (product: Product, q: string) => {
    if (!q) return true;
    return Boolean(
      product.name?.toLowerCase().includes(q) ||
        product.category?.toLowerCase().includes(q) ||
        (product.subcategory || '').toLowerCase().includes(q) ||
        (product.subSubcategory || '').toLowerCase().includes(q) ||
        (product.inventory?.sku || '').toLowerCase().includes(q) ||
        (product.barcode || '').toLowerCase().includes(q),
    );
  };

  const matchesStatus = (product: Product) => inStatus(product, statusFilter);

  /** Tab counts, over everything that matches the search box. */
  const statusCounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const pool = products.filter((p) => matchesSearch(p, q));
    return Object.fromEntries(
      STATUS_TABS.map((t) => [t.value, pool.filter((p) => inStatus(p, t.value)).length]),
    ) as Record<StatusFilter, number>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, searchQuery]);

  /** Subcategories of the selected category, for the second filter dropdown. */
  const subcategoryOptions = useMemo(() => {
    if (categoryFilter === 'all') return [];
    const cat = categories.find((c) => c.name === categoryFilter);
    return cat?.subcategories || [];
  }, [categories, categoryFilter]);

  /** Children of the selected subcategory, for the third filter dropdown. */
  const subSubcategoryOptions = useMemo(() => {
    if (subcategoryFilter === 'all') return [];
    const sub = subcategoryOptions.find((s) => s.slug === subcategoryFilter);
    return sub?.children || [];
  }, [subcategoryOptions, subcategoryFilter]);

  /**
   * Everything the taxonomy dropdowns choose from: search and status applied,
   * but not the category levels themselves, so each option can show how many
   * products picking it would give.
   */
  const searchPool = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => matchesSearch(p, q) && matchesStatus(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, searchQuery, statusFilter]);

  const inCategory = useMemo(
    () =>
      categoryFilter === 'all'
        ? searchPool
        : searchPool.filter((p) => (p.category || '') === categoryFilter),
    [searchPool, categoryFilter],
  );

  const inSubcategory = useMemo(
    () =>
      subcategoryFilter === 'all'
        ? inCategory
        : inCategory.filter((p) => matchesTaxon(p.subcategory, subcategoryFilter, subcategoryOptions)),
    [inCategory, subcategoryFilter, subcategoryOptions],
  );

  /**
   * Counts shown next to each dropdown option.
   *
   * Sub levels are matched with matchesTaxon because the product form stores
   * the display *name* while these dropdowns address a *slug* - comparing the
   * two directly showed zero products for any name with a space in it.
   */
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of searchPool) {
      const key = p.category || '';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [searchPool]);

  const subcategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sub of subcategoryOptions) {
      counts.set(
        sub.slug,
        inCategory.filter((p) => matchesTaxon(p.subcategory, sub.slug, subcategoryOptions)).length,
      );
    }
    return counts;
  }, [inCategory, subcategoryOptions]);

  const subSubcategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const child of subSubcategoryOptions) {
      counts.set(
        child.slug,
        inSubcategory.filter((p) => matchesTaxon(p.subSubcategory, child.slug, subSubcategoryOptions)).length,
      );
    }
    return counts;
  }, [inSubcategory, subSubcategoryOptions]);

  useEffect(() => {
    const filtered =
      subSubcategoryFilter === 'all'
        ? inSubcategory
        : inSubcategory.filter((p) =>
            matchesTaxon(p.subSubcategory, subSubcategoryFilter, subSubcategoryOptions),
          );
    setFilteredProducts(filtered);
  }, [inSubcategory, subSubcategoryFilter, subSubcategoryOptions]);

  const activeFilterCount =
    (categoryFilter !== 'all' ? 1 : 0) +
    (subcategoryFilter !== 'all' ? 1 : 0) +
    (subSubcategoryFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setCategoryFilter('all');
    setSubcategoryFilter('all');
    setSubSubcategoryFilter('all');
    setStatusFilter('all');
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await getAllProducts();
      setProducts(data);
      setFilteredProducts(data);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast({
        title: 'Could not load products',
        description: describeError(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleVisibility = async (product: Product) => {
    const showing = !product.flags.isActive;
    // Putting a sold-out piece back on the storefront only lets customers get
    // as far as checkout and be refused there. Say why instead of doing it.
    if (showing && stockOf(product) <= 0) {
      toast({
        title: 'Out of stock, not shown',
        description: `${product.name} has 0 in stock. Edit it and add stock; it goes live again on save.`,
        variant: 'destructive',
      });
      return;
    }
    try {
      await updateProduct(product.id!, {
        flags: { ...product.flags, isActive: showing },
        // A hand-made show or hide replaces whatever rule set the old state.
        inactiveReason: null,
      } as any);

      setProducts((prev) =>
        prev.map((p) =>
          p.id === product.id
            ? { ...p, flags: { ...p.flags, isActive: showing }, inactiveReason: null }
            : p
        )
      );
      
      toast({
        title: product.flags.isActive ? 'Product hidden' : 'Product shown',
        description: `${product.name} is ${product.flags.isActive ? 'hidden from' : 'live on'} the store.`,
      });
    } catch (error) {
      console.error('Error toggling visibility:', error);
      toast({
        title: 'Could not change visibility',
        description: describeError(error),
        variant: 'destructive',
      });
    }
  };

  const handleDeleteClick = (product: Product) => {
    setProductToDelete(product);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;
    
    try {
      await deleteProduct(productToDelete.id!);
      setProducts((prev) => prev.filter((p) => p.id !== productToDelete.id));
      toast({
        title: 'Product deleted',
        description: productToDelete.name,
      });
    } catch (error) {
      console.error('Error deleting product:', error);
      toast({
        title: 'Could not delete product',
        description: describeError(error),
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageHeader
        title="Products"
        description="Add, edit and feature products."
        actions={
          <Button asChild>
            <Link to="/admin/products/new">
              <Plus aria-hidden="true" />
              Add product
            </Link>
          </Button>
        }
      />

      <div className="space-y-5">
      {/* Toolbar: search on its own row on phones, then Scan / Filters / view */}
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <div className="relative flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search products"
            placeholder="Search by name, category, SKU or barcode"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-12 [&::-webkit-search-cancel-button]:hidden"
          />
          {searchQuery && (
            <IconButton
              label="Clear search"
              size="sm"
              onClick={() => setSearchQuery('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X />
            </IconButton>
          )}
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:flex sm:gap-3">
          <Button
            variant="outline"
            size="sm"
            className="h-11"
            onClick={() => setScannerOpen(true)}
            title="Scan a barcode to find its product"
          >
            <ScanLine aria-hidden="true" />
            Scan
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-11"
            aria-expanded={showFilters}
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter aria-hidden="true" />
            Filters
            {activeFilterCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-chip bg-primary px-1.5 text-[11px] font-semibold tabular-nums text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as 'grid' | 'table')}
            aria-label="Product view"
            className="h-11"
          >
            <ToggleGroupItem value="grid" aria-label="Grid view" size="sm" className="w-9 px-0">
              <LayoutGrid aria-hidden="true" className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" aria-label="List view" size="sm" className="w-9 px-0">
              <List aria-hidden="true" className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/*
        The warning that matters most: sold-out pieces are hidden from shoppers
        by the order that sold their last unit. The admin push notification only
        reaches a browser that allowed notifications, so the page says it too.
      */}
      {statusCounts.soldOut > 0 && statusFilter !== 'soldOut' && (
        <Notice
          tone="warning"
          action={
            <Button variant="outline" size="sm" onClick={() => setStatusFilter('soldOut')}>
              Review sold out
            </Button>
          }
        >
          <span className="font-semibold">
            {statusCounts.soldOut} product{statusCounts.soldOut === 1 ? ' is' : 's are'} out of stock
          </span>{' '}
          and hidden from the store. Add stock to put {statusCounts.soldOut === 1 ? 'it' : 'them'} back on sale.
        </Notice>
      )}

      {/*
        Always visible, unlike the Filters panel below it, so hidden, sold-out
        and photo-less products are one tap away.
      */}
      <ToggleGroup
        type="single"
        value={statusFilter}
        onValueChange={(v) => v && setStatusFilter(v as StatusFilter)}
        aria-label="Filter by status"
        className="max-w-full flex-wrap justify-start sm:flex-nowrap sm:overflow-x-auto sm:[scrollbar-width:none]"
      >
        {STATUS_TABS.map((tab) => {
          const count = statusCounts[tab.value] ?? 0;
          const warn = (tab.value === 'soldOut' || tab.value === 'noImages') && count > 0;
          return (
            <ToggleGroupItem key={tab.value} value={tab.value} size="sm" className="shrink-0 gap-1.5">
              {tab.label}
              <span
                className={`rounded-chip px-1.5 text-[11px] font-semibold tabular-nums ${
                  warn ? 'bg-status-warning-bg text-status-warning-fg' : 'bg-foreground/[0.06] text-foreground/80'
                }`}
              >
                {count}
              </span>
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>

      {showFilters && (
        <div className="grid grid-cols-1 gap-4 rounded-card border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="filter-category" className="text-xs font-medium text-foreground/80">Category</Label>
            <Select
              value={categoryFilter}
              onValueChange={(v) => {
                setCategoryFilter(v);
                setSubcategoryFilter('all');
                setSubSubcategoryFilter('all');
              }}
            >
              <SelectTrigger id="filter-category" className="mt-1.5">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <FilterOption label="All categories" count={searchPool.length} />
                </SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    <FilterOption label={c.name} count={categoryCounts.get(c.name) || 0} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="filter-subcategory" className="text-xs font-medium text-foreground/80">Subcategory</Label>
            <Select
              value={subcategoryFilter}
              onValueChange={(v) => {
                setSubcategoryFilter(v);
                setSubSubcategoryFilter('all');
              }}
              disabled={categoryFilter === 'all' || subcategoryOptions.length === 0}
            >
              <SelectTrigger id="filter-subcategory" className="mt-1.5">
                <SelectValue placeholder="All subcategories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <FilterOption label="All subcategories" count={inCategory.length} />
                </SelectItem>
                {subcategoryOptions.map((sub) => (
                  <SelectItem key={sub.slug} value={sub.slug}>
                    <FilterOption label={sub.name} count={subcategoryCounts.get(sub.slug) || 0} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="filter-subsub" className="text-xs font-medium text-foreground/80">Sub-subcategory</Label>
            <Select
              value={subSubcategoryFilter}
              onValueChange={setSubSubcategoryFilter}
              disabled={subcategoryFilter === 'all' || subSubcategoryOptions.length === 0}
            >
              <SelectTrigger id="filter-subsub" className="mt-1.5">
                <SelectValue placeholder="All sub-subcategories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <FilterOption label="All sub-subcategories" count={inSubcategory.length} />
                </SelectItem>
                {subSubcategoryOptions.map((child) => (
                  <SelectItem key={child.slug} value={child.slug}>
                    <FilterOption label={child.name} count={subSubcategoryCounts.get(child.slug) || 0} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {subcategoryFilter !== 'all' && subSubcategoryOptions.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                This subcategory has no sub-subcategories.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="filter-status" className="text-xs font-medium text-foreground/80">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger id="filter-status" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Live only</SelectItem>
                <SelectItem value="inactive">Hidden only</SelectItem>
                <SelectItem value="soldOut">Sold out</SelectItem>
                <SelectItem value="noImages">No photos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between sm:col-span-2 lg:col-span-4">
            <p className="text-xs tabular-nums text-muted-foreground">
              {filteredProducts.length} of {plural(products.length, 'product')}
            </p>
            {activeFilterCount > 0 && (
              <Button variant="link" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Products view */}
      {loading ? (
        <div aria-busy="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <span className="sr-only">Loading products</span>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-card border border-border bg-card">
              <Skeleton className="aspect-square w-full rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-card border border-dashed border-border bg-card px-4 py-12">
          <EmptyState
            icon={Package}
            title="No products found"
            description={searchQuery ? 'Try a different name, SKU or barcode.' : 'Add your first product to start selling.'}
            action={!searchQuery ? { label: 'Add product', to: '/admin/products/new' } : undefined}
          />
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid view */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.map((product) => {
            const status = statusBadge(product);
            const stock = product.inventory?.stock || 0;
            return (
              <div
                key={product.id}
                className="group relative overflow-hidden rounded-card border border-border bg-card transition-[box-shadow,border-color] duration-hover ease-out hover:border-foreground/20 hover:shadow-md has-[a:focus-visible]:outline has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-ring"
              >
                <div className="relative aspect-square bg-muted">
                  <SmartImage
                    src={product.media?.thumbnail || '/placeholder.png'}
                    alt=""
                    className="h-full w-full object-cover" preset="tile" />
                  <StatusBadge
                    tone={status.tone}
                    label={status.label}
                    icon={status.icon}
                    className="absolute right-2 top-2 max-w-[calc(100%-3.5rem)] truncate"
                  />
                  <div className="absolute left-1.5 top-1.5 z-raised opacity-100 transition-opacity duration-hover lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 lg:has-[[data-state=open]]:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton
                          label={`Actions for ${product.name}`}
                          onFocus={(e) => { confirmReturnRef.current = e.currentTarget; }}
                          size="sm"
                          variant="solid"
                          className="bg-card/90 text-foreground shadow-sm focus-visible:opacity-100"
                        >
                          <MoreVertical />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem asChild>
                          <Link to={`/admin/products/${product.id}`} className="cursor-pointer">
                            <Edit aria-hidden="true" className="mr-2 h-4 w-4" /> Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer" onClick={() => handleToggleVisibility(product)}>
                          {product.flags?.isActive ? <><EyeOff aria-hidden="true" className="mr-2 h-4 w-4" /> Hide</> : <><Eye aria-hidden="true" className="mr-2 h-4 w-4" /> Show</>}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer text-status-danger-fg focus:text-status-danger-fg" onClick={() => handleDeleteClick(product)}>
                          <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="p-3 sm:p-4">
                  <h2 className="truncate text-sm font-medium text-foreground" title={product.name}>
                    <Link
                      to={`/admin/products/${product.id}`}
                      className="outline-none after:absolute after:inset-0 after:content-['']"
                    >
                      {product.name}
                    </Link>
                  </h2>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{product.category}</p>
                  <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                    <p className="tabular-nums">
                      <span className="font-semibold text-foreground">{formatINR(product.price)}</span>
                      {product.originalPrice && product.originalPrice > product.price && (
                        <span className="ml-1.5 text-xs text-muted-foreground line-through">{formatINR(product.originalPrice)}</span>
                      )}
                    </p>
                    <span className={`text-xs tabular-nums ${stock > 0 ? 'text-muted-foreground' : 'font-medium text-status-danger-fg'}`}>
                      {stock > 0 ? `${stock} in stock` : 'Out of stock'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table view */
        <div className="overflow-hidden rounded-card border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground sm:px-6">Product</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground sm:px-6">Category</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-muted-foreground sm:px-6">Price</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-muted-foreground sm:px-6">Stock</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground sm:px-6">Status</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-muted-foreground sm:px-6"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProducts.map((product) => {
                  const status = statusBadge(product);
                  const stock = product.inventory?.stock || 0;
                  return (
                    <tr key={product.id} className="cursor-pointer transition-colors duration-hover hover:bg-muted/60" onClick={() => navigate(`/admin/products/${product.id}`)}>
                      <td className="px-4 py-3 sm:px-6">
                        <div className="flex items-center gap-3">
                          <SmartImage src={product.media?.thumbnail || '/placeholder.png'} alt="" className="h-12 w-12 shrink-0 rounded-control bg-muted object-cover" preset="tile" />
                          <div className="min-w-0">
                            <Link
                              to={`/admin/products/${product.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium text-foreground hover:text-primary focus-inset"
                            >
                              {product.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">SKU: {product.inventory?.sku || 'N/A'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground/80 sm:px-6">{product.category}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums sm:px-6">
                        <span className="font-medium text-foreground">{formatINR(product.price)}</span>
                        {product.originalPrice && product.originalPrice > product.price && (
                          <span className="ml-2 text-xs text-muted-foreground line-through">{formatINR(product.originalPrice)}</span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums sm:px-6 ${stock > 0 ? 'text-foreground/80' : 'font-medium text-status-danger-fg'}`}>
                        {stock}
                      </td>
                      <td className="px-4 py-3 sm:px-6">
                        <StatusBadge tone={status.tone} label={status.label} icon={status.icon} />
                      </td>
                      <td className="px-4 py-3 text-right sm:px-6" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton label={`Actions for ${product.name}`}
                          onFocus={(e) => { confirmReturnRef.current = e.currentTarget; }} size="sm">
                              <MoreVertical />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to={`/admin/products/${product.id}`} className="cursor-pointer">
                                <Edit aria-hidden="true" className="mr-2 h-4 w-4" /> Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer" onClick={() => handleToggleVisibility(product)}>
                              {product.flags?.isActive ? <><EyeOff aria-hidden="true" className="mr-2 h-4 w-4" /> Hide</> : <><Eye aria-hidden="true" className="mr-2 h-4 w-4" /> Show</>}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer text-status-danger-fg focus:text-status-danger-fg" onClick={() => handleDeleteClick(product)}>
                              <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </div>

      <ConfirmDialog
        returnFocusRef={confirmReturnRef}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title={`Delete ${productToDelete?.name ?? 'this product'}?`}
        description="It is removed from the store and from the admin. This cannot be undone."
        confirmLabel="Delete product"
        tone="danger"
        onConfirm={handleDeleteConfirm}
      />

      <BarcodeScannerDialog
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleScannedCode}
        title="Scan to find a product"
        description="Scanning fills the search box with the barcode."
      />
    </div>
  );
};

export default Products;
