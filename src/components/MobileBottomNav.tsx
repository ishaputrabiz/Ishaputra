import { Home, Grid, ShoppingCart, Menu, Heart } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useState, useEffect } from "react";

const MobileBottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { totalItems, subtotal } = useCart();
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Listen for modal open/close events
  useEffect(() => {
    const handleModalOpen = () => setIsModalOpen(true);
    const handleModalClose = () => setIsModalOpen(false);
    
    window.addEventListener('mobile-modal-open', handleModalOpen);
    window.addEventListener('mobile-modal-close', handleModalClose);
    
    return () => {
      window.removeEventListener('mobile-modal-open', handleModalOpen);
      window.removeEventListener('mobile-modal-close', handleModalClose);
    };
  }, []);

  // Handle scroll to show/hide navbar
  useEffect(() => {
    const controlNavbar = () => {
      const currentScrollY = window.scrollY;
      
      // Hide navbar when scrolling down, show when scrolling up
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        // Scrolling down and past threshold - hide navbar
        setIsVisible(false);
      } else if (currentScrollY < lastScrollY && currentScrollY > 50) {
        // Scrolling up and past threshold - show navbar
        setIsVisible(true);
      } else if (currentScrollY < 50) {
        // Near top of page - always show
        setIsVisible(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', controlNavbar);
    return () => window.removeEventListener('scroll', controlNavbar);
  }, [lastScrollY]);

  // Format price compactly for mobile
  const formatMobilePrice = (price: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  };

  const isActive = (href: string) => location.pathname === href;

  return (
    <>
      <nav
        className="hidden"
      >
        {/* SVG Background with curved notch */}
        <svg 
          className="absolute bottom-0 left-0 right-0 w-full h-16" 
          viewBox="0 0 375 64" 
          preserveAspectRatio="none"
          fill="none"
        >
          <path 
            d="M0 20 H130 Q145 20 152 30 Q167 55 187.5 55 Q208 55 223 30 Q230 20 245 20 H375 V64 H0 Z"
            className="fill-background"
            filter="drop-shadow(0 -4px 12px rgba(0,0,0,0.08))"
          />
        </svg>

        {/* Center floating button */}
        <button
          onClick={() => navigate("/checkout")}
          className="absolute left-1/2 -translate-x-1/2 top-0 z-10"
        >
          <div className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg ${isActive("/checkout") ? "bg-emerald-700" : "bg-emerald-600"}`}>
            <ShoppingCart className="w-5 h-5 text-white" strokeWidth={1.5} />
          </div>
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {totalItems}
            </span>
          )}
        </button>

        {/* Navigation items */}
        <div className="flex items-center justify-around h-14 relative pt-3">
          {/* Home */}
          <button
            onClick={() => navigate("/")}
            className="flex flex-col items-center justify-center flex-1 h-full"
          >
            <Home className={`w-6 h-6 ${isActive("/") ? "text-foreground" : "text-muted-foreground"}`} strokeWidth={1.5} />
            {isActive("/") && (
              <span className="w-1 h-1 bg-emerald-600 rounded-full mt-1"></span>
            )}
          </button>

          {/* Categories */}
          <button
            onClick={() => navigate("/categories")}
            className="flex flex-col items-center justify-center flex-1 h-full"
          >
            <Grid className={`w-6 h-6 ${isActive("/categories") ? "text-foreground" : "text-muted-foreground"}`} strokeWidth={1.5} />
            {isActive("/categories") && (
              <span className="w-1 h-1 bg-emerald-600 rounded-full mt-1"></span>
            )}
          </button>

          {/* Empty space for center button */}
          <div className="flex-1"></div>

          {/* Wishlist/Saved */}
          <button
            onClick={() => navigate("/wishlist")}
            className="flex flex-col items-center justify-center flex-1 h-full"
          >
            <Heart className={`w-6 h-6 ${isActive("/wishlist") ? "text-foreground" : "text-muted-foreground"}`} strokeWidth={1.5} />
            {isActive("/wishlist") && (
              <span className="w-1 h-1 bg-emerald-600 rounded-full mt-1"></span>
            )}
          </button>

          {/* Menu */}
          <button
            onClick={() => navigate("/account")}
            className="flex flex-col items-center justify-center flex-1 h-full"
          >
            <Menu className={`w-6 h-6 text-muted-foreground`} strokeWidth={1.5} />
          </button>
        </div>
      </nav>
    </>
  );
};

export default MobileBottomNav;
