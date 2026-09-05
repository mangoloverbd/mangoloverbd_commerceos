import JsBarcode from "jsbarcode";

export interface ShippingLabelItem {
  product_name: string | null;
  variant_name: string | null;
  quantity: number;
}

export interface ShippingLabelOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  product: string | null;
  quantity: number | null;
  price: number | null;
  delivery_rate: number | null;
  tracking_code?: string | null;
  consignment_id?: string | number | null;
  items?: ShippingLabelItem[];
}

type ShippingLabelResult =
  | { ok: true }
  | { ok: false; missingOrderNumbers: string[] };

type ShippingLabelHtmlResult =
  | { ok: true; html: string }
  | { ok: false; missingOrderNumbers: string[] };

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const cleanAddress = (value: string) =>
  value
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "")
    .replace(/,\s*,/g, ",")
    .replace(/,?\s*Bangladesh/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/,$/, "");

const parseInlineQuantity = (value: string) => {
  const match = value.match(/^(\d+)\s*(?:x|×)\s+(.+)$/i);
  return match
    ? { quantity: Number.parseInt(match[1], 10), productName: match[2].trim() }
    : null;
};

const formatCod = (order: ShippingLabelOrder) => {
  const amount = Number(order.price || 0) + Number(order.delivery_rate || 0);
  return `৳${amount.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
};

const formatShippingPhone = (phone: string) => {
  const value = phone.trim();
  return /^\d{11}$/.test(value) ? `${value.slice(0, 5)} ${value.slice(5)}` : value;
};

const orderNumberText = (orderNumber: string) => orderNumber.replace(/^#/, "");

export function getShippingLabelCn(order: ShippingLabelOrder): string | null {
  for (const candidate of [order.consignment_id, order.tracking_code]) {
    if (candidate == null) continue;
    const value = String(candidate).trim();
    if (value) return value;
  }
  return null;
}

function barcodeSvg(cn: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "barcode");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `CN barcode ${cn}`);
  JsBarcode(svg, cn, {
    format: "CODE128",
    displayValue: false,
    background: "#ffffff",
    lineColor: "#000000",
    width: 1.35,
    height: 48,
    margin: 0,
  });
  return new XMLSerializer().serializeToString(svg);
}

function productRows(order: ShippingLabelOrder) {
  if (order.items?.length) {
    return order.items.map((item) => ({
      productName: item.product_name || "Item",
      weight: item.variant_name || "—",
      quantity: item.quantity || 1,
    }));
  }

  const lines = (order.product || "Item")
    .split(",")
    .map((line) => line.trim())
    .filter(Boolean);

  return (lines.length ? lines : ["Item"]).map((line) => {
    const parsed = parseInlineQuantity(line);
    return {
      productName: parsed?.productName || line,
      weight: "—",
      quantity: parsed?.quantity || (lines.length === 1 ? order.quantity || 1 : 1),
    };
  });
}

function labelSection(order: ShippingLabelOrder, cn: string, businessName: string) {
  const rows = productRows(order)
    .map((item) => `
      <tr>
        <td class="product">${escapeHtml(item.productName)}</td>
        <td class="weight">${escapeHtml(item.weight)}</td>
        <td class="quantity">${item.quantity}</td>
      </tr>`)
    .join("");
  const customerName = escapeHtml(order.customer_name || "Customer");
  const phone = escapeHtml(order.phone ? formatShippingPhone(order.phone) : "—");
  const address = escapeHtml(order.address ? cleanAddress(order.address) : "—");

  return `
    <section class="shipping-label">
      <header class="brand-header">
        <img src="/mango-lover-print-logo.png" alt="${escapeHtml(businessName)}" />
      </header>
      <div class="barcode-wrap">${barcodeSvg(cn)}</div>
      <div class="cn"><span>CN:</span> ${escapeHtml(cn)}</div>
      <div class="recipient-details">
        <div class="shipment-meta">
          <span class="order-reference">ORDER <strong>#${escapeHtml(orderNumberText(order.order_number))}</strong></span>
          <span class="cod-box">COD ${formatCod(order)}</span>
        </div>
        <div class="deliver-to">DELIVER TO</div>
        <div class="recipient-name">${customerName}</div>
        <div class="recipient-phone">${phone}</div>
        <div class="recipient-address">${address}</div>
      </div>
      <table>
        <thead>
          <tr><th>Product</th><th>Weight</th><th>Qty</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

export function buildShippingLabelHtml(
  orders: ShippingLabelOrder[],
  businessName = "Mango Lover BD",
): ShippingLabelHtmlResult {
  const missingOrderNumbers = orders
    .filter((order) => !getShippingLabelCn(order))
    .map((order) => order.order_number);

  if (missingOrderNumbers.length > 0) {
    return { ok: false, missingOrderNumbers };
  }

  const labels = orders
    .map((order) => labelSection(order, getShippingLabelCn(order) as string, businessName))
    .join("");

  return {
    ok: true,
    html: `<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title></title>
          <style>
            @page { size: 3in 4in; margin: 0; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; color: #000; background: #fff; }
            body { font-family: Arial, "Noto Sans Bengali", sans-serif; }
            .shipping-label {
              width: 3in;
              height: 4in;
              padding: 0.09in;
              border: 2px solid #000;
              overflow: hidden;
              page-break-after: always;
              break-after: page;
              display: flex;
              flex-direction: column;
            }
            .shipping-label:last-child { page-break-after: auto; break-after: auto; }
            .brand-header { height: 0.42in; display: flex; align-items: center; justify-content: center; padding: 0.015in 0.16in; }
            .brand-header img { display: block; max-width: 2.24in; max-height: 0.34in; filter: grayscale(1) brightness(0); }
            .barcode-wrap { height: 0.57in; display: flex; align-items: center; justify-content: center; padding: 0.015in 0.08in 0; }
            .barcode { display: block; width: 100%; height: 0.52in; }
            .cn { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 0.045in 0; text-align: center; font-size: 18px; line-height: 1; font-weight: 800; letter-spacing: 0.6px; }
            .cn span { font-size: 15px; }
            .recipient-details { padding: 0.055in 0.025in 0.06in; border-bottom: 1px solid #000; }
            .shipment-meta { display: flex; align-items: center; justify-content: space-between; gap: 0.08in; padding-bottom: 0.045in; border-bottom: 1px solid #000; }
            .order-reference { min-width: 0; font-size: 7px; line-height: 1; font-weight: 700; letter-spacing: 0.08em; white-space: nowrap; }
            .order-reference strong { font-size: 11px; letter-spacing: 0; }
            .cod-box { flex: 0 0 auto; border: 2px solid #000; padding: 0.035in 0.055in; font-size: 11px; line-height: 1; font-weight: 800; white-space: nowrap; }
            .deliver-to { margin-top: 0.045in; font-size: 6.5px; line-height: 1; font-weight: 700; letter-spacing: 0.18em; }
            .recipient-name { margin-top: 0.025in; font-size: 18px; line-height: 1.05; font-weight: 800; text-transform: uppercase; overflow-wrap: anywhere; }
            .recipient-phone { margin-top: 0.025in; font-size: 14px; line-height: 1; font-weight: 700; letter-spacing: 0.04em; }
            .recipient-address { margin-top: 0.04in; font-size: 9px; line-height: 1.2; overflow-wrap: anywhere; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 0.045in; font-size: 7.3px; line-height: 1.1; }
            th, td { border: 1px solid #000; padding: 0.026in 0.02in; text-align: center; vertical-align: middle; overflow-wrap: anywhere; }
            th { background: #000; color: #fff; text-transform: uppercase; font-size: 6.7px; letter-spacing: 0.25px; }
            th:nth-child(1) { width: 46%; }
            th:nth-child(2) { width: 38%; }
            th:nth-child(3) { width: 16%; }
            td.product { text-align: left; font-weight: 700; }
            td.weight { text-align: left; }
            td.weight, td.quantity { white-space: nowrap; }
            @media print {
              html, body { width: 3in; }
              .shipping-label { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>${labels}</body>
      </html>`,
  };
}

function waitForImages(doc: Document) {
  return Promise.all(
    Array.from(doc.images).map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }),
  );
}

export function printShippingLabels(
  orders: ShippingLabelOrder[],
  businessName?: string,
): ShippingLabelResult {
  const result = buildShippingLabelHtml(orders, businessName);
  if (!result.ok) return result;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.setAttribute("title", "Shipping label print frame");
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    throw new Error("Unable to prepare shipping labels for printing");
  }

  iframeDoc.open();
  iframeDoc.write(result.html);
  iframeDoc.close();

  void waitForImages(iframeDoc).then(() => {
    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 5000);
    }, 150);
  });

  return { ok: true };
}
