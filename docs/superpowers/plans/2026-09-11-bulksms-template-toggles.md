# Bulk SMS Template Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add independent on/off controls for confirmation and dispatch SMS templates while preserving current behavior for existing accounts.

**Architecture:** Store `bulksms_confirmation_enabled` and `bulksms_dispatch_enabled` in the existing org-prefixed `app_settings` key-value store. The settings component loads and saves both values, and `sendBulkSms(orgId, type, order)` enforces the matching value for every existing SMS workflow. Missing values are treated as enabled.

**Tech Stack:** React 18, TypeScript, Radix Switch, Express, Supabase app_settings, Vitest.

## Global Constraints

- Keep `bulksms_enabled` as the master switch.
- Use the exact keys `bulksms_confirmation_enabled` and `bulksms_dispatch_enabled`.
- Treat a missing per-template setting as enabled for backward compatibility.
- Enforce flags in `sendBulkSms`, not separately in order or courier routes.
- Keep settings org-scoped through the existing authenticated settings API.
- Use `apiFetch()` for frontend API calls and preserve existing BulkSMSBD handling.

---

## Task 1: Add failing regression tests

**Files:**
- Modify: `src/test/sendBulkSms.test.ts`
- Modify: `src/test/bulkSmsSettingsUI.test.tsx`

**Interfaces:** The backend test checks `server/index.js` wiring. The UI test uses the existing `/api/settings` mock and verifies switches plus the POST payload.

- [ ] Add a backend test requiring both new keys, matching `confirmation` and `dispatch` branches, and a `=== "false"` early-return guard.
- [ ] Update the UI mock to return both flags as `true`; import `fireEvent` and `waitFor`.
- [ ] Assert both accessible switches render checked, toggle confirmation off, click Save, and observe `bulksms_confirmation_enabled: "false"` plus `bulksms_dispatch_enabled: "true"` in the POST body.
- [ ] Run `npm test -- src/test/sendBulkSms.test.ts src/test/bulkSmsSettingsUI.test.tsx`; confirm the new assertions fail before implementation.
- [ ] Commit with `git add src/test/sendBulkSms.test.ts src/test/bulkSmsSettingsUI.test.tsx && git commit -m "test: cover Bulk SMS template toggles"`.

## Task 2: Enforce flags in the SMS helper

**Files:**
- Modify: `server/index.js:758-807`

**Interfaces:** `sendBulkSms(orgId, type, order)` continues to return early without gateway submission when the matching setting is disabled.

- [ ] Add `${orgId}:bulksms_confirmation_enabled` and `${orgId}:bulksms_dispatch_enabled` to the existing `getSettings` key list.
- [ ] After the global `bulksms_enabled` guard, select the matching flag with `type === "confirmation"` and `type === "dispatch"`; treat unknown types as disabled.
- [ ] Return when the selected flag is exactly `"false"`; missing and empty values remain enabled.
- [ ] Run `npm test -- src/test/sendBulkSms.test.ts` and confirm it passes.
- [ ] Commit with `git add server/index.js src/test/sendBulkSms.test.ts && git commit -m "feat: add Bulk SMS template controls"`.

## Task 3: Add settings UI controls and persistence

**Files:**
- Modify: `src/components/BulkSmsSection.tsx:17-157`
- Modify: `src/test/bulkSmsSettingsUI.test.tsx`

**Interfaces:** The component consumes the existing `/api/settings` response and produces the two new fields in POST `/api/settings`.

- [ ] Add `bulkSmsConfirmationEnabled` and `bulkSmsDispatchEnabled` state, both initialized to `true`.
- [ ] Load each state with `data.settings[key] !== "false"`, preserving enabled behavior when a key is absent.
- [ ] Add both boolean states as `.toString()` values to the existing save payload.
- [ ] Render an accessible Switch beside each template label with IDs `bulksms-confirmation-enabled` and `bulksms-dispatch-enabled`.
- [ ] Run `npm test -- src/test/bulkSmsSettingsUI.test.tsx` and confirm the UI tests pass.
- [ ] Commit with `git add src/components/BulkSmsSection.tsx src/test/bulkSmsSettingsUI.test.tsx && git commit -m "feat: add Bulk SMS template toggles"`.

## Task 4: Full verification

- [ ] Run `npm test -- --hookTimeout=30000`; expect zero failures.
- [ ] Run `npm run lint`; expect zero errors, allowing existing warnings.
- [ ] Run `npm run build`; expect a successful production bundle.
- [ ] Run `git diff origin/main...HEAD --check` and `git status --short --branch`; confirm no secrets, raw frontend `fetch`, arbitrary org IDs, or unrelated files were added.
