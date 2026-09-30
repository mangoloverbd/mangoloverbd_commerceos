const state = (value) => String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");

export function customerReturnPending(row) {
  return state(row.return_status) === "pending" || /return.*pending/.test(state(row.courier_status));
}

export function customerOrderOutcome(row) {
  const statuses = [row.status, row.courier_status, row.fulfillment_status].map(state);
  if (["returned", "completed"].includes(state(row.return_status))) return "returned";
  // Older courier sync marked approval-pending returns as status=returned.
  // Preserve the uncertainty instead of treating that shortcut as completion.
  if (/return.*pending/.test(state(row.courier_status))) return "active";
  if (statuses.includes("returned")) return "returned";
  if (statuses.some((value) => ["cancelled", "canceled", "rejected"].includes(value))) return "cancelled";
  if (statuses.some((value) => value.startsWith("partial_delivered"))) return "partial_delivered";
  if (statuses.includes("delivered")) return "delivered";
  return "active";
}
