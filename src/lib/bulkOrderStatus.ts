import { apiFetch } from "@/lib/api";
import { createActivityGroupId } from "@/lib/orderActivity";
import type { OrderHoldMetadata } from "@/components/orders/OrderHoldFields";

// Matches MAX_BULK_STATUS_ORDERS in server/orderBulkStatus.js.
export const BULK_STATUS_BATCH_SIZE = 500;

export type BulkStatusFailure = { orderId: string; orderNumber: string | null; reason: string };

export type BulkStatusResult<TOrder> = {
  updated: TOrder[];
  failedIds: Set<string>;
  error: string | null;
};

// One request per 500 orders instead of one request per order. All batches
// share one activity group so the Activity Log shows a single bulk action.
export async function requestBulkStatusChange<TOrder>(
  orderIds: string[],
  status: string,
  holdDetails?: OrderHoldMetadata,
): Promise<BulkStatusResult<TOrder>> {
  const activityGroupId = createActivityGroupId();
  const updated: TOrder[] = [];
  const failedIds = new Set<string>();
  let error: string | null = null;

  for (let start = 0; start < orderIds.length; start += BULK_STATUS_BATCH_SIZE) {
    const batch = orderIds.slice(start, start + BULK_STATUS_BATCH_SIZE);
    try {
      const res = await apiFetch("/api/orders/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: batch, status, ...(holdDetails || {}), activity_group_id: activityGroupId }),
      });
      const data = await res.json().catch(() => ({})) as { updated?: TOrder[]; failures?: BulkStatusFailure[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      updated.push(...(data.updated || []));
      for (const failure of data.failures || []) failedIds.add(failure.orderId);
    } catch (batchError) {
      error = batchError instanceof Error ? batchError.message : "Failed to update status";
      for (const orderId of batch) failedIds.add(orderId);
    }
  }

  return { updated, failedIds, error };
}
