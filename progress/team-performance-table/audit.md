# Audit: Team performance, roster + profile (replaces the 5-column table)

## Files changed
- src/components/staff-performance/StaffTable.tsx
- src/lib/staffPerformanceMetrics.ts (the earlier table task added `staffTeamAverages` and the tie fix for the best flag. Round 3 added the 1e-9 tolerance to the worse flag.)
- src/test/staffPerformancePage.test.tsx
- src/test/staffPerformanceMetrics.test.ts (Round 3 added two worse-flag tolerance tests.)
- src/components/staff-performance/StaffCharts.tsx (Round 4: one comment line only, no logic change. The file's other uncommitted changes come from an earlier task.)
- progress/team-performance-table/audit.md (this file)

## src/components/staff-performance/StaffTable.tsx
- The whole table is replaced by a two-pane layout: a roster on the left and a profile on the right. The grid is `lg:grid-cols-[400px_minmax(0,1fr)]` and stacks into one column below lg. The section keeps its `aria-labelledby`, h2 and `rounded-2xl bg-black/[0.04]` container.
- Header: "{n} of {total} members with orders", then the Sort by `<select>` with all 10 keys and the direction button. Choosing a key resets to that key's default direction (name and cancelRate ascending, the rest descending). The direction label reads "A to Z" / "Z to A" for Staff and "highest first" / "lowest first" otherwise. Expand/Collapse all is gone.
- Roster: one `<button aria-pressed>` per shown member, with `data-testid="staff-performance-row-{key}"`. Each row has:
  - a rank badge (rank by value among shown members), the name, "· Former staff", a "High cancels" pill and the value;
  - a 6px outcome bar with the 4 segments;
  - a "{c} of {h} confirmed · {x} cancelled" line (the cancelled part is left out when it is 0).
- Below the roster rows:
  - The no-orders disclosure (`staff-performance-no-orders`): the names are listed A–Z with the first 3 as a preview, and each can carry a Former staff tag. These names are not selectable.
  - A flex-1 spacer.
  - The Team total card (`staff-performance-team-total`).
- A member stays in the roster if they have handled > 0, any cart activity (contacted, dismissed, reopened or converted) or extra revenue > 0. If nobody qualifies, everyone is shown and there is no no-orders group.
- Profile (`staff-performance-profile` wrapper, `<motion.section aria-label="{name} details">` keyed by member, 0.2s fade/slide, 0s under reduced motion). It has four parts:
  1. Header card: badge, name, pills, the hero value, share of team value and "Ranked r of n by value", and 6 tiles.
  2. Outcome card: a 12px bar, then 4 columns (`data-outcome`).
  3. Extra revenue and Abandoned carts cards, text ported unchanged.
  4. The products table, ported unchanged.
- Selection: the `selectedKey` state falls back to the first member in the sorted order. Every sort change first pins the current selection, so re-sorting never changes who is selected. Selecting a member below lg (checked with `matchMedia` when it exists) scrolls the profile into view, with `scrollIntoView` guarded for jsdom.
- Flags: the conf and cancel tiles use the existing `Rate` component (worse and best, with data-flag). Their sub-line reads "{d} pts below/above team" in red, or "Team x%" otherwise. `formatPts` rounds away from zero: `ceil(|d|*10 - 1e-9)/10`.
- Sort by control (coordinator follow-up):
  - The `<select>` is wrapped in `relative inline-flex`.
  - The select has `appearance-none [-webkit-appearance:none] h-9 cursor-pointer rounded-full pl-4 pr-10 text-[13px] font-medium` plus hover and focus ring.
  - A Phosphor `CaretDown` (light, 14, aria-hidden, pointer-events-none) sits absolutely at `right-4 top-1/2 -translate-y-1/2`.
  - The direction button is `h-9 w-9`, and the controls row uses `items-center gap-2`.
  - The sort test now also asserts that the select has the `appearance-none` and `pr-10` classes.
- Removed orphans: COLUMNS, RateLine, vsTeam, the old YieldBar, MiniBar, Detail, OUTCOME_CAPTIONS, the expand state and the Fragment, CaretRight and AnimatePresence imports.

## Tests
- Page: rewrote the table tests for the roster and profile design, 16 tests. They cover:
  - roster order, badges and default selection;
  - switching members and Former staff;
  - sorting (key, direction labels, selection kept, key default direction);
  - High cancels with the 5.04 gap shown as "5.1";
  - the unflagged "Team x%" and best flag;
  - the no-orders disclosure and cart-only row;
  - the all-zero exception;
  - the six tiles, team AOV, rank and share;
  - the website handler;
  - roster bar segments and the tiny 0.5% width;
  - outcome card widths and amounts;
  - extra, carts and products cards, and the empty products state;
  - the Team total card, and Needs attention showing 1 person, 2 people or None;
  - the footnotes.
- Chart and non-admin tests are untouched.
- Red run: 15 failed | 21 passed (36). Green run of the touched files: 2 files, 48 passed (48).
- `npm test`: 246 files, 1669 tests passed.
- `npm run lint`: 0 errors, 170 pre-existing warnings. The touched files are clean.
- `npm run build`: built in 9.42s.
- `tsc -p tsconfig.app.json | grep -i staff`: empty.

## Decisions where the brief was silent
- The header count "{n} of {total} members with orders" counts members who qualify for the roster (orders, carts or extra revenue), so it is 0 in the all-zero exception. The Team total's "{shown} of {total} members" counts the rows actually shown.
- Team value, handled and confirmed are summed over every member. Team AOV = team value ÷ team confirmed, and "—" when that is 0.
- Singular and plural wording: "1 confirmed order", "1 member had no orders", "1 person".
- The name preview shows 3 names so it fits the 400px roster. Names are sorted A–Z.
- The "Green = best on the team" legend is kept because the conf and cancel tiles still show the best flag. The outcome colour legend is dropped because the outcome card labels every colour.
- Added the `data-testid="staff-performance-hero-value"` test hook.
- The outcome bar's aria-label is "{name} outcomes: …" so tests and screen readers can tell it apart from the roster bar.

## Round 3 (reviewer fixes)
- StaffTable.tsx:
  1. Mobile overflow: the body grid is now `grid-cols-[minmax(0,1fr)] … lg:grid-cols-[400px_minmax(0,1fr)]`, and the roster and profile wrappers have `min-w-0`. The products table's min-w-[640px] now scrolls inside its own overflow-x-auto box.
  2. The roster caption's cancelled count uses `item.yield.cancelled`, the same count as the outcome card and cancel rate.
  3. The header reads "{n} of {total} members active".
  4. The profile wrapper has `lg:sticky lg:top-4 lg:self-start`. The roster still stretches, with the Team total at its bottom. Mobile stacking is unchanged.
  5. Mobile focus: on stacked screens, picking a different member scrolls the wrapper into view. A pending-focus ref then makes an effect keyed on the selected member focus the new `motion.section` (`tabIndex={-1}`, `focus({preventScroll:true})`, guarded). Re-clicking the current member only scrolls; focus is not moved.
  6. Accessibility:
     - The selected roster button has `aria-current="true"` (aria-pressed is removed).
     - The roster buttons sit in `<ul aria-label="Team members">`/`<li>`.
     - The disclosure CaretDown has `aria-hidden`.
     - The no-orders `<ul>` is always rendered, with `hidden` plus a `hidden`/`flex` class. The class matters because Tailwind's `.flex` would otherwise override the `[hidden]` rule, which has the same specificity. This means `aria-controls` always points at an element that exists.
     - "Sort by" is a real `<label htmlFor={useId()}>`, and the select's aria-label is removed.
  7. All eyebrows now use `text-black`.
  8. Stale selection: rendering now clears a `selectedKey` whose member has left the rows. The fallback is the first member, and a member who returns is not re-selected.
- staffPerformanceMetrics.ts: `flagFor` uses the same 1e-9 tolerance as `formatPts`. A flag now needs a gap greater than 5 + 1e-9, in either direction. So "flagged" always means "shows ≥ 5.1".
- Tests: the styling assertion is removed, and aria-current and "members active" are updated. New page tests cover:
  - the grid and min-w-0 classes and the sticky profile;
  - the Team members list and the real label;
  - the consistent cancelled count;
  - "Ranked 1 of 2" with a hidden member, and "1 member had no orders";
  - the disclosure's aria-controls target and aria-hidden caret;
  - fallback on rerender with no re-selection when the member returns;
  - mobile scrollIntoView and focus (`matchMedia` is stubbed; `scrollIntoView` is shadowed on HTMLElement.prototype because setup.ts defines a read-only stub on Element.prototype);
  - eyebrow ink.
- Two new metrics tests: 11/20 against a 50% team is not flagged, and a 5.04 gap is still flagged.
- Red run: 13 failed | 43 passed (56). Green run: 56 passed (56).
- `npm test`: 246 files, 1677 passed. Lint: 0 errors (170 existing warnings). Build: OK. tsc grep: empty.

## Round 4 (final polish)
- Finding: `lg:sticky` on the profile probably never engages. The nearest overflow ancestor is `<main overflow-auto>` (DashboardLayout.tsx:167), but the document is what scrolls. The sticky classes are kept because they do no harm.
- Desktop fallback in `select()`:
  - It applies when matchMedia matches lg, the member is different, and `getBoundingClientRect().top < 0` on the profile wrapper.
  - It then calls `scrollIntoView({block:"start"})`, with smooth or auto behaviour following reduced motion. Focus is not moved.
  - It does nothing when the profile is in view, or when the user re-clicks the selected member.
  - scrollIntoView and getBoundingClientRect are guarded for jsdom.
  - Mobile behaviour is unchanged. Changing the sort never scrolls or moves focus, on either viewport.
- Roster rows at 375px:
  - The row is badge + a `flex-1 min-w-0 flex-wrap` cluster + a `shrink-0` value.
  - The cluster holds the name (`min-w-0 max-w-full truncate`) and the Former staff / High cancels tags, which wrap to a second line when needed.
  - The value keeps its width, and the cluster absorbs the rest.
- Profile at 375px:
  - Tile value is `text-[20px] sm:text-[24px]`, with `min-w-0 break-words [overflow-wrap:anywhere]`, and the tile has `min-w-0`.
  - Hero is `text-[32px] sm:text-[44px]` with `[overflow-wrap:anywhere]`, and its container has `min-w-0`.
  - The h3 name has `min-w-0 break-words [overflow-wrap:anywhere]`.
  - Desktop sizes are unchanged.
- Comments: StaffCharts' yield flag comment and the product-loss comparison in StaffTable now say they mirror flagFor's strict rule without its 1e-9 tolerance. Logic is unchanged.
- Tests:
  - The matchMedia restore now saves and reassigns the original.
  - A shared `withViewport` helper was added.
  - New desktop tests: scroll only when the profile is above the viewport; no focus move; no scroll when in view; re-click does nothing.
  - A sort test checks that neither viewport scrolls or moves focus.
  - A class check covers the wrapping roster row and the responsive hero.
- Red run: 2 failed | 57 passed (59). The sort test passed before the change; it is a regression guard. Green run: 59 passed (59).
- `npm test`: 246 files, 1680 passed. Lint: 0 errors (170 existing warnings). Build: OK. tsc grep: empty.

## Open risks
- The desktop fallback only fires when the profile's top is above the viewport. If the profile is below the fold (for example in a very short window), it does not scroll.
- Layout overflow at 375px is covered only by class assertions, because jsdom cannot measure layout. It still needs a manual check in a real browser.
- Outcome bars use exact % widths inside a flex row with 2px gaps and `min-w-[2px]`. Segments shrink slightly to fit, so the drawing is not pixel-exact (the style.width values are exact). This is the same trade-off as the old table.
- `formatPts` and `flagFor` share a 1e-9 tolerance, so the flag and the displayed gap always agree. A genuine gap in (5, 5 + 1e-9] is treated as not worse.
- The sticky profile can be taller than the viewport, so its lower cards scroll with the page as usual. The selected row can also scroll out of view in a very long roster.
- The selection is cleared during render (a React-supported state adjustment), which causes one extra render when the rows change.
- The `<span>` content inside the roster `<button>` includes a `role="img"` bar. Some screen readers treat button children as presentational, so the bar's aria-label may not be announced, though the text line is.
- The profile is re-keyed per member, so a scroll position inside the products table resets when the selection changes.
