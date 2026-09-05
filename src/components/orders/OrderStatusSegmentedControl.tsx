import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/components/base/segmented-control/segmented-control";
import {
  ORDER_STATUS_FILTERS,
  type OrderStatusFilter,
} from "@/lib/orderStatusFilters";

type StatusPresentation = {
  label: string;
  dotClassName: string;
  countClassName: string;
};

const STATUS_PRESENTATION: Record<OrderStatusFilter, StatusPresentation> = {
  all: {
    label: "All Orders",
    dotClassName: "bg-black/60",
    countClassName: "text-black",
  },
  pending: {
    label: "Pending",
    dotClassName: "bg-amber-400",
    countClassName: "text-amber-700",
  },
  on_hold: {
    label: "On Hold",
    dotClassName: "bg-orange-400",
    countClassName: "text-orange-700",
  },
  approved: {
    label: "Approved",
    dotClassName: "bg-sky-500",
    countClassName: "text-sky-700",
  },
  processing: {
    label: "Processing",
    dotClassName: "bg-violet-500",
    countClassName: "text-violet-700",
  },
  ready_to_ship: {
    label: "Ready To Ship",
    dotClassName: "bg-cyan-500",
    countClassName: "text-cyan-700",
  },
  in_transit: {
    label: "In-Transit",
    dotClassName: "bg-indigo-500",
    countClassName: "text-indigo-700",
  },
  delivered: {
    label: "Delivered",
    dotClassName: "bg-emerald-500",
    countClassName: "text-emerald-700",
  },
  flagged: {
    label: "Flagged",
    dotClassName: "bg-rose-500",
    countClassName: "text-rose-700",
  },
  cancelled: {
    label: "Cancelled",
    dotClassName: "bg-zinc-400",
    countClassName: "text-zinc-600",
  },
};

export type OrderStatusSegmentedControlProps = {
  counts: Record<OrderStatusFilter, number>;
  value: OrderStatusFilter;
  onChange: (value: OrderStatusFilter) => void;
  loading?: boolean;
};

export function OrderStatusSegmentedControl({
  counts,
  value,
  onChange,
  loading = false,
}: OrderStatusSegmentedControlProps) {
  return (
    <div className="overflow-x-auto border-b border-black/[0.07] bg-[#FAFAF8] px-3 py-2.5 [scrollbar-width:thin] sm:px-5">
      <SegmentedControl
        aria-label="Filter orders by status"
        selectedKeys={new Set([value])}
        onSelectionChange={(keys) => {
          const selected = [...keys][0];
          if (selected) onChange(String(selected) as OrderStatusFilter);
        }}
        className="min-w-max rounded-xl bg-black/[0.045] p-1 ring-1 ring-black/[0.025]"
      >
        {ORDER_STATUS_FILTERS.map((status) => {
          const presentation = STATUS_PRESENTATION[status];
          const formattedCount = counts[status].toLocaleString("en-BD");

          return (
            <SegmentedControlItem
              key={status}
              id={status}
              aria-label={`${presentation.label}: ${loading ? "loading" : formattedCount}`}
              className={({ isSelected }) => [
                "min-w-[96px] rounded-lg px-3 py-2 sm:min-w-[104px]",
                "hover:bg-white/45 data-[pressed]:scale-[0.99]",
                isSelected ? "text-black" : "text-black/55",
              ].join(" ")}
            >
              <span className="flex min-w-0 flex-col items-start gap-1">
                <span className="flex items-center gap-1.5 text-[8px] font-semibold uppercase leading-none tracking-[0.16em]">
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${presentation.dotClassName}`}
                  />
                  {presentation.label}
                </span>
                <span className={`pl-3 text-[15px] font-semibold leading-none tabular-nums tracking-tight ${presentation.countClassName}`}>
                  {loading ? "—" : formattedCount}
                </span>
              </span>
            </SegmentedControlItem>
          );
        })}
      </SegmentedControl>
    </div>
  );
}
