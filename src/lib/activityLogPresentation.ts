export type ActivityAction =
  | "created"
  | "confirmed"
  | "cancelled"
  | "status_changed"
  | "contacted"
  | "reopened"
  | "dismissed"
  | "converted"
  | "expired";

export type ActivityOrderTable = "orders" | "social_inbox_orders" | "abandoned_checkouts";

export type ActivityEvent = {
  id: string;
  occurred_at: string;
  action: ActivityAction;
  order_table: ActivityOrderTable;
  order_id: string;
  order_label: string | null;
  order_value: number | null;
  actor_id: string | null;
  actor_display_name: string;
};

export type ActivityStaffOption = {
  user_id: string;
  display_name: string;
  is_active: boolean;
};

export type ActivityLogResponse = {
  range: { from: string | null; to: string | null };
  available_staff: ActivityStaffOption[];
  selected_user_ids: string[];
  events: ActivityEvent[];
  total: number;
  action_counts: Partial<Record<ActivityAction, number>>;
  page: number;
  page_size: number;
  has_more: boolean;
};

const ACTION_LABELS: Record<ActivityAction, string> = {
  created: "Created",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  status_changed: "Updated",
  contacted: "Contacted",
  reopened: "Reopened",
  dismissed: "Dismissed",
  converted: "Converted to order",
  expired: "Expired",
};

export function activityActionLabel(action: ActivityAction): string {
  return ACTION_LABELS[action] || "Updated";
}

type ChipColor = "lime" | "rose" | "yellow" | "blue" | "soft";

const ACTION_COLORS: Record<ActivityAction, ChipColor> = {
  created: "soft",
  confirmed: "lime",
  cancelled: "rose",
  status_changed: "soft",
  contacted: "blue",
  reopened: "yellow",
  dismissed: "rose",
  converted: "lime",
  expired: "rose",
};

export function activityActionColor(action: ActivityAction): ChipColor {
  return ACTION_COLORS[action] || "soft";
}

const TABLE_LABELS: Record<ActivityOrderTable, string> = {
  orders: "Order",
  social_inbox_orders: "Inbox order",
  abandoned_checkouts: "Abandoned cart",
};

export function activityTableLabel(table: ActivityOrderTable): string {
  return TABLE_LABELS[table] || "Order";
}

export function activityOrderLink(event: Pick<ActivityEvent, "order_table" | "order_id">): string | null {
  if (event.order_table === "orders") return `/orders/${event.order_id}`;
  if (event.order_table === "abandoned_checkouts") return `/abandoned/${event.order_id}`;
  return null;
}

function dhakaDayKey(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "unknown";
  const dhaka = new Date(timestamp + 6 * 60 * 60 * 1000);
  return `${dhaka.getUTCFullYear()}-${String(dhaka.getUTCMonth() + 1).padStart(2, "0")}-${String(dhaka.getUTCDate()).padStart(2, "0")}`;
}

export type ActivityDayGroup = {
  dayKey: string;
  events: ActivityEvent[];
};

// Groups an already-descending list of events into same-day buckets (Dhaka
// calendar day), preserving order. Used to render date separators in the feed.
export function groupActivityEventsByDay(events: ActivityEvent[]): ActivityDayGroup[] {
  const groups: ActivityDayGroup[] = [];
  for (const event of events) {
    const dayKey = dhakaDayKey(event.occurred_at);
    const current = groups[groups.length - 1];
    if (current && current.dayKey === dayKey) {
      current.events.push(event);
    } else {
      groups.push({ dayKey, events: [event] });
    }
  }
  return groups;
}
