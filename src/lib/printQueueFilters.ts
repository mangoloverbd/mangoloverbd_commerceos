import { expandOrderLines, type PackingSummaryOrder } from "@/utils/packingSummaryPrinter";

// Print tab filters. Each order lands in exactly one product group and one
// weight group, so no order can show up (or be printed) under two choices.
export const MIXED_KEY = "__mixed__";
export const UNKNOWN_KEY = "__unknown__";

export interface PrintFilters {
  product: string;
  weight: string;
}

export interface PrintFilterOption {
  key: string;
  label: string;
  count: number;
}

export function printProductKey(order: PackingSummaryOrder): string {
  const products = new Set(expandOrderLines(order).map((line) => line.product));
  return products.size === 1 ? [...products][0] : MIXED_KEY;
}

// Pack weight of one unit (variant weight, else product weight), not the parcel total.
export function printWeightKey(order: PackingSummaryOrder): string {
  const lines = expandOrderLines(order);
  if (lines.some((line) => line.weightKg == null)) return UNKNOWN_KEY;
  const weights = new Set(lines.map((line) => String(line.weightKg)));
  return weights.size === 1 ? [...weights][0] : MIXED_KEY;
}

const matches = (key: string, choice: string) => choice === "all" || key === choice;

export function filterPrintOrders<T extends PackingSummaryOrder>(orders: T[], filters: PrintFilters): T[] {
  if (filters.product === "all" && filters.weight === "all") return orders;
  return orders.filter((order) => matches(printProductKey(order), filters.product) && matches(printWeightKey(order), filters.weight));
}

const weightLabel = (key: string) => {
  if (key === MIXED_KEY) return "Mixed weights";
  if (key === UNKNOWN_KEY) return "Unknown weight";
  const kg = Number(key);
  return kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg} kg`;
};

function tally(keys: string[]) {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
  return counts;
}

// Each dropdown counts the orders left by the other dropdown's choice.
export function countPrintFilterOptions(orders: PackingSummaryOrder[], filters: PrintFilters) {
  const productPool = orders.filter((order) => matches(printWeightKey(order), filters.weight));
  const weightPool = orders.filter((order) => matches(printProductKey(order), filters.product));

  const products: PrintFilterOption[] = [...tally(productPool.map(printProductKey))]
    .filter(([key]) => key !== MIXED_KEY)
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const mixedProducts = productPool.filter((order) => printProductKey(order) === MIXED_KEY).length;
  if (mixedProducts > 0) products.push({ key: MIXED_KEY, label: "Mixed products", count: mixedProducts });

  const weightCounts = tally(weightPool.map(printWeightKey));
  const weights: PrintFilterOption[] = [...weightCounts]
    .filter(([key]) => key !== MIXED_KEY && key !== UNKNOWN_KEY)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([key, count]) => ({ key, label: weightLabel(key), count }));
  for (const key of [MIXED_KEY, UNKNOWN_KEY]) {
    const count = weightCounts.get(key);
    if (count) weights.push({ key, label: weightLabel(key), count });
  }

  // Keep the current choice listed even when the other filter leaves it empty.
  if (filters.product !== "all" && !products.some((option) => option.key === filters.product)) {
    products.push({ key: filters.product, label: filters.product === MIXED_KEY ? "Mixed products" : filters.product, count: 0 });
  }
  if (filters.weight !== "all" && !weights.some((option) => option.key === filters.weight)) {
    weights.push({ key: filters.weight, label: weightLabel(filters.weight), count: 0 });
  }

  return {
    products,
    productTotal: productPool.length,
    weights,
    weightTotal: weightPool.length,
  };
}
