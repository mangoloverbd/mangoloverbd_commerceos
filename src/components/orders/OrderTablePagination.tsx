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
};

export function OrderTablePagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
}: OrderTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);

  return (
    <div data-testid="order-pagination-footer" className="grid gap-3 border-t border-black/10 px-4 py-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <span aria-hidden="true" className="hidden sm:block" />

      <span className="text-center text-[11px] font-medium tabular-nums text-black/55">
        Page {safePage + 1} of {totalPages}
      </span>

      <div className="flex items-center justify-center gap-2 sm:justify-end">
        <button
          type="button"
          aria-label="Previous page"
          onClick={() => onPageChange(Math.max(0, safePage - 1))}
          disabled={safePage === 0}
          className="rounded-[8px] bg-[#E3E3E3]/80 px-4 py-2 text-[12px] font-medium text-zinc-900 shadow-[0_2px_4px_0_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.16),inset_0_1px_0_0_#FDFDFD] transition-all hover:bg-[#E3E3E3] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          aria-label="Next page"
          onClick={() => onPageChange(Math.min(totalPages - 1, safePage + 1))}
          disabled={safePage >= totalPages - 1}
          className="rounded-[8px] bg-[#E3E3E3]/80 px-4 py-2 text-[12px] font-medium text-zinc-900 shadow-[0_2px_4px_0_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.16),inset_0_1px_0_0_#FDFDFD] transition-all hover:bg-[#E3E3E3] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
