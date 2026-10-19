import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { SmartImage } from "@/components/ui/smart-image";
import { showsCartPill } from "@/lib/cartPill";
import { plural } from "@/lib/format";

/**
 * The floating "View cart" pill, bottom centre, once the cart has items (the
 * quick-commerce pattern): the last three photos, the item count and a way into
 * the cart drawer. It springs in on the first item and gives a small bump on
 * every add, which is the add-to-cart feedback (cards no longer toast). It hides
 * while the drawer is open and on pages listed off in `src/lib/cartPill.ts`.
 * The spacer keeps the footer's last line clear of it.
 */
const ViewCartPill = () => {
  const { items, totalItems, isCartOpen, openCart } = useCart();
  const { pathname } = useLocation();
  const visible = totalItems > 0 && !isCartOpen && showsCartPill(pathname);
  const thumbs = items.slice(-3).reverse();

  return (
    <>
      {totalItems > 0 && showsCartPill(pathname) && <div aria-hidden="true" className="h-20" />}
      <AnimatePresence>
        {visible && (
          <motion.div
            key="view-cart"
            initial={{ opacity: 0, y: 24, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 24, x: "-50%" }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.2 }}
            className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-sticky"
          >
            <motion.button
              key={totalItems}
              type="button"
              onClick={openCart}
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", duration: 0.35, bounce: 0.45 }}
              className="flex h-14 items-center gap-3 rounded-full bg-primary py-2 pl-2 pr-2.5 text-primary-foreground shadow-[0_10px_30px_-8px_hsl(var(--primary)/0.55)] outline-none transition-[background-color,transform] duration-press ease-out hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97]"
            >
              <span aria-hidden="true" className="flex -space-x-3">
                {thumbs.map((item) => (
                  <span key={item.id} className="size-10 overflow-hidden rounded-full border-2 border-primary bg-card">
                    <SmartImage src={item.image} alt="" preset="thumb" className="h-full w-full object-cover" />
                  </span>
                ))}
              </span>
              <span className="flex flex-col items-start whitespace-nowrap leading-tight" style={{ fontFamily: "var(--font-body)" }}>
                <span className="text-[15px] font-bold">View cart</span>
                <span aria-live="polite" className="text-xs tabular-nums opacity-85">
                  {plural(totalItems, "item")}
                </span>
              </span>
              <span aria-hidden="true" className="ml-1 grid size-9 place-items-center rounded-full bg-primary-foreground/15">
                <ChevronRight className="size-5" />
              </span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ViewCartPill;
