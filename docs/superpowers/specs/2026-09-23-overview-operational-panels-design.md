# Overview Operational Panels Design

## Goal

Make the Overview page’s lower operational cards more useful by expanding Courier Performance and replacing Inbox Activity with a detailed Staff Performance summary that matches the Staff Performance and Business Report visual language.

## Scope

- Keep the existing Overview date-range behavior and `/api/overview` endpoint.
- Add a `staffPerformance` response section for the selected date range.
- Preserve the existing `socialInbox` response data for compatibility, but stop rendering its Overview card.
- Expand Courier Performance without changing its existing courier status source data.
- Keep the existing three-column desktop and stacked mobile layout.

## Data contract

The Overview response will include:

```ts
staffPerformance: {
  assignedCount: number;
  confirmedCount: number;
  confirmedValue: number;
  confirmationRate: number;
  deliveredRate: number;
  topStaff: Array<{
    userId: string;
    name: string;
    confirmedCount: number;
    confirmedValue: number;
    deliveredRate: number;
  }>;
}
```

The summary is calculated from current-range regular orders and workspace-scoped `user_roles` display names. Assigned work is counted from `assigned_to`; confirmation and delivery metrics use the order’s confirmed actor/time and courier outcome. Top staff are ranked by confirmed value and limited to three entries. If there is no attribution, the response returns zeroed metrics and an empty list.

## UI design

### Courier Performance

Keep the existing `Delivery` eyebrow and `Courier Performance` title. Add a compact summary row for total shipments, delivered shipments, and overall success rate. Each courier row retains its segmented status bar and adds visible counts for delivered, in transit, pending, failed, and total shipments, plus the courier success rate.

### Staff Performance

Replace the `Social / Inbox Activity` card with a `People / Staff Performance` card. Use four report-style summary metrics for assigned orders, confirmed orders, confirmed value, and delivered rate. Below them, show up to three staff rows ranked by confirmed value; each row includes the staff name, confirmed value, confirmed order count, and delivered rate. Show a restrained empty state when no staff-attributed activity exists.

Both cards use the existing Overview panel geometry and motion, with report-style typography, tabular numbers, soft neutral panels, and subtle separators. No new navigation or page route is introduced.

## Testing

- Update overview panel tests for expanded courier details.
- Add Staff Performance panel tests covering summary values, top staff, and empty state.
- Add Overview wiring coverage proving the Staff Performance panel replaces Social Inbox Activity.
- Add server overview aggregation coverage for staff summary values, ranking, date filtering, and missing attribution.
- Run the focused tests, full test suite, build, lint, and `git diff --check`.

## Non-goals

- Do not remove or alter the social inbox API data.
- Do not duplicate the full Staff Performance report page or add staff filters to Overview.
- Do not change courier status classification or existing report routes.
