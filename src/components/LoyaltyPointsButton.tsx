import { Award } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

interface LoyaltyPointsButtonProps {
  /** Icon size in px - the desktop header uses 20, the mobile header 22. */
  size?: number;
}

/**
 * Header shortcut to the loyalty points / rewards page (/wallet).
 *
 * Sits where the live silver-rate widget was in the original theme. It shows no
 * points count on purpose: reading the balance here would cost a Firestore read
 * on every page view for every signed-in visitor.
 */
const LoyaltyPointsButton = ({ size = 20 }: LoyaltyPointsButtonProps) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = pathname.startsWith("/wallet");
  // The mobile header (22px icons) sits on touch screens: no tooltip, 44px target.
  const mobile = size > 20;

  return (
    <IconButton
      label="Rewards"
      tooltip={!mobile}
      onClick={() => navigate("/wallet")}
      aria-current={active ? "page" : undefined}
      className={cn("hover:text-primary", mobile && "size-11 [@media(pointer:fine)]:size-11 [&_svg]:size-[22px]", active && "text-primary")}
    >
      <Award aria-hidden="true" />
    </IconButton>
  );
};

export default LoyaltyPointsButton;
