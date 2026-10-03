import { CircleUserRound, Heart, ShoppingBag } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, type MouseEvent } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import SilverRateWidget from "./SilverRateWidget";
import LoyaltyPointsButton from "./LoyaltyPointsButton";
import { SILVER_PRICING_ENABLED } from "@/config/features";
import { IconButton } from "@/components/ui/icon-button";
import { plural } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Scroll state shared by the mobile header and the category strip, so both
 * hide and return on the same frame. One passive listener per caller, read in
 * requestAnimationFrame, and the direction only flips after an 8px move.
 */
export const useScrollChrome = () => {
  const [state, setState] = useState(() => ({
    hidden: false,
    scrolled: typeof window !== "undefined" && window.scrollY > 50,
  }));

  useEffect(() => {
    let anchorY = window.scrollY;
    let hidden = false;
    let scrolled = anchorY > 50;
    let frame = 0;

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      let nextHidden = hidden;
      if (y < 10) {
        nextHidden = false;
        anchorY = y;
      } else if (Math.abs(y - anchorY) >= 8) {
        nextHidden = y > anchorY;
        anchorY = y;
      }
      const nextScrolled = y > 50;
      if (nextHidden !== hidden || nextScrolled !== scrolled) {
        hidden = nextHidden;
        scrolled = nextScrolled;
        setState({ hidden, scrolled });
      }
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return state;
};

/**
 * "Skip to content": the first focusable element of the page shell. Moves focus
 * to the page's <main id="main"> (or the first <main>) without touching the URL.
 */
export const SkipLink = () => {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById("main") ?? document.querySelector("main");
    if (!target) return;
    e.preventDefault();
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    (target as HTMLElement).focus({ preventScroll: true });
    target.scrollIntoView({ block: "start" });
  };

  return (
    <a
      href="#main"
      onClick={handleClick}
      className="btn-copper sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-toast focus:inline-flex focus:h-11 focus:items-center focus:px-6 focus:py-0"
    >
      Skip to content
    </a>
  );
};

interface MobileHeaderProps {
  /** Header renders its own skip link above both headers. */
  skipLink?: boolean;
}

const MobileHeader = ({ skipLink = true }: MobileHeaderProps) => {
  const lightModeLogo = "/black_logo.png";
  const darkModeLogo = "/white_logo.png";
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { totalItems } = useCart();
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const { hidden } = useScrollChrome();

  const onAccount = pathname.startsWith("/account");
  const onWishlist = pathname.startsWith("/wishlist");
  const showBadge = !!user && totalItems > 0;

  return (
    <header
      className={cn(
        "lg:hidden sticky top-0 z-header border-b border-border bg-background transition-transform ease-out",
        hidden ? "-translate-y-full duration-exit" : "translate-y-0 duration-[220ms]",
      )}
    >
      {skipLink && <SkipLink />}
      <div className="flex h-14 items-center justify-between px-2 min-[360px]:px-3">
        {/* Left: account + logo */}
        <div className="flex min-w-0 items-center gap-1">
          <IconButton
            label="Account"
            onClick={() => navigate("/account")}
            aria-current={onAccount ? "page" : undefined}
            className={cn("size-11 [@media(pointer:fine)]:size-11 [&_svg]:size-6 hover:text-primary", onAccount && "text-primary")}
          >
            <CircleUserRound aria-hidden="true" />
          </IconButton>
          <Link to="/" aria-label="Ishaputra Botanicals home" className="flex shrink-0 items-center rounded-control">
            <img
              src={resolvedTheme === "dark" ? darkModeLogo : lightModeLogo}
              alt=""
              width={137}
              height={40}
              decoding="async"
              className="h-9 w-auto object-contain min-[360px]:h-10"
            />
          </Link>
        </div>

        {/* Right: icons */}
        <div className="flex items-center">
          {SILVER_PRICING_ENABLED ? <SilverRateWidget variant="icon" /> : <LoyaltyPointsButton size={22} />}

          <IconButton
            label="Wishlist"
            onClick={() => navigate("/wishlist")}
            aria-current={onWishlist ? "page" : undefined}
            className={cn("size-11 [@media(pointer:fine)]:size-11 [&_svg]:size-[22px] hover:text-primary", onWishlist && "text-primary")}
          >
            <Heart aria-hidden="true" />
          </IconButton>

          <IconButton
            label={showBadge ? `Cart, ${plural(totalItems, "item")}` : "Cart"}
            onClick={() => navigate("/checkout")}
            className="size-11 [@media(pointer:fine)]:size-11 [&_svg]:size-[22px] hover:text-primary"
          >
            <ShoppingBag aria-hidden="true" />
            {showBadge && (
              <span
                aria-hidden="true"
                className="absolute right-0.5 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none tabular-nums text-primary-foreground ring-2 ring-background"
              >
                {totalItems}
              </span>
            )}
          </IconButton>
        </div>
      </div>
    </header>
  );
};

export default MobileHeader;
