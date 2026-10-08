# Staff Performance redesign — state (2026-09-28)

## Status
Mockup approved (v3: https://claude.ai/artifact/Ar2kwZLYdjZpikpoVSYpSD). Plan written, awaiting human review:
docs/superpowers/plans/2026-09-28-staff-performance-redesign.md (6 tasks, TDD).

## Rulings in the plan
- No previous-period deltas (staff route already ~10 paginated queries).
- Sparklines only on Confirmed value / Confirmed orders tiles (new team `series`).
- Order yield uses the assigned population (2 new counters).
- No per-product outcome split; social inbox stays hidden; flags ±5 pts; best only with ≥2 members.

## Rejected in mockup review
- Quality-vs-speed scatter (hard to read) → Order yield 100% bars.
- Horizontal stacked leaderboard (looked same as yield) → ranked vertical columns.

## Implementation (2026-09-28)
- Branch feat/staff-performance-redesign, 9 commits (15cbe3a..769a9b7), all tasks via subagent-driven development + final review.
- Verified: 1617/1617 tests, tsc 65 (= main), lint 0 errors, build OK.
- Extra rulings: confirmed_assigned_cancelled_count overlap counter; "Open / in transit" label; "Confirmed, not cancelled" / "of assigned" labels; charts stay visible to team members (approved mockup note).
- Follow-ups: server single-bucket classification per assigned order; lowercase "in transit" leftovers; tie handling for "best"; long-range series cap; see sdd-ledger.md.

## Handled-orders fix (2026-09-28)
- Root cause: assigned_to only set on manual orders / converted carts, so assigned-basis metrics missed website orders (Jannat 39 assigned vs 331 confirmed, cancels 0).
- Now: every staff figure uses orders HANDLED (confirmed or cancelled), each order once by the member's last action; products broken down by confirmed/delivered/RTO/cancelled with Loss %.
- Commits 2082259, c61e705, a7cf108; reviewed (2 fix rounds). 1630 tests, tsc 64, build OK.
- Follow-ups: snapshot Confirmed value/orders tiles and Team contribution still per-action; page pre-sort uses per-action value.
