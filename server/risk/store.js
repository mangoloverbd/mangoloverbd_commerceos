const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const KINDS = ["phone", "device", "fingerprint", "network"];

function uuid(value, name) {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError(`Invalid ${name}`);
  return value;
}
function hash(value, name) {
  if (typeof value !== "string" || !HASH.test(value)) throw new TypeError(`Invalid ${name}`);
  return value;
}
function listName(value) {
  if (value !== "block" && value !== "allow") throw new TypeError("Invalid list");
  return value;
}
function pageSize(value) {
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new TypeError("Invalid limit");
  return value;
}
function isoDate(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) throw new TypeError(`Invalid ${name}`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`Invalid ${name}`);
  return parsed.toISOString();
}
async function result(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
function ensureRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new TypeError("Invalid attempt");
  uuid(row.org_id, "org_id");
  if (!["public_v1", "custom_webhook"].includes(row.route) || !["shadow", "active"].includes(row.mode) || !["ALLOW", "HOLD", "BLOCK"].includes(row.decision) || !Number.isInteger(row.score) || row.score < 0) throw new TypeError("Invalid risk attempt");
  if (row.expires_at != null) isoDate(row.expires_at, "expires_at");
  for (const key of ["phone_hash", "device_hash", "fingerprint_hash", "network_hash", "ip_hash", "user_agent_hash"]) {
    if (row[key] != null) hash(row[key], key);
  }
  for (const key of ["order_id", "review_id"]) if (row[key] != null) uuid(row[key], key);
  if (row.signals != null && !Array.isArray(row.signals)) throw new TypeError("Invalid signals");
  if (row.items != null && !Array.isArray(row.items)) throw new TypeError("Invalid items");
  return row;
}

export async function insertRiskAttempt(supabase, row) {
  return result(supabase.from("order_risk_attempts").insert(ensureRow(row)).select("id").single());
}

export async function linkAttemptToOrder(supabase, { orgId, attemptId, orderId }) {
  uuid(orgId, "orgId"); uuid(attemptId, "attemptId"); uuid(orderId, "orderId");
  const attempt = await result(supabase.from("order_risk_attempts").select("id").eq("org_id", orgId).eq("id", attemptId).maybeSingle());
  if (!attempt) return null;
  const order = await result(supabase.from("orders").update({ risk_attempt_id: attemptId }).eq("org_id", orgId).eq("id", orderId).select("id").maybeSingle());
  if (!order) return null;
  await result(supabase.from("order_risk_attempts").update({ order_id: orderId }).eq("org_id", orgId).eq("id", attemptId));
  return order;
}

export async function linkAttemptToReview(supabase, { orgId, attemptId, reviewId }) {
  uuid(orgId, "orgId"); uuid(attemptId, "attemptId"); uuid(reviewId, "reviewId");
  const attempt = await result(supabase.from("order_risk_attempts").select("id").eq("org_id", orgId).eq("id", attemptId).maybeSingle());
  if (!attempt) return null;
  const review = await result(supabase.from("order_protection_reviews").update({ attempt_id: attemptId }).eq("org_id", orgId).eq("id", reviewId).select("id").maybeSingle());
  if (!review) return null;
  await result(supabase.from("order_risk_attempts").update({ review_id: reviewId }).eq("org_id", orgId).eq("id", attemptId));
  return review;
}

export async function listRiskAttempts(supabase, { orgId, decision = "all", limit = 50, before = null }) {
  uuid(orgId, "orgId"); pageSize(limit);
  if (!["all", "allow", "hold", "block"].includes(decision)) throw new TypeError("Invalid decision");
  let query = supabase.from("order_risk_attempts").select("*").eq("org_id", orgId);
  if (decision !== "all") query = query.eq("decision", decision.toUpperCase());
  if (before != null) query = query.lt("created_at", isoDate(before, "before"));
  return (await result(query.order("created_at", { ascending: false }).limit(limit))) || [];
}

export async function getRiskAttempt(supabase, { orgId, attemptId }) {
  uuid(orgId, "orgId"); uuid(attemptId, "attemptId");
  return result(supabase.from("order_risk_attempts").select("*").eq("org_id", orgId).eq("id", attemptId).maybeSingle());
}

export async function listRelatedAttempts(supabase, { orgId, attempt, days = 7, limit = 50 }) {
  uuid(orgId, "orgId"); uuid(attempt?.id, "attempt.id"); pageSize(limit);
  if (!Number.isInteger(days) || days < 1 || days > 180) throw new TypeError("Invalid days");
  const terms = [];
  for (const key of ["phone_hash", "device_hash", "fingerprint_hash"]) {
    if (attempt[key] != null) terms.push(`${key}.eq.${hash(attempt[key], key)}`);
  }
  if (!terms.length) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  return (await result(supabase.from("order_risk_attempts").select("*").eq("org_id", orgId).gte("created_at", since).or(terms.join(",")).not("id", "eq", attempt.id).order("created_at", { ascending: false }).limit(limit))) || [];
}

export async function findListHits(supabase, { orgId, hashes }) {
  uuid(orgId, "orgId");
  const values = [];
  for (const kind of KINDS) if (hashes?.[kind] != null) values.push(hash(hashes[kind], kind));
  const hits = { block: [], allow: [] };
  if (!values.length) return hits;
  const rows = await result(supabase.from("order_risk_list_entries").select("list, kind, value_hash").eq("org_id", orgId).in("value_hash", values).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`));
  for (const row of rows || []) if ((row.list === "block" || row.list === "allow") && KINDS.includes(row.kind) && hashes[row.kind] === row.value_hash && !hits[row.list].includes(row.kind)) hits[row.list].push(row.kind);
  return hits;
}

export async function createListEntries(supabase, { orgId, list, entries, reason = null, sourceAttemptId = null, createdBy = null }) {
  uuid(orgId, "orgId"); listName(list);
  if (!Array.isArray(entries) || !entries.length) throw new TypeError("Invalid entries");
  if (sourceAttemptId != null) uuid(sourceAttemptId, "sourceAttemptId");
  if (createdBy != null) uuid(createdBy, "createdBy");
  if (reason != null && (typeof reason !== "string" || reason.length > 500)) throw new TypeError("Invalid reason");
  const rows = entries.map(entry => {
    if (!entry || !KINDS.includes(entry.kind)) throw new TypeError("Invalid kind");
    hash(entry.value_hash, "value_hash");
    if (entry.display_hint != null && (typeof entry.display_hint !== "string" || entry.display_hint.length > 120)) throw new TypeError("Invalid display_hint");
    return { org_id: orgId, list, kind: entry.kind, value_hash: entry.value_hash, display_hint: entry.display_hint ?? null, reason, source_attempt_id: sourceAttemptId, created_by: createdBy, expires_at: entry.expires_at == null ? null : isoDate(entry.expires_at, "expires_at") };
  });
  return (await result(supabase.from("order_risk_list_entries").upsert(rows, { onConflict: "org_id,list,kind,value_hash" }).select("*").eq("org_id", orgId))) || [];
}

export async function listListEntries(supabase, { orgId, list }) {
  uuid(orgId, "orgId"); listName(list);
  return (await result(supabase.from("order_risk_list_entries").select("*").eq("org_id", orgId).eq("list", list).order("created_at", { ascending: false }))) || [];
}

export async function deleteListEntry(supabase, { orgId, entryId }) {
  uuid(orgId, "orgId"); uuid(entryId, "entryId");
  return result(supabase.from("order_risk_list_entries").delete().eq("org_id", orgId).eq("id", entryId).select("id").maybeSingle());
}

export async function labelRiskAttempt(supabase, { orgId, attemptId, label }) {
  uuid(orgId, "orgId"); uuid(attemptId, "attemptId");
  if (label !== "fake" && label !== "genuine") throw new TypeError("Invalid label");
  return result(supabase.from("order_risk_attempts").update({ label, labelled_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", attemptId).select("*").maybeSingle());
}

export async function scrubExpiredRiskAttempts(supabase, { now = new Date() } = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError("Invalid now");
  // Internal service-role maintenance sweeps the fixed workspace database; no client supplies its scope.
  const { count: scrubbed, error: scrubError } = await supabase.from("order_risk_attempts")
    .update({ customer_name: null, phone: null, address: null, ip_prefix: null, items: [] }, { count: "exact" })
    .lt("expires_at", now.toISOString());
  if (scrubError) throw scrubError;
  const cutoff = new Date(now.getTime() - 180 * 86_400_000).toISOString();
  const { count: deleted, error: deleteError } = await supabase.from("order_risk_attempts")
    .delete({ count: "exact" }).lt("created_at", cutoff);
  if (deleteError) throw deleteError;
  return { scrubbed: scrubbed || 0, deleted: deleted || 0 };
}
