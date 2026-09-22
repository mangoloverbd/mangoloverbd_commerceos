# Order Activity Overview Design

## Goal

Replace low-value `Ownership` and `Reviewed` metadata in the per-order activity header with a useful summary of the actual audit trail. Keep detailed event data hidden until an activity row is expanded.

## Header

The three-column header becomes:

1. **Origin** — source chip plus the order creation timestamp.
2. **Latest activity** — latest event summary plus actor and relative time.
3. **History** — recorded event count plus the date detailed tracking began.

No header card should show placeholder values such as `Unassigned`, `—`, or a context-free viewer count.

## Chips

Install the BoardUI chip through `npx boardui@latest add chip` as requested and use the project-local BoardUI `Chip` component. Chips remain semantic and restrained:

- Origin/source: blue or cyan.
- Latest event: color derived from the event type, with destructive outcomes in rose, successful outcomes in lime, pending or caution states in yellow, and informational activity in blue.
- History count: purple.
- Cancellation reasons and addition reasons inside expanded details use the matching semantic color where useful.

Plain prose remains plain prose. Actor names, timestamps, and before/after values should not all become chips.

## Data Flow

The component derives the latest activity and history count from the existing `events` response. The history start date comes from the oldest detailed event, falling back to provenance creation time when needed. No API or schema change is required.

## Interaction

The existing behavior remains:

- Five event overviews are visible initially.
- Each whole row expands on click.
- Expanded content shows reason, note, exact timestamp, and before/after changes.
- `View all activity` reveals the full history.

## Testing

Component tests verify the new header labels and values, semantic chips, five-event limit, and row expansion behavior.
