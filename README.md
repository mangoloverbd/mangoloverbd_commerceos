# Seraphine

An AI-powered order management and social inbox platform built with React, Vite, TypeScript, and Supabase.

## Features

- 📦 Order extraction and management
- 📊 Order analytics and dashboard
- 📥 Social inbox (Facebook, Instagram, WhatsApp)
- 🚚 Courier integrations (Pathao, Steadfast)
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
```

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
