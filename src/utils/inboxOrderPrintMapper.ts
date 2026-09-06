import type { InvoiceOrder } from "@/utils/invoiceGenerator";

interface InboxOrderForPrint {
  id: string;
  platform: string;
  contact_name: string;
  contact_id: string;
  items: Array<{
    product: string;
    quantity: number;
    variant_id?: string | null;
  }>;
  notes: string;
  total_price: number;
  status: string;
  created_at: string;
  delivery_rate?: number | null;
  courier_status?: string | null;
  consignment_id?: string | number | null;
  tracking_code?: string | null;
  courier_message?: string | null;
}

const parseInboxNotes = (notes: string) => {
  const phone = notes?.match(/Phone:\s*([^,\n]+)/i)?.[1]?.trim() || "";
  const address = notes?.match(/Address:\s*([^\n]+)/i)?.[1]?.trim() || "";
  const orderNote = (notes || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(?:Phone|Address):/i.test(line))
    .join("\n")
    .trim();
  return { phone, address, orderNote };
};

const itemsToProduct = (items: InboxOrderForPrint["items"]) =>
  (items || []).map((item) => `${item.quantity}x ${item.product}`).join(", ");

export function toInvoiceOrder(
  order: InboxOrderForPrint,
  variantLabels: Record<string, string> = {},
): InvoiceOrder {
  const { phone, address, orderNote } = parseInboxNotes(order.notes);
  const items = order.items || [];

  return {
    id: order.id,
    order_number: `IO-${order.id.slice(-6).toUpperCase()}`,
    customer_name: order.contact_name || order.contact_id || "Customer",
    phone: phone || null,
    address: address || null,
    product: itemsToProduct(items),
    quantity: items.reduce((total, item) => total + (item.quantity || 1), 0),
    price: order.total_price,
    status: order.status,
    created_at: order.created_at,
    delivery_rate: order.delivery_rate ?? null,
    courier_status: order.courier_status || null,
    consignment_id: order.consignment_id || null,
    tracking_code: order.tracking_code || null,
    courier_message: order.courier_message || null,
    notes: orderNote || null,
    items: items.map((item) => ({
      product_name: item.product || "Item",
      variant_name: item.variant_id ? variantLabels[item.variant_id] || null : null,
      quantity: item.quantity || 1,
    })),
  };
}
