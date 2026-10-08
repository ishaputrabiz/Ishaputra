import React from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useToast } from '@/hooks/use-toast';
import { onCatalogPublishFailure } from '@/services/catalogPublisher';
import { subscribePendingDealerCount } from '@/services/dealerService';
import { DELIVERY_PARTNERS_ENABLED, SILVER_PRICING_ENABLED } from '@/config/features';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Image,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Truck,
  MessageSquare,
  Gift,
  Ticket,
  Star,
  Settings,
  Users2,
  Sparkles,
  ImageDown,
  Globe,
  Youtube,
  PanelTop,
  Bell,
  MessagesSquare,
  LayoutGrid,
  Video,
  Coins,
  Mail,
  HardDrive,
  Search,
  Store,
  Handshake,
  LayoutPanelTop,
  GalleryHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import StorageLimitWatcher from '@/components/admin/StorageLimitWatcher';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Public-folder logos (same source as the customer Header)
const lightModeLogo = "/black_logo.png";
const darkModeLogo = "/white_logo.png";

type NavItem = { path: string; icon: LucideIcon; label: string; /** Applications waiting, shown as a badge when above 0. */ count?: number };

/** One look for every sidebar row: links, the Content & Media toggle and Logout. */
const NAV_ROW =
  'flex w-full items-center gap-3 h-10 px-3 rounded-control text-sm font-medium transition-[background-color,color,box-shadow] duration-hover ease-out';
const NAV_IDLE = 'text-foreground/80 hover:bg-muted hover:text-foreground';
// 6% tint, not 10%: copper text on the 10% tint measured 4.38:1 in light mode; 6% gives 4.6:1.
const NAV_ACTIVE = 'bg-primary/[0.06] text-primary shadow-[inset_2px_0_0_hsl(var(--primary))]';

const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [contentMediaOpen, setContentMediaOpen] = React.useState(false);
  const [headerQuery, setHeaderQuery] = React.useState('');
  const [pendingDealers, setPendingDealers] = React.useState(0);
  const { userProfile, logout } = useAuth();
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  /**
   * Say so when a change does not reach the storefront.
   *
   * The snapshot that feeds every listing page is published in the background
   * after a product write. When that silently failed, the admin saw the new
   * price on the product page (which reads Firestore) and had no idea the grid
   * shoppers see was still serving the old one.
   */
  React.useEffect(
    () =>
      onCatalogPublishFailure((message) =>
        toast({ title: 'Storefront not updated', description: message, variant: 'destructive' }),
      ),
    [toast],
  );

  // Dealer applications waiting for review: one listener for the whole admin area.
  // On an error the badge simply stays hidden; the Dealers page reports the problem itself.
  React.useEffect(
    () =>
      subscribePendingDealerCount(setPendingDealers, () => setPendingDealers(0)),
    [],
  );

  // The drawer only exists below lg; close it if the window grows past that.
  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (mq.matches) setSidebarOpen(false);
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/admin');
  };

  const handleHeaderSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = headerQuery.trim();
    navigate(q ? `/admin/products?q=${encodeURIComponent(q)}` : '/admin/products');
  };

  const contentMediaPaths = ['/admin/banners', '/admin/home-banners', '/admin/home-collections', '/admin/showcases', '/admin/testimonials', '/admin/gallery', '/admin/videos', '/admin/reviews', '/admin/site-settings'];
  const isContentMediaActive = contentMediaPaths.some(p => location.pathname.startsWith(p));

  // Auto-open dropdown when navigating to a content media page
  React.useEffect(() => {
    if (isContentMediaActive) {
      setContentMediaOpen(true);
    }
  }, [isContentMediaActive]);

  const mainNavItems: NavItem[] = [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/products', icon: Package, label: 'Products' },
    { path: '/admin/orders', icon: ShoppingCart, label: 'Orders' },
    // Delivery-partner management: only shown when the delivery system is enabled.
    ...(DELIVERY_PARTNERS_ENABLED
      ? [{ path: '/admin/delivery-boys', icon: Truck, label: 'Delivery boys' }]
      : []),
    { path: '/admin/customers', icon: Users2, label: 'Customers' },
    { path: '/admin/dealers', icon: Handshake, label: 'Dealers', count: pendingDealers },
    { path: '/admin/coupons', icon: Ticket, label: 'Coupons' },
    { path: '/admin/gift-cards', icon: Gift, label: 'Gift cards' },
    { path: '/admin/video-calls', icon: Video, label: 'Video calls' },
    { path: '/admin/newsletter', icon: Mail, label: 'Newsletter' },
    ...(SILVER_PRICING_ENABLED ? [{ path: '/admin/silver-rate', icon: Coins, label: 'Silver rate' }] : []),
    { path: '/admin/commerce-settings', icon: Store, label: 'Commerce' },
    { path: '/admin/image-prompts', icon: Sparkles, label: 'AI prompts' },
    { path: '/admin/image-compressor', icon: ImageDown, label: 'Image compressor' },
    { path: '/admin/marketing', icon: Bell, label: 'Marketing' },
    { path: '/admin/whatsapp', icon: MessagesSquare, label: 'WhatsApp' },
    { path: '/admin/storage', icon: HardDrive, label: 'Storage' },
    { path: '/admin/settings', icon: Settings, label: 'Settings' },
  ];

  const contentMediaItems: NavItem[] = [
    { path: '/admin/banners', icon: GalleryHorizontal, label: 'Hero banners' },
    { path: '/admin/showcases', icon: LayoutPanelTop, label: 'Showcases' },
    { path: '/admin/home-banners', icon: PanelTop, label: 'Collection banner' },
    { path: '/admin/home-collections', icon: LayoutGrid, label: 'Our collections' },
    { path: '/admin/videos', icon: Youtube, label: 'Video stories' },
    { path: '/admin/testimonials', icon: MessageSquare, label: 'Testimonials' },
    { path: '/admin/gallery', icon: Image, label: 'Gallery' },
    { path: '/admin/reviews', icon: Star, label: 'Customer reviews' },
    { path: '/admin/site-settings', icon: Globe, label: 'Footer and brand' },
  ];

  const settingsItem = mainNavItems[mainNavItems.length - 1];

  // Tab and history names: the nav label of the current page (detail pages get their own), never indexed.
  const pageTitle = (() => {
    const path = location.pathname.replace(/\/+$/, '');
    if (path === '/admin/products/new') return 'Add product';
    if (path.startsWith('/admin/products/')) return 'Edit product';
    if (path.startsWith('/admin/orders/')) return 'Order details';
    if (path.startsWith('/admin/customers/')) return 'Customer details';
    if (path.startsWith('/admin/delivery-boys/')) return 'Delivery partner';
    const item = [...mainNavItems, ...contentMediaItems].find((i) => path === i.path || path.startsWith(`${i.path}/`));
    return item?.label ?? 'Dashboard';
  })();
  usePageMeta({ title: `${pageTitle} · Admin`, noindex: true });

  // Keep the current page's link in view: with Content and media open, the
  // active row can sit below the sidebar's fold on a 900px-tall screen.
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>('nav[aria-label="Admin"] a[aria-current="page"]').forEach((link) => {
        const nav = link.closest('nav');
        if (!nav || nav.clientHeight === 0) return;
        const navBox = nav.getBoundingClientRect();
        const linkBox = link.getBoundingClientRect();
        if (linkBox.bottom > navBox.bottom) nav.scrollTop += linkBox.bottom - navBox.bottom + 16;
        else if (linkBox.top < navBox.top) nav.scrollTop -= navBox.top - linkBox.top + 16;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.pathname, contentMediaOpen, sidebarOpen]);

  const navLinkClass = ({ isActive }: { isActive: boolean }) => cn(NAV_ROW, isActive ? NAV_ACTIVE : NAV_IDLE);

  /** The sidebar body, shared by the fixed aside (lg+) and the drawer (below lg). */
  const renderNav = (idPrefix: string) => (
    <>
      <nav aria-label="Admin" className="flex-1 overflow-y-auto overscroll-contain px-3 py-4">
        <ul className="flex flex-col gap-1">
          {/* Main nav items (all except Settings) */}
          {mainNavItems.slice(0, -1).map((item) => (
            <li key={item.path}>
              <NavLink to={item.path} onClick={() => setSidebarOpen(false)} className={navLinkClass}>
                <item.icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.count ? (
                  <span className="ml-auto rounded-chip bg-status-warning-bg px-1.5 text-xs font-semibold tabular-nums text-status-warning-fg">
                    <span className="sr-only">, </span>
                    {item.count}
                    <span className="sr-only"> pending</span>
                  </span>
                ) : null}
              </NavLink>
            </li>
          ))}

          {/* Content & Media group */}
          <li>
            <button
              type="button"
              onClick={() => setContentMediaOpen(!contentMediaOpen)}
              aria-expanded={contentMediaOpen}
              aria-controls={`${idPrefix}-content-media`}
              className={cn(NAV_ROW, 'justify-between', isContentMediaActive ? 'text-primary' : NAV_IDLE, isContentMediaActive && 'hover:bg-muted')}
            >
              <span className="flex items-center gap-3">
                <Image aria-hidden="true" className="size-4 shrink-0" />
                <span>Content and media</span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn('size-4 shrink-0 transition-transform duration-dropdown ease-out', contentMediaOpen && 'rotate-180')}
              />
            </button>
            {contentMediaOpen && (
              <ul
                id={`${idPrefix}-content-media`}
                className="mt-1 ml-5 flex flex-col gap-1 border-l border-sidebar-border pl-2"
              >
                {contentMediaItems.map((item) => (
                  <li key={item.path}>
                    <NavLink to={item.path} onClick={() => setSidebarOpen(false)} className={navLinkClass}>
                      <item.icon aria-hidden="true" className="size-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </li>

          {/* Settings */}
          <li>
            <NavLink to={settingsItem.path} onClick={() => setSidebarOpen(false)} className={navLinkClass}>
              <Settings aria-hidden="true" className="size-4 shrink-0" />
              <span>Settings</span>
            </NavLink>
          </li>
        </ul>
      </nav>

      {/* Logout, pinned to the sidebar footer */}
      <div className="shrink-0 border-t border-sidebar-border p-3">
        <button type="button" onClick={handleLogout} className={cn(NAV_ROW, NAV_IDLE)}>
          <LogOut aria-hidden="true" className="size-4 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </>
  );

  const logo = (
    <img
      src={resolvedTheme === 'dark' ? darkModeLogo : lightModeLogo}
      alt="Ishaputra Botanicals"
      className="h-8 w-auto"
    />
  );

  return (
    // The Sheet root wraps the shell so the hamburger can be its Trigger (focus returns to it on close).
    <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
    <div className="min-h-screen bg-background text-foreground" style={{ fontFamily: 'var(--font-body)' }}>
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-3 focus-visible:z-toast focus-visible:inline-flex focus-visible:h-11 focus-visible:items-center focus-visible:rounded-control focus-visible:bg-primary focus-visible:px-4 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Sidebar, lg and up */}
      <aside className="fixed inset-y-0 left-0 z-sticky hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-6">
          {logo}
        </div>
        {renderNav('aside')}
      </aside>

      {/* Sidebar drawer, below lg */}
        <SheetContent
          side="left"
          hideClose
          aria-describedby={undefined}
          className="flex w-64 flex-col gap-0 border-sidebar-border bg-sidebar p-0 sm:max-w-none lg:hidden"
        >
          <SheetTitle className="sr-only">Admin menu</SheetTitle>
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border pl-6 pr-2">
            {logo}
            <SheetClose asChild>
              <IconButton label="Close menu" className="size-11 [@media(pointer:fine)]:size-11">
                <X />
              </IconButton>
            </SheetClose>
          </div>
          {renderNav('drawer')}
        </SheetContent>

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Top Header */}
        <header className="flex h-16 items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar px-2 sm:px-4 lg:px-6">
          {/* Mobile Menu Button */}
          <SheetTrigger asChild>
            <IconButton label="Open menu" className="size-11 lg:hidden [@media(pointer:fine)]:size-11">
              <Menu />
            </IconButton>
          </SheetTrigger>

          {/* Search: jumps to Products filtered by the query */}
          <form role="search" onSubmit={handleHeaderSearch} className="relative hidden max-w-md flex-1 md:block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              aria-label="Search"
              value={headerQuery}
              onChange={(e) => setHeaderQuery(e.target.value)}
              placeholder="Search products"
              className="h-10 w-full rounded-control border border-input bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground transition-[border-color,box-shadow] duration-hover ease-out focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </form>

          {/* Theme Toggle & User Menu */}
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-11 gap-2 px-2 text-sm font-medium normal-case tracking-normal text-foreground/80 hover:bg-muted hover:text-foreground"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                  >
                    {userProfile?.username?.charAt(0).toUpperCase() || 'A'}
                  </span>
                  <span className="hidden md:block">{userProfile?.username || 'Admin'}</span>
                  <span className="sr-only md:hidden">Account menu</span>
                  <ChevronDown aria-hidden="true" className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={handleLogout}
                >
                  <LogOut aria-hidden="true" className="mr-2 size-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main id="main" tabIndex={-1} className="admin-panel p-4 outline-none lg:p-6">
          <Outlet />
          <StorageLimitWatcher />
        </main>
      </div>
    </div>
    </Sheet>
  );
};

export default AdminLayout;
