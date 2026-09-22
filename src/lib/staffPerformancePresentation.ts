export type ProductDetail = {
  product_id: string | null;
  product_name: string;
  packs: number;
  kg: number;
};

export type StaffMetrics = {
  assigned_count: number;
  confirmed_count: number;
  confirmed_assigned_count: number;
  confirmed_value: number;
  confirmed_kg: number;
  confirmation_rate: number | null;
  average_order_value: number | null;
  cancelled_count: number;
  cancelled_assigned_count: number;
  cancelled_value: number;
  cancellation_rate: number | null;
  delivered_count: number;
  delivered_value: number;
  delivered_rate: number | null;
  returned_count: number;
  returned_value: number;
  telesales_confirmed_count: number;
  telesales_confirmed_value: number;
  telesales_confirmed_kg: number;
  retained_upsell_count: number;
  retained_upsell_value: number;
  products: ProductDetail[];
};

export type AbandonedCartMetrics = {
  contacted_count: number;
  dismissed_count: number;
  reopened_count: number;
  converted_count: number;
  converted_value: number;
};

export type StaffRow = {
  user_id: string;
  display_name: string;
  is_active: boolean;
  orders: StaffMetrics;
  social_inbox_orders: StaffMetrics;
  abandoned_checkouts: AbandonedCartMetrics;
};

export type StaffPerformanceSnapshot = {
  confirmedValue: number;
  confirmedCount: number;
  confirmationRate: number | null;
  deliveredRate: number | null;
};

type RegularOrderTotals = {
  confirmedValue: number;
  confirmedCount: number;
  assignedCount: number;
  confirmedAssignedCount: number;
  deliveredCount: number;
};

function numberOrZero(value: number) {
  return Number(value || 0);
}

export function buildStaffPerformanceSnapshot(rows: StaffRow[]): StaffPerformanceSnapshot {
  const totals = rows.reduce<RegularOrderTotals>((current, row) => ({
    confirmedValue: current.confirmedValue + numberOrZero(row.orders.confirmed_value),
    confirmedCount: current.confirmedCount + numberOrZero(row.orders.confirmed_count),
    assignedCount: current.assignedCount + numberOrZero(row.orders.assigned_count),
    confirmedAssignedCount: current.confirmedAssignedCount + numberOrZero(row.orders.confirmed_assigned_count),
    deliveredCount: current.deliveredCount + numberOrZero(row.orders.delivered_count),
  }), {
    confirmedValue: 0,
    confirmedCount: 0,
    assignedCount: 0,
    confirmedAssignedCount: 0,
    deliveredCount: 0,
  });

  return {
    confirmedValue: totals.confirmedValue,
    confirmedCount: totals.confirmedCount,
    confirmationRate: totals.assignedCount > 0
      ? totals.confirmedAssignedCount / totals.assignedCount
      : null,
    deliveredRate: totals.confirmedCount > 0
      ? totals.deliveredCount / totals.confirmedCount
      : null,
  };
}

export function sortStaffPerformanceRows(rows: StaffRow[]): StaffRow[] {
  return [...rows].sort((left, right) => (
    numberOrZero(right.orders.confirmed_value) - numberOrZero(left.orders.confirmed_value)
    || left.display_name.localeCompare(right.display_name)
  ));
}
