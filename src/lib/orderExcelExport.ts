import { strToU8, zipSync } from "fflate";

export type ExportableOrder = {
  id: string; order_number?: string | null; customer_name?: string | null; contact_name?: string | null;
  phone?: string | null; address?: string | null; product?: string | null;
  items?: Array<{ product?: string | null; quantity?: number | null }> | null; quantity?: number | null;
  weight_kg?: number | null; price?: number | null; total_price?: number | null;
  warehouse_id?: string | null; consignment_id?: string | number | null;
};

export const ORDER_EXPORT_COLUMNS = ["Order Number", "Customer Name", "Phone", "Address", "Product", "Quantity", "Weight (kg)", "COD Amount", "Warehouse", "Steadfast ID"] as const;

export function buildOrderExportRows(orders: ExportableOrder[], warehouseNames: Record<string, string>, options: { inbox?: boolean } = {}) {
  return orders.map((order) => {
    const items = order.items ?? [];
    const product = order.product || items.map((item) => `${item.product || ""} x${item.quantity ?? 1}`).join(", ");
    const quantity = order.quantity ?? (items.length ? items.reduce((sum, item) => sum + (item.quantity ?? 1), 0) : "");
    return [
      options.inbox ? `IO-${order.order_number || order.id}` : (order.order_number || order.id),
      order.customer_name || order.contact_name || "", order.phone || "", order.address || "", product,
      quantity, order.weight_kg ?? "", order.price ?? order.total_price ?? "",
      order.warehouse_id ? warehouseNames[order.warehouse_id] || "" : "", order.consignment_id ?? "",
    ];
  });
}

export function orderExportFileName(date: Date, warehouseName?: string | null) {
  const day = date.toISOString().slice(0, 10);
  const warehouse = warehouseName?.trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return `orders${warehouse ? `-${warehouse}` : ""}-${day}.xlsx`;
}

const escapeXml = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const columnName = (index: number) => String.fromCharCode(65 + index);

function worksheetXml(rows: Array<Array<string | number>>) {
  const allRows = [ORDER_EXPORT_COLUMNS as unknown as string[], ...rows];
  const body = allRows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => {
    const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
    return typeof cell === "number" ? `<c r="${ref}"${rowIndex === 0 ? ' s="1"' : ""}><v>${cell}</v></c>` : `<c r="${ref}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
  }).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${[18,22,16,36,32,12,14,16,20,18].map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${body}</sheetData></worksheet>`;
}

export async function downloadOrderExcel(orders: ExportableOrder[], warehouseNames: Record<string, string>, options: { inbox?: boolean; warehouseName?: string | null } = {}) {
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    "_rels/.rels": strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    "xl/workbook.xml": strToU8('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Orders" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    "xl/styles.xml": strToU8('<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font/><font><b/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>'),
    "xl/worksheets/sheet1.xml": strToU8(worksheetXml(buildOrderExportRows(orders, warehouseNames, options))),
  };
  const blob = new Blob([zipSync(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
  anchor.href = url; anchor.download = orderExportFileName(new Date(), options.warehouseName); anchor.click(); URL.revokeObjectURL(url);
}
