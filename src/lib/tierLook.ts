// ============================================
// LOYALTY TIER LOOK: the metal each tier position wears on the member card.
// Kept out of the component file so MemberCard.tsx exports only components.
// ============================================

import { Award, Crown, Diamond, type LucideIcon } from 'lucide-react';

export interface TierLook {
  icon: LucideIcon;
  /** Metal text/fill colour, readable on charcoal (4.5:1 or more). */
  metal: string;
  /** Hairline in the same metal. */
  line: string;
  /** Foil edge around the card. */
  edge: string;
  /** Faint metal glow in the card's corner. */
  glow: string;
}

/** Steel, gold, platinum, copper. Keyed by position because admins can rename the tiers. */
const TIER_LOOKS: TierLook[] = [
  {
    icon: Award,
    metal: 'hsl(210 10% 78%)',
    line: 'hsl(210 10% 78% / 0.45)',
    edge: 'linear-gradient(135deg, hsl(210 12% 88%) 0%, hsl(210 7% 50%) 48%, hsl(210 10% 80%) 100%)',
    glow: 'hsl(210 12% 78% / 0.14)',
  },
  {
    icon: Crown,
    metal: 'hsl(36 48% 59%)',
    line: 'hsl(36 48% 59% / 0.5)',
    edge: 'linear-gradient(135deg, hsl(38 58% 74%) 0%, hsl(36 46% 38%) 48%, hsl(36 48% 59%) 100%)',
    glow: 'hsl(36 48% 59% / 0.18)',
  },
  {
    icon: Diamond,
    metal: 'hsl(36 24% 86%)',
    line: 'hsl(36 24% 86% / 0.45)',
    edge: 'linear-gradient(135deg, hsl(40 25% 95%) 0%, hsl(36 8% 58%) 48%, hsl(36 24% 86%) 100%)',
    glow: 'hsl(36 24% 86% / 0.14)',
  },
  {
    icon: Crown,
    metal: 'hsl(23 63% 61%)',
    line: 'hsl(23 63% 61% / 0.5)',
    edge: 'linear-gradient(135deg, hsl(23 63% 61%) 0%, hsl(19 61% 31%) 48%, hsl(20 49% 48%) 100%)',
    glow: 'hsl(23 56% 52% / 0.22)',
  },
];

/** The metal look for a tier position (0 to 3). Anything above 3 uses copper, anything below 0 steel. */
export const tierStyle = (index: number): TierLook =>
  TIER_LOOKS[Math.min(TIER_LOOKS.length - 1, Math.max(0, Math.floor(Number(index)) || 0))];
