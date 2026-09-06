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

export function isOnHoldStatus(value: string | null | undefined): boolean {
  const normalized = normalizeBusinessStatus(value);
  return normalized === "on_hold" || normalized === "hold";
}

export function canEnterPrint(fromStatus: string | null | undefined): boolean {
  return isApprovedStatus(fromStatus);
}

export function canLeavePrint(toStatus: string | null | undefined): boolean {
  if (isOnHoldStatus(toStatus)) return true;
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

export function displayStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeBusinessStatus(status);
  if (normalized === "confirmed") return "Approved";
  if (normalized === "on_hold" || normalized === "hold") return "On Hold";
  return (status || "").trim();
}

export type BulkStatusCandidate = {
  id: string;
  status?: string | null;
};

export function planBulkStatusChange(
  orders: BulkStatusCandidate[],
  ids: Iterable<string>,
  target: string,
): { validIds: string[]; skipped: number } {
  const normalizedTarget = normalizeBusinessStatus(target);
  const byId = new Map(orders.map((order) => [order.id, order]));
  const validIds: string[] = [];
  let skipped = 0;
  for (const id of ids) {
    const order = byId.get(id);
    if (!order) {
      skipped += 1;
      continue;
    }
    if (normalizeBusinessStatus(order.status) === normalizedTarget) {
      skipped += 1;
      continue;
    }
    if (normalizedTarget === "print") {
      if (!canEnterPrint(order.status)) {
        skipped += 1;
        continue;
      }
    } else if (isPrintStatus(order.status) && !canLeavePrint(normalizedTarget)) {
      skipped += 1;
      continue;
    }
    validIds.push(id);
  }
  return { validIds, skipped };
}
