/**
 * Cart lines in the order the customer added them.
 *
 * Firestore stores the cart as a map keyed by product id and hands it back
 * sorted by key, so without this the lines reshuffle on every reload. Lines
 * saved before `addedAt` existed count as oldest and keep their order.
 */
export const sortCartLines = <T extends { addedAt?: number }>(lines: T[]): T[] =>
  [...lines].sort((a, b) => (a.addedAt ?? 0) - (b.addedAt ?? 0));
