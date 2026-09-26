import { buildDetailedActivityEvent } from "./orderActivity.js";
import { buildStatusEvent } from "./orderAttribution.js";
import { isScheduledOrderHoldDue } from "../shared/orderHold.js";

const HOLD_STATUSES = ["on_hold", "hold"];
const CANDIDATE_PAGE_SIZE = 500;

async function fetchDueOrderHolds(supabase, orgId, todayInDhaka) {
  const candidates = [];
  for (let from = 0; ; from += CANDIDATE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, status, hold_reason_code, hold_reason_detail, hold_until_date")
      .eq("org_id", orgId)
      .in("status", HOLD_STATUSES)
      .not("hold_until_date", "is", null)
      .lt("hold_until_date", todayInDhaka)
      .order("id", { ascending: true })
      .range(from, from + CANDIDATE_PAGE_SIZE - 1);
    if (error) throw error;

    const page = data || [];
    candidates.push(...page.filter((row) => isScheduledOrderHoldDue(row.hold_until_date, todayInDhaka)));
    if (page.length < CANDIDATE_PAGE_SIZE) break;
  }
  return candidates;
}

/** Release due customer-date holds without touching unscheduled risk holds. */
export async function releaseDueOrderHolds({
  supabase,
  orgId,
  todayInDhaka,
  now = new Date(),
  recordStatusEvent,
  recordOrderActivity,
} = {}) {
  if (!supabase || !orgId || !todayInDhaka) throw new TypeError("Workspace, date, and Supabase client are required");
  if (typeof recordStatusEvent !== "function" || typeof recordOrderActivity !== "function") {
    throw new TypeError("Order hold release requires status and activity recorders");
  }

  const candidates = await fetchDueOrderHolds(supabase, orgId, todayInDhaka);
  let released = 0;
  const occurredAt = now.toISOString();

  for (const candidate of candidates) {
    const { data: updatedOrder, error } = await supabase
      .from("orders")
      .update({ status: "pending", updated_at: occurredAt })
      .eq("id", candidate.id)
      .eq("org_id", orgId)
      .in("status", HOLD_STATUSES)
      .not("hold_until_date", "is", null)
      .lt("hold_until_date", todayInDhaka)
      .select("id, status, hold_reason_code, hold_reason_detail, hold_until_date")
      .maybeSingle();
    if (error) throw error;
    if (!updatedOrder) continue;

    const statusEvent = buildStatusEvent({
      orgId,
      orderId: updatedOrder.id,
      orderTable: "orders",
      fromStatus: candidate.status,
      toStatus: "pending",
      actorKind: "system",
      occurredAt,
    });
    const statusChange = {
      type: "field_changed",
      field: "status",
      label: "Status",
      before: candidate.status,
      after: "pending",
    };
    const activityEvent = buildDetailedActivityEvent({
      orgId,
      orderId: updatedOrder.id,
      orderTable: "orders",
      eventType: "order.status_changed",
      category: "status",
      actorKind: "system",
      sourceSurface: "system",
      summary: "Scheduled hold ended",
      reasonCode: updatedOrder.hold_reason_code,
      reasonNote: updatedOrder.hold_reason_detail,
      changes: [statusChange],
      metadata: {
        from_status: candidate.status,
        to_status: "pending",
        hold_until_date: updatedOrder.hold_until_date,
      },
      occurredAt,
    });

    await recordStatusEvent(supabase, statusEvent);
    await recordOrderActivity(supabase, activityEvent);
    released += 1;
  }

  return released;
}
