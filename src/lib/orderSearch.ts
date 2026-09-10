export interface OrderSearchRecord {
  order_number: string | null | undefined;
  customer_name: string | null | undefined;
  phone: string | null | undefined;
  consignment_id: string | number | null | undefined;
  tracking_code: string | null | undefined;
}

export function matchesOrderSearch(order: OrderSearchRecord, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return [
    order.order_number,
    order.customer_name,
    order.phone,
    order.consignment_id,
    order.tracking_code,
  ].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery));
}
