# Custom Storefront Domain — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a merchant connect their own domain (e.g. `shop.stepprs.com`) to their storefront from the Merchant Suite Settings page, with the Vercel custom-domain attach happening automatically on Save and DNS instructions shown back to them.

**Architecture:** Single-tenant model — each merchant has their own Commerce-os fork (one `org_id`) and their own storefront Vercel project. The storefront settings table gains `custom_domain` + `custom_domain_status` columns. A new admin-only Settings card reads/writes them. On Save, the backend calls the Vercel Project Domains API (`POST/PATCH/DELETE` against `https://api.vercel.com/v9/projects/{projectId}/domains`) using `VERCEL_PROJECT_ID` + `VERCEL_ACCESS_TOKEN` from env, validates the domain, persists `pending`/`verified`/`failed`, and returns the CNAME target (`cname.vercel-dns.com`) plus the exact DNS record for the merchant to set. The storefront itself reads its config from the suite's existing `GET /api/storefront/settings`-derived public config so it can render the merchant's branding on the attached domain. No multi-tenancy, no host→org resolution — the merchant's storefront deploy already knows its own org (single-tenant).

**Tech Stack:** Express (server/index.js), Supabase `storefront_settings` table, Vercel REST API v9, React + shadcn/ui + TanStack Query (Settings page), Vitest.

## Global Constraints

- Every DB query is scoped by the resolved `org_id` (project hard rule #2). The new columns live on `storefront_settings` which is already one-row-per-`org_id`; no new per-tenant table.
- New routes must be auth-guarded: `getToken` → `getUser` → `if (!user) return 401`, and admin-only for writes (project hard rule #3).
- Use `apiFetch()` from `src/lib/api.ts` for all frontend API calls (project hard rule #1).
- Use Phosphor Icons `weight="light"` for any new icons (project hard rule #5).
- Never commit secrets (`.env` is gitignored). `VERCEL_PROJECT_ID` + `VERCEL_ACCESS_TOKEN` live in env, not code (project hard rule #6).
- Schema change (`storefront_settings` new columns) is added to the `migrateStorefrontSettingsTable()` startup migration in `server/index.js` so it self-heals, matching the existing `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pattern. Invoke the `supabase` skill before implementing Task 1 (project hard rule #10).
- The Vercel API call must degrade gracefully: if `VERCEL_PROJECT_ID`/`VERCEL_ACCESS_TOKEN` are unset, persist the domain with status `pending` and return DNS instructions + a note that the operator will attach it (so dev/staging without Vercel creds still works, and prod fails closed rather than crashing Save).
- Currency/units: domain-only, no price work.
- TypeScript is strict — no `any` without a justifying comment.

## File Structure

- **Modify** `server/index.js`:
  - `migrateStorefrontSettingsTable()` — add `custom_domain` + `custom_domain_status` columns to the migration SQL.
  - `GET /api/storefront/settings` — return the two new fields.
  - `POST /api/storefront/settings` — accept `customDomain` and orchestrate the Vercel attach via a new helper `syncStorefrontDomain(orgId)`.
  - New helper `syncStorefrontDomain(orgId, prevDomain, newDomain)` — calls Vercel API (add/update/remove), returns `{ status, cnameTarget, dnsRecord, error }`.
  - New route `GET /api/storefront/domain-status` — polls the Vercel verification endpoint so the UI can refresh status without re-saving.
- **Modify** `src/pages/Settings.tsx`:
  - Add a `StorefrontDomainSection` component rendered inside `WorkspaceSection` (admin only).
  - Reads/writes via `apiFetch`; renders input, status badge, DNS instructions, Save/Disconnect buttons.
- **Modify** `.env.example` (Commerce-os) — document `VERCEL_PROJECT_ID`, `VERCEL_ACCESS_TOKEN`, `STOREFRONT_VERCEL_TEAM_ID` (optional, for team-scoped projects).
- **No storefront repo changes** — the storefront already reads its config from the suite; attaching the domain in Vercel is what makes the merchant's custom domain serve the storefront. (Future enhancement: have the storefront read the branding config from the suite to render the merchant's logo/colors on the custom domain — out of scope for this plan, noted at the end.)

---

### Task 1: Storefront settings schema — add custom_domain columns

**Files:**
- Modify: `server/index.js` — `migrateStorefrontSettingsTable()` function (around line 9895) and its migration SQL.

**Interfaces:**
- Consumes: existing `storefront_settings` table (one row per `org_id`).
- Produces: two new nullable columns — `custom_domain TEXT`, `custom_domain_status TEXT` (values: `pending` | `verified` | `failed` | null). Read by the GET route and written by the POST route + `syncStorefrontDomain`.

Before this task: invoke the `supabase` skill (schema change).

- [ ] **Step 1: Locate the migration**

Run: `grep -n "migrateStorefrontSettingsTable" server/index.js`
Expected: a function definition around line 9895 and its startup call.

- [ ] **Step 2: Read the current migration SQL**

```bash
sed -n "$(grep -n 'async function migrateStorefrontSettingsTable' server/index.js | head -1 | cut -d: -f1),+40p" server/index.js
```
Note the exact `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` blocks already there (e.g. `store_name`, `tagline`) — match this style.

- [ ] **Step 3: Add the two columns to the migration**

Append two `DO $$ BEGIN ... EXCEPTION ... END $$;` blocks inside `migrateStorefrontSettingsTable()`'s SQL string, mirroring the existing pattern exactly:

```sql
DO $$ BEGIN
  ALTER TABLE public.storefront_settings ADD COLUMN IF NOT EXISTS custom_domain TEXT;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.storefront_settings ADD COLUMN IF NOT EXISTS custom_domain_status TEXT;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
```
Place these immediately after the last existing `ALTER TABLE` block in that function. Do not touch other columns.

- [ ] **Step 4: Run the migration**

If the server is running, restart it (`npm run dev`) so `migrateStorefrontSettingsTable()` fires on boot. Otherwise run once.

- [ ] **Step 5: Verify the columns exist**

Run:
```bash
node --env-file=.env -e "import('pg').then(async ({default: pg}) => { const c=new pg.Pool({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}}); const r=await c.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='storefront_settings' AND column_name IN ('custom_domain','custom_domain_status')\"); console.log(r.rows); await c.end(); })"
```
Expected: two rows, `custom_domain` and `custom_domain_status`.

- [ ] **Step 6: Commit**

```bash
git add server/index.js
git commit -m "feat(storefront): add custom_domain columns to storefront_settings migration"
```

---

### Task 2: Vercel domain sync helper + verification endpoint

**Files:**
- Modify: `server/index.js` — add `syncStorefrontDomain()` helper near the storefront settings routes (after line ~2190), plus a `GET /api/storefront/domain-status` route.

**Interfaces:**
- Consumes: `VERCEL_PROJECT_ID`, `VERCEL_ACCESS_TOKEN`, optional `STOREFRONT_VERCEL_TEAM_ID` from env.
- Produces: `syncStorefrontDomain(orgId, prevDomain, newDomain)` → `{ status: 'pending'|'verified'|'failed', cnameTarget: string|null, dnsRecord: {type, host, value}|null, error: string|null }`. Used by the POST route (Task 3).
- Produces: `GET /api/storefront/domain-status` → `{ domain, status, cnameTarget, dnsRecord, error }` for UI polling.

- [ ] **Step 1: Add the helper**

Place `syncStorefrontDomain` above the `app.post("/api/storefront/settings"...)` route. It returns a plain object; it does not throw (errors become `status: 'failed'` + `error`).

```js
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID || "";
const VERCEL_ACCESS_TOKEN = process.env.VERCEL_ACCESS_TOKEN || "";
const STOREFRONT_VERCEL_TEAM_ID = process.env.STOREFRONT_VERCEL_TEAM_ID || "";

function vercelDomainsUrl() {
  const base = `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/domains`;
  return STOREFRONT_VERCEL_TEAM_ID ? `${base}?teamId=${STOREFRONT_VERCEL_TEAM_ID}` : base;
}
function vercelDomainUrl(domain) {
  const base = `https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}/domains/${encodeURIComponent(domain)}`;
  return STOREFRONT_VERCEL_TEAM_ID ? `${base}?teamId=${STOREFRONT_VERCEL_TEAM_ID}` : base;
}

// Bare host (apex) → A record 76.76.21.21; any subdomain → CNAME cname.vercel-dns.com.
function dnsRecordFor(domain) {
  const labels = domain.split(".");
  const isApex = labels.length <= 2 || (labels.length === 3 && labels[1].length <= 3);
  return isApex
    ? { type: "A", host: "@", value: "76.76.21.21" }
    : { type: "CNAME", host: labels.slice(0, -2).join(".") || "@", value: "cname.vercel-dns.com" };
}

async function syncStorefrontDomain(orgId, prevDomain, newDomain) {
  // No creds: persist intent only, instructions still return. Operator attaches manually.
  if (!VERCEL_PROJECT_ID || !VERCEL_ACCESS_TOKEN) {
    return newDomain
      ? { status: "pending", cnameTarget: "cname.vercel-dns.com", dnsRecord: dnsRecordFor(newDomain), error: "Vercel credentials not configured — operator will attach this domain manually." }
      : { status: null, cnameTarget: null, dnsRecord: null, error: null };
  }
  const headers = { Authorization: `Bearer ${VERCEL_ACCESS_TOKEN}`, "Content-Type": "application/json" };
  try {
    // Remove phase: domain changed or cleared.
    if (!newDomain) {
      if (prevDomain) {
        await fetch(vercelDomainUrl(prevDomain), { method: "DELETE", headers });
      }
      return { status: null, cnameTarget: null, dnsRecord: null, error: null };
    }
    // Domain unchanged: just re-check verification.
    if (prevDomain && prevDomain === newDomain) {
      const r = await fetch(vercelDomainUrl(newDomain), { headers });
      const d = r.ok ? await r.json() : {};
      const verified = d.verified ?? false;
      return { status: verified ? "verified" : "pending", cnameTarget: "cname.vercel-dns.com", dnsRecord: dnsRecordFor(newDomain), error: null };
    }
    // Add phase: new or changed. Remove the old one first if it existed.
    if (prevDomain && prevDomain !== newDomain) {
      await fetch(vercelDomainUrl(prevDomain), { method: "DELETE", headers });
    }
    const addRes = await fetch(vercelDomainsUrl(), {
      method: "POST", headers,
      body: JSON.stringify({ name: newDomain }),
    });
    if (!addRes.ok) {
      const body = await addRes.text();
      return { status: "failed", cnameTarget: null, dnsRecord: null, error: `Vercel rejected domain: ${addRes.status} ${body.slice(0, 200)}` };
    }
    const added = await addRes.json();
    const verified = added.verification?.some((v) => v !== undefined) ? false : (added.verified ?? false);
    return { status: verified ? "verified" : "pending", cnameTarget: "cname.vercel-dns.com", dnsRecord: dnsRecordFor(newDomain), error: null };
  } catch (e) {
    return { status: "failed", cnameTarget: null, dnsRecord: null, error: e.message };
  }
}
```

- [ ] **Step 2: Add the verification status route**

Place `GET /api/storefront/domain-status` after the `POST /api/storefront/settings` route:

```js
app.get("/api/storefront/domain-status", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { data } = await supabase
      .from("storefront_settings")
      .select("custom_domain, custom_domain_status")
      .eq("org_id", orgId)
      .maybeSingle();
    const domain = data?.custom_domain || null;
    if (!domain) return res.json({ domain: null, status: null, cnameTarget: null, dnsRecord: null, error: null });
    // Re-check via Vercel if creds present.
    const sync = await syncStorefrontDomain(orgId, domain, domain);
    return res.json({
      domain,
      status: sync.status,
      cnameTarget: sync.cnameTarget,
      dnsRecord: sync.dnsRecord,
      error: sync.error,
    });
  } catch (err) {
    return sendError(res, err);
  }
});
```

- [ ] **Step 3: Verify compile (no runtime test yet)**

Run: `node --check server/index.js`
Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat(storefront): Vercel domain sync helper + domain-status endpoint"
```

---

### Task 3: Wire Vercel sync into the storefront settings routes

**Files:**
- Modify: `server/index.js` — `GET /api/storefront/settings` (return new fields) and `POST /api/storefront/settings` (accept `customDomain`, call `syncStorefrontDomain`, persist status + instructions).

**Interfaces:**
- Consumes: `syncStorefrontDomain()` from Task 2; `custom_domain` / `custom_domain_status` columns from Task 1.
- Produces: GET returns `customDomain`, `customDomainStatus`, `dnsRecord`. POST accepts `settings.customDomain` and returns `{ success, domainStatus: {...} }` with the Vercel result so the UI can render DNS instructions without an extra round-trip.

- [ ] **Step 1: Extend the GET response**

In `GET /api/storefront/settings`, inside the `data ? {...}` block, add after `shippingZones`:

```js
        customDomain: data.custom_domain || null,
        customDomainStatus: data.custom_domain_status || null,
        dnsRecord: data.custom_domain ? dnsRecordForStored(data.custom_domain) : null,
```
Add a tiny helper near `syncStorefrontDomain`:
```js
function dnsRecordForStored(domain) {
  // same logic as dnsRecordFor but safe for the read path
  const labels = String(domain).split(".");
  const isApex = labels.length <= 2 || (labels.length === 3 && labels[1].length <= 3);
  return isApex
    ? { type: "A", host: "@", value: "76.76.21.21" }
    : { type: "CNAME", host: labels.slice(0, -2).join(".") || "@", value: "cname.vercel-dns.com" };
}
```
And in the defaults-when-no-row block, add:
```js
        customDomain: null,
        customDomainStatus: null,
        dnsRecord: null,
```

- [ ] **Step 2: Extend the POST route**

At the top of `app.post("/api/storefront/settings"...)`, after resolving `orgId`, capture the previous domain:

```js
    const { data: existing } = await supabase
      .from("storefront_settings")
      .select("custom_domain")
      .eq("org_id", orgId)
      .maybeSingle();
    const prevDomain = existing?.custom_domain || null;
```

In the `const s = req.body?.settings || {};` block, read the new value and normalize:

```js
    const requestedDomain = typeof s.customDomain === "string"
      ? s.customDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "")
      : null;
```

Add columns to the `row` object:

```js
      custom_domain: requestedDomain || null,
      custom_domain_status: requestedDomain ? "pending" : null, // refined by sync below
```

After the `upsert` succeeds, call the sync helper and reconcile status:

```js
    // Sync custom domain with Vercel (may add/remove/re-check).
    if (requestedDomain !== prevDomain) {
      const sync = await syncStorefrontDomain(orgId, prevDomain, requestedDomain);
      await supabase
        .from("storefront_settings")
        .update({ custom_domain_status: sync.status, updated_at: new Date().toISOString() })
        .eq("org_id", orgId);
      await purgeStorefrontConfigCache(orgId);
      return res.json({
        success: true,
        domainStatus: {
          domain: requestedDomain,
          status: sync.status,
          cnameTarget: sync.cnameTarget,
          dnsRecord: sync.dnsRecord,
          error: sync.error,
        },
      });
    }
    return res.json({ success: true, domainStatus: null });
```

- [ ] **Step 3: Run the server and hit the GET route**

Start `npm run dev`, then (with a valid JWT session — easiest via the running app's auth):
```bash
curl -s http://localhost:5100/api/storefront/settings -H "Authorization: Bearer <JWT>" | python3 -m json.tool | grep -E "customDomain|customDomainStatus"
```
Expected: `customDomain: null, customDomainStatus: null` (defaults).

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat(storefront): persist + Vercel-sync custom domain via settings route"
```

---

### Task 4: Settings UI — Storefront domain card

**Files:**
- Modify: `src/pages/Settings.tsx` — add `StorefrontDomainSection` and render it inside `WorkspaceSection`.

**Interfaces:**
- Consumes: `GET /api/storefront/settings` (fields `customDomain`, `customDomainStatus`, `dnsRecord`), `GET /api/storefront/domain-status`, `POST /api/storefront/settings` body `{ settings: { customDomain } }`.
- Produces: a card with an input, a status badge, DNS instructions, and Save / Disconnect actions. Calls `onSuccess` to refresh status.

- [ ] **Step 1: Write the component**

Add inside `Settings.tsx` (before `WorkspaceSection`):

```tsx
function statusBadge(status: string | null) {
  if (status === "verified") return <span className="text-[11px] font-medium text-emerald-600">Connected</span>;
  if (status === "pending") return <span className="text-[11px] font-medium text-amber-600">Pending DNS</span>;
  if (status === "failed") return <span className="text-[11px] font-medium text-red-500">Failed</span>;
  return null;
}

function StorefrontDomainSection() {
  const { isAdmin } = useUserRole();
  const [settings, setSettings] = useState<{ customDomain: string | null; customDomainStatus: string | null; dnsRecord: { type: string; host: string; value: string } | null } | null>(null);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ domain: string; status: string; cnameTarget: string | null; dnsRecord: { type: string; host: string; value: string } | null; error: string | null } | null>(null);
  const [polling, setPolling] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/api/storefront/settings");
    if (!res.ok) return;
    const data = await res.json();
    const s = data.settings;
    setSettings(s);
    setInput(s.customDomain || "");
  }, []);
  useEffect(() => { load(); }, [load]);

  const refreshStatus = useCallback(async () => {
    setPolling(true);
    try {
      const res = await apiFetch("/api/storefront/domain-status");
      if (res.ok) setResult(await res.json());
    } finally { setPolling(false); }
  }, []);

  const save = async () => {
    const value = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    setSaving(true);
    try {
      const res = await apiFetch("/api/storefront/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { customDomain: value } }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const data = await res.json();
      setResult(data.domainStatus);
      await load();
      toast.success(data.domainStatus?.error ? "Saved — see DNS instructions" : "Domain connected");
    } catch (e: any) {
      toast.error(e?.message || "Save failed");
    } finally { setSaving(false); }
  };

  const disconnect = async () => {
    setInput("");
    setSaving(true);
    try {
      const res = await apiFetch("/api/storefront/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { customDomain: "" } }),
      });
      if (!res.ok) throw new Error("Disconnect failed");
      setResult(null);
      await load();
      toast.success("Custom domain removed");
    } finally { setSaving(false); }
  };

  if (!isAdmin) return null;
  const status = result?.status || settings?.customDomainStatus || null;
  const dns = result?.dnsRecord || settings?.dnsRecord || null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[17px] font-semibold text-black tracking-tight">Storefront Domain</h2>
        <p className="mt-0.5 text-[13px] text-black/45">Connect your own domain to your storefront.</p>
      </div>
      <div className="overflow-hidden rounded-[14px] border border-black/[0.08] bg-white divide-y divide-black/[0.06]">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-black">Custom Domain</p>
            <p className="text-[11px] text-black/40 mt-0.5">e.g. shop.stepprs.com — we attach it to your storefront on Save.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="shop.yourbrand.com"
              className="h-8 w-56 rounded-lg border-black/[0.1] bg-black/[0.04] text-[13px] text-black placeholder:text-black/25 focus-visible:ring-1 focus-visible:ring-black/20"
            />
            {statusBadge(status)}
          </div>
        </div>

        {dns ? (
          <div className="px-5 py-4 bg-black/[0.02]">
            <p className="text-[11px] font-medium text-black/50 uppercase tracking-[0.12em] mb-2">DNS record to set</p>
            <div className="font-mono text-[12px] text-black/70 space-y-1">
              <p><span className="text-black/40">Type:</span> {dns.type}</p>
              <p><span className="text-black/40">Host/Name:</span> {dns.host}</p>
              <p><span className="text-black/40">Value:</span> {dns.value}</p>
            </div>
            <p className="mt-2 text-[11px] text-black/40">
              Set this at your DNS provider, then click "Check status". It may take a few minutes to propagate.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-black px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
              >Save</button>
              <button
                onClick={refreshStatus}
                disabled={polling}
                className="rounded-lg border border-black/[0.1] px-3 py-1.5 text-[12px] font-medium text-black disabled:opacity-50"
              >{polling ? "Checking…" : "Check status"}</button>
              {settings?.customDomain && (
                <button
                  onClick={disconnect}
                  disabled={saving}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
                >Disconnect</button>
              )}
            </div>
            {result?.error ? <p className="mt-2 text-[11px] text-amber-600">{result.error}</p> : null}
          </div>
        ) : (
          <div className="px-5 py-4 flex gap-2">
            <button
              onClick={save}
              disabled={saving || !input.trim()}
              className="rounded-lg bg-black px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
            >Save</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Render it in WorkspaceSection**

In `WorkspaceSection`, add `<StorefrontDomainSection />` after `<BulkSmsSection />` (line ~213):

```tsx
      <StorefrontDomainSection />
```

- [ ] **Step 3: Type-check**

Run: `npm run build` (or `npx tsc --noEmit`)
Expected: no errors. If `useUserRole`/`apiFetch`/`toast` aren't imported at top of file, they already are (verified: lines 2, 7, 10).

- [ ] **Step 4: Run the app and load Settings → Workspace**

Run: `npm run dev`, open `http://localhost:5100/settings`, switch to Workspace. The "Storefront Domain" card should render with an empty input. No save click yet (that's Task 5).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat(storefront): custom domain settings card (admin)"
```

---

### Task 5: Manual E2E against a real Vercel project (operator)

> This task is performed by a human (the operator) because it needs a live Vercel project + a real disposable domain. It is the acceptance gate for the feature.

**Files:** none.

**Prerequisites:** a Vercel project (the storefront) with `VERCEL_PROJECT_ID` known; a `VERCEL_ACCESS_TOKEN` with project scope; a disposable domain or subdomain you control its DNS for (e.g. a free `*.tk`/a spare subdomain of your own).

- [ ] **Step 1: Set env**

In `.env` add:
```
VERCEL_PROJECT_ID=<your storefront Vercel project id>
VERCEL_ACCESS_TOKEN=<vercel token>
STOREFRONT_VERCEL_TEAM_ID=<optional>
```

- [ ] **Step 2: Run dev**

`npm run dev` (Commerce-os on :5100).

- [ ] **Step 3: Save a domain**

In `http://localhost:5100/settings` → Workspace → Storefront Domain, type the disposable domain, click Save. Observe:
- Toast: "Saved — see DNS instructions" (or "Domain connected" if Vercel auto-verifies).
- DNS record block appears with Type/Host/Value for your DNS provider.

- [ ] **Step 4: Verify Vercel state**

Open the Vercel dashboard → your storefront project → Settings → Domains. The domain should be listed.

- [ ] **Step 5: (If DNS settable) verify**

Set the DNS record at your provider, click "Check status". Status should move `pending` → `verified`; the badge becomes "Connected". Visit the domain — it should serve the storefront.

- [ ] **Step 6: Disconnect**

Click "Disconnect". Verify the domain is removed from Vercel's project domains list and the DB row's `custom_domain`/`custom_domain_status` are null.

- [ ] **Step 7: Graceful-no-creds check**

Remove `VERCEL_ACCESS_TOKEN` from `.env`, restart, save a domain. Expected: status `pending`, DNS instructions shown, the `error` note: "Vercel credentials not configured — operator will attach this domain manually." The Save must not 500.

---

## Out of scope (future)

- **Storefront branding on the custom domain:** currently the storefront (`e-commerce` repo) reads its catalog/orders from the suite but not the `storefront_settings` branding (logo/colors/tagline). The settings table already stores these; a follow-up would have the storefront fetch the public storefront-config (a new unauthenticated `GET /api/public/storefronts/:id/config` exposing the safe fields) and render the merchant's brand. Not needed for the domain-attach feature — attaching the domain in Vercel is what makes the merchant's domain serve the storefront.
- **Automated onboarding** (provisioning the `[brandname].merchant-suite.online` admin subdomain + the storefront Vercel project + env on signup) — a separate provisioning feature.
- **Wildcard TLS / the `*.merchant-suite.online` wildcard cert** — infra/ops, not code.
- **UI for the storefront handle (`/{handle}` vanity URL)** — already exists in the codebase (`storefront_handle` machinery); could be surfaced in Settings too, but it's a different feature.
- **Tests for the Vercel helper** — the helper hits a live API; a follow-up could extract the HTTP layer and test it with mocked fetch. Not blocking for a single-tenant fork where the operator verifies once (Task 5).

## Self-Review Notes

- **Spec coverage:** each decision (custom domain type = merchant's own; attach = automated Vercel API; single-tenant, one fork per merchant; you configure `[brand].merchant-suite.online`, merchant self-serves their custom domain) maps to Tasks 1–5.
- **Placeholders:** none — every step has actual code or a concrete command.
- **Type consistency:** `customDomain`/`customDomainStatus` (camelCase) in API + UI; `custom_domain`/`custom_domain_status` (snake_case) in DB — consistent with the existing settings route's camelCase↔snake mapping. `dnsRecord: { type, host, value }` used identically in helper, route, and UI.
- **Edge cases covered:** domain unchanged (re-check only), domain cleared (remove from Vercel), domain changed (remove old + add new), missing Vercel creds (persist pending + instruct, no crash), `apex` (A record) vs `subdomain` (CNAME).