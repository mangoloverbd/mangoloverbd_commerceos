export interface PackingSummaryItem {
  product_name: string | null;
  variant_name: string | null;
  quantity: number;
  weight_kg?: number | null;
}

export interface PackingSummaryOrder {
  id: string;
  order_number: string;
  product: string | null;
  quantity: number | null;
  items?: PackingSummaryItem[] | null;
}

export interface PackingSummaryRow {
  product: string;
  pack: string;
  orderCount: number;
  totalKg: number | null;
  hasUnknownWeight: boolean;
}

export interface PackingExceptionOrder {
  orderNumber: string;
  lines: string[];
}

export interface PackingSummary {
  rows: PackingSummaryRow[];
  exceptions: PackingExceptionOrder[];
  totalOrders: number;
  totalKg: number;
  hasUnknownWeight: boolean;
}

const parseInlineQuantity = (value: string) => {
  const match = value.match(/^(\d+)\s*(?:x|×)\s+(.+)$/i);
  return match
    ? { quantity: Number.parseInt(match[1], 10), productName: match[2].trim() }
    : null;
};

interface ExpandedLine {
  product: string;
  pack: string;
  quantity: number;
  weightKg: number | null;
}

function expandOrderLines(order: PackingSummaryOrder): ExpandedLine[] {
  if (order.items?.length) {
    return order.items.map((item) => ({
      product: (item.product_name || "").trim() || "Item",
      pack: (item.variant_name || "").trim() || "—",
      quantity: item.quantity || 1,
      weightKg: typeof item.weight_kg === "number" && Number.isFinite(item.weight_kg) ? item.weight_kg : null,
    }));
  }
  const lines = (order.product || "Item").split(",").map((line) => line.trim()).filter(Boolean);
  return (lines.length ? lines : ["Item"]).map((line) => {
    const parsed = parseInlineQuantity(line);
    return {
      product: parsed?.productName || line,
      pack: "—",
      quantity: parsed?.quantity || (lines.length === 1 ? order.quantity || 1 : 1),
      weightKg: null,
    };
  });
}

export function buildPackingSummary(orders: PackingSummaryOrder[]): PackingSummary {
  const rowMap = new Map<string, { product: string; pack: string; orderIds: Set<string>; totalKg: number; hasUnknownWeight: boolean }>();
  const exceptions: PackingExceptionOrder[] = [];
  let hasUnknownWeight = false;

  for (const order of orders) {
    const lines = expandOrderLines(order);
    const distinctKeys = new Set(lines.map((line) => `${line.product}|||${line.pack}`));
    if (distinctKeys.size > 1) {
      exceptions.push({
        orderNumber: order.order_number,
        lines: [...distinctKeys].map((key) => {
          const [product, pack] = key.split("|||");
          return pack === "—" ? product : `${product} — ${pack}`;
        }),
      });
    }
    const seenInOrder = new Set<string>();
    for (const line of lines) {
      const key = `${line.product}|||${line.pack}`;
      let row = rowMap.get(key);
      if (!row) {
        row = { product: line.product, pack: line.pack, orderIds: new Set(), totalKg: 0, hasUnknownWeight: false };
        rowMap.set(key, row);
      }
      if (!seenInOrder.has(key)) {
        seenInOrder.add(key);
        row.orderIds.add(order.id);
      }
      if (line.weightKg == null) {
        row.hasUnknownWeight = true;
        hasUnknownWeight = true;
      } else {
        row.totalKg += line.quantity * line.weightKg;
      }
    }
  }

  const rows: PackingSummaryRow[] = [...rowMap.values()].map((row) => ({
    product: row.product,
    pack: row.pack,
    orderCount: row.orderIds.size,
    totalKg: row.hasUnknownWeight && row.totalKg === 0 ? null : row.totalKg,
    hasUnknownWeight: row.hasUnknownWeight,
  }));
  rows.sort((a, b) => a.product.localeCompare(b.product, "en") || a.pack.localeCompare(b.pack, "en"));
  exceptions.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber, "en"));

  return {
    rows,
    exceptions,
    totalOrders: orders.length,
    totalKg: rows.reduce((sum, row) => sum + (row.totalKg || 0), 0),
    hasUnknownWeight,
  };
}
