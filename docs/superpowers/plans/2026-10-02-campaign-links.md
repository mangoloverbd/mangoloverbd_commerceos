# Campaign Links with Delivered-Revenue Reporting — Implementation Plan

**Goal:** Let Mango Lover BD create tracked links such as
`https://www.mangolover.com.bd/go/himsagar-reel`, attribute storefront orders
to the link that brought the customer, and report each link's full funnel:
clicks → checkouts → orders → delivered → revenue and profit.

**Inspired by:** Dub (dub.co) short links + conversion tracking, adapted for
COD commerce where *delivered* revenue is the number that matters.

**Repos touched:**
- `mangoloverbd_commerceos` (Merchant-Suite): schema, API, reports, UI.
- `mangoloverbd_storefront`: `/go/:slug` redirect and forwarding the click id at checkout.

---

## 1. Decisions (confirm before building)

| # | Decision | Proposal |
|---|---|---|
| D1 | Attribution model | **Last click**: the most recent campaign link click wins. |
| D2 | Attribution window | **30 days** from click to order. |
| D3 | Link format | `www.mangolover.com.bd/go/<slug>`; slug is lowercase `a-z0-9-`, 3–60 chars, unique per workspace. |
| D4 | Who can see it | **Admin only** (matches Online Store / Business Report). |
| D5 | Which orders are attributable | Storefront orders and abandoned checkouts only. Social-inbox, phone and manual orders are out of scope for v1. |
| D6 | Profit definition | Delivered order value − COGS of delivered orders − courier fees recorded on the link's orders (returns still cost a courier fee). |
| D7 | Ad spend / ROAS | **Not in the first build.** Added as Phase E (§7a), started 2–4 weeks after Campaign Links goes live. |

---

## 2. How it works end to end

```
Customer taps link in FB reel
  → GET www.mangolover.com.bd/go/himsagar-reel          (storefront, Vercel)
  → storefront api/go.ts calls Merchant-Suite
      POST /api/public/v1/:handle/campaign-links/:slug/clicks
      ← { clickId, destinationPath }
  → sets HttpOnly cookie ml_cclick=<clickId> (30 days) and 302 → destinationPath
Customer checks out (any checkout component)
  → storefront api/orders.ts reads ml_cclick cookie, forwards campaignClickId
  → Merchant-Suite handlePublicHandleOrderSubmit validates the click
      (same org, within 30 days) and stores campaign_link_id + campaign_click_id
Courier delivers / returns / cancels
  → existing status flow; reports derive outcome from current order state
Admin opens Marketing › Campaign Links
  → per-link funnel and delivered revenue/profit
```

Why a server-side HttpOnly cookie: every checkout already goes through the
storefront's own serverless proxy (`api/orders.ts` → `server/order-service.ts`,
and `api/abandoned-carts.ts`). Reading the cookie there means **no changes to
the four checkout components** (`order-dialog.tsx`, `honey-checkout.tsx`,
`honey-nut-checkout.tsx`, `kalojira-checkout.tsx`), and client JS cannot tamper
with it. Only a click id is sent, never a link id or `org_id`, and Merchant-Suite
verifies it, so a visitor can't attribute an order to an arbitrary campaign.

---

## 3. Phase A — Database (Merchant-Suite)

Invoke the `supabase` skill first. Run `npm run verify:supabase-project` before
any linked command and `npm run verify:supabase-baseline` before proposing the
migration.

**Migration:** `supabase/migrations/20261002120000_campaign_links.sql`

```sql
create table if not exists public.campaign_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  name text not null check (char_length(name) between 1 and 120),
  channel text not null,            -- facebook | instagram | tiktok | youtube | whatsapp | influencer | print | sms | other
  destination_path text not null default '/',  -- storefront-relative path only
  creator_name text,
  post_url text,
  notes text,
  created_by uuid references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);

create table if not exists public.campaign_link_clicks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  link_id uuid not null references public.campaign_links(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  visitor_hash text,       -- sha256(ip + ua + daily salt); never store raw IP
  referrer_host text,
  device text,             -- mobile | desktop | tablet | unknown
  is_bot boolean not null default false
);
create index on public.campaign_link_clicks (org_id, link_id, clicked_at desc);

alter table public.orders
  add column if not exists campaign_link_id uuid references public.campaign_links(id) on delete set null,
  add column if not exists campaign_click_id uuid references public.campaign_link_clicks(id) on delete set null;
create index if not exists orders_org_campaign_link_idx
  on public.orders (org_id, campaign_link_id) where campaign_link_id is not null;

alter table public.abandoned_checkouts
  add column if not exists campaign_link_id uuid references public.campaign_links(id) on delete set null;

alter table public.campaign_links enable row level security;
alter table public.campaign_link_clicks enable row level security;
-- No policies: service-role (Express) access only. The storefront never reads these tables.
```

Notes:
- Clicks are an append-only log; links are never hard-deleted once they have
  clicks (archive instead) so historical reports stay intact.
- `orders.source` stays `website`; campaign attribution is separate, the same
  way `landing_page_path` is (see `20260914000001_add_order_landing_page_path.sql`).
- Regenerate `src/integrations/supabase/types.ts` after applying.

**Verify:** migration applies cleanly on a branch DB, existing order inserts
still succeed, and the baseline check passes.

---

## 4. Phase B — Merchant-Suite backend

Invoke `plan-eng-review` on this section before coding. Pure logic goes in a
new I/O-free module, following the `orderAttribution.js` / `businessReport.js`
pattern; routes stay in `server/index.js`.

### B1. `server/campaignLinks.js` (pure, unit-tested)
- `normalizeCampaignSlug(value)`: lowercase, trim, validate; returns `undefined` if invalid.
- `slugFromName(name)`: suggestion for the create form ("Himsagar Reel" → `himsagar-reel`).
- `normalizeDestinationPath(value)`: must start with `/`, no `//`, no scheme,
  ≤ 200 chars, and no `/go/` path (no redirect loops). Prevents open redirects.
- `CAMPAIGN_CHANNELS` plus `normalizeCampaignChannel`.
- `isBotUserAgent(ua)`: flags `facebookexternalhit`, `Facebot`,
  `WhatsApp`, `TelegramBot`, `Twitterbot`, `Slackbot`, `bot|crawler|spider`.
  **Important:** Facebook/WhatsApp fetch link previews the moment a link is
  posted, so without this the click counts would be inflated.
- `resolveCampaignAttribution({ click, orgId, now, windowDays = 30 })`:
  returns `{ campaign_link_id, campaign_click_id }`, or `{}` if the click is
  missing, belongs to another org, is a bot click, or is outside the window.

### B2. `server/campaignReport.js` (pure, unit-tested)
- Reuse the Business Report outcome rules so numbers match everywhere (PR #142
  made order value consistent). Export the existing outcome classifier from
  `server/businessReport.js` instead of copying it.
- `buildCampaignReport({ links, clicks, checkouts, orders, products, request })`
  returns, per link:
  - `clicks`, `unique_visitors` (distinct `visitor_hash`, non-bot only)
  - `checkouts_started` (abandoned checkouts + orders carrying the link)
  - `orders`, `order_value`
  - `confirmed`, `delivered`, `cancelled`, `returned`, `pending` (counts + values)
  - `delivered_revenue`, `delivered_cogs` (via `computeOrderCogs` in `server/cog.js`),
    `courier_fees`, `delivered_profit` (definition D6)
  - rates: `click_to_order`, `order_to_delivered`, `loss_rate` ((cancelled + returned) / orders)
- Plus a `totals` row and an "unattributed website orders" comparison row.
- Dates use the existing Dhaka-day helpers (`toDhakaInterval`).

### B3. Admin routes (auth → `getUser` → admin role → `org_id` on every query)
| Route | Purpose |
|---|---|
| `GET /api/campaign-links?from&to&include_archived` | List links with report metrics for the range |
| `POST /api/campaign-links` | Create. Validates slug/channel/destination; 409 on duplicate slug |
| `PATCH /api/campaign-links/:id` | Edit name, channel, creator, post URL, destination, notes, archive/unarchive. **Slug is immutable once the link has clicks** (printed QR codes and published posts would break) |
| `GET /api/campaign-links/:id?from&to` | One link: metrics, daily clicks/orders series, recent attributed orders (id, date, customer, value, outcome) linking to `/orders/:id` |

The client never sends `org_id`; it is always resolved from `user_roles`.

### B4. Public routes (storefront-facing)
| Route | Purpose |
|---|---|
| `POST /api/public/v1/:handle/campaign-links/:slug/clicks` | `resolveStorefrontHandle` → orgId; look up a non-archived link; insert a click row (bot-flagged if the UA matches); return `{ clickId, destinationPath }`. Unknown/archived slug → `404 { destinationPath: "/" }`. Uses `rateLimitPublicRead`-style limiting |

The storefront serverless function passes the original visitor's UA, referrer
and IP via headers; Merchant-Suite hashes the IP and never stores it raw.

### B5. Order + abandoned-checkout intake
- `handlePublicHandleOrderSubmit` (`server/index.js:14132`): accept optional
  `campaignClickId`. If it's a valid UUID, load the click with
  `.eq("org_id", orgId)` and apply `resolveCampaignAttribution`.
  **An invalid or expired click is silently ignored and must never fail the order.**
- Same for the abandoned-checkout upsert, so `checkouts_started` works.
- When an abandoned checkout converts into an order, carry `campaign_link_id` across.

### B6. Order detail
- Include `campaign_link_id` → `{ name, slug, channel }` in the order detail
  response so staff can see which campaign an order came from.

**Verify:** `npm test` (new unit tests + existing order-submit tests), and a manual
curl through the public click → order-submit path against local dev.

---

## 5. Phase C — Merchant-Suite UI

Invoke `brainstorming` / `plan-design-review` for the visual pass. Follow the
design language in CLAUDE.md §8 (8px tracked labels, light values, ৳, Phosphor
`weight="light"`, Framer Motion, `apiFetch` only).

1. **Sidebar:** new collapsible **Marketing** section after Reports, with
   **Campaign Links** → `/marketing/links` (admin-only, two-tone inline SVG
   icon to match the other sidebar entries).
2. **Routes** in `src/App.tsx`: `/marketing/links` and `/marketing/links/:id`,
   both wrapped in `AdminRoute`.
3. **`src/pages/CampaignLinks.tsx`** (list):
   - Header with `DateRangePicker` (same defaults as Business Report) and a "New link" button.
   - Summary tiles: Clicks · Orders · Delivered revenue · Delivered profit · Loss rate.
   - Table: Name / channel / creator · Link (copy button) · Clicks · Orders ·
     Delivered · Cancelled + returned · Delivered revenue (৳) · Profit (৳).
     Sortable; row click → detail.
   - Empty state explaining the link format.
4. **Create/edit dialog** (shadcn `Dialog`): name → auto-suggested slug
   (editable until the first click), channel select, destination picker
   (Home, published products, `/step/*` landing pages from the public catalog)
   or a custom path, creator name, post URL, notes. Shows the live preview
   `www.mangolover.com.bd/go/<slug>`.
5. **`src/pages/CampaignLinkDetail.tsx`**: funnel bar
   (clicks → checkouts → orders → delivered), a daily series chart (follow the
   `dataviz` skill and existing `businessReportCharts.ts` conventions), the
   outcome breakdown, and the attributed orders table linking to `/orders/:id`.
   Archive/unarchive action.
6. **Order detail:** a small "Campaign · Himsagar Reel" chip when attributed.
7. **Data hooks:** `useCampaignLinks(range)` and `useCampaignLink(id, range)`
   with TanStack Query; invalidate on create/edit/archive.

**Verify:** component tests in `src/test/` (list renders metrics and ৳
formatting, create dialog validation, slug lock after clicks, sidebar entry
hidden or disabled for team members), then `npm run lint` and `npm run build`.

---

## 6. Phase D — Storefront (`mangoloverbd_storefront`)

Separate branch and PR in the storefront repo.

1. **`vercel.json`:** add `{ "source": "/go/:slug", "destination": "/api/go?slug=:slug" }`
   **above** the SPA catch-all rewrite.
2. **`api/go.ts`** (new serverless function):
   - Validate the slug format locally; if invalid, 302 to `/`.
   - Call the Merchant-Suite click endpoint (2s timeout), forwarding UA, referrer and client IP.
   - On success, set `ml_cclick=<clickId>; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`
     and 302 to `destinationPath`, keeping any incoming `utm_*` query params.
   - On any failure, **still redirect** (to the known destination or `/`). A
     tracking outage must never break the customer's tap.
   - `Cache-Control: no-store` so Vercel/CDN never caches a redirect + cookie.
3. **`server/order-service.ts` / `api/orders.ts`:** read the `ml_cclick` cookie
   and add `campaignClickId` to the forwarded payload. Extend the zod schema
   (optional uuid).
4. **`api/abandoned-carts.ts`:** same forwarding.
5. **Tests:** `api/go.test.ts` (valid slug sets cookie + redirects; failed
   upstream still redirects; invalid slug → `/`; no-store header),
   `api/orders.test.ts` (cookie forwarded; absent cookie → field omitted).

**Verify:** `vercel dev` locally: `/go/test-link` → cookie set → place a
test order → the order in Merchant-Suite shows the campaign.

---

## 7. Rollout order

1. Phase A migration (additive only; safe with the old code running).
2. Phase B backend deploy. The new fields are optional, so the current storefront keeps working.
3. Phase C UI deploy. Create one internal test link.
4. Phase D storefront deploy.
5. Production smoke test: open the test link on a phone from the Facebook
   in-app browser, place a test order, confirm attribution, then cancel the
   test order and confirm it moves to "cancelled" in the report.
6. Create real links for the next campaigns. No backfill; history starts at launch.
7. After 2–4 weeks of clean data, start Phase E (§7a).

Before each PR: `review` skill (workspace guard, auth, open redirect),
`verification-before-completion`, then `ship`.

---

## 7a. Phase E — Ad spend and profit per ad (later)

**Start:** 2–4 weeks after Phase D is live and attributed numbers have been checked against real orders.

**Why:** Campaign Links shows what each link *earned*; without spend it can't show whether it made a
profit. Meta Ads Manager counts every placed order (including fake/cancelled COD orders) as a sale;
Merchant-Suite knows which orders were actually delivered, so it can show the real return.

**What already exists:** `/api/analytics` (`server/index.js:4764`) already fetches Meta spend with
`level=account` (`server/index.js:4970`) using the stored Meta token and ad account, and converts it
with `convertMetaSpendToBdt` (`server/metaAdCurrency.js`). The Dashboard P&L uses it.

**Steps:**
1. **Schema:** add `meta_ad_id text` (nullable) to `campaign_links`, plus an optional
   `meta_campaign_id text` for links shared by several ads. Run the `supabase` skill and the
   verify scripts as in Phase A.
2. **Ad picker:** `GET /api/campaign-links/meta-ads` (admin, `org_id`-scoped settings) lists
   ads from the connected ad account (`/{ad_account}/ads?fields=id,name,campaign{name},effective_status`).
   The link create/edit dialog gets an optional "Meta ad" select.
3. **Spend per ad:** extract the existing insights fetch into a shared helper that accepts
   `level` (`account` | `ad` | `campaign`). Call it with `level=ad&fields=ad_id,ad_name,spend`
   for the report range, convert to BDT with the same helper, and cache it (TTL cache like the
   Dashboard's) so reports don't multiply Graph API calls. The Dashboard keeps its current behaviour.
4. **Report:** `server/campaignReport.js` gains `spend`, `roas_delivered` (delivered revenue ÷ spend)
   and `profit_after_ads` (delivered profit − spend) per link, and in the totals row. Links without an
   ad show "—", not ৳0.
5. **UI:** Spend, Delivered return (×) and Profit after ads columns and tiles on Campaign Links and
   the link detail page; a "Connect Meta ad" prompt on links without one.
6. **Tests:** level-agnostic insights helper (pagination, currency conversion, error → null spend),
   report maths (zero spend, missing ad, shared campaign), and admin-only access to the ad picker.

**Caveats to show in the UI:**
- View-through buyers (saw the ad, didn't tap the link) aren't counted, so the true return is likely somewhat higher.
- One link per ad gives the clearest numbers; shared links can only be measured per Meta campaign.
- Ads that send people to Messenger show no revenue until inbox/discount-code attribution exists.

**Out of scope for Phase E:** Google/TikTok ad spend, automatic budget changes, sending delivered
outcomes back to Meta (separate plan; must go through the GTM-owned Pixel/CAPI setup and dedupe
on event id).

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| FB/WhatsApp preview crawlers inflate clicks | UA bot flag; bot clicks excluded from metrics and can't attribute orders |
| Open redirect via `destination_path` | Server-side path-only validation; storefront redirects only to relative paths |
| Spoofed attribution | Only an opaque click id travels from the browser; it's verified against org + window server-side |
| Tracking outage breaks links | `api/go.ts` always redirects, even on upstream failure |
| Customer clicks the link, then orders via Messenger | Not attributed in v1 (D5). A later phase could let inbox agents pick a campaign |
| Cookie loss (cleared browser, different device) | Accepted; that order shows as unattributed website traffic |
| Numbers disagree with Business Report | Reuse the exported outcome classifier and `computeOrderCogs`; add a test asserting totals match the Business Report for the same fixtures |
| Personal data | No raw IPs stored; visitor hash uses a daily-rotating salt |

---

## 9. Out of scope (later phases)

- QR code generation per link (cheap follow-up on top of this).
- Influencer/reseller commission reporting (Dub Partners-style).
- Tracked links inserted by social-inbox agents and the bot.
- A `go.mangolover.com.bd` subdomain (can point at the same `/go/:slug` route later).
