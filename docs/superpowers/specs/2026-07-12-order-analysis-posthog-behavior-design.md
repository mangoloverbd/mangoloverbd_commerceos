# Order Analysis PostHog Behavior Design

## Scope

Add the first PostHog-powered behavior intelligence to the Order Analysis page using the approved Option A layout: behavior signals appear immediately after the top AI Business Forecast metric cards.

This phase includes Website Funnel, Conversion Drop-off, and Product Demand Signals. It does not include traffic-source ROI, AI summary integration, frontend PostHog SDKs, or joining web sessions to exact order revenue.

## Backend

Add `GET /api/order-analysis/website-behavior?days=30` in `server/index.js` near `/api/business-forecast`.

The route must:

- Authenticate with `getUser(getToken(req))`.
- Resolve `orgId` through `getUserOrg()`.
- Require no Supabase schema changes.
- Query PostHog server-side only with `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, and optional `POSTHOG_HOST`.
- Filter every query by `properties.org_id = orgId`.
- Return `configured: false` with empty metrics when query credentials are missing.
- Return `configured: true` with empty metrics if PostHog fails, plus a warning log, so the page does not fail.

Use PostHog HogQL via `POST /api/projects/:project_id/query/`.

## Response Shape

```ts
type WebsiteBehaviorResponse = {
  configured: boolean;
  lookbackDays: number;
  funnel: {
    visitors: number;
    productViews: number;
    carts: number;
    checkouts: number;
    purchases: number;
    conversionRate: number;
  };
  dropOff: {
    step: string;
    rate: number;
    hint: string;
  } | null;
  productDemand: Array<{
    url: string;
    views: number;
    carts: number;
    checkouts: number;
    purchases: number;
    conversionRate: number;
  }>;
};
```

## Frontend

In `src/pages/OrderAnalysis.tsx`:

- Add a second `useQuery` for `/api/order-analysis/website-behavior` using `apiFetch()`.
- Render a new `WebsiteBehaviorPanel` after the forecast metric card section.
- Show a disabled/configuration empty state when `configured` is false.
- Show loading skeletons while the query loads.
- Display funnel steps, biggest drop-off, and the top product/page demand rows.

## Tenant Isolation

The frontend never sends `org_id`. The backend resolves it from auth and injects it into every PostHog query filter. The PostHog personal API key and project ID are never exposed to the browser.

## Testing

Add source-level tests covering:

- Auth and org resolution in the new endpoint.
- PostHog query env vars.
- HogQL filtering by `properties.org_id`.
- `configured: false` behavior.
- `OrderAnalysis.tsx` using `apiFetch('/api/order-analysis/website-behavior')`.
- UI labels: `Website Funnel`, `Conversion Drop-off`, and `Product Demand Signals`.
