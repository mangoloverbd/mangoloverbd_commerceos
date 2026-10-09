// One-time catch-up: asks Steadfast for the current status of every active
// Steadfast parcel, for orders whose updates were missed before the webhook was
// connected. Applies exactly the webhook's rules (server/steadfastWebhook.js):
// only Delivered and Cancelled; the lookup cannot tell In transit apart from
// pending, so that stays with the webhook.
//
//   node --env-file=.env scripts/steadfast-status-catchup.mjs --org-id=<uuid>          # preview
//   node --env-file=.env scripts/steadfast-status-catchup.mjs --org-id=<uuid> --apply  # write
//
// Steadfast locks the keys out for 60 minutes after 10 refused calls in five
// minutes, so the run is paced and stops at the first refused lookup.
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isFinalCourierStatus, planSteadfastStatusSync } from "../server/steadfastWebhook.js";
import { buildDetailedActivityEvent } from "../server/orderActivity.js";
import { buildStatusEvent } from "../server/orderAttribution.js";
import { labelOrderRiskAttempt } from "../server/risk/labels.js";

const STATUS_URL = "https://portal.packzy.com/api/v1/status_by_cid";
const PAGE = 1000;
const PACE_MS = 150; // about 400 lookups a minute, under Steadfast's 1,000.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseCatchupArguments(args) {
  const orgId = args.find((arg) => arg.startsWith("--org-id="))?.slice("--org-id=".length);
  if (!UUID_RE.test(orgId || "")) throw new Error("Pass a valid --org-id=<uuid>");
  return { orgId, apply: args.includes("--apply") };
}

// Same parcel selection as the Steadfast refresh route.
const isSteadfast = (order) => order.courier_name === "steadfast"
  || (!order.courier_name && String(order.courier_message || "").toLowerCase().includes("steadfast"));

async function activeSteadfastOrders(supabase, orgId) {
  const orders = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("orders")
      .select("id, consignment_id, tracking_code, courier_status, status, courier_name, courier_message, risk_attempt_id")
      .eq("org_id", orgId).eq("sent_to_courier", true).order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    orders.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  // A parcel with a confirmed outcome never needs a lookup.
  return orders.filter((order) => isSteadfast(order) && (order.consignment_id || order.tracking_code)
    && !isFinalCourierStatus(order.courier_status));
}

async function recordChange(supabase, orgId, order, patch) {
  await labelOrderRiskAttempt(supabase, orgId, { ...order, ...patch });
  if (patch.status !== undefined) {
    const event = buildStatusEvent({ orgId, orderId: order.id, orderTable: "orders", fromStatus: order.status, toStatus: patch.status,
      actorId: null, actorKind: "system", includeEquivalentBusinessState: true });
    if (event) await supabase.from("order_status_events").insert({ ...event, id: randomUUID() });
  }
  const activity = buildDetailedActivityEvent({ orgId, orderId: order.id, orderTable: "orders", eventType: "courier.status_changed", category: "courier",
    actorKind: "system", sourceSurface: "system", summary: `Steadfast status caught up to ${patch.courier_status}`,
    metadata: { courier: "steadfast", from_status: order.courier_status, to_status: patch.courier_status } });
  await supabase.from("order_activity_events").insert({ ...activity, id: randomUUID() });
}

export async function runSteadfastStatusCatchup({ supabase, orgId, apply, fetchImpl = fetch,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)), log = console.log }) {
  const { data: settings, error: settingsError } = await supabase.from("app_settings").select("key, value")
    .in("key", [`${orgId}:steadfast_api_key`, `${orgId}:steadfast_secret_key`]);
  if (settingsError) throw settingsError;
  const setting = (name) => settings?.find((row) => row.key === `${orgId}:${name}`)?.value;
  const apiKey = setting("steadfast_api_key"), secretKey = setting("steadfast_secret_key");
  if (!apiKey || !secretKey) throw new Error("Steadfast keys are not configured for this workspace");

  const orders = await activeSteadfastOrders(supabase, orgId);
  log(`${orders.length} active Steadfast parcels to check (${apply ? "apply" : "preview"})`);
  const result = { checked: 0, changes: {}, applied: 0, skipped: 0, stopped: null };

  for (const order of orders) {
    if (result.checked > 0) await sleep(PACE_MS);
    const response = await fetchImpl(`${STATUS_URL}/${encodeURIComponent(order.consignment_id || order.tracking_code)}`, {
      headers: { "Api-Key": apiKey, "Secret-Key": secretKey, "Content-Type": "application/json" },
    });
    if (!response.ok) { result.stopped = `Steadfast answered ${response.status}`; break; }
    const body = await response.json().catch(() => null);
    result.checked += 1;
    const plan = planSteadfastStatusSync(body?.delivery_status, order.courier_status);
    if (plan.action === "ignore") continue;

    const change = `${order.courier_status || "none"} → ${plan.patch.courier_status}`;
    result.changes[change] = (result.changes[change] || 0) + 1;
    if (!apply) continue;

    // Only write if nothing (such as the webhook) changed the parcel meanwhile.
    let update = supabase.from("orders").update(plan.patch).eq("id", order.id).eq("org_id", orgId);
    update = order.courier_status === null ? update.is("courier_status", null) : update.eq("courier_status", order.courier_status);
    const { data: updated, error } = await update.select("id");
    if (error) throw error;
    if (!updated?.length) { result.skipped += 1; continue; }
    await recordChange(supabase, orgId, order, plan.patch);
    result.applied += 1;
    if (result.applied % 100 === 0) log(`… ${result.applied} updated`);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { orgId, apply } = parseCatchupArguments(process.argv.slice(2));
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const result = await runSteadfastStatusCatchup({ supabase, orgId, apply });
  console.log(JSON.stringify(result, null, 2));
  if (result.stopped) process.exitCode = 1;
}
