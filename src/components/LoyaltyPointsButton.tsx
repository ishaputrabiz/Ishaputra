import { Award } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { IconButton } from "@/components/ui/icon-button";
import { useWaitingScratchCards } from "@/hooks/useWaitingScratchCards";
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
 * on every page view for every signed-in visitor. A copper dot says a scratch
 * card is waiting; that comes from one listener shared by the whole session.
 */
const LoyaltyPointsButton = ({ size = 20 }: LoyaltyPointsButtonProps) => {
  const waiting = useWaitingScratchCards() > 0;
  return <LoyaltyPointsButtonView size={size} waiting={waiting} />;
};

export const LoyaltyPointsButtonView = ({ size = 20, waiting = false }: LoyaltyPointsButtonProps & { waiting?: boolean }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const active = pathname.startsWith("/wallet");
  // The mobile header (22px icons) sits on touch screens: no tooltip, 44px target.
  const mobile = size > 20;

  return (
    <IconButton
      label={waiting ? "Rewards, scratch card waiting" : "Rewards"}
      tooltip={!mobile}
      onClick={() => navigate("/wallet")}
      aria-current={active ? "page" : undefined}
      className={cn("hover:text-primary", mobile && "size-11 [@media(pointer:fine)]:size-11 [&_svg]:size-[22px]", active && "text-primary")}
    >
      <Award aria-hidden="true" />
      {waiting && (
        <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
      )}
    </IconButton>
  );
};

export default LoyaltyPointsButton;
