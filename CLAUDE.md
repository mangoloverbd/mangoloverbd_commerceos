# CLAUDE.md — Merchant-Suite Agent Guide

This file is the authoritative guide for AI agents (Claude, OpenCode, etc.) working in this codebase.
Read it fully before making any changes. The rules in the **AI Agent Rules** section are hard guardrails — follow them without exception.

---

## 1. Project Overview

**Merchant-Suite** is the private, single-tenant order management system for **Mango Lover BD**. It handles order ingestion, courier dispatch, fraud detection, social inbox management, and P&L analytics for this brand only.

This deployment is not a shared SaaS instance. Use the Mango Lover BD Supabase project, integrations, branding, social accounts, and storefront configuration for every change. The code still contains `org_id` fields and helpers for database compatibility; in this deployment they identify the one Mango Lover BD workspace rather than separate customer tenants.

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
STOREFRONT_GIT_REPO=noorkarimmehedi/e-commerce
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

- Uses `getServiceSupabase()` internally — this uses `SUPABASE_SERVICE_ROLE_KEY` and bypasses RLS. This deployment serves only Mango Lover BD. Preserve the existing `org_id` checks as defense in depth and database compatibility, but do not design new shared-tenant behavior.
- In dev, Express also proxies the Vite dev server. In production, it serves the built `dist/` folder.
- Raw body buffering is enabled for webhook HMAC verification (`req.rawBody`).

> **Before adding new backend routes or refactoring the server:** invoke `plan-eng-review` to review the architecture plan first. For complex logic changes, use `writing-plans` to produce a step-by-step plan before coding.

### Database

Supabase PostgreSQL. The Merchant-Suite frontend accesses Supabase directly only for auth; its other DB access goes through the Express API. The separate public storefront may use the same project's publishable key only for the approved read-only revision subscription. The backend uses the service role client.

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
- `migrateMultiTenancy()` — legacy compatibility migration that ensures existing `org_id` columns remain available + reloads the PostgREST schema cache

> **Before schema changes or writing Postgres queries:** invoke the `supabase` skill. For query optimization or index design, invoke `supabase-postgres-best-practices`. The project-local Supabase MCP server is configured in `.mcp.json` (Claude Code) and `.codex/config.toml` (Codex) — use it for direct DB introspection.

### Storefront integration boundary (approved target architecture)

Merchant-Suite and the dedicated storefront are separate GitHub repositories and separate Vercel projects, but they use the same Mango Lover BD Supabase project for runtime commerce data and merchant-editable content.

- **GitHub + Vercel own application code.** Storefront components, layouts, CSS, application logic, and fixed code assets live in the storefront repository. Agent-led design customization is committed there, and Vercel redeploys it automatically.
- **Supabase owns runtime content and commerce data.** Products, prices, variants, authoritative stock, product images, editable branding, shipping configuration, customers, orders, and storefront revision state live in the same Mango Lover BD Supabase project.
- **Dashboard changes never require a storefront redeploy.** Product, image, price, publication, variant, or stock mutations go through authenticated Merchant-Suite APIs, update Supabase, advance catalog/inventory revisions, invalidate Vercel cache entries, and notify already-open storefronts.
- **The public storefront consumes the versioned Merchant-Suite API.** Keep commerce reads and checkout behind `/api/public/v1/:handle/...`; do not couple storefront UI to internal Supabase product or order tables.
- **Direct Supabase access in the storefront is notification-only.** A browser-safe Supabase publishable key may subscribe to a narrowly exposed, read-only storefront revision signal. Never expose the service-role/secret key, and never grant the storefront direct writes to commerce tables.
- **Images use Supabase Storage plus Vercel delivery.** Merchant-uploaded product and branding images use immutable UUID object paths in the shared Supabase Storage project. The storefront serves responsive variants through Vercel Image Optimization/CDN.
- **One source of stock truth.** Do not maintain parallel stock values in `app_settings` and product/variant rows. Product or variant inventory must have one authoritative database representation, and checkout must validate and decrement it atomically.
- **Preserve the fixed workspace guard.** The deployment is single-tenant, but all server-side data access continues to resolve and filter by the Mango Lover BD `org_id`. Public clients use the assigned storefront handle and never submit an arbitrary organization id.

The detailed approved direction is documented in `docs/superpowers/specs/2026-08-27-realtime-storefront-sync-design.md`.

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
| `.mcp.json` | Project-local Supabase MCP server configuration (Claude Code) |
| `.codex/config.toml` | Project-local Supabase MCP server configuration (Codex) |
| `supabase/` | Supabase project config and migrations |

---

## 4. Single-Tenant Deployment (Critical — Read Before Any DB Work)

This deployment belongs exclusively to Mango Lover BD. Every piece of data belongs to the one Mango Lover BD workspace. The existing `org_id` is the fixed workspace identifier used by the current schema and route helpers; it is not an invitation to add support for multiple merchants.

### How it works

The Mango Lover BD admin account and its team members use the same existing `org_id` stored in `user_roles.org_id`. The backend resolves the current workspace for authenticated requests so existing data remains compatible.

**Server auth helpers** (defined at top of `server/index.js`):
```js
// Extract JWT from Authorization header
const token = getToken(req);

// Resolve user from JWT
const { user } = await getUser(token);
if (!user) return res.status(401).json({ error: "Unauthorized" });

// Resolve the Mango Lover BD workspace from user_roles
const { data: roleRow } = await supabase
  .from("user_roles")
  .select("org_id, role")
  .eq("user_id", user.id)
  .maybeSingle();
const orgId = roleRow?.org_id;
```

**Settings namespace** — existing app_settings keys are prefixed with the fixed workspace id:
```js
// Read org-scoped settings
const cfg = await getSettings([`${orgId}:shopify_token`]);

// Write org-scoped settings
await saveSettings({ [`${orgId}:shopify_token`]: value });
```

**Workspace guard** — keep the existing `org_id` filter on queries for `orders`, `social_conversations`, `social_inbox_orders`, `products`, and other user data. This prevents accidental cross-workspace data access if legacy records or tooling exist, but the application has one intended merchant: Mango Lover BD.
```js
const { data } = await supabase
  .from("orders")
  .select("*")
  .eq("org_id", orgId);  // ← ALWAYS required
```

### Hard rule

**Every new route that reads or writes user data MUST use the current Mango Lover BD workspace and preserve the `org_id` guard in all relevant queries.** Do not accept an arbitrary organization or tenant identifier from the client, and do not introduce shared multi-merchant behavior.

> **When adding new DB features:** invoke `supabase` skill. When reviewing a diff that touches DB queries, invoke `review` skill to check for workspace guard, auth, and data-isolation gaps.

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
4. Resolve the Mango Lover BD workspace and role from `user_roles`

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

> **Before shipping any API changes:** run `review` skill to check for SQL safety, auth gaps, and workspace guards. Run `qa` skill to verify the feature works end-to-end in the browser.

---

## 7. External Integrations

All integration credentials are stored in the Mango Lover BD deployment's `app_settings` (using the existing workspace-prefixed keys). They are configured through the Settings page (`/settings`) and read server-side via `getSettings()`.

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
| `review` | Pre-landing diff review — SQL safety, auth gaps, and workspace guards |
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
The Supabase MCP server is configured project-locally for project `ldiktvcavyabivpxfwpn`, in two places — one per agent runtime, both pointing at the same project:

| File | Runtime |
|---|---|
| `.mcp.json` | Claude Code (HTTP transport, `https://mcp.supabase.com/mcp`) |
| `.codex/config.toml` | Codex / OpenCode |

Use it for direct DB introspection, table inspection, and queries. Never add or replace a global MCP configuration — keep Supabase MCP scoped to this project. Claude Code requires a one-time OAuth flow: run `/mcp`, select `supabase`, then Authenticate. If you change the project ref or enabled features, update both files so the runtimes stay in sync.

---

## 12. AI Agent Hard Rules

These are non-negotiable. Violating any of these will introduce bugs or security issues.

1. **Always use `apiFetch()`** from `src/lib/api.ts` for all API calls from the frontend. Never use raw `fetch()` for authenticated endpoints.

2. **Always use the fixed Mango Lover BD workspace guard**. Every query on `orders`, `social_conversations`, `social_inbox_orders`, `products`, and any new user-data table must preserve the resolved `org_id` filter. Never accept a tenant or organization id from the client.

3. **Always guard new API endpoints with auth**. Call `getToken(req)` → `getUser(token)` → `if (!user) return 401` at the top of every new route handler.

4. **Use React Router v6 (`react-router-dom`) for all new routes.** `wouter` exists in some old components — do not use it for anything new.

5. **Use Phosphor Icons (`weight="light"`)** for all new icons. Only fall back to Lucide if Phosphor doesn't have the icon.

6. **Never commit `.env` or any file containing secrets.** `.env` is in `.gitignore` — keep it that way.

7. **Always run `normalizeBdPhone()`** before passing a phone number to FraudShield or any courier API. Raw phone input from users is not safe to pass directly.

8. **Add new routes to `server/index.js` in the correct domain section** (see Section 6). Do not create new server files unless the feature is genuinely standalone.

9. **Before building any feature, invoke `brainstorming` skill.** Before shipping, invoke `review` and `verification-before-completion`.

10. **For any Supabase schema change, invoke the `supabase` skill first.** Schema changes affect the Mango Lover BD database and PostgREST schema cache — they need to be handled carefully.

11. **Keep storefront code and runtime data separate.** Storefront design/code changes belong in its GitHub repository and deploy through Vercel; merchant-editable products, stock, images, branding, and orders belong in the shared Mango Lover BD Supabase project.

12. **Do not give the public storefront direct commerce-table access.** It may use a publishable Supabase key only for the read-only revision notification channel. Catalog, inventory, and checkout continue through the versioned Merchant-Suite public API; never expose a service-role or secret key.

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

## Mango Lover BD Deployment

This repository is the dedicated Merchant-Suite deployment for **Mango Lover BD**. It has one Supabase project, one analytics setup, one branded operations dashboard, and one intended storefront. Do not add merchant selection, tenant provisioning, or shared multi-merchant workflows.

### Setup for Mango Lover BD (operator)
1. **Fork & brand.** Fork this Merchant-Suite repository for Mango Lover BD and fork `github.com/noorkarimmehedi/e-commerce` as its dedicated storefront. Use the brand's Facebook page as the primary social reference: `https://www.facebook.com/WeAreMangoLover`.
2. **Create the accounts.** Use the Mango Lover BD **Supabase** project and the deployment's analytics project. Keep all credentials in environment variables or the existing server-side settings flow; never commit secrets.
3. **Fill keys & deploy.** Enter Mango Lover BD's Supabase, AI, courier, Shopify, Meta, fraud, analytics, Vercel, and storefront values into the deployment configuration, then deploy the Suite at the approved Mango Lover BD URL.
4. **Create the admin account.** The first Mango Lover BD admin login receives the existing admin role. Additional staff accounts may be invited and share the same workspace.

### Mango Lover BD storefront flow (references in `server/index.js`)
5. **Add products & provision storefront.** Add Mango Lover BD products manually or through Shopify, publish the products intended for sale, then use **"Provision Storefront"** → `POST /api/storefront/provision` (server/index.js:2559). The server:
   - ensures a `custom_store_api_key` exists for this deployment,
   - creates a dedicated **Vercel project** from the forked `noorkarimmehedi/e-commerce` storefront repository,
   - sets the Merchant-Suite URL and storefront identity variables,
   - under the approved realtime-sync architecture, also sets `VITE_STOREFRONT_HANDLE`, `VITE_SUPABASE_URL`, and the browser-safe `VITE_SUPABASE_PUBLISHABLE_KEY`,
   - keeps `CUSTOM_ORDERS_API_KEY` server-only and never exposes it through a `VITE_` variable,
   - deploys it and stores the Vercel project id in the Mango Lover BD settings namespace,
   - returns the storefront's production URL.
6. **Optional custom domain.** Connect Mango Lover BD's approved domain to the dedicated storefront project and complete the displayed DNS record.

After go-live, customers shop the Mango Lover BD storefront and orders land in this deployment's dashboard. Product, inventory, merchant-editable images/branding, shipping, customer, revision, and order data remain in the one Mango Lover BD Supabase project. Dashboard content changes synchronize at runtime and do not redeploy the storefront; only storefront source/design changes flow through GitHub and a Vercel deployment.

### Team members
- An admin invites Mango Lover BD teammates via `POST /api/admin/assign-role` (server/index.js:734); they use the same fixed workspace.

### Key facts for agents
- **Single-brand deployment:** this Suite fork and the storefront fork belong only to Mango Lover BD.
- The existing `org_id` is a fixed workspace compatibility key, not a supported merchant selector. Preserve it in relevant queries and settings keys, but do not build new multi-tenant behavior.
- The **storefront is provisioned from the dedicated e-commerce fork** via `provisionStorefrontProject` / `getStorefrontProjectId` (server/index.js:2482 / 2423) — reuse these rather than writing duplicate storefront logic.
- Storefront public reads and order submission use the Mango Lover BD handle and server-side workspace resolution; never accept an arbitrary `org_id` from a visitor or client.
- Sign-up is instant (email auto-confirmed). Billing/trial behavior may remain in the existing code until Mango Lover BD's commercial requirements are finalized.
- When adding onboarding-related features, preserve the fixed workspace guard, Mango Lover BD branding, and the dedicated storefront connection.

---

## 13. General Coding Principles

Behavioral guidelines to reduce common LLM coding mistakes. These apply on top of everything above.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 13.1 Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 13.2 Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 13.3 Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 13.4 Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

### 13.5 Multi-Pass Review for High-Stakes Decisions

**Don't settle on a first-pass answer when a decision is consequential or ambiguous.**

For architecture decisions, security-sensitive code, or irreversible calls, work through three internal passes before presenting a final answer:

1. **Independent pass** — Draft the solution on its own merits first, without anchoring to an alternative you may already be leaning toward.
2. **Self-review** — Critique that draft as if reviewing someone else's work: what's the weakest assumption, what could break, what did it fail to consider?
3. **Synthesis** — Produce one final answer that resolves the critique, and note explicitly what changed between the draft and the final version and why.

Trigger this only for: irreversible architecture choices, security-critical code, or explicit request ("council this," "pressure-test this"). Skip it for routine edits — the overhead isn't justified for low-stakes changes.

**Note:** This is single-model internal deliberation, not multi-model dispatch. For an actual multi-LLM council, use the `llm-council` skill instead — that's a different mechanism and shouldn't be conflated with this rule.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
