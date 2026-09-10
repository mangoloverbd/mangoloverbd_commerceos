# BulkSMSBD Delivery Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make automated BulkSMSBD messages deliver reliably from Merchant Suite.

**Architecture:** Keep the existing org-scoped settings and SMS triggers. Add a BulkSMSBD-specific phone formatter that converts the internally validated `01XXXXXXXXX` format to the gateway-required `8801XXXXXXXXX` format. Await the gateway request and classify its JSON `response_code`, accepting only `202` as submission success while preserving order-operation success when SMS itself fails.

**Tech Stack:** Node.js 20, Express, native `fetch`, Vitest.

## Global Constraints

- Never log or expose API keys.
- Preserve `normalizeBdPhone()` behavior for FraudShield and courier APIs.
- BulkSMSBD response code `202` is the only successful submission response.
- SMS failures must be observable but must not roll back a successfully-created or dispatched order.
- Do not change Supabase schema or settings key names.

---

## Task 1: Add failing BulkSMSBD behavior tests

**Files:**
- Modify: `src/test/sendBulkSms.test.ts`

- [x] Add tests that assert the server source contains a BulkSMSBD `880` phone conversion, awaits the gateway response, and checks `response_code === 202` rather than logging every response as successful.
- [x] Run `npm test -- src/test/sendBulkSms.test.ts` and confirm the new assertions fail against the current helper.

## Task 2: Fix the SMS helper

**Files:**
- Modify: `server/index.js:758-807`
- Modify: `src/test/sendBulkSms.test.ts`

- [x] Convert the existing validated local phone to `880${phone.slice(1)}` only inside `sendBulkSms`.
- [x] Replace fire-and-forget fetch handling with an awaited request and safe response parsing.
- [x] Log a success only for response code `202`; log the gateway response code/message for failures without including credentials.
- [x] Keep the helper defensive: missing settings, template, or invalid phone return without calling the gateway; gateway failures are caught and do not throw into order routes.
- [x] Run the focused test and confirm it passes.

## Task 3: Verify

- [x] Run `npm test`.
- [x] Run `npm run lint && npm run build`.
- [x] Run `git diff --check` and confirm no secret values were added.
- [x] Commit the implementation and tests with `fix: make BulkSMSBD delivery reliable`.
