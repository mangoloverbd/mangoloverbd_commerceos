import type { BusinessReportSource, Metrics, ProductWeight } from "@/components/business-report/types";

export const SOURCE_FLAG_POINTS = 3;
export const PRODUCT_FLAG_POINTS = 5;

export function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

export function percentChange(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

export function pointChange(currentRate: number, previousRate: number): number {
  return currentRate - previousRate;
}

export type SourceRow = {
  key: string;
  label: string;
  orders: number;
  value: number;
  share: number;
  mix: { approved: number; pending: number; cancelled: number; returned: number };
  approvalRate: number;
  lossRate: number;
  aov: number;
  kg: number;
  netPerOrder: number;
  flags: { approval: boolean; loss: boolean };
  source: BusinessReportSource;
};

export type SourceSortKey = "label" | "orders" | "value" | "approvalRate" | "lossRate" | "aov" | "kg" | "netPerOrder";
export type SortDir = 1 | -1;

export function buildSourceRows(sources: BusinessReportSource[], summary: Metrics): SourceRow[] {
  const averageApproval = rate(summary.approved_count, summary.intake_count);
  const averageLoss = rate(summary.cancelled_value + summary.returned_value, summary.order_value);
  return sources.map((source) => {
    const approvalRate = rate(source.approved_count, source.intake_count);
    const lossRate = rate(source.cancelled_value + source.returned_value, source.order_value);
    return {
      key: source.source,
      label: source.label,
      orders: source.intake_count,
      value: source.order_value,
      share: rate(source.order_value, summary.order_value),
      mix: {
        approved: source.approved_value,
        pending: source.pending_value,
        cancelled: source.cancelled_value,
        returned: source.returned_value,
      },
      approvalRate,
      lossRate,
      aov: source.intake_count > 0 ? source.order_value / source.intake_count : 0,
      kg: source.order_kg,
      netPerOrder: source.intake_count > 0 ? source.net_delivery_position / source.intake_count : 0,
      flags: {
        approval: approvalRate < averageApproval - SOURCE_FLAG_POINTS,
        loss: lossRate > averageLoss + SOURCE_FLAG_POINTS,
      },
      source,
    };
  });
}

export function sortSourceRows(rows: SourceRow[], key: SourceSortKey, dir: SortDir): SourceRow[] {
  return [...rows].sort((a, b) => {
    const order = key === "label" ? a.label.localeCompare(b.label) : a[key] - b[key];
    return order * dir;
  });
}

export type MixSlice = { label: string; value: number };

export function groupSourceMix(sources: BusinessReportSource[], maxSlices = 4): MixSlice[] {
  const sorted = [...sources]
    .filter((source) => source.order_value > 0)
    .sort((a, b) => b.order_value - a.order_value);
  const top = sorted.slice(0, maxSlices).map((source) => ({ label: source.label, value: source.order_value }));
  const rest = sorted.slice(maxSlices).reduce((sum, source) => sum + source.order_value, 0);
  return rest > 0 ? [...top, { label: "Other", value: rest }] : top;
}

export type ProductOutcomeRow = {
  name: string;
  kg: number;
  packs: number;
  approvedKg: number;
  pendingKg: number;
  cancelledKg: number;
  returnedKg: number;
  lossRate: number;
  flagged: boolean;
};

export type ProductOutcomeTable = { rows: ProductOutcomeRow[]; total: ProductOutcomeRow };

function toOutcomeRow(name: string, product: Pick<ProductWeight, "kg" | "packs" | "approved_kg" | "pending_kg" | "cancelled_kg" | "returned_kg">): ProductOutcomeRow {
  return {
    name,
    kg: product.kg,
    packs: product.packs,
    approvedKg: product.approved_kg,
    pendingKg: product.pending_kg,
    cancelledKg: product.cancelled_kg,
    returnedKg: product.returned_kg,
    lossRate: rate(product.cancelled_kg + product.returned_kg, product.kg),
    flagged: false,
  };
}

export function buildProductOutcomeRows(products: ProductWeight[]): ProductOutcomeTable {
  const totals = products.reduce(
    (sum, product) => ({
      kg: sum.kg + product.kg,
      packs: sum.packs + product.packs,
      approved_kg: sum.approved_kg + product.approved_kg,
      pending_kg: sum.pending_kg + product.pending_kg,
      cancelled_kg: sum.cancelled_kg + product.cancelled_kg,
      returned_kg: sum.returned_kg + product.returned_kg,
    }),
    { kg: 0, packs: 0, approved_kg: 0, pending_kg: 0, cancelled_kg: 0, returned_kg: 0 },
  );
  const total = toOutcomeRow("All products", totals);
  const rows = products.map((product) => {
    const row = toOutcomeRow(product.product_name, product);
    return { ...row, flagged: row.kg > 0 && row.lossRate > total.lossRate + PRODUCT_FLAG_POINTS };
  });
  return { rows, total };
}

export function maxIndex(values: number[]): number {
  let best = -1;
  let bestValue = 0;
  values.forEach((value, index) => {
    if (value > bestValue) {
      best = index;
      bestValue = value;
    }
  });
  return best;
}
