# Order Editor Logs Tab Design

## Goal

Give every order editing page two views, **Order details** and **Logs**. Order details is the current editor. Logs slides in and shows only that order's live activity history.

## Scope

In scope:

- Regular order editor: `src/pages/OrderDetail.tsx` (`/orders/:id`).
- Abandoned checkout editor: `src/pages/AbandonedDetail.tsx`.

Out of scope:

- Inbox Orders. It has no editor page; its existing activity popover stays unchanged.
- New Order. The order does not exist until it is saved, so there is nothing to log.
- Backend and database. The activity endpoints already exist:
  - `GET /api/orders/:id/activity`
  - `GET /api/abandoned-checkouts/:id/activity`

## Placement

The tab switch sits in the sticky editor toolbar, on the right side of the title row:

```
← Order editor ML-1042                    [ Order details | Logs ]
```

On mobile it wraps below the title and keeps full-width tap targets.

## Behavior

### Tab switch

- Two options: **Order details** (default) and **Logs**.
- Uses the existing segmented-control visual language used elsewhere in the dashboard.
- The selected tab is stored in the URL as `?tab=logs`. Order details removes the parameter. Other query parameters, such as `fulfillmentTab`, and router state, such as the pending order queue, are preserved.
- Reloading or sharing a `?tab=logs` link opens on Logs.

### Slide transition

- Framer Motion horizontal slide of about 250 ms: Logs enters from the right; Order details returns from the left.
- The toolbar and tab switch do not move.
- Respects `prefers-reduced-motion` by switching instantly.

### Order details view

- Identical to the current editor, except the compact activity timeline is removed from `CustomerPanel` on both editors because the Logs tab replaces it.
- The Order details view stays mounted while Logs is visible and is hidden from view and assistive technology. Unsaved cart, status, note, source, reason, and in-progress customer edits are never lost when switching tabs.
- Order-level controls such as pending Previous/Next navigation stay available on both tabs.

### Logs view

- Full width, in the same bordered card style as the editor.
- Reuses the existing `OrderActivityTimeline` event rows, chips, provenance summary, actors, reasons, and before/after values.
- Shows the full history by default, not only the five most recent events.
- The event list scrolls within the page naturally; no nested fixed-height scroller on mobile.
- Shows a subtle **Live** indicator.
- Loading, empty, and error states match the current timeline copy.

### Live updates

- Logs polls its activity endpoint every 5 seconds while the Logs tab is visible.
- It refetches when the browser window regains focus.
- Polling stops when Order details is visible or the page is closed.
- Existing post-save invalidation of the activity query remains, so saved changes appear immediately.
- Existing "order viewed" activity recording is unchanged.

## Components

- `src/components/order-editor/OrderEditorTabs.tsx`: shared tab switch, URL state, and slide container for Order details and Logs.
- `src/components/OrderActivityTimeline.tsx`: gains opt-in props for full history and live polling. Existing callers keep today's compact behavior.
- `OrderDetail.tsx` and `AbandonedDetail.tsx`: wrap their editor content in the shared tabs and stop passing the timeline into `CustomerPanel`.

## Testing

- Tab switch renders on both editors with Order details selected by default.
- Selecting Logs shows the activity view and writes `?tab=logs` while preserving other query parameters.
- Opening with `?tab=logs` starts on Logs.
- Switching to Logs and back keeps unsaved cart edits.
- Logs mode shows full history and enables polling; compact mode keeps the existing five-event behavior.
- The customer panel no longer renders the embedded activity timeline on either editor.

## Acceptance Criteria

- Both editors show **Order details | Logs** in the toolbar.
- Logs slides in smoothly and shows only that order's activity.
- New activity appears within about 5 seconds without a reload while Logs is open.
- No unsaved edits are lost when switching tabs.
- Inbox Orders and New Order are unchanged.
