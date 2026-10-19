/**
 * Pages that show the floating "View cart" pill once the cart has items: the
 * places a shopper browses and adds from. Off on the product page (its own
 * sticky Buy bar sits there), checkout, account, admin and sign-in.
 */
const SHOPPING_PATHS = ["/category", "/categories", "/products", "/search-results", "/wishlist", "/buy-again", "/shop"];

export function showsCartPill(pathname: string): boolean {
  if (pathname === "/") return true;
  return SHOPPING_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
