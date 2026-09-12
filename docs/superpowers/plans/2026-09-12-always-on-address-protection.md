# Always-On Address Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require GPT-4o-mini to evaluate every public checkout address and related customer text before an order can be created.

**Architecture:** Keep fast deterministic checks for honeypots, known abuse, and duplicate/rate signals. After those checks, call the existing server-side OpenAI address validator for every order, using structured JSON. Block clear abuse, gibberish, fake/test content, and invalid addresses; hold uncertain addresses for review; allow only valid delivery addresses.

**Tech Stack:** Express, Node.js, Supabase, Upstash Redis, OpenAI Chat Completions with structured JSON, Vitest.

## Global Constraints

- `OPENAI_API_KEY` remains server-only in Merchant Suite Vercel.
- Production model is `gpt-4o-mini` through `ADDRESS_VALIDATION_MODEL`.
- The client never receives the model prompt, API key, or raw provider error.
- OpenAI unavailability fails closed with a retryable protection response.
- No order is created and no Purchase event is emitted before an allow decision.
- Existing `org_id`, hashed protection signals, review TTL, and Turnstile checks remain unchanged.

### Task 1: Expand address-validation output and prompt

**Files:**
- Modify: `server/addressValidation.js`
- Test: `src/test/addressValidation.test.ts`

- [ ] Add failing tests for `addressValid`, notes being included in the model input, and the `gpt-4o-mini` model.
- [ ] Run the focused address-validation tests and confirm the new assertions fail.
- [ ] Extend the normalized provider result and strict parser contract with `addressValid`.
- [ ] Update the prompt to classify every submitted address for deliverability, gibberish, fake/test content, harassment, and uncertainty.
- [ ] Keep the request limited to customer name, address, and notes; use structured JSON output.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Call AI for every order and map decisions safely

**Files:**
- Modify: `server/orderSubmissionProtection.js`
- Test: `src/test/orderSubmissionProtection.test.ts`
- Test: `src/test/orderProtectionContract.test.ts`

- [ ] Add failing tests proving a normal address calls AI, gibberish is blocked, abuse is blocked, uncertainty is reviewed, and AI downtime is retryably blocked.
- [ ] Run the focused protection tests and confirm they fail for the current vague-only behavior.
- [ ] Invoke address validation for every non-honeypot, non-obvious-hard-block order.
- [ ] Block when AI marks the address invalid, abusive, fake/test, or explicitly blocked.
- [ ] Hold when AI marks the address unclear or requests review, and allow only a valid low-risk result.
- [ ] Preserve deterministic Romanized Bangla abuse detection as a fast fallback.
- [ ] Add and assert the stable `address_invalid` reason code.
- [ ] Run all protection tests and confirm they pass.

### Task 3: Update runtime configuration and documentation

**Files:**
- Modify: `.env.example`
- Modify: `docs/runbooks/order-protection.md`

- [ ] Document `ADDRESS_VALIDATION_MODEL=gpt-4o-mini` as the production setting.
- [ ] Document that every order invokes address validation and that OpenAI downtime fails closed.
- [ ] Document the expected Vercel environment target and redeploy requirement.
- [ ] Run a repository search to ensure no storefront secret or client-side OpenAI key is introduced.

### Task 4: Verify and ship Merchant Suite

**Files:**
- No additional files.

- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Review the diff and commit with `feat: validate every order address with ai`.
- [ ] Push the branch, open a PR against `main`, and merge it after checks pass.
- [ ] Verify the production public order route returns a protection decision and does not create an order for gibberish or abusive input.
