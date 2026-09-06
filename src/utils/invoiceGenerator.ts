import { format } from "date-fns";
import JsBarcode from "jsbarcode";

export interface InvoiceItem {
  product_name: string | null;
  variant_name: string | null;
  quantity: number;
}

export interface InvoiceOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  product: string | null;
  quantity: number | null;
  price: number | null;
  status: string;
  created_at: string;
  delivery_rate: number | null;
  courier_status?: string | null;
  consignment_id?: string | number | null;
  tracking_code?: string | null;
  courier_message?: string | null;
  notes?: string | null;
  items?: InvoiceItem[];
}

interface InvoiceProductRow {
  productName: string;
  weight: string;
  quantity: number;
}

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

const formatMoney = (value: number | null | undefined) =>
  `৳${Number(value || 0).toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatPhone = (value: string) => value.trim().replace(/\s+/g, "");

const formatStatus = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

const parseInlineQuantity = (value: string) => {
  const match = value.match(/^(\d+)\s*(?:x|×)\s+(.+)$/i);
  return match
    ? { quantity: Number.parseInt(match[1], 10), productName: match[2].trim() }
    : null;
};

const productRows = (order: InvoiceOrder): InvoiceProductRow[] => {
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
};

const courierName = (order: InvoiceOrder) => {
  const message = order.courier_message?.toLowerCase() || "";
  if (message.includes("pathao")) return "Pathao";
  if (message.includes("steadfast")) return "Steadfast";
  return order.consignment_id || order.tracking_code ? "Steadfast" : "Not assigned";
};

const courierIdentifier = (order: InvoiceOrder) => {
  for (const candidate of [order.consignment_id, order.tracking_code]) {
    if (candidate == null) continue;
    const value = String(candidate).trim();
    if (value) return value;
  }
  return null;
};

const barcodeSvg = (value: string) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "barcode");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Invoice barcode ${value}`);
  JsBarcode(svg, value, {
    format: "CODE128",
    displayValue: false,
    background: "#ffffff",
    lineColor: "#000000",
    width: 1.4,
    height: 42,
    margin: 0,
  });
  return new XMLSerializer().serializeToString(svg);
};

const invoicePage = (order: InvoiceOrder, businessName: string) => {
  const identifier = courierIdentifier(order);
  const subtotal = Number(order.price || 0);
  const deliveryFee = Number(order.delivery_rate || 0);
  const total = subtotal + deliveryFee;
  const customerName = order.customer_name || "Customer";
  const phone = order.phone ? formatPhone(order.phone) : "—";
  const address = order.address ? cleanAddress(order.address) : "—";
  const notes = order.notes?.trim();
  const rows = productRows(order)
    .map((item) => `
              <tr>
                <td class="product">${escapeHtml(item.productName)}</td>
                <td class="weight">${escapeHtml(item.weight)}</td>
                <td class="quantity">${item.quantity}</td>
              </tr>`)
    .join("");

  return `
        <section class="invoice-page">
          <header class="invoice-header">
            <div class="brand-block">
              <img src="/mango-lover-print-logo.png" alt="${escapeHtml(businessName)}" />
              <span>PREMIUM FOODS</span>
            </div>
            <div class="invoice-heading">
              <div class="invoice-title">INVOICE</div>
              <div class="invoice-number">${escapeHtml(order.order_number)}</div>
            </div>
          </header>

          <section class="metadata-grid">
            <div class="metadata-field"><span>INVOICE DATE</span><strong>${format(new Date(order.created_at), "MMM dd, yyyy")}</strong></div>
            <div class="metadata-field"><span>ORDER STATUS</span><strong>${escapeHtml(formatStatus(order.status))}</strong></div>
            <div class="metadata-field"><span>COURIER</span><strong>${courierName(order)}</strong></div>
            <div class="metadata-field identifier-field">
              <span>CN / TRACKING</span>
              <strong>${identifier ? escapeHtml(identifier) : "NOT ASSIGNED"}</strong>
              ${identifier ? barcodeSvg(identifier) : ""}
            </div>
          </section>

          <section class="detail-grid">
            <div class="detail-panel">
              <span class="section-label">CUSTOMER</span>
              <strong class="customer-contact">${escapeHtml(customerName)} - ${escapeHtml(phone)}</strong>
              <div class="customer-address">${escapeHtml(address)}</div>
            </div>
            <div class="detail-panel payment-panel">
              <span class="section-label">PAYMENT</span>
              <strong>CASH ON DELIVERY</strong>
              <span class="payment-due">PAYMENT DUE</span>
              <div>Order value ${formatMoney(subtotal)}</div>
              <div>Delivery fee ${formatMoney(deliveryFee)}</div>
            </div>
          </section>

          <section class="products-section">
            <table>
              <thead><tr><th>Product</th><th>Weight</th><th>Qty</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </section>

          <section class="invoice-summary">
            <div class="invoice-notes">
              <span class="section-label">ORDER NOTE</span>
              <div>${notes ? escapeHtml(notes) : "No additional instructions."}</div>
              <strong>Thank you for choosing Mango Lover.</strong>
            </div>
            <div class="totals">
              <div><span>Subtotal</span><strong>${formatMoney(subtotal)}</strong></div>
              <div><span>Delivery fee</span><strong>${formatMoney(deliveryFee)}</strong></div>
              <div class="grand-total"><span>Grand total</span><strong>${formatMoney(total)}</strong></div>
              <div class="due-total"><span>Amount due</span><strong>${formatMoney(total)}</strong></div>
            </div>
          </section>

          <footer>${escapeHtml(businessName)} · CUSTOMER COPY · KEEP FOR YOUR RECORDS</footer>
        </section>`;
};

export function buildInvoiceHtml(
  orders: InvoiceOrder[],
  businessName = "Mango Lover BD",
) {
  const pages = orders.map((order) => invoicePage(order, businessName)).join("");

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice Print</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; color: #000; background: #fff; }
          body { font-family: Arial, "Noto Sans Bengali", sans-serif; }
          .invoice-page {
            width: 210mm;
            height: 297mm;
            padding: 14mm;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            page-break-after: always;
            break-after: page;
          }
          .invoice-page:last-child { page-break-after: auto; break-after: auto; }
          .invoice-header {
            min-height: 34mm;
            margin: -14mm -14mm 0;
            padding: 10mm 14mm 8mm;
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #000;
            color: #fff;
          }
          .brand-block img { display: block; width: 58mm; max-height: 12mm; object-fit: contain; object-position: left center; filter: grayscale(1) brightness(0) invert(1); }
          .brand-block span { display: block; margin-top: 2mm; font-size: 7px; font-weight: 700; letter-spacing: 0.24em; }
          .invoice-heading { text-align: right; }
          .invoice-title { font-size: 30px; line-height: 1; font-weight: 900; letter-spacing: 0.12em; }
          .invoice-number { margin-top: 2mm; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; }
          .metadata-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5mm; padding: 8mm 0 6mm; }
          .metadata-field { min-width: 0; padding-bottom: 3mm; border-bottom: 1px solid #999; }
          .metadata-field > span, .section-label { display: block; color: #555; font-size: 7px; line-height: 1; font-weight: 700; letter-spacing: 0.16em; }
          .metadata-field strong { display: block; margin-top: 2mm; font-size: 12px; line-height: 1.15; overflow-wrap: anywhere; }
          .identifier-field .barcode { display: block; width: 100%; height: 9mm; margin-top: 2mm; }
          .detail-grid { display: grid; grid-template-columns: 1.4fr 1fr; border: 2px solid #000; }
          .detail-panel { min-height: 42mm; padding: 6mm; font-size: 11px; line-height: 1.5; }
          .detail-panel + .detail-panel { border-left: 1px solid #000; }
          .detail-panel > strong { display: block; margin: 3mm 0 1.5mm; font-size: 15px; line-height: 1.2; }
          .customer-contact { text-transform: uppercase; overflow-wrap: anywhere; }
          .customer-address { max-width: 105mm; }
          .payment-due { display: inline-block; margin: 0 0 2mm; padding: 1mm 2mm; border: 1px solid #000; font-size: 8px; font-weight: 800; letter-spacing: 0.1em; }
          .products-section { margin-top: 8mm; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
          th, td { border: 1px solid #000; padding: 4mm 3mm; vertical-align: middle; overflow-wrap: anywhere; }
          th { background: #000; color: #fff; text-align: left; text-transform: uppercase; font-size: 9px; letter-spacing: 0.12em; }
          th:nth-child(1) { width: 56%; }
          th:nth-child(2) { width: 30%; }
          th:nth-child(3) { width: 14%; }
          td.product { font-weight: 700; }
          td.quantity, th:nth-child(3) { text-align: center; white-space: nowrap; }
          .invoice-summary { display: grid; grid-template-columns: 1fr 72mm; gap: 12mm; margin-top: 8mm; }
          .invoice-notes { color: #444; font-size: 10px; line-height: 1.5; }
          .invoice-notes > div { margin-top: 3mm; white-space: pre-wrap; overflow-wrap: anywhere; }
          .invoice-notes > strong { display: block; margin-top: 6mm; color: #000; }
          .totals { font-size: 11px; }
          .totals > div { display: flex; justify-content: space-between; gap: 6mm; padding: 2mm 0; }
          .grand-total { margin-top: 2mm; padding-top: 4mm !important; border-top: 2px solid #000; font-size: 14px; }
          .due-total { margin-top: 1mm; background: #000; color: #fff; padding: 4mm !important; font-size: 15px; text-transform: uppercase; }
          footer { margin-top: auto; padding-top: 4mm; border-top: 1px solid #999; text-align: center; font-size: 8px; font-weight: 700; letter-spacing: 0.12em; }
          @media print {
            html, body { width: 210mm; }
            .invoice-page { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>${pages}</body>
    </html>`;
}

const waitForImages = (doc: Document) =>
  Promise.all(
    Array.from(doc.images).map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }),
  );

export function printInvoice(orders: InvoiceOrder[], businessName?: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  iframe.setAttribute("title", "Invoice print frame");
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  const iframeWindow = iframe.contentWindow;
  const removeIframe = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  if (!iframeDoc || !iframeWindow || typeof iframeWindow.print !== "function") {
    removeIframe();
    throw new Error("Unable to prepare invoices for printing");
  }

  try {
    iframeDoc.open();
    iframeDoc.write(buildInvoiceHtml(orders, businessName));
    iframeDoc.close();
  } catch {
    removeIframe();
    throw new Error("Unable to prepare invoices for printing");
  }

  void waitForImages(iframeDoc).then(() => {
    window.setTimeout(() => {
      iframeWindow.focus();
      iframeWindow.print();
      window.setTimeout(() => {
        removeIframe();
      }, 5000);
    }, 150);
  });
}
