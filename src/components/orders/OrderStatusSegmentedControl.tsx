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
};

export type FulfillmentQueueTab = OrderStatusFilter | "abandoned";

const STATUS_PRESENTATION: Record<FulfillmentQueueTab, StatusPresentation> = {
  all: {
    label: "All Orders",
    dotClassName: "bg-black/60",
  },
  abandoned: {
    label: "Abandoned Carts",
    dotClassName: "bg-rose-400",
  },
  pending: {
    label: "Pending",
    dotClassName: "bg-amber-400",
  },
  on_hold: {
    label: "On Hold",
    dotClassName: "bg-orange-400",
  },
  approved: {
    label: "Approved",
    dotClassName: "bg-sky-500",
  },
  print: {
    label: "Print",
    dotClassName: "bg-lime-500",
  },
  processing: {
    label: "Processing",
    dotClassName: "bg-violet-500",
  },
  ready_to_ship: {
    label: "Ready To Ship",
    dotClassName: "bg-cyan-500",
  },
  in_transit: {
    label: "In-Transit",
    dotClassName: "bg-indigo-500",
  },
  delivered: {
    label: "Delivered",
    dotClassName: "bg-emerald-500",
  },
  flagged: {
    label: "Flagged",
    dotClassName: "bg-rose-500",
  },
  cancelled: {
    label: "Cancelled",
    dotClassName: "bg-zinc-400",
  },
};

const FULFILLMENT_QUEUE_TABS: FulfillmentQueueTab[] = [
  "all",
  "abandoned",
  ...ORDER_STATUS_FILTERS.filter((status) => status !== "all"),
];

export type OrderStatusSegmentedControlProps = {
  counts: Record<OrderStatusFilter, number>;
  abandonedCount?: number;
  value: FulfillmentQueueTab;
  onChange: (value: FulfillmentQueueTab) => void;
  loading?: boolean;
};

export function OrderStatusSegmentedControl({
  counts,
  abandonedCount = 0,
  value,
  onChange,
  loading = false,
}: OrderStatusSegmentedControlProps) {
  return (
    <div
      data-testid="order-status-scroll-container"
      className="w-full overflow-x-auto border-b border-black/[0.07] bg-[#FAFAF8] px-3 py-2.5 [scrollbar-width:thin] sm:px-5"
    >
      <SegmentedControl
        data-testid="order-status-control"
        aria-label="Filter orders by status"
        selectedKeys={new Set([value])}
        onSelectionChange={(keys) => {
          const selected = [...keys][0];
          if (selected) onChange(String(selected) as FulfillmentQueueTab);
        }}
        className="w-max min-w-full rounded-xl bg-black/[0.045] p-1 ring-1 ring-black/[0.025] xl:grid xl:w-full xl:grid-cols-12"
      >
        {FULFILLMENT_QUEUE_TABS.map((status) => {
          const presentation = STATUS_PRESENTATION[status];
          const count = status === "abandoned" ? abandonedCount : counts[status];
          const formattedCount = count.toLocaleString("en-BD");

          return (
            <SegmentedControlItem
              key={status}
              id={status}
              aria-label={`${presentation.label}: ${loading ? "loading" : formattedCount}`}
              className={({ isSelected }) => [
                "min-w-[112px] rounded-lg px-3 py-2 xl:min-w-0 xl:w-full",
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
                <span
                  data-testid={`order-status-count-${status}`}
                  className="pl-3 text-[14px] font-semibold leading-none tabular-nums tracking-tight text-black/80"
                >
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
