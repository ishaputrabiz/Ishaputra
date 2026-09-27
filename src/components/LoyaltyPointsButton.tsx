import { Award } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
  return (
    <button
      onClick={() => navigate("/wallet")}
      className="p-2 hover:bg-muted rounded-full transition-all duration-200 group"
      aria-label="Loyalty points and rewards"
      title="Loyalty points"
    >
      <Award
        style={{ width: size, height: size }}
        className="text-foreground/80 group-hover:text-primary transition-colors"
        strokeWidth={1.5}
      />
    </button>
  );
};

export default LoyaltyPointsButton;
