export type ProductDetail = {
  product_id: string | null;
  product_name: string;
  packs: number;
  kg: number;
  delivered_packs: number;
  delivered_kg: number;
  returned_packs: number;
  returned_kg: number;
  cancelled_packs: number;
  cancelled_kg: number;
};

export type StaffMetrics = {
  assigned_count: number;
  // Handled basis: each regular order the member confirmed or cancelled,
  // counted once and classified by their last action on it.
  handled_count: number;
  handled_confirmed_count: number;
  handled_confirmed_value: number;
  handled_confirmed_kg: number;
  handled_cancelled_count: number;
  handled_cancelled_value: number;
  handled_delivered_count: number;
  handled_delivered_value: number;
  handled_returned_count: number;
  handled_returned_value: number;
  confirmed_count: number;
  confirmed_assigned_count: number;
  confirmed_assigned_delivered_count: number;
  confirmed_assigned_returned_count: number;
  confirmed_assigned_cancelled_count: number;
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
  handledCount: number;
  handledConfirmedCount: number;
  handledDeliveredCount: number;
};

function numberOrZero(value: number) {
  return Number(value || 0);
}

export function buildStaffPerformanceSnapshot(rows: StaffRow[]): StaffPerformanceSnapshot {
  const totals = rows.reduce<RegularOrderTotals>((current, row) => ({
    confirmedValue: current.confirmedValue + numberOrZero(row.orders.confirmed_value),
    confirmedCount: current.confirmedCount + numberOrZero(row.orders.confirmed_count),
    handledCount: current.handledCount + numberOrZero(row.orders.handled_count),
    handledConfirmedCount: current.handledConfirmedCount + numberOrZero(row.orders.handled_confirmed_count),
    handledDeliveredCount: current.handledDeliveredCount + numberOrZero(row.orders.handled_delivered_count),
  }), {
    confirmedValue: 0,
    confirmedCount: 0,
    handledCount: 0,
    handledConfirmedCount: 0,
    handledDeliveredCount: 0,
  });

  return {
    confirmedValue: totals.confirmedValue,
    confirmedCount: totals.confirmedCount,
    confirmationRate: totals.handledCount > 0
      ? totals.handledConfirmedCount / totals.handledCount
      : null,
    deliveredRate: totals.handledConfirmedCount > 0
      ? totals.handledDeliveredCount / totals.handledConfirmedCount
      : null,
  };
}

export function sortStaffPerformanceRows(rows: StaffRow[]): StaffRow[] {
  return [...rows].sort((left, right) => (
    numberOrZero(right.orders.confirmed_value) - numberOrZero(left.orders.confirmed_value)
    || left.display_name.localeCompare(right.display_name)
  ));
}

export type StaffSeriesBucket = {
  key: string;
  label: string;
  confirmed_count: number;
  confirmed_value: number;
  handled_count: number;
  handled_confirmed_count: number;
  handled_delivered_count: number;
  extra_value: number;
};

export type StaffSeries = {
  granularity: "hour" | "day";
  buckets: StaffSeriesBucket[];
};

export type StaffSparks = {
  value: number[];
  count: number[];
  confirmationRate: number[];
  deliveredRate: number[];
  extra: number[];
};

// A bucket with no denominator has no rate; it takes the previous bucket's rate
// (or the first known one) so the line holds level instead of dropping to 0%.
function rateSpark(buckets: StaffSeriesBucket[], rate: (bucket: StaffSeriesBucket) => number | null): number[] {
  const rates = buckets.map(rate);
  const first = rates.find((value) => value !== null);
  if (first === undefined || first === null) return [];
  let previous = first;
  return rates.map((value) => (previous = value ?? previous));
}

export function buildStaffSparks(buckets: StaffSeriesBucket[]): StaffSparks {
  return {
    value: buckets.map((bucket) => bucket.confirmed_value),
    count: buckets.map((bucket) => bucket.confirmed_count),
    confirmationRate: rateSpark(buckets, (bucket) => (
      bucket.handled_count > 0 ? bucket.handled_confirmed_count / bucket.handled_count : null
    )),
    deliveredRate: rateSpark(buckets, (bucket) => (
      bucket.handled_confirmed_count > 0 ? bucket.handled_delivered_count / bucket.handled_confirmed_count : null
    )),
    extra: buckets.map((bucket) => bucket.extra_value),
  };
}
