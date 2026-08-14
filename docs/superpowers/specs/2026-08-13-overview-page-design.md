# Overview Page Design

**Date**: 2026-08-13
**Status**: Approved
**Author**: opencode

## Summary

Add a new analytics-focused Overview page (`/overview`) to Merchant-Suite that provides at-a-glance business metrics, charts, and panels. This page lives alongside the existing Dashboard (`/`) which remains the fulfillment-focused orders table view.

## Design Decisions

- **Approach**: Single-page analytics overview (Approach A)
- **Visual style**: Light theme with rich charts (hybrid) — consistent with Merchant-Suite's existing aesthetic
- **Chart library**: Recharts
- **Route**: `/overview` (new), Dashboard at `/` stays unchanged

## Page Structure

```
/overview
├── Header: "Overview" title + date range picker (reuse DateRangePicker)
├── Row 1: 5 KPI cards (responsive grid: 2 cols mobile, 5 cols desktop)
├── Row 2: 2 large charts side-by-side
└── Row 3: 3 smaller panels
```

## KPI Cards (Row 1)

5 cards, each with: icon, label, value, trend indicator, mini sparkline.

| Card | Value Source | Trend |
|------|-------------|-------|
| Total Orders | Count of orders in range | vs previous period (same-length period before selected range) |
| Revenue | Sum of (price + delivery_rate) | vs previous period |
| Profit Margin | (Revenue - COG - Shipping) / Revenue | vs previous period |
| Delivery Success | Delivered / (Delivered + Failed + Returned) from courier_status | vs previous period |
| Unread Messages | social_conversations.unread_count > 0 | vs yesterday |

Styling: 8px uppercase label, 2xl light value, trend badge (green/red), 7-bar sparkline.

## Large Charts (Row 2)

### Chart 1: Order Volume Trend
- Area chart with daily granularity
- Two layers: current period (solid fill) + previous period (dashed outline)
- Tooltip: date, count, % change

### Chart 2: Revenue vs Costs
- Stacked bar chart: Revenue (green), COG (amber), Shipping (blue)
- Profit as line overlay (dark)
- Tooltip: date, breakdown, net profit

## Bottom Panels (Row 3)

### Panel 1: Courier Performance
- Horizontal bar chart: success rate per courier (Steadfast, Pathao)
- States mapped from `courier_status`: Delivered (green), Pending/Processing (amber), Returned/Cancelled/Rejected (red), In Transit (blue)
- Summary: overall delivery success %

### Panel 2: Social Inbox Activity
- 3 mini stats: Unread messages, Avg response time, Conversations today
- Channel breakdown: Facebook, Instagram, WhatsApp with icons

### Panel 3: Customer Retention
- Repeat customer rate: % with 2+ orders
- Progress bar visualization
- Top 5 customers by order count

## Data Requirements

### New endpoint: `GET /api/overview`

Query params: `since`, `until` (YYYY-MM-DD, optional)

Response structure:
```json
{
  "kpis": {
    "totalOrders": { "value": 245, "trend": 12.4, "previousValue": 218 },
    "revenue": { "value": 184320, "trend": 8.2, "previousValue": 170280 },
    "profitMargin": { "value": 23.5, "trend": -2.1, "previousValue": 25.6 },
    "deliverySuccess": { "value": 87.3, "trend": 3.2, "previousValue": 84.1 },
    "unreadMessages": { "value": 12, "trend": -40, "previousValue": 20 }
  },
  "orderVolumeSeries": [
    { "date": "2026-08-06", "current": 32, "previous": 28 }
  ],
  "revenueSeries": [
    { "date": "2026-08-06", "revenue": 12400, "cog": 7200, "shipping": 1800, "profit": 3400 }
  ],
  "courierPerformance": {
    "steadfast": { "delivered": 180, "inTransit": 20, "failed": 12, "pending": 8 },
    "pathao": { "delivered": 95, "inTransit": 8, "failed": 5, "pending": 3 }
  },
  "socialInbox": {
    "unread": 12,
    "avgResponseTimeMinutes": 45,
    "conversationsToday": 28,
    "byChannel": { "facebook": 18, "instagram": 7, "whatsapp": 3 }
  },
  "customerRetention": {
    "repeatRate": 34.2,
    "repeatCustomers": 84,
    "totalCustomers": 245,
    "topCustomers": [
      { "name": "...", "phone": "...", "orderCount": 12, "totalSpent": 45200 }
    ]
  }
}
```

### Data sources
- `orders` table: order count, revenue, COG, shipping, `courier_status` (values: delivered, returned, cancelled, rejected, partial_delivered, Pending, etc.)
- `products` table: COG lookup
- `social_conversations`: `unread_count` column for unread messages, `platform` for channel breakdown
- `social_messages`: for avg response time calculation
- Customer retention: computed from orders grouped by phone/customer

### Multi-tenancy
All queries filtered by `org_id` resolved from JWT.

## Routing & Navigation

- **Route**: `/overview` added to `App.tsx` under `ProtectedRoute` > `DashboardLayout`
- **Sidebar**: New "Overview" nav item with analytics icon, link to `/overview`
- **Current Dashboard** (`/`) unchanged

## Component Structure

```
src/pages/Overview.tsx
src/components/overview/
  ├── KpiCard.tsx
  ├── OrderVolumeChart.tsx
  ├── RevenueChart.tsx
  ├── CourierPanel.tsx
  ├── SocialInboxPanel.tsx
  └── RetentionPanel.tsx
```

## Dependencies

- New: `recharts` package
- Existing: `framer-motion`, `date-fns`, `@phosphor-icons/react`, shadcn/ui components

## Testing

- Unit tests for each panel component
- Integration test for `/api/overview` endpoint (auth, org_id isolation, date filtering)
- Visual regression not required for v1

## Out of Scope (v1)

- Widget customization / drag-and-drop
- Real-time data updates (polling can be added later)
- Export functionality
- Dark theme variant
