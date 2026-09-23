import { toSlug } from '@/services/categoryService';

export interface Taxon {
  name: string;
  slug: string;
  children?: Taxon[];
}

/**
 * Does a product's stored subcategory value refer to the subcategory addressed
 * by `activeSlug`?
 *
 * The admin product form stores the subcategory *name* ("Men & Women"), while
 * the storefront filters address it by *slug* ("men-women"). Comparing the two
 * directly only matched when a name happened to be a single plain word, so any
 * subcategory containing a space or symbol silently showed zero products.
 *
 * Migrating 353 product documents to slugs would fix it too, but this keeps
 * both shapes valid so existing data and any half-migrated data both work.
 */
export const matchesTaxon = (
  stored: string | undefined | null,
  activeSlug: string,
  options: Taxon[] = [],
): boolean => {
  if (!stored || !activeSlug) return false;

  const value = stored.trim().toLowerCase();
  const target = activeSlug.trim().toLowerCase();

  // stored as a slug already, or a name that slugifies to the target
  if (value === target || toSlug(value) === target) return true;

  // stored as the display name - resolve the slug back to its name
  const match = options.find((o) => o.slug.toLowerCase() === target);
  if (!match) return false;

  return value === match.name.trim().toLowerCase() || toSlug(value) === toSlug(match.name);
};
