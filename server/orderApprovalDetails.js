export function getMissingOrderApprovalFields(order) {
  const text = (value) => typeof value === "string" ? value.trim() : "";
  const customerName = text(order?.customer_name) || text(order?.contact_name);
  const missing = [];

  if (!customerName) missing.push("customer name");
  if (!text(order?.phone)) missing.push("phone number");
  if (!text(order?.address)) missing.push("delivery address");

  return missing;
}

export function getOrderApprovalDetailsError(order) {
  const missingFields = getMissingOrderApprovalFields(order);
  if (missingFields.length === 0) return null;

  const fieldList = missingFields.length === 1
    ? missingFields[0]
    : `${missingFields.slice(0, -1).join(", ")}${missingFields.length > 2 ? "," : ""} and ${missingFields.at(-1)}`;

  return {
    error: `Add the ${fieldList} before approving this order.`,
    code: "approval_customer_details_required",
    missing_fields: missingFields,
  };
}
