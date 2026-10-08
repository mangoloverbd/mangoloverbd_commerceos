# Audit — abandoned-editor-actions

## Files changed
1. `src/pages/AbandonedDetail.tsx` (modified)
2. `src/components/order-editor/CartPanel.tsx` (modified)
3. `src/test/abandonedDetail.test.tsx` (modified)

(No server files touched. `button.tsx` not touched. No commits.)

## src/components/order-editor/CartPanel.tsx
- New optional prop `actions?: ReactNode` (type-only `ReactNode` import added).
- `{actions ?? <original status-select / Save / Cancel grid>}`: when `actions` is passed, it replaces the whole bottom action row, right under Final total and the error line, inside the sticky bottom block. When it is not passed, the markup is byte-identical to before, so other callers are unchanged.

## src/pages/AbandonedDetail.tsx
- State: `target` ("keep" | "pending" | "on_hold" | "approved", default "keep"), `holdDetails`, `dismissOpen`. Refs: `busyRef` (synchronous double-submit guard) and `customerPanelRef`.
- `isDirty` useMemo compares customer (trimmed name/address, digits-only phone), the effective delivery rate, and cart lines against `checkout`.
- `persistEdits(): Promise<boolean>` is the old `save()` with the same validation, PATCH, cache update, and 404/409 → toast + goBack. It does not toast success or toggle `saving`.
- `submit()`: bails if `busyRef`/`saving` is set. keep → persistEdits + "Checkout updated". Otherwise: hold validation (`validateOrderHoldDetails`) or name/address required for approval → persistEdits only if dirty → POST `/convert` (hold fields null unless on_hold). On 404: toast "Checkout is no longer active" + goBack. On 409 or any other error: the server `error` is shown inline (fallback "Could not move checkout"), with " Your edits were saved." appended when the PATCH ran, and the page stays open. On success: remove from the abandoned cache (activeCount - 1), toast `Order #N moved to Pending|On Hold|Approved`, goBack.
- `dismiss()`: busy-guarded. PATCH `{ action: "dismissed", activity_group_id }`, remove from cache, toast, goBack. Its PATCH treats 404/409 as "no longer active"; other failures → toast "Could not dismiss checkout".
- Placement: the action block is passed to CartPanel through `actions`, so it sits in the cart column under the totals. The earlier full-width bar is gone. Root `data-testid="abandoned-action-bar"`, `mt-2 flex flex-col gap-2`. Contents:
  - "Status after save" label.
  - One pill group (`grid grid-cols-4 gap-1 rounded-[10px] bg-black/[0.04] p-1`, role=group, aria-label "Move checkout to") with 4 aria-pressed buttons: Abandoned / Pending / On hold / Approved (`h-8 rounded-[6px]`; selected is white with a ring).
  - OrderHoldFields when On hold is selected.
  - `role="alert"` error.
  - Button row: Dismiss (`BuiButton variant="danger" size="medium"`, `rounded-[6px]`) on the left, then `ml-auto` Cancel (ghost, `rounded-[6px]`) and the primary black button (`rounded-[6px]`, label "Save changes" or "Save & move to <option label>").
- CartPanel receives `error={undefined}` and no-op `onSave`; the error shows only in the block.
- Cmd/Ctrl+Enter submits. It is ignored while saving, while the dismiss dialog is open, on key repeat, and when focus is inside the CustomerPanel wrapper (its edits stay local until Apply).
- Dismiss AlertDialog: the confirm button's accessible name is its visible text "Dismiss checkout" (the aria-label was removed). "Keep checkout" and "Dismiss checkout" both get `rounded-[6px]`. When dirty, the description appends " Your unsaved changes will be lost."
- Radius overrides work because BuiButton merges className with `cx` (extended tailwind-merge) and the dialog buttons use `cn` (tailwind-merge).

## src/test/abandonedDetail.test.tsx
- The 10 original tests are unchanged. 10 new tests sit in a `move-to action bar` describe: default Abandoned + save in place; Approved with no edits → convert only; edit + Pending → PATCH then POST; On hold without a reason is blocked; convert 400 after edits shows "Your edits were saved"; Ctrl+Enter in the customer form sends nothing; 409 shows the server error and stays; On hold with a reason sends hold_reason_code; Pending sends null hold fields; dismiss dialog warning + PATCH body.
- The Ctrl+Enter test was mutation-checked: with the customer-panel guard removed it fails ("expected 1 to be +0"). The guard was then restored.

## Rulings
- Ruling: the button label uses the option label ("Save & move to On hold") and the toast uses "On Hold" — both come from the plan — cost if wrong: a copy tweak.
- Ruling: when `actions` is passed, the whole CartPanel action row is replaced, including the status select slot. The only caller uses hideOrderSections, and keeping an empty grid would add stray spacing — cost if wrong: a future caller wanting both would need a small tweak.
- Ruling: a catch-all in submit/dismiss handles network errors — cost if wrong: none.

## Results (final)
- Targeted: 20/20 passed.
- Full suite: 246 files / 1690 tests passed (baseline 246 / 1680; +10 new tests). One mid-task full run showed 1 intermittent failure under heavy load; it did not reproduce on the next two runs.
- eslint on the 3 files: exit 0.
- tsc (`-p tsconfig.app.json`): 64 errors in total, 0 in touched files. All are in untouched files.

## Open risks
- If convert fails after edits were saved, the checkout stays in Abandoned with the edits applied. This is the intended behaviour, and the message says so.
- `isDirty` compares lines by index. Line reordering is not possible in this UI.
