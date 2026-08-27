# Notification Center Redesign — Design Spec

**Date:** 2026-08-17
**Status:** Approved (design), pending implementation plan

## Goal

Replace the existing alerts popover content (currently a flat list of "Stale Pending" /
"Unsent Confirmed" groups) with a richer, tabbed `NotificationCenter` component that
follows the provided API shape, while keeping the existing header bell trigger + unread
badge + popover shell.

## Scope

- Frontend only. No backend or DB changes.
- Reuse data from the existing `useSidebarAlerts()` hook — no new endpoints.

## Component API

`src/components/application/notification-center/notification-center.tsx`:

```ts
export interface NotificationItem {
  id: string;
  category: "mentions" | "system" | "activity";
  group: string;            // e.g. "Today", "This week", "Earlier"
  title: string;
  description: string;
  timestamp: string;        // short, e.g. "2m", "Sat"
  unread?: boolean;
  status?: "neutral" | "information" | "success" | "error";
  avatar?: { src: string; alt: string };
  actions?: { id: string; label: string; variant: "primary" | "secondary" }[];
}

export interface NotificationCenterProps {
  notifications: NotificationItem[];
  defaultTab?: "mentions" | "system" | "activity";
  tab?: "mentions" | "system" | "activity";          // controlled
  onTabChange?: (tab: string) => void;               // controlled
  onAction?: (notificationId: string, actionId: string) => void;
}
```

- Controlled (`tab` + `onTabChange`) or uncontrolled (`defaultTab`) tab state.
- Three tabs: **Mentions · System · Activity**.
- Notifications are grouped by their `group` string under section headers.
- Tabs with zero notifications show a quiet "Nothing here" empty state.
- Only the `system` tab receives data today; `mentions`/`activity` render empty states.

## Data Mapping (all → `system` tab)

Transform `useSidebarAlerts()` output:

| Source | category | status | title | description | group (computed) |
|---|---|---|---|---|---|
| `stalePending` | `system` | `error` | `#<order_number> · <customer>` | `<daysOld>d old — needs follow-up` | by `created_at` recency |
| `unsentConfirmed` | `system` | `information` | `#<order_number> · <customer>` | `Confirmed <relative> — not sent to courier` | by `created_at` recency |

- `group` buckets: `Today` (today), `This week` (<=7d), `Earlier` (older).
- `timestamp`: short relative label (e.g. `2d`, `5h`).
- `unread`: `true` for all (no read-state backend yet).
- `actions`: each item gets one `{ id: "view", label: "View", variant: "primary" }`.
  `onAction(id, "view")` navigates to `/orders`.
- No `avatar` for order alerts.

## Aesthetic

- Keep the existing luxury-minimalist treatment already in `HeaderAlerts`:
  warm off-white panels (`#FAFAF8`/`#E9E8E5`), borderless/rounded panels,
  no shadows on content, uppercase tracked labels (`text-[8px] tracking-[0.3em]`).
- Replace current `lucide-react` icons with **Phosphor Icons** `weight="light"` per
  AGENTS.md design rules.
- Tabs styled as small uppercase tracked labels with an active underline/indicator.

## Files

- **New** `src/components/application/notification-center/notification-center.tsx`
  (the `NotificationCenter` component + `NotificationItem`/`NotificationCenterProps` types).
- **Edit** `src/components/HeaderAlerts.tsx`:
  - Keep bell trigger, unread `Badge`, `Popover`/`PopoverContent` shell.
  - Remove the manual `stalePending`/`unsentConfirmed` section rendering.
  - Add a `useMemo` transform from `useSidebarAlerts()` → `NotificationItem[]`.
  - Render `<NotificationCenter notifications={...} defaultTab="system"
    onAction={handleAction} />` inside the popover.
  - `handleAction` uses `react-router` navigation (`useNavigate`) to `/orders`.
- No changes to `useSidebarAlerts.ts`.

## Behavior / Edge cases

- Loading state: keep current spinner bell.
- Zero alerts: keep current empty bell (no popover).
- Controlled vs uncontrolled tab handled internally (use `tab` if provided, else
  internal `useState(defaultTab ?? "system")`).
- Empty `mentions`/`activity` tabs: render empty state, no errors.

## Testing

- `npm run lint` and `npm run build` must pass.
- Manual: open header bell, confirm System tab lists Stale Pending (error) and
  Unsent Confirmed (information), groups render, "View" navigates to `/orders`,
  Mentions/Activity show empty state.
