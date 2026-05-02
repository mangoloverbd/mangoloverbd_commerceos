import jsPDF from "jspdf";
import { format } from "date-fns";
import { LOGO_SVG_DATA_URI } from "./logoData";

interface Order {
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
  consignment_id?: number | null;
  tracking_code?: string | null;
  courier_message?: string | null;
}

/** Split comma-separated product field into individual lines */
function splitProductLines(product: string | null): string[] {
  if (!product) return [];
  return product.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Check if a line already contains an inline quantity like "3x Item" */
function parseInlineQty(line: string): { name: string; qty: number } | null {
  const match = line.match(/^(\d+)\s*(x|×)\s+(.+)$/i);
  if (match) return { qty: parseInt(match[1], 10), name: match[3].trim() };
  return null;
}

/** Remove IP addresses and clean up extra commas/spaces from address strings */
function cleanAddress(text: string): string {
  return text
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "")
    .replace(/,\s*,/g, ",")
    .replace(/,?\s*Bangladesh/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/,$/, "");
}

/** Convert SVG data URI to PNG data URL via canvas */
function svgToPngDataUrl(svgDataUri: string, width: number, height: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * 2;
      canvas.height = height * 2;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject("no ctx"); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = svgDataUri;
  });
}

/** Render a classic FRAGILE / HANDLE WITH CARE label as a PNG data URL via canvas */
function renderFragileBadge(widthPx: number, heightPx: number): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) { resolve(""); return; }

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthPx, heightPx);

    // Solid black border
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 6;
    ctx.setLineDash([]);
    ctx.strokeRect(3, 3, widthPx - 6, heightPx - 6);

    // --- TOP: Wine glass with lightning crack ---
    const glassZone = heightPx * 0.46;
    const gPadX = widthPx * 0.18;
    const gLeft  = gPadX;
    const gRight = widthPx - gPadX;
    const gTop   = heightPx * 0.04;
    const gW     = gRight - gLeft;
    const gCX    = widthPx / 2;
    const bowlBottom = gTop + glassZone * 0.57;

    // Bowl (trapezoid — wider at top, narrow at bottom)
    ctx.fillStyle = "#cc0000";
    ctx.beginPath();
    ctx.moveTo(gLeft, gTop);
    ctx.lineTo(gRight, gTop);
    ctx.lineTo(gCX + gW * 0.12, bowlBottom);
    ctx.lineTo(gCX - gW * 0.12, bowlBottom);
    ctx.closePath();
    ctx.fill();

    // Lightning bolt crack — white cutout inside bowl
    ctx.fillStyle = "#ffffff";
    const bx = gCX + gW * 0.05;
    const by = gTop + glassZone * 0.07;
    const bh = bowlBottom - by - glassZone * 0.04;
    ctx.beginPath();
    ctx.moveTo(bx,              by);
    ctx.lineTo(bx - gW * 0.20, by + bh * 0.42);
    ctx.lineTo(bx - gW * 0.06, by + bh * 0.42);
    ctx.lineTo(bx - gW * 0.24, by + bh * 0.90);
    ctx.lineTo(bx + gW * 0.20, by + bh * 0.42);
    ctx.lineTo(bx + gW * 0.06, by + bh * 0.42);
    ctx.lineTo(bx + gW * 0.18, by);
    ctx.closePath();
    ctx.fill();

    // Stem
    ctx.fillStyle = "#cc0000";
    const stemW = gW * 0.14;
    const stemH = glassZone * 0.27;
    ctx.fillRect(gCX - stemW / 2, bowlBottom, stemW, stemH);

    // Base
    const baseW = gW * 0.76;
    const baseH = glassZone * 0.10;
    ctx.fillRect(gCX - baseW / 2, bowlBottom + stemH, baseW, baseH);

    // --- MIDDLE: "FRAGILE" ---
    ctx.fillStyle = "#cc0000";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `900 ${Math.round(heightPx * 0.155)}px Arial, sans-serif`;
    ctx.fillText("FRAGILE", widthPx / 2, heightPx * 0.50);

    // --- BOTTOM: "HANDLE WITH CARE" ---
    ctx.font = `bold ${Math.round(heightPx * 0.093)}px Arial, sans-serif`;
    ctx.fillText("HANDLE", widthPx / 2, heightPx * 0.695);
    ctx.fillText("WITH CARE", widthPx / 2, heightPx * 0.812);

    resolve(canvas.toDataURL("image/png"));
  });
}

const buildInvoicePdf = async (orders: Order[]) => {
  const pageWidth = 75;
  const pageHeight = 100;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [pageWidth, pageHeight],
  });

  const margin = 4;
  const contentWidth = pageWidth - margin * 2;

  // Pre-render logo once
  let logoPngData: string | null = null;
  try {
    logoPngData = await svgToPngDataUrl(LOGO_SVG_DATA_URI, 188, 80);
  } catch { /* fallback to text */ }

  // Pre-render fragile badge once (portrait canvas)
  let fragileBadgePng: string | null = null;
  try {
    fragileBadgePng = await renderFragileBadge(210, 285);
  } catch { /* skip */ }

  for (let index = 0; index < orders.length; index++) {
    const order = orders[index];
    if (index > 0) {
      doc.addPage([pageWidth, pageHeight]);
    }

    let y = margin + 2;

    // --- Brand Logo ---
    if (logoPngData) {
      const logoW = 52;
      const logoH = 22;
      doc.addImage(logoPngData, "PNG", margin, y - 4, logoW, logoH);
      y += logoH - 2;
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text("Angonaloy", margin, y);
      y += 5;
    }

    // --- Fragile Badge (top-right corner, portrait) ---
    if (fragileBadgePng) {
      const badgeW = 15;
      const badgeH = 22;
      doc.addImage(fragileBadgePng, "PNG", pageWidth - margin - badgeW, margin - 2, badgeW, badgeH);
    }

    // --- Invoice Details ---
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);

    const invoiceNo = order.order_number.replace("#", "");

    doc.text(`Invoice No.: `, margin, y);
    doc.setFont("helvetica", "bold");
    doc.text(`AN-${invoiceNo}`, margin + 16, y);
    y += 3.5;

    doc.setFont("helvetica", "normal");
    doc.text(`Invoice Date: `, margin, y);
    doc.setFont("helvetica", "bold");
    doc.text(format(new Date(order.created_at), "MMM dd, yyyy"), margin + 16, y);
    y += 3.5;

    const courierName = order.courier_message?.toLowerCase().includes("pathao") ? "Pathao" : "Steadfast";
    doc.setFont("helvetica", "normal");
    doc.text(`Courier: `, margin, y);
    doc.setFont("helvetica", "bold");
    doc.text(courierName, margin + 16, y);
    y += 3.5;

    const consignmentId = order.consignment_id ?? (order as any).consignment_id;
    if (consignmentId != null) {
      y += 1;
      const label = "Delivery ID:";
      const idText = String(consignmentId);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);

      const labelWidth = doc.getTextWidth(label);
      const idWidth = doc.getTextWidth(idText);
      const boxPadX = 3;
      const boxH = 7;
      const gap = 2;

      // Full box encompassing label + id
      const totalBoxW = labelWidth + gap + idWidth + boxPadX * 2;
      const boxX = margin;
      const boxY = y - 4.2;

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(boxX, boxY, totalBoxW, boxH);

      doc.setFont("helvetica", "normal");
      doc.text(label, boxX + boxPadX, y);
      doc.setFont("helvetica", "bold");
      doc.text(idText, boxX + boxPadX + labelWidth + gap, y);

      y += boxH + 1.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
    }

    y += 2;

    // --- Invoice To ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("Invoice To:", margin, y);
    y += 4;

    doc.setFontSize(7);
    // Name with icon
    doc.setFont("helvetica", "normal");
    doc.text("\u00B7", margin, y); // bullet
    doc.setFont("helvetica", "normal");
    doc.text(order.customer_name || "Customer", margin + 3, y);
    y += 3.5;

    // Phone
    if (order.phone) {
      doc.text("\u00B7", margin, y);
      doc.text(order.phone, margin + 3, y);
      y += 3.5;
    }

    // Address
    if (order.address) {
      doc.text("\u00B7", margin, y);
      const addressLines = doc.splitTextToSize(cleanAddress(order.address), contentWidth - 5);
      doc.text(addressLines, margin + 3, y);
      y += addressLines.length * 3.5;
    }

    y += 3;

    // --- Divider line ---
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 3;

    // --- Table Header ---
    const col1X = margin;
    const col2X = margin + 42;
    const col3X = margin + 52;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text("Product", col1X, y);
    doc.text("Qty", col2X, y);
    doc.text("Price", col3X, y, { align: "left" });
    y += 1;

    // Header underline
    doc.setLineWidth(0.1);
    doc.line(margin, y, pageWidth - margin, y);
    y += 3;

    // --- Product Rows ---
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);

    const subtotal = order.price || 0;
    const lines = splitProductLines(order.product);
    const fallbackQty = order.quantity || 1;

    if (lines.length <= 1) {
      // Single product
      const productName = order.product || "Item";
      const wrapped = doc.splitTextToSize(productName, 38);
      doc.text(wrapped, col1X, y);
      doc.text(String(fallbackQty), col2X + 2, y);
      doc.text(subtotal.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), pageWidth - margin, y, { align: "right" });
      y += wrapped.length * 3.5 + 2;
    } else {
      // Multiple products – each on its own row
      lines.forEach((line) => {
        const parsed = parseInlineQty(line);
        const itemName = parsed ? parsed.name : line;
        const itemQty = parsed ? parsed.qty : 1;

        const wrapped = doc.splitTextToSize(itemName, 38);
        doc.text(wrapped, col1X, y);
        doc.text(String(itemQty), col2X + 2, y);
        // Individual line prices not available, leave blank
        y += wrapped.length * 3.5 + 1;
      });
      // Show total price on a summary line
      doc.setFont("helvetica", "normal");
      doc.text("(all items)", col1X, y);
      doc.text(subtotal.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), pageWidth - margin, y, { align: "right" });
      y += 4;
    }


    // --- Divider ---
    doc.setLineWidth(0.1);
    doc.line(margin, y, pageWidth - margin, y);
    y += 4;

    // --- Totals ---
    const shipping = order.delivery_rate || 0;
    const total = subtotal + shipping;

    const labelX = margin + 28;
    const valueX = pageWidth - margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);

    doc.text("Sub Total", labelX, y);
    doc.text(subtotal.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), valueX, y, { align: "right" });
    y += 4;

    doc.text("Delivery Fee", labelX, y);
    doc.text(shipping.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), valueX, y, { align: "right" });
    y += 4;

    // Grand Total line
    doc.setLineWidth(0.2);
    doc.line(labelX, y - 1, pageWidth - margin, y - 1);
    y += 2;

    doc.setFontSize(8);
    doc.text("Grand Total", labelX, y);
    doc.text(total.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), valueX, y, { align: "right" });
    y += 4;

    doc.text("Due Amount", labelX, y);
    doc.text(total.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), valueX, y, { align: "right" });
  }

  return doc;
};

export const generateInvoice = async (orders: Order[]) => {
  const doc = await buildInvoicePdf(orders);
  const filename = orders.length > 1
    ? `Invoices_Bulk_${format(new Date(), "yyyyMMdd_HHmmss")}.pdf`
    : `Invoice_${orders[0].order_number}.pdf`;
  doc.save(filename);
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMoney = (value: number | null | undefined) =>
  (value ?? 0).toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const printInvoice = (orders: Order[]) => {
  const invoicePages = orders
    .map((order) => {
      const invoiceNo = escapeHtml(order.order_number.replace("#", ""));
      const customerName = escapeHtml(order.customer_name || "Customer");
      const phone = order.phone ? escapeHtml(order.phone) : "";
      const address = order.address ? escapeHtml(cleanAddress(order.address)) : "";
      const subtotal = order.price || 0;
      const shipping = order.delivery_rate || 0;
      const total = subtotal + shipping;
      const consignmentId = order.consignment_id ?? (order as any).consignment_id;
      const courierName = order.courier_message?.toLowerCase().includes("pathao") ? "Pathao" : "Steadfast";
      const lines = splitProductLines(order.product);
      const fallbackQty = order.quantity || 1;

      let productRowsHtml: string;
      if (lines.length <= 1) {
        const product = escapeHtml(order.product || "Item");
        productRowsHtml = `<div class="table-row"><span>${product}</span><span>${fallbackQty}</span><span>${formatMoney(subtotal)}</span></div>`;
      } else {
        productRowsHtml = lines.map((line) => {
          const parsed = parseInlineQty(line);
          const itemName = escapeHtml(parsed ? parsed.name : line);
          const itemQty = parsed ? parsed.qty : 1;
          return `<div class="table-row"><span>${itemName}</span><span>${itemQty}</span><span></span></div>`;
        }).join("");
        productRowsHtml += `<div class="table-row"><span>(all items)</span><span></span><span>${formatMoney(subtotal)}</span></div>`;
      }

      return `
        <section class="invoice">
          <div class="fragile-badge">
            <svg class="fragile-glass" viewBox="0 0 50 70" xmlns="http://www.w3.org/2000/svg">
              <path fill="#cc0000" d="M3,2 L47,2 L29,37 L21,37 Z"/>
              <path fill="white" d="M26,5 L18,20 L24,20 L21,34 L32,20 L26,20 L34,5 Z"/>
              <rect fill="#cc0000" x="23" y="37" width="4" height="18"/>
              <rect fill="#cc0000" x="13" y="55" width="24" height="7" rx="1"/>
            </svg>
            <span class="fragile-title">FRAGILE</span>
            <span class="fragile-sub">HANDLE<br>WITH CARE</span>
          </div>
          <div class="brand"><img src="${LOGO_SVG_DATA_URI}" alt="Angonaloy" style="height:36px;" /></div>
          <div class="meta"><span>Invoice No.:</span> <strong>AN-${invoiceNo}</strong></div>
          <div class="meta"><span>Invoice Date:</span> <strong>${format(new Date(order.created_at), "MMM dd, yyyy")}</strong></div>
          <div class="meta"><span>Courier:</span> <strong>${courierName}</strong></div>
          ${consignmentId != null ? `<div class="delivery-id-box">Delivery ID: <strong>${escapeHtml(String(consignmentId))}</strong></div>` : ""}

          <div class="section-title">Invoice To:</div>
          <div class="line">\u2022 ${customerName}</div>
          ${phone ? `<div class="line">\u2022 ${phone}</div>` : ""}
          ${address ? `<div class="line">\u2022 ${address}</div>` : ""}

          <hr />

          <div class="table-head"><span>Product</span><span>Qty</span><span>Price</span></div>
          ${productRowsHtml}

          <hr />

          <div class="total"><span>Sub Total</span><span>${formatMoney(subtotal)}</span></div>
          <div class="total"><span>Delivery Fee</span><span>${formatMoney(shipping)}</span></div>
          <div class="total grand"><span>Grand Total</span><span>${formatMoney(total)}</span></div>
          <div class="total grand"><span>Due Amount</span><span>${formatMoney(total)}</span></div>
        </section>
      `;
    })
    .join("");

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice Print</title>
        <style>
          @page { size: 75mm 100mm; margin: 0; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Segoe UI", Arial, sans-serif;
            color: #000;
          }
          .invoice {
            width: 75mm;
            height: 100mm;
            padding: 4mm;
            page-break-after: always;
            font-size: 8.5px;
            line-height: 1.2;
            position: relative;
          }
          .invoice:last-child { page-break-after: auto; }
          .fragile-badge {
            position: absolute;
            top: 2.5mm;
            right: 2.5mm;
            border: 2px solid #111;
            background: #fff;
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 1.8mm 2mm;
            gap: 0.9mm;
            width: 19mm;
            text-align: center;
          }
          .fragile-title {
            display: block;
            color: #cc0000;
            font-size: 10.5px;
            font-weight: 900;
            letter-spacing: 0.5px;
            line-height: 1;
          }
          .fragile-sub {
            display: block;
            color: #cc0000;
            font-size: 6px;
            font-weight: 700;
            letter-spacing: 0.3px;
            line-height: 1.5;
          }
          .fragile-glass {
            width: 17px;
            height: 23px;
          }
          .brand { font-size: 16px; font-weight: 700; margin-bottom: 1.5mm; }
          .meta { margin-bottom: 0.8mm; }
          .meta span { display: inline-block; min-width: 17mm; }
          .section-title { font-weight: 700; margin-top: 1.6mm; margin-bottom: 1mm; }
          .line { margin-bottom: 0.8mm; word-break: break-word; }
          .delivery-id-box {
            display: inline-block;
            border: 1.5px solid #000;
            padding: 1.5mm 3mm;
            font-size: 14px;
            font-weight: 400;
            letter-spacing: 0.3px;
            margin-top: 1.5mm;
            margin-bottom: 1.5mm;
          }
          hr { border: none; border-top: 1px solid #000; margin: 1.6mm 0; }
          .table-head,
          .table-row,
          .total {
            display: grid;
            grid-template-columns: 1fr 8mm 14mm;
            gap: 1mm;
            align-items: start;
            margin-bottom: 0.9mm;
          }
          .table-head { font-weight: 700; }
          .table-head span:nth-child(2),
          .table-row span:nth-child(2) { text-align: center; }
          .table-head span:nth-child(3),
          .table-row span:nth-child(3),
          .total span:last-child { text-align: right; }
          .total { grid-template-columns: 1fr 14mm; }
          .total.grand { font-weight: 700; font-size: 9.5px; }
        </style>
      </head>
      <body>${invoicePages}</body>
    </html>
  `;

  // Use a hidden iframe to trigger native print dialog
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    document.body.removeChild(iframe);
    generateInvoice(orders).catch(() => {});
    return;
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  iframe.onload = () => {
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      // Clean up after a delay
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch (_) {}
      }, 5000);
    }, 300);
  };
};
