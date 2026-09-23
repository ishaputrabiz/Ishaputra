import type { MouseEvent } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

/**
 * Numbered pages for product grids: Previous · 1 … 4 5 6 … 25 · Next.
 *
 * Page numbers are real links (`hrefFor`), so they can be opened in a new tab
 * and the page is part of the URL; a normal click is handed to `onPageChange`
 * for in-app navigation. Phones show only the current page between the first
 * and last so the bar fits a 360px screen.
 */

type Entry = number | "gap";

/** First, last, and `siblings` pages either side of the current one, gaps collapsed to "…". */
const pageEntries = (page: number, total: number, siblings: number): Entry[] => {
  const wanted = new Set([1, total]);
  for (let n = page - siblings; n <= page + siblings; n++) wanted.add(n);
  const nums = [...wanted].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);

  const out: Entry[] = [];
  nums.forEach((n, i) => {
    const prev = nums[i - 1];
    if (prev !== undefined && n - prev === 2) out.push(prev + 1); // a lone hidden page: just show it
    else if (prev !== undefined && n - prev > 2) out.push("gap");
    out.push(n);
  });
  return out;
};

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  hrefFor: (page: number) => string;
  className?: string;
}

const ProductPagination = ({ page, totalPages, onPageChange, hrefFor, className }: Props) => {
  if (totalPages <= 1) return null;

  const go = (target: number) => (e: MouseEvent<HTMLAnchorElement>) => {
    // Let modified clicks (new tab / window) follow the link.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (target !== page && target >= 1 && target <= totalPages) onPageChange(target);
  };

  const renderEntries = (entries: Entry[], itemClass: string, keyPrefix: string) =>
    entries.map((entry, i) =>
      entry === "gap" ? (
        <PaginationItem key={`${keyPrefix}-gap-${i}`} className={itemClass}>
          <PaginationEllipsis />
        </PaginationItem>
      ) : (
        <PaginationItem key={`${keyPrefix}-${entry}`} className={itemClass}>
          <PaginationLink
            href={hrefFor(entry)}
            onClick={go(entry)}
            isActive={entry === page}
            className="h-9 w-9 sm:h-10 sm:w-10"
          >
            {entry}
          </PaginationLink>
        </PaginationItem>
      ),
    );

  const edge = "pointer-events-none opacity-40";
  // Label text hidden on phones; the chevron remains.
  const arrow = "px-2.5 [&>span]:hidden sm:[&>span]:inline";

  return (
    <Pagination className={className}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={hrefFor(Math.max(1, page - 1))}
            onClick={go(page - 1)}
            aria-disabled={page === 1}
            tabIndex={page === 1 ? -1 : undefined}
            className={`${arrow} ${page === 1 ? edge : ""}`}
          />
        </PaginationItem>

        {renderEntries(pageEntries(page, totalPages, 1), "hidden sm:list-item", "d")}
        {renderEntries(pageEntries(page, totalPages, 0), "sm:hidden", "m")}

        <PaginationItem>
          <PaginationNext
            href={hrefFor(Math.min(totalPages, page + 1))}
            onClick={go(page + 1)}
            aria-disabled={page === totalPages}
            tabIndex={page === totalPages ? -1 : undefined}
            className={`${arrow} ${page === totalPages ? edge : ""}`}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
};

export default ProductPagination;
