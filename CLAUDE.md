# CLAUDE.md — Merchant-Suite Agent Guide

This file is the authoritative guide for AI agents (Claude, OpenCode, etc.) working in this codebase.
Read it fully before making any changes. The rules in the **AI Agent Rules** section are hard guardrails — follow them without exception.

---

## 1. Project Overview

**Merchant-Suite** is a multi-tenant order management SaaS built for Bangladeshi e-commerce businesses. It handles order ingestion, courier dispatch, fraud detection, social inbox management, and P&L analytics.

**Tech stack:**
- Frontend: React 18 + Vite + TypeScript, Tailwind CSS, shadcn/ui
- Backend: Express.js (ESM, Node 20) — single file at `server/index.js`
- Database: Supabase (PostgreSQL), accessed via `@supabase/supabase-js`
- Auth: Supabase Auth (JWT)
- AI: OpenAI GPT-4o-mini for order extraction, analysis, and social bot

**Run locally:**
```bash
# Install
npm install

# Start full stack (Express serves both API and Vite dev server)
npm run dev              # dev
NODE_ENV=production PORT=24678 node server/index.js   # prod

# Other commands
npm run build            # Vite production build
npm run lint             # ESLint
npm test                 # Vitest
```

**Environment variables** (required in `.env`):
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

> **Before starting any new feature:** invoke the `brainstorming` skill to explore requirements and design before touching code. Invoke `writing-plans` after brainstorming to produce an implementation plan. Invoke `plan-ceo-review` if you want to pressure-test scope or ambition.

---

## 2. Architecture

### Frontend

All frontend code lives in `src/`. Entry point is `src/main.tsx` → `src/App.tsx`.

- **Routing:** React Router v6 (`react-router-dom`). All routes are declared in `src/App.tsx`. Protected routes wrap `DashboardLayout` from `src/components/DashboardLayout.tsx`. **Never use `wouter` for new routes** — it exists in legacy components only.
- **State management:** TanStack Query v5 (`@tanstack/react-query`) for server state. No Redux, no Zustand.
- **Auth state:** `useAuth()` hook from `src/hooks/useAuth.tsx` — provides `user`, `session`, `loading`, `signIn`, `signUp`, `signOut`.
- **API calls:** Always use `apiFetch()` from `src/lib/api.ts`. It auto-attaches the Supabase JWT to every request. Never use raw `fetch()` from the frontend for authenticated endpoints.
- **UI components:** shadcn/ui (in `src/components/ui/`). Add new components via the shadcn CLI, not by hand-copying.
- **Icons:** Phosphor Icons (`@phosphor-icons/react`, always `weight="light"`). Only use Lucide (`lucide-react`) if a Phosphor equivalent doesn't exist.
- **Animations:** Framer Motion for anything animated.
- **Font:** Geist Sans variable font (`public/fonts/GeistSans-Variable.woff2`), loaded via CSS.

### Backend

The entire Express server is `server/index.js` (~2100 lines, ESM). It is a single file by design.

- Uses `getServiceSupabase()` internally — this uses `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS. All multi-tenancy isolation is enforced manually in route handlers (not by RLS policies).
- In dev, Express also proxies the Vite dev server. In production, it serves the built `dist/` folder.
- Raw body buffering is enabled for webhook HMAC verification (`req.rawBody`).

> **Before adding new backend routes or refactoring the server:** invoke `plan-eng-review` to review the architecture plan first. For complex logic changes, use `writing-plans` to produce a step-by-step plan before coding.

### Database

Supabase PostgreSQL. Frontend accesses Supabase directly only for auth — all other DB access goes through the Express API. The backend uses the service role client.

**Key tables:**
| Table | Purpose |
|---|---|
| `user_roles` | user_id, role (admin/team_member), org_id |
| `orders` | Shopify-synced orders, fraud data, courier data, org_id |
| `app_settings` | Key-value config store (org-prefixed keys) |
| `social_conversations` | Facebook/Instagram/WhatsApp threads, org_id |
| `social_messages` | Individual messages within conversations |
| `social_inbox_orders` | Orders captured from social chats, org_id |
| `products` | Product catalog with COGs, org_id |

**Startup migrations** run automatically on cold-start:
- `migrateInboxOrdersTable()` — ensures `social_inbox_orders` has all columns
- `migrateMultiTenancy()` — ensures `org_id` columns exist on all relevant tables + reloads PostgREST schema cache

> **Before schema changes or writing Postgres queries:** invoke the `supabase` skill. For query optimization or index design, invoke `supabase-postgres-best-practices`. The Supabase MCP server is configured in `.mcp.json` — use it for direct DB introspection.

---

## 3. Key File Map

| File | Purpose |
|---|---|
| `src/App.tsx` | Root component, all route declarations, `ProtectedRoute` / `PublicRoute` guards |
| `src/lib/api.ts` | `apiFetch()` — the only correct way to call the API from the frontend |
| `src/hooks/useAuth.tsx` | Auth context and hook |
| `src/hooks/useUserRole.tsx` | Resolves current user's role (admin/team_member) |
| `src/hooks/useOrgName.ts` | Resolves the current org's display name |
| `src/components/DashboardLayout.tsx` | Shell layout wrapping all authenticated pages |
| `src/components/AppSidebar.tsx` | Navigation sidebar |
| `src/components/OrdersTable.tsx` | Main orders table component |
| `src/pages/Dashboard.tsx` | P&L dashboard with animated metrics |
| `src/pages/OrderExtraction.tsx` | AI-powered order parsing from free text |
| `src/pages/OrderAnalysis.tsx` | AI batch analysis by date/order range |
| `src/pages/SocialInbox.tsx` | Social inbox landing page |
| `src/pages/FacebookInbox.tsx` | Facebook Messenger thread view |
| `src/pages/InstagramInbox.tsx` | Instagram DM thread view |
| `src/pages/WhatsappInbox.tsx` | WhatsApp Business thread view |
| `src/pages/InboxOrders.tsx` | Orders captured from social chats |
| `src/pages/Products.tsx` | Product catalog and COG management |
| `src/pages/Settings.tsx` | All integration and org settings |
| `src/integrations/supabase/client.ts` | Supabase browser client (anon key) |
| `src/integrations/supabase/types.ts` | Generated Supabase TypeScript types |
| `server/index.js` | Entire Express backend — all API routes, helpers, migrations |
| `server/db.ts` | Direct pg Pool connection (used for raw SQL migrations) |
| `.env` | Environment variables — never commit this |
| `.mcp.json` | Supabase MCP server configuration |
| `supabase/` | Supabase project config and migrations |

---

## 4. Multi-Tenancy (Critical — Read Before Any DB Work)

This is the most important pattern in the codebase. Every piece of data is scoped to an `org_id`.

### How it works

When an admin registers, they get a new `org_id` (UUID) stored in `user_roles.org_id`. Team members inherit their admin's `org_id`. The backend resolves the org for every authenticated request.

**Server auth helpers** (defined at top of `server/index.js`):
```js
// Extract JWT from Authorization header
const token = getToken(req);

// Resolve user from JWT
const { user } = await getUser(token);
if (!user) return res.status(401).json({ error: "Unauthorized" });

// Resolve org_id from user_roles
const { data: roleRow } = await supabase
  .from("user_roles")
  .select("org_id, role")
  .eq("user_id", user.id)
  .maybeSingle();
const orgId = roleRow?.org_id;
```

**Settings isolation** — app_settings keys are prefixed with org_id:
```js
// Read org-scoped settings
const cfg = await getSettings([`${orgId}:shopify_token`]);

// Write org-scoped settings
await saveSettings({ [`${orgId}:shopify_token`]: value });
```

**Table isolation** — every query on `orders`, `social_conversations`, `social_inbox_orders`, `products` must filter by `org_id`:
```js
const { data } = await supabase
  .from("orders")
  .select("*")
  .eq("org_id", orgId);  // ← ALWAYS required
```

### Hard rule

**Every new route that reads or writes user data MUST resolve `orgId` and apply it to all queries.** Missing `org_id` filters cause data leakage between tenants. This is the #1 bug class to avoid.

> **When adding new DB features:** invoke `supabase` skill. When reviewing a diff that touches DB queries, invoke `review` skill to check for org_id isolation gaps.

---

## 5. Auth Pattern

### Frontend auth flow

1. `AuthProvider` in `src/hooks/useAuth.tsx` wraps the whole app
2. `useAuth()` returns `{ user, session, loading, signIn, signUp, signOut }`
3. `ProtectedRoute` in `src/App.tsx` redirects unauthenticated users to `/auth`
4. **All API calls use `apiFetch()`** from `src/lib/api.ts` — it attaches the JWT automatically

```ts
// Correct
const res = await apiFetch("/api/orders");

// Wrong — missing auth header
const res = await fetch("/api/orders");
```

### Backend auth flow

1. Extract token: `const token = getToken(req);`
2. Validate and get user: `const { user } = await getUser(token);`
3. Guard: `if (!user) return res.status(401).json({ error: "Unauthorized" });`
4. Resolve org: query `user_roles` for `org_id` and `role`

First-login side effect: `getUser()` auto-assigns an `admin` role if the user has no role yet.

> **When adding new endpoints:** always add auth guards. Use `review` skill before landing to catch any endpoint missing auth.

---

## 6. API Route Inventory

All routes are in `server/index.js`. Group new routes with their domain section.

| Domain | Routes |
|---|---|
| Config | `GET /api/config` |
| Auth / Roles | `POST /api/auth/register`, `POST /api/admin/assign-role`, `GET /api/admin/check` |
| Settings | `GET /api/settings`, `POST /api/settings`, `POST /api/settings/test-facebook`, `POST /api/settings/test-fraudshield` |
| Analytics | `GET /api/analytics` |
| Orders | `GET /api/orders`, `PATCH /api/orders/:id`, `POST /api/fetch-shopify-orders` |
| Courier | `POST /api/send-to-courier` (Steadfast), `POST /api/send-to-pathao` |
| Fraud | `POST /api/check-fraud`, `POST /api/inbox-orders/check-fraud` |
| Social / Inbox | `GET /api/social/messages/:conversationId`, `GET /api/social/inbox-orders`, `PATCH /api/social/inbox-orders/:id`, `DELETE /api/social/inbox-orders/:id` |
| Inbox Courier | `POST /api/inbox-orders/send-to-courier`, `POST /api/inbox-orders/send-to-pathao` |
| Brand Doc | `GET /api/social/brand-doc`, `POST /api/social/brand-doc` |
| Products | `GET /api/products`, `POST /api/products/save`, `POST /api/products/crawl`, `PATCH /api/products/:id`, `DELETE /api/products/:id` |
| AI | `POST /api/extract-order-from-text` |
| DB Setup | `GET /api/db-setup-sql`, `POST /api/db-setup` (admin only) |

> **Before shipping any API changes:** run `review` skill to check for SQL safety, auth gaps, and org_id isolation. Run `qa` skill to verify the feature works end-to-end in the browser.

---

## 7. External Integrations

All integration credentials are stored in `app_settings` (org-prefixed). They are configured through the Settings page (`/settings`) and read server-side via `getSettings()`.

### Shopify
- Admin API for order sync
- Credentials: `{orgId}:shopify_admin_api_token`, `{orgId}:shopify_store_url`
- Entry point: `POST /api/fetch-shopify-orders`

### Steadfast Courier
- Order dispatch + webhook tracking
- Credentials: `{orgId}:steadfast_api_key`, `{orgId}:steadfast_secret_key`
- Entry point: `POST /api/send-to-courier`

### Pathao Courier
- OAuth token-based dispatch
- Credentials: `{orgId}:pathao_client_id`, `{orgId}:pathao_client_secret`, `{orgId}:pathao_username`, `{orgId}:pathao_password`, `{orgId}:pathao_store_id`
- Token fetched fresh per request via `getPathaoToken()` — not cached
- Entry point: `POST /api/send-to-pathao`

### FraudShield
- Phone number fraud checking (BD-specific)
- Credential: `{orgId}:fraudshield_api_key`
- Always run phone numbers through `normalizeBdPhone()` before calling FraudShield
- Entry points: `POST /api/check-fraud`, `POST /api/inbox-orders/check-fraud`

### Facebook / Meta Graph API
- Messenger + Instagram DM + WhatsApp Business via webhooks
- Credentials: `{orgId}:facebook_access_token`, `{orgId}:facebook_page_id`
- Webhook HMAC verification uses `req.rawBody` (preserved by the body-parser verify callback)
- Social conversations stored in `social_conversations` + `social_messages`

### OpenAI (GPT-4o-mini)
- Order extraction from free text (Bangla/English/mixed)
- Order batch analysis
- Social bot replies
- Credential: `OPENAI_API_KEY` env var (not in app_settings)

### Firecrawl
- Product catalog scraping fallback (when Shopify products.json is unavailable)
- Entry point: `POST /api/products/crawl`

> **When modifying or adding integrations:** invoke `plan-eng-review` before implementation to validate the integration architecture. For security review of credentials handling, invoke `cso`.

---

## 8. Design Language

Merchant-Suite uses a luxury minimalist aesthetic. Follow these conventions precisely — do not introduce new design tokens without discussion.

**Background:** `bg-[#FAFAF8]` (warm off-white, not pure white)

**Typography conventions:**
```
Labels:  text-[8px] font-medium tracking-[0.3em] text-black uppercase
Values:  text-2xl font-light
```

**Layout:** Borderless panels, no card shadows on content panels. Use `rounded-lg` sparingly and only for interactive elements.

**Icons:** Phosphor Icons (`@phosphor-icons/react`) with `weight="light"` on all icons. Example:
```tsx
import { Package } from "@phosphor-icons/react";
<Package weight="light" size={20} />
```

**Animations:** Framer Motion for any animated element. The P&L dashboard uses animated cells — follow that pattern for new dashboard metrics.

**Font:** Geist Sans variable (`public/fonts/GeistSans-Variable.woff2`). Already loaded globally — do not add new font imports.

**Currency:** Always use `৳` (taka symbol) for Bangladeshi taka amounts, not "BDT" or "Tk".

> **Before implementing new UI:** invoke `brainstorming` skill to explore design. For visual design variants, invoke `design-shotgun`. For design review of implemented UI, invoke `design-review`. For a comprehensive design system discussion, invoke `design-consultation`.

---

## 9. Testing & Code Quality

```bash
npm test          # Vitest — runs all tests in src/test/
npm run lint      # ESLint
npm run build     # Type-checks and bundles — run before shipping
```

Tests live in `src/test/`. Use Vitest + `@testing-library/react` for component tests.

TypeScript is strict — do not use `any` unless absolutely unavoidable and documented with a comment explaining why.

> **When implementing any feature or bugfix:** invoke `test-driven-development` skill before writing implementation code. Before claiming work is complete, invoke `verification-before-completion` to confirm tests pass and build succeeds. For systematic debugging of failures, invoke `systematic-debugging`.

---

## 10. Git & Shipping Workflow

Branch from `main`. Commit messages use imperative style: `fix:`, `feat:`, `chore:`, `refactor:`.

> **When code is ready to ship:** invoke `ship` skill — it merges base branch, runs checks, bumps VERSION, updates CHANGELOG, and creates the PR. Do not push directly to main. Before merging, invoke `review` to catch pre-landing issues. After merging, invoke `land-and-deploy` to verify production health.
>
> **For weekly engineering retrospectives:** invoke `retro` skill.
>
> **To save/restore working context across sessions:** invoke `context-save` and `context-restore`.

---

## 11. Gstack & Superpowers Skills Reference

This project has gstack and superpowers installed. Skills are the correct way to handle many common engineering workflows — do not bypass them.

### Installed project skills (`.agents/skills/`)
| Skill | When to use |
|---|---|
| `supabase` | Any Supabase task: schema changes, RLS, auth, edge functions, migrations, `supabase-js` usage |
| `supabase-postgres-best-practices` | Query optimization, index design, schema best practices |

### Gstack skills (always available)
| Skill | When to use |
|---|---|
| `brainstorming` | Before building any feature, component, or significant change |
| `writing-plans` | After brainstorming — produces implementation plan before coding |
| `plan-ceo-review` | Pressure-test scope, ambition, or direction of a plan |
| `plan-eng-review` | Architecture review — catch structural issues before implementation |
| `plan-design-review` | Review UI/UX design plans before building |
| `design-shotgun` | Generate multiple design variants to explore options visually |
| `design-review` | Visual QA on implemented UI — find spacing, hierarchy, consistency issues |
| `design-consultation` | Full design system discussion from scratch |
| `investigate` | Root cause analysis for any bug or unexpected behavior |
| `systematic-debugging` | Structured debugging workflow for test failures or errors |
| `test-driven-development` | Write tests before implementation code |
| `verification-before-completion` | Verify work is actually complete before claiming done |
| `review` | Pre-landing diff review — SQL safety, auth gaps, org_id isolation |
| `qa` | End-to-end QA testing in browser + fix bugs found |
| `qa-only` | QA testing report only (no fixes) |
| `ship` | Full ship workflow: merge base, checks, VERSION bump, CHANGELOG, PR |
| `land-and-deploy` | Merge PR, wait for CI/deploy, verify production |
| `cso` | Security audit — credentials handling, OWASP, threat modeling |
| `health` | Code quality dashboard — linter, type-checker, test runner, composite score |
| `retro` | Weekly engineering retrospective |
| `context-save` / `context-restore` | Save and restore working context across sessions |
| `benchmark` | Performance regression detection |
| `canary` | Post-deploy production monitoring |
| `browse` | Headless browser for manual QA, screenshots, interaction testing |
| `dispatching-parallel-agents` | Run 2+ independent tasks in parallel via subagents |
| `executing-plans` | Execute a written implementation plan with review checkpoints |
| `finishing-a-development-branch` | Decide how to integrate completed work (merge, PR, cleanup) |
| `autoplan` | Run CEO + design + eng + DX reviews automatically in sequence |

### MCP Server
The Supabase MCP server is configured in `.mcp.json` (project `cuzimtflsqextibxbxxc`). Use it for direct DB introspection, table inspection, and running queries without leaving the agent session.

---

## 12. AI Agent Hard Rules

These are non-negotiable. Violating any of these will introduce bugs or security issues.

1. **Always use `apiFetch()`** from `src/lib/api.ts` for all API calls from the frontend. Never use raw `fetch()` for authenticated endpoints.

2. **Always scope DB queries by `org_id`**. Every query on `orders`, `social_conversations`, `social_inbox_orders`, `products`, and any new user-data table must filter by the resolved `org_id`. Missing this causes tenant data leakage.

3. **Always guard new API endpoints with auth**. Call `getToken(req)` → `getUser(token)` → `if (!user) return 401` at the top of every new route handler.

4. **Use React Router v6 (`react-router-dom`) for all new routes.** `wouter` exists in some old components — do not use it for anything new.

5. **Use Phosphor Icons (`weight="light"`)** for all new icons. Only fall back to Lucide if Phosphor doesn't have the icon.

6. **Never commit `.env` or any file containing secrets.** `.env` is in `.gitignore` — keep it that way.

7. **Always run `normalizeBdPhone()`** before passing a phone number to FraudShield or any courier API. Raw phone input from users is not safe to pass directly.

8. **Add new routes to `server/index.js` in the correct domain section** (see Section 6). Do not create new server files unless the feature is genuinely standalone.

9. **Before building any feature, invoke `brainstorming` skill.** Before shipping, invoke `review` and `verification-before-completion`.

10. **For any Supabase schema change, invoke the `supabase` skill first.** Schema changes affect multi-tenancy migrations and PostgREST schema cache — they need to be handled carefully.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

---

## Merchant Onboarding

Merchant Suite onboards each merchant as their **own forked deployment** — not a single shared multi-tenant instance. The operator forks the Suite and the storefront template, brands them, and deploys. Each merchant runs in full isolation: their own database, their own analytics, their own URLs. No shared logins or data between merchants. (The code inside each fork is still multi-tenant by `org_id`, so a merchant can have teammates and multiple workspaces — but the *deployment boundary* is per-merchant.)

### Setup per merchant (operator)
1. **Fork & brand.** Fork the Merchant Suite repo and the storefront repo; tweak them for the merchant's brand (name, colors, copy) and push the storefront.
2. **Create their accounts.** Create the merchant's own **Supabase** project (database) and **PostHog** project (analytics).
3. **Fill keys & deploy.** Enter those Supabase/PostHog keys into the Suite fork's settings, then deploy the Suite → it goes live at the merchant's URL.
4. **Merchant logs in → workspace auto-created.** On first login the merchant's private workspace (tenant) is created automatically (`org_id`-scoped).

### Merchant self-serve flow (references in `server/index.js`)
5. **Add products & provision storefront.** The merchant adds products (manual entry or Shopify sync), then clicks **"Provision Storefront"** → `POST /api/storefront/provision` (server/index.js:2425). The server:
   - ensures a `custom_store_api_key` exists (`ms-{orgId8}-{random}`),
   - calls `provisionStorefrontProject(orgId, apiKey)` (server/index.js:2448), which creates a **Vercel project** from the storefront template repo, sets its env (`VITE_STOREFRONT_ID` = org_id, `VITE_MERCHANT_SUITE_URL`, `CUSTOM_ORDERS_API_KEY`), deploys it, and stores the Vercel project id in `app_settings` (`{orgId}:storefront_vercel_project_id`),
   - returns `https://storefront-{orgId8}.vercel.app`.
   Visitor tracking is **already wired** (the `merchant-suite-tracker` script + PostHog), so live visitors show immediately — no extra setup.
6. **Optional custom domain.** The merchant can connect their own domain name to the storefront project.

After go-live: customers shop the storefront and orders land in the merchant's dashboard. Everything stays separate per merchant.

### Team members
- An admin invites teammates via `POST /api/admin/assign-role` (server/index.js:734); they inherit the same `org_id`.

### Key facts for agents
- **Fork-per-merchant deployment**, not one shared Suite: each merchant = own fork + own Supabase + own PostHog + own URL.
- Within a fork, data stays scoped by `org_id` (multi-tenant code), so team members and workspaces remain isolated inside that merchant's instance.
- The **storefront is auto-provisioned per merchant** via `provisionStorefrontProject` / `getStorefrontProjectId` (server/index.js:2448 / 2289) — reuse these rather than writing new storefront logic.
- Every new merchant gets a **7-day free trial** automatically on sign-up (`billing_plan: "growth"`, `billing_status: "trialing"`, `trial_ends_at = now + 7d` — server/index.js:712).
- Sign-up is instant (email auto-confirmed).
- When adding onboarding-related features, keep the `org_id`-scoping and trial-seeding behavior intact.
