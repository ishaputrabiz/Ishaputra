import React from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { onCatalogPublishFailure } from '@/services/catalogPublisher';
import { DELIVERY_PARTNERS_ENABLED } from '@/config/features';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Image,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Layers,
  Truck,
  MessageSquare,
  Gift,
  Ticket,
  Star,
  Settings,
  Users2,
  Sparkles,
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import StorageLimitWatcher from '@/components/admin/StorageLimitWatcher';
import ThemeToggle from '@/components/ThemeToggle';
import { useTheme } from '@/contexts/ThemeContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Public-folder logos (same source as the customer Header)
const lightModeLogo = "/black_logo.png";
const darkModeLogo = "/white_logo.png";

const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [contentMediaOpen, setContentMediaOpen] = React.useState(false);
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

  const handleLogout = async () => {
    await logout();
    navigate('/admin');
  };

  const contentMediaPaths = ['/admin/banners', '/admin/home-banners', '/admin/home-collections', '/admin/showcases', '/admin/testimonials', '/admin/gallery', '/admin/videos', '/admin/reviews', '/admin/site-settings'];
  const isContentMediaActive = contentMediaPaths.some(p => location.pathname.startsWith(p));

  // Auto-open dropdown when navigating to a content media page
  React.useEffect(() => {
    if (isContentMediaActive) {
      setContentMediaOpen(true);
    }
  }, [isContentMediaActive]);

  const mainNavItems = [
    { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/admin/products', icon: Package, label: 'Products' },
    { path: '/admin/orders', icon: ShoppingCart, label: 'Orders' },
    // Delivery-partner management — only shown when the delivery system is enabled.
    ...(DELIVERY_PARTNERS_ENABLED
      ? [{ path: '/admin/delivery-boys', icon: Truck, label: 'Delivery Boys' }]
      : []),
    { path: '/admin/customers', icon: Users2, label: 'Customers' },
    { path: '/admin/coupons', icon: Ticket, label: 'Coupons' },
    { path: '/admin/gift-cards', icon: Gift, label: 'Gift Cards' },
    { path: '/admin/video-calls', icon: Video, label: 'Video Calls' },
    { path: '/admin/newsletter', icon: Mail, label: 'Newsletter' },
    { path: '/admin/silver-rate', icon: Coins, label: 'Silver Rate' },
    { path: '/admin/commerce-settings', icon: Settings, label: 'Commerce' },
    { path: '/admin/image-prompts', icon: Sparkles, label: 'AI Prompts' },
    { path: '/admin/marketing', icon: Bell, label: 'Marketing' },
    { path: '/admin/whatsapp', icon: MessagesSquare, label: 'WhatsApp' },
    { path: '/admin/storage', icon: HardDrive, label: 'Storage' },
    { path: '/admin/settings', icon: Settings, label: 'Settings' },
  ];

  const contentMediaItems = [
    { path: '/admin/banners', icon: Layers, label: 'Hero Banners' },
    { path: '/admin/showcases', icon: Layers, label: 'Showcases' },
    { path: '/admin/home-banners', icon: PanelTop, label: 'Collection Banner' },
    { path: '/admin/home-collections', icon: LayoutGrid, label: 'Our Collections' },
    { path: '/admin/videos', icon: Youtube, label: 'Videos' },
    { path: '/admin/testimonials', icon: MessageSquare, label: 'Testimonials' },
    { path: '/admin/gallery', icon: Image, label: 'Gallery' },
    { path: '/admin/reviews', icon: Star, label: 'Reviews' },
    { path: '/admin/site-settings', icon: Globe, label: 'Footer & Brand' },
  ];

  return (
    <div className="min-h-screen bg-[#FBF8F3] dark:bg-gray-950 font-['Poppins']" style={{ fontFamily: 'Poppins, sans-serif' }}>
      <style>{`
        .admin-panel h1, .admin-panel h2, .admin-panel h3, 
        .admin-panel h4, .admin-panel h5, .admin-panel h6 {
          font-family: 'Poppins', sans-serif !important;
        }
        .admin-nav-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(180, 83, 9, 0.45) transparent;
        }
        .admin-nav-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .admin-nav-scroll::-webkit-scrollbar-thumb {
          background: rgba(180, 83, 9, 0.35);
          border-radius: 999px;
        }
        .admin-nav-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-[#FFFBF5] dark:bg-gray-900 border-r border-[#F5EFE6] dark:border-gray-800 transform transition-transform duration-300 ease-in-out lg:translate-x-0 flex flex-col ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-[#F5EFE6] dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-3">
            <img src={resolvedTheme === 'dark' ? darkModeLogo : lightModeLogo} alt="Sreerasthu Silvers" className="h-8 w-auto" />
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-400 hover:text-gray-600 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="admin-nav-scroll flex-1 overflow-y-auto p-4 pr-3 space-y-1">
          {/* Main nav items (all except Settings) */}
          {mainNavItems.slice(0, -1).map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[#FFF9E6] dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-[#FFF9E6]/50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                }`
              }
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* Content & Media Dropdown */}
          <div>
            <button
              onClick={() => setContentMediaOpen(!contentMediaOpen)}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg transition-colors ${
                isContentMediaActive
                  ? 'bg-[#FFF9E6] dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-[#FFF9E6]/50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Image className="h-5 w-5" />
                <span>Content & Media</span>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${contentMediaOpen ? 'rotate-180' : ''}`} />
            </button>
            {contentMediaOpen && (
              <div className="ml-4 mt-1 space-y-1 border-l-2 border-[#F5EFE6] dark:border-gray-700 pl-3">
                {contentMediaItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                        isActive
                          ? 'bg-[#FFF9E6] dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-[#FFF9E6]/50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>

          {/* Settings */}
          <NavLink
            to={mainNavItems[mainNavItems.length - 1].path}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-[#FFF9E6] dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-[#FFF9E6]/50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              }`
            }
          >
            <Settings className="h-5 w-5" />
            <span>Settings</span>
          </NavLink>

          {/* Logout Button - Inside Scroll Area */}
          <div className="pt-4 mt-4 border-t border-[#F5EFE6] dark:border-gray-800">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 w-full text-gray-700 dark:text-gray-300 hover:bg-[#FFF9E6]/50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white rounded-lg transition-colors"
            >
              <LogOut className="h-5 w-5" />
              <span>Logout</span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64">
        {/* Top Header */}
        <header className="h-16 bg-[#FFFBF5] dark:bg-gray-900 border-b border-[#F5EFE6] dark:border-gray-800 flex items-center justify-between px-4 lg:px-6">
          {/* Mobile Menu Button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-gray-600 hover:text-gray-900"
          >
            <Menu className="h-6 w-6" />
          </button>

          {/* Search (placeholder) */}
          <div className="hidden md:block flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search..."
              className="w-full bg-white dark:bg-gray-800 border border-[#F5EFE6] dark:border-gray-700 rounded-lg px-4 py-2 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:border-amber-600"
            />
          </div>

          {/* Theme Toggle & User Menu */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <div className="w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {userProfile?.username?.charAt(0).toUpperCase() || 'A'}
                  </span>
                </div>
                <span className="hidden md:block">{userProfile?.username || 'Admin'}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-gray-900 border-[#F5EFE6] dark:border-gray-700">
              <DropdownMenuItem
                className="text-red-600 hover:text-red-700 hover:bg-red-50 cursor-pointer"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-6 admin-panel">
          <Outlet />
          <StorageLimitWatcher />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
