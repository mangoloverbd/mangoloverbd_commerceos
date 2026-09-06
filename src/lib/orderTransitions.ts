export function normalizeBusinessStatus(value: string | null | undefined): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isApprovedStatus(value: string | null | undefined): boolean {
  const normalized = normalizeBusinessStatus(value);
  return normalized === "approved" || normalized === "confirmed";
}

export function isPrintStatus(value: string | null | undefined): boolean {
  return normalizeBusinessStatus(value) === "print";
}

export function canEnterPrint(fromStatus: string | null | undefined): boolean {
  return isApprovedStatus(fromStatus);
}

export function canLeavePrint(toStatus: string | null | undefined): boolean {
  const normalized = normalizeBusinessStatus(toStatus);
  return (
    normalized === "print" ||
    normalized === "approved" ||
    normalized === "confirmed" ||
    normalized === "cancelled" ||
    normalized === "canceled"
  );
}

export function courierSendBlockReason(status: string | null | undefined): string | null {
  if (isApprovedStatus(status)) return "Move to Print first";
  return null;
}
