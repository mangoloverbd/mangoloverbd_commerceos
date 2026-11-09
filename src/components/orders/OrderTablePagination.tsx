import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/interfaces-select";
import { ORDER_PAGE_SIZE_OPTIONS } from "@/hooks/useOrderPageSize";

type OrderRowsPerPageSelectProps = {
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  ariaLabel: string;
};

export function OrderRowsPerPageSelect({
  pageSize,
  onPageSizeChange,
  ariaLabel,
}: OrderRowsPerPageSelectProps) {
  return (
    <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        className="w-[72px] rounded-lg border-black/10 bg-[#E9E9E7] text-[12px] font-medium text-black shadow-none hover:bg-[#E3E3E0] focus-visible:ring-black/15"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" className="min-w-[88px] rounded-lg border-black/10 bg-white">
        {ORDER_PAGE_SIZE_OPTIONS.map((option) => (
          <SelectItem key={option} value={String(option)} className="text-[12px]">
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type OrderTablePaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  /** Optional rows-per-page picker shown beside the page number. */
  pageSizeControl?: ReactNode;
};

type PageSlot = number | "gap-start" | "gap-end";

/** Up to seven slots of 1-based page numbers, with gaps around the current page. */
export function getPageSlots(currentPage: number, totalPages: number): PageSlot[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, "gap-end", totalPages];
  if (currentPage >= totalPages - 3) {
    return [1, "gap-start", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "gap-start", currentPage - 1, currentPage, currentPage + 1, "gap-end", totalPages];
}

const navButtonClass =
  "rounded-[8px] bg-[#E3E3E3]/80 px-4 py-2 text-[12px] font-medium text-zinc-900 shadow-[0_2px_4px_0_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.16),inset_0_1px_0_0_#FDFDFD] transition-all hover:bg-[#E3E3E3] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40";

export function OrderTablePagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  pageSizeControl,
}: OrderTablePaginationProps) {
  const [jumpValue, setJumpValue] = useState("");
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const currentPage = safePage + 1;

  const submitJump = () => {
    const target = Number.parseInt(jumpValue, 10);
    if (Number.isFinite(target)) {
      onPageChange(Math.min(Math.max(target, 1), totalPages) - 1);
    }
    setJumpValue("");
  };

  const pagePosition = (
    <div className="flex items-center justify-center gap-3">
      {pageSizeControl}
      <span className="text-center text-[11px] font-medium tabular-nums text-black/55 sm:hidden">
        Page {currentPage} of {totalPages}
      </span>
      <nav aria-label="Pages" className="hidden items-center gap-1 sm:flex">
        {getPageSlots(currentPage, totalPages).map((slot) =>
          typeof slot === "number" ? (
            <button
              key={slot}
              type="button"
              aria-label={`Page ${slot}`}
              aria-current={slot === currentPage ? "page" : undefined}
              onClick={() => onPageChange(slot - 1)}
              className={cn(
                "h-8 min-w-8 rounded-lg px-2 text-[12px] font-medium tabular-nums transition-colors",
                slot === currentPage
                  ? "bg-black text-white"
                  : "text-black/60 hover:bg-black/[0.06] hover:text-black",
              )}
            >
              {slot}
            </button>
          ) : (
            <span key={slot} aria-hidden="true" className="w-6 text-center text-[12px] text-black/35">
              …
            </span>
          ),
        )}
      </nav>
      {totalPages > 1 && (
        <div className="hidden items-center gap-1.5 sm:flex">
          <label htmlFor="order-page-jump" className="text-[11px] font-medium text-black/55">
            Go to
          </label>
          <input
            id="order-page-jump"
            type="number"
            inputMode="numeric"
            min={1}
            max={totalPages}
            value={jumpValue}
            onChange={(event) => setJumpValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitJump();
              }
            }}
            placeholder={String(currentPage)}
            aria-label="Go to page"
            className="h-8 w-14 rounded-lg border-0 bg-black/[0.06] px-2 text-center text-[12px] tabular-nums text-black placeholder:text-black/35 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        </div>
      )}
    </div>
  );

  return (
    <div data-testid="order-pagination-footer" className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-black/10 px-4 py-3">
      <button
        type="button"
        aria-label="Previous page"
        onClick={() => onPageChange(Math.max(0, safePage - 1))}
        disabled={safePage === 0}
        className={cn("justify-self-start", navButtonClass)}
      >
        Previous
      </button>

      {pagePosition}

      <button
        type="button"
        aria-label="Next page"
        onClick={() => onPageChange(Math.min(totalPages - 1, safePage + 1))}
        disabled={safePage >= totalPages - 1}
        className={cn("justify-self-end", navButtonClass)}
      >
        Next
      </button>
    </div>
  );
}
