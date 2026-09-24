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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatKg = (value: number | null) =>
  value == null ? "—" : `${Number(value.toFixed(2))}kg`;

export function buildPackingSummaryHtml(
  summary: PackingSummary,
  businessName = "Mango Lover BD",
  printedAt = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
): string {
  const rows = summary.rows
    .map(
      (row) => `
        <tr>
          <td class="product">${escapeHtml(row.product)}</td>
          <td class="pack">${escapeHtml(row.pack)}</td>
          <td class="number">${row.orderCount}</td>
          <td class="number">${formatKg(row.totalKg)}</td>
          <td class="tick-cell"><span class="tick" aria-hidden="true"></span></td>
        </tr>`,
    )
    .join("");

  const exceptions = summary.exceptions
    .map(
      (entry) => `
        <li>
          <span><strong>${escapeHtml(entry.orderNumber)}</strong>: ${entry.lines.map(escapeHtml).join(" + ")}</span>
          <span class="tick" aria-hidden="true"></span>
        </li>`,
    )
    .join("");

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Packing Summary</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; color: #000; background: #fff; }
          body { font-family: Arial, "Noto Sans Bengali", sans-serif; }
          .packing-page { width: 210mm; padding: 14mm; }
          .packing-header { margin: -14mm -14mm 0; padding: 10mm 14mm 8mm; background: #000; color: #fff; }
          .packing-title { font-size: 26px; font-weight: 900; letter-spacing: 0.1em; }
          .packing-meta { margin-top: 2mm; font-size: 12px; }
          table { width: 100%; margin-top: 8mm; border-collapse: collapse; font-size: 13px; }
          th, td { border: 1px solid #000; padding: 3.5mm 3mm; vertical-align: middle; overflow-wrap: anywhere; }
          th { background: #000; color: #fff; text-transform: uppercase; font-size: 9px; letter-spacing: 0.12em; }
          td.product { font-weight: 700; font-size: 14px; }
          td.number, th.number { text-align: center; white-space: nowrap; }
          .tick-cell { text-align: center; }
          .tick { display: inline-block; width: 5mm; height: 5mm; border: 1.5px solid #000; }
          li { display: flex; justify-content: space-between; align-items: center; gap: 6mm; padding: 3mm 0; border-bottom: 1px solid #999; font-size: 13px; }
          .packing-note { margin-top: 5mm; font-size: 11px; color: #444; }
          .packing-totals { margin-top: 5mm; font-size: 15px; font-weight: 800; }
          @media print { html, body { width: 210mm; } }
        </style>
      </head>
      <body>
        <div class="packing-page">
          <header class="packing-header">
            <div class="packing-title">PACKING SUMMARY</div>
            <div class="packing-meta">${escapeHtml(businessName)} · ${escapeHtml(printedAt)} · ${summary.totalOrders} orders · ${formatKg(summary.totalKg)} to pack</div>
          </header>
          <table>
            <thead><tr><th>Product</th><th>Pack</th><th class="number">Orders</th><th class="number">Total kg</th><th class="number">Packed</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="packing-totals">Total: ${summary.totalOrders} orders · ${formatKg(summary.totalKg)}</div>
          ${summary.exceptions.length ? `<h2>Multi-item orders — pick separately</h2><ul>${exceptions}</ul><p class="packing-note">kg already includes multi-item orders below — do not pack twice.</p>` : ""}
          ${summary.hasUnknownWeight ? `<p class="packing-note">— = weight not saved in catalog.</p>` : ""}
        </div>
      </body>
    </html>`;
}

let previousPackingSummaryFrame: HTMLIFrameElement | null = null;

export function printPackingSummary(orders: PackingSummaryOrder[], businessName?: string) {
  previousPackingSummaryFrame?.remove();
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.setAttribute("title", "Packing summary print frame");
  document.body.appendChild(iframe);
  previousPackingSummaryFrame = iframe;

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  const iframeWindow = iframe.contentWindow;
  const removeIframe = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    if (previousPackingSummaryFrame === iframe) previousPackingSummaryFrame = null;
  };

  if (!iframeDoc || !iframeWindow || typeof iframeWindow.print !== "function") {
    removeIframe();
    throw new Error("Unable to prepare packing summary for printing");
  }

  try {
    iframeDoc.open();
    iframeDoc.write(buildPackingSummaryHtml(buildPackingSummary(orders), businessName));
    iframeDoc.close();
  } catch {
    removeIframe();
    throw new Error("Unable to prepare packing summary for printing");
  }

  window.setTimeout(() => {
    try {
      iframeWindow.focus();
      iframeWindow.print();
    } catch (error) {
      removeIframe();
      console.error("Packing summary printing failed:", error);
    }
  }, 150);
}
