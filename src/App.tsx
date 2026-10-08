import { useState, useEffect, lazy, Suspense, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { RouteSkeleton } from "@/components/skeletons";
import { loadAnalytics } from "@/config/firebase";

// Auth Provider
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import { SilverRateProvider } from "@/contexts/SilverRateContext";
import ShoppingCart from "@/components/ShoppingCart";

// Route Guards
import ProtectedRoute from "@/guards/ProtectedRoute";
import AdminRoute from "@/guards/AdminRoute";
import DeliveryRoute from "@/guards/DeliveryRoute";
import { DELIVERY_PARTNERS_ENABLED, SILVER_PRICING_ENABLED } from "@/config/features";
import DeliveryLightThemeWrapper from "@/components/DeliveryLightThemeWrapper";

// Public Pages
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
const CategoryPage = lazy(() => import("./pages/CategoryPage"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Contact = lazy(() => import("./pages/Contact"));
const About = lazy(() => import("./pages/About"));
const CustomerSupport = lazy(() => import("./pages/CustomerSupport"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsConditions = lazy(() => import("./pages/TermsConditions"));
const ShippingPolicy = lazy(() => import("./pages/ShippingPolicy"));
const CancellationRefundPolicy = lazy(() => import("./pages/CancellationRefundPolicy"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const MobileCategories = lazy(() => import("./pages/MobileCategories"));
const Checkout = lazy(() => import("./pages/Checkout"));
const Account = lazy(() => import("./pages/Account"));
const SavedAddresses = lazy(() => import("./pages/SavedAddresses"));
const BuyAgain = lazy(() => import("./pages/BuyAgain"));
import LoadingScreen from "./components/LoadingScreen";
import ScrollToTop from "./components/ScrollToTop";
const MobileOrders = lazy(() => import("./pages/MobileOrders"));
const OrderDetailsPage = lazy(() => import("./pages/OrderDetailsPage"));
const CancelOrderPage = lazy(() => import("./pages/CancelOrderPage"));
const ProfileEditPage = lazy(() => import("./pages/ProfileEditPage"));
const MobileSearch = lazy(() => import("./pages/MobileSearch"));
const SearchResults = lazy(() => import("./pages/SearchResults"));
// Purchase Summary & Security Pages
const PurchaseSummary = lazy(() => import("./pages/PurchaseSummary"));
const DealerProgramme = lazy(() => import("./pages/DealerProgramme"));
const SecurityPage = lazy(() => import("./pages/SecurityPage"));
// Auth Pages
const Signup = lazy(() => import("./pages/auth/Signup"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/auth/ResetPassword"));
const VerifyEmail = lazy(() => import("./pages/auth/VerifyEmail"));
// Admin Pages
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const Products = lazy(() => import("./pages/admin/Products"));
const ProductForm = lazy(() => import("./pages/admin/ProductForm"));
const Media = lazy(() => import("./pages/admin/Media"));
const AdminBanners = lazy(() => import("./pages/AdminBanners"));
const AdminShowcases = lazy(() => import("./pages/admin/AdminShowcases"));
const AdminTestimonials = lazy(() => import("./pages/admin/AdminTestimonials"));
const AdminGallery = lazy(() => import("./pages/admin/AdminGallery"));
const AdminOrders = lazy(() => import("./pages/AdminOrders"));
const AdminDeliveryBoys = lazy(() => import("./pages/admin/AdminDeliveryBoys"));
const AdminGiftCards = lazy(() => import("./pages/admin/AdminGiftCards"));
const AdminCoupons = lazy(() => import("./pages/admin/AdminCoupons"));
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminImagePrompts = lazy(() => import("./pages/admin/AdminImagePrompts"));
const AdminImageCompressor = lazy(() => import("./pages/admin/AdminImageCompressor"));
const AdminCustomers = lazy(() => import("./pages/admin/AdminCustomers"));
const AdminCustomerDetails = lazy(() => import("./pages/admin/AdminCustomerDetails"));
const AdminDealers = lazy(() => import("./pages/admin/AdminDealers"));
const AdminSiteSettings = lazy(() => import("./pages/admin/AdminSiteSettings"));
const AdminSilverRate = lazy(() => import("./pages/admin/AdminSilverRate"));
const AdminCommerceSettings = lazy(() => import("./pages/admin/AdminCommerceSettings"));
const AdminHomeBanners = lazy(() => import("./pages/admin/AdminHomeBanners"));
const AdminHomeCollections = lazy(() => import("./pages/admin/AdminHomeCollections"));
const AdminVideos = lazy(() => import("./pages/admin/AdminVideos"));
const AdminNotifications = lazy(() => import("./pages/admin/AdminNotifications"));
const AdminWhatsApp = lazy(() => import("./pages/admin/AdminWhatsApp"));
const AdminDeliveryBoyDetails = lazy(() => import("./pages/admin/AdminDeliveryBoyDetails"));
const AdminOrderDetails = lazy(() => import("./pages/admin/AdminOrderDetails"));
const AdminVideoCalls = lazy(() => import("./pages/admin/AdminVideoCalls"));
const AdminNewsletterSubscriptions = lazy(() => import("./pages/admin/AdminNewsletterSubscriptions"));
const AdminStorage = lazy(() => import("./pages/admin/AdminStorage"));
const MyVideoCalls = lazy(() => import("./pages/MyVideoCalls"));
const VideoCallPage = lazy(() => import("./pages/VideoCallPage"));
const WriteReview = lazy(() => import("./pages/WriteReview"));
const ThankYouReview = lazy(() => import("./pages/ThankYouReview"));
// Delivery Partner Pages
const DeliveryLogin = lazy(() => import("./pages/delivery/DeliveryLogin"));
const DeliveryDashboard = lazy(() => import("./pages/delivery/DeliveryDashboard"));
const DeliveryOrderDetails = lazy(() => import("./pages/delivery/DeliveryOrderDetails"));
const DeliveryMapPage = lazy(() => import("./pages/delivery/DeliveryMapPage"));
/**
 * Old Sreerasthu URLs (jewellery, furniture, gifts, articles...) all land on the
 * full catalogue (owner decision PERF-23, 2026-10-04). The route paths stay so
 * old links and bookmarks still resolve; only the target changed.
 */
const LegacyRedirect = () => <Navigate to="/products" replace />;

/** After the first paint: load analytics, then warm the two most-visited page chunks. */
function useIdleWarmup() {
  useEffect(() => {
    const idle = (fn: () => void) =>
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(fn, { timeout: 4000 })
        : window.setTimeout(fn, 1500);
    const start = () =>
      idle(() => {
        void loadAnalytics();
        void import("./pages/CategoryPage");
        void import("./pages/ProductDetail");
      });
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);
}

/**
 * Each page fades in (200ms, opacity only: a transform here would trap every
 * fixed header, drawer and sticky bar inside it). Keyed by path, so a
 * query-string change does not re-run it, and admin pages share one key so
 * the admin sidebar does not remount on every click.
 */
function RouteFade({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const key = pathname.startsWith("/admin/") ? "/admin" : pathname;
  return (
    <div key={key} className="route-enter">
      {children}
    </div>
  );
}

const App = () => {
  // Check if the app has been loaded before in this session
  const [isLoaded, setIsLoaded] = useState(() => {
    return sessionStorage.getItem('appLoaded') === 'true';
  });

  const handleLoadingComplete = () => {
    setIsLoaded(true);
    sessionStorage.setItem('appLoaded', 'true');
  };

  useIdleWarmup();

  return (
    // reducedMotion="user": framer-motion drops transforms for visitors who ask
    // for less motion and keeps the fades. No default transition, so drag
    // springs keep their own physics.
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <CartProvider>
          <SilverRateProvider>
            <TooltipProvider>
            <Sonner />
            {!isLoaded && <LoadingScreen onComplete={handleLoadingComplete} />}
            {/* v7_startTransition: navigation runs in a transition, so the current
                page stays on screen while the next page's code loads. */}
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <ScrollToTop />
              <ShoppingCart />
            {/* Route components are lazy-loaded; the skeleton shows only if a chunk takes over 150ms. */}
            <Suspense fallback={<RouteSkeleton />}>
            <RouteFade>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Index />} />
              
              {/* Mobile Cart Page: redirect to checkout (cart is now step 1 of checkout) */}
              <Route path="/cart" element={<Navigate to="/checkout" replace />} />
              
              {/* Mobile Search Pages */}
              <Route path="/search" element={<MobileSearch />} />
              <Route path="/search-results" element={<SearchResults />} />
              
              {/* Category Pages: unified */}
              <Route path="/categories" element={<MobileCategories />} />
              <Route path="/category/:categorySlug" element={<CategoryPage />} />
              
              {/* Legacy redirects */}
              <Route path="/jewelry" element={<LegacyRedirect />} />
              <Route path="/furniture" element={<LegacyRedirect />} />
              <Route path="/articles" element={<LegacyRedirect />} />
              <Route path="/articles/:articleSlug" element={<LegacyRedirect />} />
              <Route path="/products" element={<CategoryPage />} />
              <Route path="/home-decor" element={<LegacyRedirect />} />
              <Route path="/home-decor/:itemSlug" element={<LegacyRedirect />} />
              <Route path="/gifts" element={<LegacyRedirect />} />
              <Route path="/gifts/:giftSlug" element={<LegacyRedirect />} />
              <Route path="/shop/:shopSlug" element={<LegacyRedirect />} />
              <Route path="/furniture/:itemSlug" element={<LegacyRedirect />} />
              <Route path="/other-products/:itemSlug" element={<LegacyRedirect />} />
              <Route path="/jewelry-collections" element={<LegacyRedirect />} />
              
              <Route path="/product/:productId" element={<ProductDetail />} />
              <Route path="/write-review" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <WriteReview />
                </ProtectedRoute>
              } />
              <Route path="/thank-you-review" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <ThankYouReview />
                </ProtectedRoute>
              } />
              <Route path="/wishlist" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <Wishlist />
                </ProtectedRoute>
              } />
              <Route path="/checkout" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <Checkout />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={<Navigate to="/account" replace />} />
              <Route path="/account" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <Account />
                </ProtectedRoute>
              } />
              <Route path="/account/orders" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <MobileOrders />
                </ProtectedRoute>
              } />
              <Route path="/account/orders/:orderId" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <OrderDetailsPage />
                </ProtectedRoute>
              } />
              <Route path="/account/orders/:orderId/cancel" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <CancelOrderPage />
                </ProtectedRoute>
              } />
              <Route path="/account/profile-edit" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <ProfileEditPage />
                </ProtectedRoute>
              } />
              <Route path="/account/addresses" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <SavedAddresses />
                </ProtectedRoute>
              } />
              <Route path="/my-video-calls" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <MyVideoCalls />
                </ProtectedRoute>
              } />
              <Route path="/buy-again" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <BuyAgain />
                </ProtectedRoute>
              } />
              <Route path="/wallet" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <PurchaseSummary />
                </ProtectedRoute>
              } />
              <Route path="/purchase-summary" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <PurchaseSummary />
                </ProtectedRoute>
              } />
              <Route path="/dealer" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <DealerProgramme />
                </ProtectedRoute>
              } />
              <Route path="/security" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <SecurityPage />
                </ProtectedRoute>
              } />
              <Route path="/contact" element={<Contact />} />
              <Route path="/about" element={<About />} />

              {/* Video call (WebRTC). /call?to=<uid> initiates, /call/:callId answers */}
              <Route path="/call" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <VideoCallPage />
                </ProtectedRoute>
              } />
              <Route path="/call/:callId" element={
                <ProtectedRoute requireEmailVerification={false}>
                  <VideoCallPage />
                </ProtectedRoute>
              } />
              <Route path="/customer-support" element={<CustomerSupport />} />
              
              {/* Policy Pages */}
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-conditions" element={<TermsConditions />} />
              <Route path="/shipping-policy" element={<ShippingPolicy />} />
              <Route path="/cancellation-refund-policy" element={<CancellationRefundPolicy />} />
              
              {/* Auth Routes - all point to Account page */}
              <Route path="/login" element={<Account />} />
              <Route path="/auth/login" element={<Account />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/auth/signup" element={<Signup />} />
              <Route path="/auth/verify-email" element={<VerifyEmail />} />
              <Route path="/auth/forgot-password" element={<ForgotPassword />} />
              <Route path="/auth/reset-password" element={<ResetPassword />} />
              <Route path="/auth/action" element={<ResetPassword />} />
              <Route path="/__/auth/action" element={<ResetPassword />} />

              {/* Admin Login (separate from admin panel) */}
              <Route path="/admin" element={<AdminLogin />} />

              {/* Protected Admin Routes */}
              <Route
                path="/admin"
                element={
                  <AdminRoute>
                    <AdminLayout />
                  </AdminRoute>
                }
              >
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="products" element={<Products />} />
                <Route path="products/new" element={<ProductForm />} />
                <Route path="products/:productId" element={<ProductForm />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="orders/:orderId" element={<AdminOrderDetails />} />
                {/* Delivery-partner management: gated by feature flag (kept for future re-enable) */}
                <Route path="delivery-boys" element={DELIVERY_PARTNERS_ENABLED ? <AdminDeliveryBoys /> : <Navigate to="/admin/dashboard" replace />} />
                <Route path="delivery-boys/:deliveryBoyId" element={DELIVERY_PARTNERS_ENABLED ? <AdminDeliveryBoyDetails /> : <Navigate to="/admin/dashboard" replace />} />
                <Route path="media" element={<Media />} />
                <Route path="banners" element={<AdminBanners />} />
                <Route path="showcases" element={<AdminShowcases />} />
                <Route path="testimonials" element={<AdminTestimonials />} />
                <Route path="gallery" element={<AdminGallery />} />
                <Route path="coupons" element={<AdminCoupons />} />
                <Route path="gift-cards" element={<AdminGiftCards />} />
                <Route path="video-calls" element={<AdminVideoCalls />} />
                <Route path="reviews" element={<AdminReviews />} />
                <Route path="image-prompts" element={<AdminImagePrompts />} />
                <Route path="image-compressor" element={<AdminImageCompressor />} />
                <Route path="home-banners" element={<AdminHomeBanners />} />
                <Route path="home-collections" element={<AdminHomeCollections />} />
                <Route path="videos" element={<AdminVideos />} />
                <Route path="site-settings" element={<AdminSiteSettings />} />
                {SILVER_PRICING_ENABLED && <Route path="silver-rate" element={<AdminSilverRate />} />}
                <Route path="commerce-settings" element={<AdminCommerceSettings />} />
                <Route path="marketing" element={<AdminNotifications />} />
                <Route path="whatsapp" element={<AdminWhatsApp />} />
                <Route path="notifications" element={<Navigate to="/admin/marketing" replace />} />
                <Route path="settings" element={<AdminSettings />} />
                <Route path="customers" element={<AdminCustomers />} />
                <Route path="customers/:customerId" element={<AdminCustomerDetails />} />
                <Route path="dealers" element={<AdminDealers />} />
                <Route path="newsletter" element={<AdminNewsletterSubscriptions />} />
                <Route path="storage" element={<AdminStorage />} />
              </Route>

              {/* Delivery Partner Routes (always rendered in light mode).
                  Gated by DELIVERY_PARTNERS_ENABLED: when off, every /delivery*
                  URL redirects home. The components are intentionally kept so the
                  workflow can be re-enabled by flipping the flag. */}
              {DELIVERY_PARTNERS_ENABLED ? (
                <>
                  <Route path="/delivery" element={<Navigate to="/deliverypartner" replace />} />
                  <Route
                    path="/deliverypartner"
                    element={
                      <DeliveryLightThemeWrapper>
                        <DeliveryLogin />
                      </DeliveryLightThemeWrapper>
                    }
                  />
                  <Route
                    path="/delivery/dashboard"
                    element={
                      <DeliveryRoute>
                        <DeliveryLightThemeWrapper>
                          <DeliveryDashboard />
                        </DeliveryLightThemeWrapper>
                      </DeliveryRoute>
                    }
                  />
                  <Route
                    path="/delivery/order/:orderId"
                    element={
                      <DeliveryRoute>
                        <DeliveryLightThemeWrapper>
                          <DeliveryOrderDetails />
                        </DeliveryLightThemeWrapper>
                      </DeliveryRoute>
                    }
                  />
                  <Route
                    path="/delivery/map/:orderId"
                    element={
                      <DeliveryRoute>
                        <DeliveryLightThemeWrapper>
                          <DeliveryMapPage />
                        </DeliveryLightThemeWrapper>
                      </DeliveryRoute>
                    }
                  />
                </>
              ) : (
                <>
                  <Route path="/delivery" element={<Navigate to="/" replace />} />
                  <Route path="/deliverypartner" element={<Navigate to="/" replace />} />
                  <Route path="/delivery/dashboard" element={<Navigate to="/" replace />} />
                  <Route path="/delivery/order/:orderId" element={<Navigate to="/" replace />} />
                  <Route path="/delivery/map/:orderId" element={<Navigate to="/" replace />} />
                </>
              )}

              {/* 404 Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </RouteFade>
            </Suspense>
          </BrowserRouter>
            </TooltipProvider>
          </SilverRateProvider>
        </CartProvider>
      </AuthProvider>
    </MotionConfig>
  );
};

export default App;
