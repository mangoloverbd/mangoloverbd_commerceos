import express from "express";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import * as campaignLinks from "../../server/campaignLinks.js";
import * as campaignReport from "../../server/campaignReport.js";
import * as abandoned from "../../server/abandonedCheckouts.js";
import * as clientContext from "../../server/clientContext.js";
import { normalizeBusinessReportSource } from "../../server/businessReport.js";
import crypto from "node:crypto";

export const orgId = "11111111-1111-4111-8111-111111111111";
export const foreignOrg = "99999999-9999-4999-8999-999999999999";
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// A deliberately small in-memory Supabase adapter. Production handlers execute
// unchanged; assertions inspect filters, payloads, pagination and RPC arguments.
export function database(seed: Record<string, Record<string, unknown>[]> = {}) {
  const tables = structuredClone(seed);
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const failures: Record<string, { code?: string; message: string }> = {};
  const hanging = new Set<string>();
  let sequence = 10000;
  function from(table: string) {
    const rows = () => tables[table] || [];
    const filters: ((row: Record<string, unknown>) => boolean)[] = [];
    const sorts: [string, boolean][] = [];
    let offset = 0, end = Infinity, one = false;
    let fields = "*";
    let operation = "select", payload: Record<string, unknown> | Record<string, unknown>[] = {};
    const q = {
      select(...args: unknown[]) { calls.push({ table, method: "select", args }); fields = String(args[0] || "*"); return q; },
      eq(key: string, value: unknown) { calls.push({ table, method: "eq", args: [key, value] }); filters.push(row => row[key] === value); return q; },
      is(key: string, value: unknown) { calls.push({ table, method: "is", args: [key, value] }); filters.push(row => (row[key] ?? null) === value); return q; },
      in(key: string, values: unknown[]) { calls.push({ table, method: "in", args: [key, values] }); filters.push(row => values.includes(row[key])); return q; },
      gte(key: string, value: string) { filters.push(row => String(row[key]) >= value); return q; },
      gt(key: string, value: string) { filters.push(row => String(row[key]) > value); return q; },
      lt(key: string, value: string) { filters.push(row => String(row[key]) < value); return q; },
      order(key: string, options: { ascending?: boolean } = {}) { sorts.push([key, options.ascending !== false]); return q; },
      range(start: number, stop: number) { calls.push({ table, method: "range", args: [start, stop] }); offset = start; end = stop + 1; return q; },
      limit(count: number) { end = count; return q; },
      maybeSingle() { one = true; return q; }, single() { one = true; return q; },
      abortSignal(signal: AbortSignal) { calls.push({ table, method: "abortSignal", args: [signal] }); return q; },
      insert(value: typeof payload) { operation = "insert"; payload = value; calls.push({ table, method: "insert", args: [value] }); return q; },
      update(value: Record<string, unknown>) { operation = "update"; payload = value; calls.push({ table, method: "update", args: [value] }); return q; },
      delete() { operation = "delete"; return q; },
      async then(resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) {
        try {
          if (hanging.has(table)) return await new Promise(() => {});
          if (failures[table]) return resolve({ data: null, error: failures[table] });
          let result = rows().filter(row => filters.every(filter => filter(row)));
          if (operation === "insert") {
            const inputs = Array.isArray(payload) ? payload : [payload];
            if (table === "campaign_links" && inputs.some(input => rows().some(row => row.org_id === input.org_id && row.slug === input.slug))) return resolve({ data: null, error: { code: "23505" } });
            result = inputs.map(input => ({ id: uuid(sequence++), created_at: new Date().toISOString(), ...input }));
            tables[table] = [...rows(), ...result];
          } else if (operation === "update") result.forEach(row => Object.assign(row, payload));
          else if (operation === "delete") tables[table] = rows().filter(row => !result.includes(row));
          for (const [key, ascending] of [...sorts].reverse()) result.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1));
          result = result.slice(offset, end);
          if (fields !== "*") result = result.map(row => Object.fromEntries(fields.split(",").map(key => key.trim()).filter(key => Object.prototype.hasOwnProperty.call(row, key)).map(key => [key, row[key]])));
          return resolve({ data: one ? result[0] || null : result, error: null });
        } catch (error) { return reject?.(error); }
      },
    };
    return q;
  }
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.push({ table: name, method: "rpc", args: [args] });
    if (failures[name]) return { data: null, error: failures[name] };
    if (name === "record_campaign_link_click") {
      const saved = (tables.campaign_link_clicks || []).find(row => row.org_id === args.p_org_id && row.request_id === args.p_request_id);
      const row = saved || { id: uuid(sequence++), org_id: args.p_org_id, link_id: args.p_link_id, request_id: args.p_request_id, clicked_at: new Date().toISOString(), is_bot: args.p_is_bot, visitor_hash: args.p_visitor_hash };
      if (!saved) tables.campaign_link_clicks = [...(tables.campaign_link_clicks || []), row];
      return { data: [row], error: null };
    }
    if (name === "rename_campaign_link") {
      const row = tables.campaign_links?.find(row => row.id === args.p_link_id && row.org_id === args.p_org_id);
      if (!row) return { data: [], error: { code: "P0002" } };
      if (tables.campaign_link_clicks?.some(click => click.link_id === row.id)) return { data: null, error: { code: "23514", message: "slug locked" } };
      row.slug = args.p_slug;
      return { data: [row], error: null };
    }
    if (name === "attribute_campaign_checkout") {
      const row = tables.abandoned_checkouts?.find(row => row.id === args.p_checkout_id && row.org_id === args.p_org_id);
      const click = tables.campaign_link_clicks?.find(row => row.id === args.p_click_id && row.org_id === args.p_org_id);
      const saved = tables.campaign_link_clicks?.find(click => click.id === row?.campaign_click_id);
      const attribution = campaignLinks.resolveCampaignAttribution({ click, orgId: args.p_org_id, effectiveAt: args.p_effective_at });
      if (row && ["open", "contacted"].includes(String(row.status)) && (!saved || String(click?.clicked_at) >= String(saved.clicked_at))) Object.assign(row, attribution);
      return { data: row ? [row] : [], error: null };
    }
    if (name === "record_analytics_order_fact") return { data: "recorded", error: null };
    throw new Error(`Unexpected RPC ${name}`);
  };
  return { from, rpc: (name: string, args: Record<string, unknown>) => {
    const promise = rpc(name, args);
    return Object.assign(promise, { abortSignal: (_signal: AbortSignal) => promise });
  }, tables, calls, failures, hanging };
}

const source = readFileSync("server/index.js", "utf8");
export function handlers(db: ReturnType<typeof database>, extras: Record<string, unknown> = {}) {
  const app = express(); app.use(express.json());
  const context = createContext({ app, process, console, crypto, Date, URL, AbortController, setTimeout, clearTimeout,
    ...campaignLinks, ...campaignReport, ...abandoned, ...clientContext, normalizeBusinessReportSource,
    // jsdom's AbortSignal lacks Node's timeout(); handlers use it for bounded optional lookups.
    AbortSignal: { timeout: (ms: number) => { const controller = new AbortController(); setTimeout(() => controller.abort(), ms); return controller.signal; } },
    getServiceSupabase: () => db,
    getToken: (req: express.Request) => req.headers.authorization,
    getUser: async (token: string) => ({ user: token ? { id: uuid(1) } : null }),
    getUserOrg: async () => ({ orgId }),
    resolveStorefrontHandle: async (handle: string) => handle === "mangolover" ? orgId : null,
    rateLimitPublicRead: (_req: unknown, _res: unknown, next: () => void) => next(),
    getBangladeshDateKey: (date: Date) => date.toISOString().slice(0, 10),
    ...extras,
  });
  const start = source.indexOf("const CAMPAIGN_LINK_FIELDS");
  if (start >= 0) runInContext(source.slice(start, source.indexOf("const ABANDONED_CHECKOUT_DASHBOARD_FIELDS", start)), context);
  const parsed = ts.createSourceFile("index.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return { app, context, load(names: string[], routes: string[] = []) {
    for (const statement of parsed.statements) {
      if (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(parsed)))) runInContext(statement.getText(parsed), context);
      if (ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text || "")) runInContext(statement.getText(parsed), context);
      if (ts.isExpressionStatement(statement) && routes.some(route => statement.getText(parsed).startsWith(route))) runInContext(statement.getText(parsed), context);
    }
  } };
}

export async function http(app: express.Express, method: string, path: string, body?: unknown, headers: Record<string, string> = { authorization: "Bearer test" }) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, headers: response.headers, body: await response.json() };
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

export const link = { id: uuid(2), org_id: orgId, name: "Mango reel", slug: "mango-reel", channel: "facebook", destination_path: "/step/honey?variant=large#buy", created_by: uuid(88), archived_at: null };
export function signedHeaders(userAgent = "Mozilla/5.0 FBAN/FBIOS") {
  const secret = "test-secret-at-least-thirty-two-characters";
  process.env.STOREFRONT_CONTEXT_SECRET = secret;
  return { "x-mlbd-client-context": clientContext.signClientContext({ v: 1, issuedAt: new Date().toISOString(), ip: "203.0.113.5", userAgent, geo: { country: null, region: null, city: null }, deviceId: null, fingerprint: null, telemetry: { firstInteractionAt: null, phoneCandidates: [], pastedFields: [] } }, secret) };
}
