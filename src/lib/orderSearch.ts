export interface OrderSearchRecord {
  order_number: string | null | undefined;
  customer_name: string | null | undefined;
  phone: string | null | undefined;
  consignment_id: string | number | null | undefined;
  tracking_code: string | null | undefined;
}

// Order numbers are shown as "#ML-152172" but stored as "ML-152172", so a
// leading "#" is ignored on both the query and the stored number.
const stripLeadingHash = (value: string) => value.replace(/^#+/, "");

export function matchesOrderSearch(order: OrderSearchRecord, query: string): boolean {
  const normalizedQuery = stripLeadingHash(query.trim().toLowerCase()).trim();
  if (!normalizedQuery) return true;

  return [
    stripLeadingHash(String(order.order_number ?? "")),
    order.customer_name,
    order.phone,
    order.consignment_id,
    order.tracking_code,
  ].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery));
}
