# Arc Lab Technology — Order Management Dashboard

## Overview
Full-stack order management SaaS with multi-tenancy. Built with React/Vite (frontend) + Express (backend) + Supabase (PostgreSQL).

## Architecture

### Frontend
- **Framework**: React 18 + Vite + TypeScript
- **Routing**: React Router v6 (`wouter` used in some components)
- **State**: TanStack Query v5
- **UI**: shadcn/ui + Tailwind CSS
- **Icons**: Phosphor Icons (`@phosphor-icons/react`, `weight="light"`) + Lucide React
- **Animations**: Framer Motion
- **Font**: Geist Sans (variable, `public/fonts/GeistSans-Variable.woff2`)

### Backend
- **Runtime**: Node.js 20, Express.js (ESM)
- **Database**: Supabase (PostgreSQL via `@supabase/supabase-js`)
- **Auth**: Supabase Auth (JWT tokens)
- **AI**: OpenAI GPT-4o-mini (order extraction, analysis, social bot)
- **Web scraping**: Firecrawl API

### Design Language
- Background: `bg-[#FAFAF8]`
- Labels: `text-[8px] font-medium tracking-[0.3em] text-black uppercase`
- Values: `text-2xl font-light`
- Borderless panels, luxury minimalist aesthetic

## Multi-Tenancy Architecture

### Org Isolation Strategy
- Each admin who registers gets a new `org_id` (UUID) auto-generated and stored in `user_roles.org_id`
- Team members inherit their admin's `org_id`
- **Settings**: stored as `{orgId}:{key}` in `app_settings` table
- **Orders**: filtered by `org_id` column on `orders` table
- **Social**: filtered by `org_id` column on `social_conversations` and `social_inbox_orders` tables
- **Products**: stored as `{orgId}:products_catalog` in `app_settings`
- **AI Context**: stored as `{orgId}:ai_product_context` in `app_settings`
- **Brand Doc**: stored as `{orgId}:brand_doc` in `app_settings`

### Server Helpers
- `getToken(req)` — extracts Bearer token from Authorization header
- `getUserAndOrgId(token)` — resolves user + org_id from JWT + user_roles lookup
- `getSettings(keys, orgId)` — reads org-prefixed settings
- `saveSettings(settings, orgId)` — writes org-prefixed settings

### Frontend Auth Helper
- `src/lib/api.ts` — `apiFetch(url, options)` attaches JWT from Supabase session to every API call

## Database Tables
- `user_roles` — user_id, role (admin/team_member), org_id
- `orders` — Shopify orders with org_id, fraud data, courier data
- `app_settings` — key-value store (org-prefixed keys for multi-tenancy)
- `social_conversations` — Facebook/Instagram/WhatsApp conversations with org_id
- `social_messages` — messages within conversations
- `social_inbox_orders` — orders extracted from social chats with org_id

## Startup Migrations (auto-run)
- `migrateInboxOrdersTable()` — ensures social_inbox_orders has all courier/fraud columns
- `migrateMultiTenancy()` — ensures org_id columns exist on all relevant tables

## Key Features
- **P&L Dashboard**: Framer Motion animated cells, Phosphor Icons, ৳ taka symbol for Ad Spend
- **Orders Table**: Shopify sync, fraud check (FraudShield), Steadfast/Pathao courier dispatch
- **Products Catalog**: Shopify scraper (products.json) + Firecrawl fallback, COG tracking
- **Order Extraction**: AI-powered text parsing (Bangla/English/mixed)
- **Order Analysis**: AI batch analysis by date range or order number range
- **Social Inbox**: Facebook Messenger, Instagram DM, WhatsApp Business AI bot
- **Inbox Orders**: Orders captured from social conversations
- **Role Management**: Admin/team_member roles, team invite system

## External Integrations
- **Shopify**: Admin API for order sync
- **Steadfast Courier**: Order dispatch + webhook tracking
- **Pathao Courier**: Order dispatch (OAuth token-based)
- **FraudShield**: Phone number fraud checking
- **Facebook/Meta Graph API**: Messenger + Instagram + WhatsApp webhooks
- **Firecrawl**: Product catalog scraping

## Running
- Dev: `npm run dev` (runs `node server/index.js` which also serves Vite)
- Production: `NODE_ENV=production PORT=24678 node server/index.js`
