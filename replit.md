# Merchant-Suite — Order Management Dashboard

## Overview
Private, single-tenant order management system for Mango Lover BD. Built with React/Vite (frontend) + Express (backend) + Supabase (PostgreSQL).

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

## Mango Lover BD Workspace Architecture

### Workspace Strategy
- This deployment serves Mango Lover BD only; there is one intended workspace and one Supabase project
- The existing `org_id` is retained as a fixed compatibility/workspace key in `user_roles` and user-data tables
- Team members inherit the Mango Lover BD workspace's `org_id`
- **Settings**: stored as `{orgId}:{key}` in `app_settings` for compatibility with the existing server helpers
- **Orders**: retain the `org_id` guard on the `orders` table
- **Social**: retain the `org_id` guard on `social_conversations` and `social_inbox_orders`
- **Products**: retain the existing workspace guard and settings namespace
- **AI Context**: stored using the existing Mango Lover BD workspace namespace
- **Brand Doc**: stored using the existing Mango Lover BD workspace namespace
- New code uses the current workspace and never accepts an arbitrary organization or tenant id from the client

### Server Helpers
- `getToken(req)` — extracts Bearer token from Authorization header
- `getUserAndOrgId(token)` — resolves the Mango Lover BD user + workspace key from JWT + user_roles lookup
- `getSettings(keys, orgId)` — reads org-prefixed settings
- `saveSettings(settings, orgId)` — writes org-prefixed settings

### Frontend Auth Helper
- `src/lib/api.ts` — `apiFetch(url, options)` attaches JWT from Supabase session to every API call

## Database Tables
- `user_roles` — user_id, role (admin/team_member), org_id
- `orders` — Shopify orders with org_id, fraud data, courier data
- `app_settings` — key-value store using the existing Mango Lover BD workspace-prefixed keys
- `social_conversations` — Facebook/Instagram/WhatsApp conversations with org_id
- `social_messages` — messages within conversations
- `social_inbox_orders` — orders extracted from social chats with org_id

## Startup Migrations (auto-run)
- `migrateInboxOrdersTable()` — ensures social_inbox_orders has all courier/fraud columns
- `migrateMultiTenancy()` — legacy compatibility migration that ensures org_id columns remain available on relevant tables

## Key Features
- **P&L Dashboard**: Framer Motion animated cells, Phosphor Icons, ৳ taka symbol for Ad Spend
- **Orders Table**: Shopify sync, fraud check (FraudShield), Steadfast/Pathao courier dispatch
- **Products Catalog**: Shopify scraper (products.json) + Firecrawl fallback, COG tracking
- **Order Extraction**: AI-powered text parsing (Bangla/English/mixed)
- **Order Analysis**: AI batch analysis by date range or order number range
- **Social Inbox**: Facebook Messenger, Instagram DM, WhatsApp Business AI bot
- **Inbox Orders**: Orders captured from social conversations
- **Role Management**: Admin/team_member roles, team invite system
- **Online Store**: Dedicated Mango Lover BD storefront (`github.com/mangoloverbd/mangoloverbd_storefront`, originally forked from `noorkarimmehedi/e-commerce`), connected through the public catalog and order APIs

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
