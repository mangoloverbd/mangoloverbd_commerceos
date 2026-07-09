# Customer Marketing Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add campaign-ready customer segments, lifecycle stages, and CSV bulk export to the Customers page.

**Architecture:** Customer lifecycle and campaign labels are derived in `server/customers.js` so every caller receives consistent funnel intelligence from `/api/customers`. The React page adds segment filtering and client-side export without adding schema or new backend routes.

**Tech Stack:** Express ESM, React 18 + TypeScript, Vitest, existing `apiFetch()`.

---

### Task 1: Customer Funnel Classification

**Files:**
- Modify: `server/customers.js`
- Test: `src/test/customers.test.ts`

- [ ] Add failing tests expecting `lifecycleStage` and `campaignSegments` on aggregated customers.
- [ ] Run `npm test -- src/test/customers.test.ts` and confirm the new expectations fail.
- [ ] Implement lifecycle and campaign derivation in `server/customers.js`.
- [ ] Re-run the targeted test and confirm it passes.

### Task 2: Bulk Export Helper

**Files:**
- Create: `src/lib/customerExport.ts`
- Test: `src/test/customerExport.test.ts`

- [ ] Add a failing test for CSV header, escaping, taka values, lifecycle stage, and campaign segment labels.
- [ ] Run the targeted test and confirm the module is missing or behavior fails.
- [ ] Implement `buildCustomerExportCsv()`.
- [ ] Re-run the targeted test and confirm it passes.

### Task 3: Customers Page UI

**Files:**
- Modify: `src/pages/Customers.tsx`
- Test: `src/test/customersPageRouting.test.ts`

- [ ] Add static tests proving the page imports export helper, filters by campaign segments, displays lifecycle, and exposes export action.
- [ ] Run the targeted test and confirm the new expectations fail.
- [ ] Add campaign segment filter tabs/chips, lifecycle display, and filtered CSV download button.
- [ ] Re-run the targeted test and confirm it passes.

### Task 4: Verification

**Files:**
- Existing tests only

- [ ] Run targeted customer/export tests.
- [ ] Run `npm run build`.
- [ ] Report any unrelated failures clearly.

