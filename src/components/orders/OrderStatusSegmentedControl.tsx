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
    label: "Abandoned",
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
  stuck: {
    label: "Follow up",
    dotClassName: "bg-rose-500",
  },
  cancelled: {
    label: "Cancelled",
    dotClassName: "bg-zinc-400",
  },
};

export const FULFILLMENT_QUEUE_TABS: FulfillmentQueueTab[] = [
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
  hiddenStatuses?: OrderStatusFilter[];
};

export function OrderStatusSegmentedControl({
  counts,
  abandonedCount = 0,
  value,
  onChange,
  loading = false,
  hiddenStatuses = [],
}: OrderStatusSegmentedControlProps) {
  return (
    <div
      data-testid="order-status-scroll-container"
      className="w-full overflow-x-auto border-b border-black/[0.07] bg-[#F2F2F0] px-1 py-2.5 [scrollbar-width:thin] sm:px-2"
    >
      <SegmentedControl
        data-testid="order-status-control"
        aria-label="Filter orders by status"
        selectedKeys={new Set([value])}
        onSelectionChange={(keys) => {
          const selected = [...keys][0];
          if (selected) onChange(String(selected) as FulfillmentQueueTab);
        }}
        thumbClassName="rounded-xl border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
        className="w-max min-w-full rounded-2xl bg-black/[0.055] p-1 ring-1 ring-black/[0.035] xl:flex xl:w-full"
      >
        {FULFILLMENT_QUEUE_TABS.filter((status) => status === "abandoned" || !hiddenStatuses.includes(status)).map((status) => {
          const presentation = STATUS_PRESENTATION[status];
          const count = status === "abandoned" ? abandonedCount : counts[status];
          const formattedCount = count.toLocaleString("en-BD");

          return (
            <SegmentedControlItem
              key={status}
              id={status}
              aria-label={`${presentation.label}: ${loading ? "loading" : formattedCount}`}
              className={({ isSelected }) => [
                "group min-w-[104px] rounded-xl px-3 py-2.5 xl:min-w-0 xl:flex-1",
                "hover:bg-white/45 data-[pressed]:scale-[0.99]",
                isSelected ? "text-black" : "text-black/60",
              ].join(" ")}
            >
              <span className="flex min-w-0 flex-col items-center gap-1.5">
                <span
                  data-testid={`order-status-count-${status}`}
                  className={[
                    "text-[22px] font-medium leading-none tabular-nums tracking-tight",
                    // Empty queues fade back so the busy ones stand out.
                    !loading && count === 0 ? "text-black/30" : "text-black/80 group-data-[selected]:text-black",
                  ].join(" ")}
                >
                  {loading ? "—" : formattedCount}
                </span>
                <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium leading-none">
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${presentation.dotClassName}`}
                  />
                  {presentation.label}
                </span>
              </span>
            </SegmentedControlItem>
          );
        })}
      </SegmentedControl>
    </div>
  );
}
