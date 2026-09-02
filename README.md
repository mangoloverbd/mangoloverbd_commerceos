# Merchant-Suite

**Merchant-Suite** is the private, single-tenant order management system for **Mango Lover BD** — AI-powered order management and social inbox, built with React, Vite, TypeScript, and Supabase.

This is not a shared SaaS instance. It serves Mango Lover BD only, using that brand's own Supabase project, integrations, and storefront configuration. See `AGENTS.md` / `CLAUDE.md` before making changes.

## Features

- 📦 Order extraction and management
- 📊 Order analytics and dashboard
- 📥 Social inbox (Facebook, Instagram, WhatsApp)
- 🚚 Courier integrations (Pathao, Steadfast)
- ⚡ Railway auto-deploy enabled
- 🔒 Fraud detection
- 🧾 Invoice generation
- 👥 Team management

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Backend:** Express.js (Node)
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install dependencies

```bash
npm install
```

### Environment variables

Create a `.env` file in the root with the following:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_DB_URL=your_supabase_pooler_connection_string
ADMIN_EMAILS=owner@example.com
POSTHOG_PROJECT_API_KEY=your_posthog_project_api_key
POSTHOG_PERSONAL_API_KEY=your_posthog_personal_api_key
POSTHOG_PROJECT_ID=your_posthog_project_id
POSTHOG_HOST=https://app.posthog.com
```

On Railway, also set the Vite public variables so the browser bundle can sign in:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

`SUPABASE_DB_URL` should be the Supabase pooler connection string from
Supabase Dashboard → Project Settings → Database → Connection string → Pooler.
Railway often cannot reach Supabase's direct IPv6 database host, so the pooler
string is preferred for startup migrations. You can alternatively set
`SUPABASE_POOLER_URL`, `SUPABASE_DB_POOLER_URL`, `SUPABASE_DATABASE_URL`,
`DATABASE_URL`, or `POSTGRES_URL`.
`ADMIN_EMAILS` is a comma-separated list of existing Supabase Auth users that
should be repaired or promoted to admin on their next sign-in.
`POSTHOG_PROJECT_API_KEY` is used only server-side to forward custom website
tracker events into this deployment's PostHog project.
`POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` are used only server-side to
query PostHog behavior data for Order Analysis.

### Run the frontend

```bash
npx vite
```

Runs at `http://localhost:5173`

### Run the backend

```bash
node server/index.js
```

Runs at `http://localhost:5000`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Express server |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest tests |
