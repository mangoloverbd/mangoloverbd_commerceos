// One-time catch-up from Steadfast's tracking history, for parcels booked before
// the webhook was connected: marks parcels that are really moving In transit
// (dated by their first movement) and records the latest delivery problem the
// rider reported. Never changes any other status.
//
//   node --env-file=.env scripts/steadfast-tracking-catchup.mjs --org-id=<uuid>          # preview
//   node --env-file=.env scripts/steadfast-tracking-catchup.mjs --org-id=<uuid> --apply  # write
//
// Steadfast locks the keys out for 60 minutes after 10 refused calls in five
// minutes, so the run is paced and stops at the first refused lookup.
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isFinalCourierStatus } from "../server/steadfastWebhook.js";
import { isDeliveryProblemNote } from "../shared/orderStatus.js";

const TRACKING_URL = "https://portal.packzy.com/api/v1/trackings_by_invoice";
const PAGE = 1000;
const PACE_MS = 150;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NOT_PICKED_UP = new Set(["", "in_review", "pending"]);
const MOVING = /^(consignment sent to|consignment has been received at|assigned to rider)/i;
// A parcel on its way back is not "in transit" to the customer.
const GOING_BACK = /reversed back|cancellation request|cancelled by|marked as cancelled|updated as cancelled/i;

export function parseTrackingCatchupArguments(args) {
  const orgId = args.find((arg) => arg.startsWith("--org-id="))?.slice("--org-id=".length);
  if (!UUID_RE.test(orgId || "")) throw new Error("Pass a valid --org-id=<uuid>");
  return { orgId, apply: args.includes("--apply") };
}

// The invoice Merchant Suite sends when booking (see /api/send-to-courier).
const invoiceFor = (order) => `ORD-${String(order.order_number || order.id.slice(-8)).replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase()}`;
const isSteadfast = (order) => order.courier_name === "steadfast"
  || (!order.courier_name && String(order.courier_message || "").toLowerCase().includes("steadfast"));

async function activeSteadfastOrders(supabase, orgId) {
  const orders = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("orders")
      .select("id, order_number, courier_status, courier_name, courier_message, courier_problem")
      .eq("org_id", orgId).eq("sent_to_courier", true).order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    orders.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return orders.filter((order) => isSteadfast(order) && !isFinalCourierStatus(order.courier_status));
}

export function planFromTracking(order, steps) {
  const ordered = [...steps].filter((s) => s?.text).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const patch = {};
  const firstMove = ordered.find((s) => MOVING.test(String(s.text).trim()));
  const goingBack = ordered.some((s) => GOING_BACK.test(String(s.text)));
  if (firstMove && !goingBack && NOT_PICKED_UP.has(String(order.courier_status || "").trim().toLowerCase())) {
    Object.assign(patch, { courier_status: "in_transit", courier_status_at: firstMove.created_at });
  }
  const problem = [...ordered].reverse().find((s) => isDeliveryProblemNote(String(s.text)));
  if (problem && String(problem.text).trim() !== order.courier_problem) {
    Object.assign(patch, { courier_problem: String(problem.text).trim(), courier_problem_at: problem.created_at });
  }
  return patch;
}

export async function runSteadfastTrackingCatchup({ supabase, orgId, apply, fetchImpl = fetch,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)), log = console.log }) {
  const { data: settings, error: settingsError } = await supabase.from("app_settings").select("key, value")
    .in("key", [`${orgId}:steadfast_api_key`, `${orgId}:steadfast_secret_key`]);
  if (settingsError) throw settingsError;
  const setting = (name) => settings?.find((row) => row.key === `${orgId}:${name}`)?.value;
  const apiKey = setting("steadfast_api_key"), secretKey = setting("steadfast_secret_key");
  if (!apiKey || !secretKey) throw new Error("Steadfast keys are not configured for this workspace");

  const orders = await activeSteadfastOrders(supabase, orgId);
  log(`${orders.length} active Steadfast parcels to check (${apply ? "apply" : "preview"})`);
  const result = { checked: 0, moving: 0, problems: 0, applied: 0, skipped: 0, stopped: null };

  for (const order of orders) {
    if (result.checked > 0) await sleep(PACE_MS);
    const response = await fetchImpl(`${TRACKING_URL}/${encodeURIComponent(invoiceFor(order))}`, {
      headers: { "Api-Key": apiKey, "Secret-Key": secretKey, "Content-Type": "application/json" },
    });
    if (!response.ok) { result.stopped = `Steadfast answered ${response.status}`; break; }
    const body = await response.json().catch(() => null);
    result.checked += 1;
    const patch = planFromTracking(order, Array.isArray(body?.tracking) ? body.tracking : []);
    if (patch.courier_status) result.moving += 1;
    if (patch.courier_problem) result.problems += 1;
    if (!apply || !Object.keys(patch).length) continue;

    // Only write if nothing (such as the webhook) changed the parcel meanwhile.
    let update = supabase.from("orders").update(patch).eq("id", order.id).eq("org_id", orgId);
    update = order.courier_status === null ? update.is("courier_status", null) : update.eq("courier_status", order.courier_status);
    const { data: updated, error } = await update.select("id");
    if (error) throw error;
    if (updated?.length) result.applied += 1; else result.skipped += 1;
    if (result.applied && result.applied % 100 === 0) log(`… ${result.applied} updated`);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { orgId, apply } = parseTrackingCatchupArguments(process.argv.slice(2));
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  const result = await runSteadfastTrackingCatchup({ supabase: createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), orgId, apply });
  console.log(JSON.stringify(result, null, 2));
  if (result.stopped) process.exitCode = 1;
}
