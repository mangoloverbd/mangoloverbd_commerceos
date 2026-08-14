import jsPDF from "jspdf";
import { format } from "date-fns";

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

/** jsPDF built-in fonts only support a narrow character set. Strip symbols that render as mojibake. */
function cleanPdfText(text: string | null | undefined, fallback = ""): string {
  const cleaned = (text || fallback)
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/[•·]/g, "-")
    .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
    .replace(/(\u200D|\uFE0E|\uFE0F)/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || fallback;
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

const buildInvoicePdf = async (orders: Order[], businessName?: string) => {
  const pageWidth = 75;
  const pageHeight = 100;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [pageWidth, pageHeight],
  });

  const margin = 4;
  const contentWidth = pageWidth - margin * 2;


  for (let index = 0; index < orders.length; index++) {
    const order = orders[index];
    if (index > 0) {
      doc.addPage([pageWidth, pageHeight]);
    }

    const money = (value: number) =>
      value.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const muted = () => doc.setTextColor(128, 128, 128);
    const ink = () => doc.setTextColor(28, 28, 30);
    const drawLabel = (label: string, x: number, yy: number, align: "left" | "right" | "center" = "left") => {
      muted();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(3.9);
      doc.text(label.toUpperCase(), x, yy, { align });
      ink();
    };
    const clampLines = (linesToClamp: string[], max: number) => {
      if (linesToClamp.length <= max) return linesToClamp;
      const next = linesToClamp.slice(0, max);
      next[max - 1] = `${next[max - 1].replace(/\.+$/, "")}...`;
      return next;
    };

    let y = margin + 2.5;

    // --- Swiss Header ---
    const brandName = businessName || "My Business";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    ink();
    doc.text(cleanPdfText(brandName, "My Business"), margin, y + 1);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.2);
    ink();
    doc.text("Invoice", pageWidth - margin, y + 0.5, { align: "right" });
    muted();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.5);
    doc.text("Order receipt", pageWidth - margin, y + 4.8, { align: "right" });

    doc.setDrawColor(232, 232, 232);
    doc.setLineWidth(0.12);
    doc.line(margin, 14.5, pageWidth - margin, 14.5);

    y = 17;
    const invoiceNo = order.order_number.replace("#", "");
    const courierName = order.courier_message?.toLowerCase().includes("pathao") ? "Pathao" : "Steadfast";
    const consignmentId = order.consignment_id;

    drawLabel("Invoice No.", margin, y + 1.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.text(`AN-${invoiceNo}`, margin, y + 6);

    drawLabel("Date", margin + 24, y + 1.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.text(format(new Date(order.created_at), "MMM dd, yyyy"), margin + 24, y + 6);

    drawLabel("Courier", margin + 49, y + 1.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.text(courierName, margin + 49, y + 6);
    y += 10.5;
    doc.setDrawColor(232, 232, 232);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    if (consignmentId != null) {
      drawLabel("Delivery ID", margin, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.6);
      doc.text(String(consignmentId), margin + 20, y);
      y += 5.5;
    }

    // --- Customer ---
    const customerName = cleanPdfText(order.customer_name, "Customer");
    const customerPhone = cleanPdfText(order.phone, "");
    const addressLines = order.address
      ? clampLines(doc.splitTextToSize(cleanPdfText(cleanAddress(order.address)), contentWidth), 3)
      : [];

    drawLabel("Invoice To", margin, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.text(customerName, margin, y + 5);
    let customerY = y + 9.2;
    if (customerPhone) {
      muted();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.text(customerPhone, margin, customerY);
      customerY += 3.3;
    }
    if (addressLines.length) {
      muted();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.8);
      doc.text(addressLines, margin, customerY);
      customerY += addressLines.length * 3;
    }
    ink();
    y = customerY + 4;
    doc.setDrawColor(232, 232, 232);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    // --- Products ---
    const subtotal = order.price || 0;
    const shipping = order.delivery_rate || 0;
    const total = subtotal + shipping;
    const lines = splitProductLines(order.product);
    const fallbackQty = order.quantity || 1;
    const productRows = lines.length <= 1
      ? [{
          name: cleanPdfText(parseInlineQty(order.product || "")?.name || order.product, "Item"),
          qty: parseInlineQty(order.product || "")?.qty || fallbackQty,
          price: money(subtotal),
        }]
      : lines.map((line) => {
          const parsed = parseInlineQty(line);
          return {
            name: cleanPdfText(parsed ? parsed.name : line, "Item"),
            qty: parsed ? parsed.qty : 1,
            price: "",
          };
        });

    const rowLineSets = productRows.map((row) => clampLines(doc.splitTextToSize(row.name, 40), 2));

    drawLabel("Product", margin, y);
    drawLabel("Qty", margin + 48.5, y, "center");
    drawLabel("Price", pageWidth - margin, y, "right");
    y += 4;
    doc.setDrawColor(232, 232, 232);
    doc.line(margin, y - 1.7, pageWidth - margin, y - 1.7);

    let rowY = y + 2;
    productRows.forEach((row, rowIndex) => {
      if (rowY > 76) return;
      const rowLines = rowLineSets[rowIndex];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      ink();
      doc.text(rowLines, margin, rowY);
      doc.setFont("helvetica", "bold");
      doc.text(String(row.qty), margin + 48.5, rowY, { align: "center" });
      if (row.price) doc.text(row.price, pageWidth - margin, rowY, { align: "right" });
      rowY += Math.max(5.5, rowLines.length * 3.2 + 1.8);
    });
    if (lines.length > 1 && rowY <= 78) {
      muted();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.8);
      doc.text("All items", margin, rowY);
      ink();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.text(money(subtotal), pageWidth - margin, rowY, { align: "right" });
      rowY += 5;
    }
    y = Math.max(rowY + 4, 70);
    doc.setDrawColor(232, 232, 232);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    // --- Swiss Totals ---
    const totalsLabelX = margin + 32;
    muted();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.text("Sub Total", totalsLabelX, y);
    doc.text(money(subtotal), pageWidth - margin, y, { align: "right" });
    y += 4;
    doc.text("Delivery Fee", totalsLabelX, y);
    doc.text(money(shipping), pageWidth - margin, y, { align: "right" });
    y += 4;
    doc.setDrawColor(28, 28, 30);
    doc.setLineWidth(0.18);
    doc.line(totalsLabelX, y, pageWidth - margin, y);
    y += 5;
    ink();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.text("Due Amount", totalsLabelX, y);
    doc.text(money(total), pageWidth - margin, y, { align: "right" });
    ink();
  }

  return doc;
};

export const generateInvoice = async (orders: Order[], businessName?: string) => {
  const doc = await buildInvoicePdf(orders, businessName);
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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatMoney = (value: number | null | undefined) =>
  (value ?? 0).toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const printInvoice = (orders: Order[], businessName?: string) => {
  const invoicePages = orders
    .map((order) => {
      const invoiceNo = escapeHtml(order.order_number.replace("#", ""));
      const customerName = escapeHtml(order.customer_name || "Customer");
      const phone = order.phone ? escapeHtml(order.phone) : "";
      const address = order.address ? escapeHtml(cleanAddress(order.address)) : "";
      const subtotal = order.price || 0;
      const shipping = order.delivery_rate || 0;
      const total = subtotal + shipping;
      const consignmentId = order.consignment_id;
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
          <div class="brand">${escapeHtml(businessName || "My Business")}</div>
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
    generateInvoice(orders, businessName).catch(() => {});
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
        try { document.body.removeChild(iframe); } catch (_) { /* iframe already removed */ }
      }, 5000);
    }, 300);
  };
};
