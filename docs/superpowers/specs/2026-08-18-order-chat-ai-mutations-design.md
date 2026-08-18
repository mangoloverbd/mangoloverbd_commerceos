# Order Chat AI Mutations — Design

Date: 2026-08-18
Status: Approved by user (brainstorming complete)

## Goal

Extend the existing Order Chat (`src/pages/OrderChat.tsx` + `POST /api/order-chat`) so an admin merchant can ask the AI to **mutate** business data — e.g. "add 50 stock to M size for Cocoa Brown Trouser" — and the AI proposes a structured action that the merchant confirms before it is applied. Team members keep today's read-only chat.

Mutation domains (v1): products (core fields), product variants / stock, orders (status / notes), courier dispatch (Steadfast + Pathao), FraudShield phone checks, and product creation.

## Context

- `POST /api/order-chat` (`server/index.js:4331`) is read-only today: it loads orders / products / variants / inbox orders into a system prompt and streams a text answer. No tools, no mutations.
- Mutation endpoints already exist, are auth-guarded, and org-scoped: `PATCH /api/products/:id` (`:9591`), `PATCH /api/products/:id/variants/:variantId` (`:10001`), `PATCH /api/orders/:id`, `POST /api/send-to-courier`, `POST /api/send-to-pathao`, `POST /api/check-fraud`, `POST /api/products/save` (`:9148`).
- Multi-tenancy is enforced manually in every handler via `.eq("org_id", orgId)` (AGENTS.md §4). Auth helpers: `getToken(req)` → `getUser(token)` → `getUserOrg(supabase, user.id)` → `{ orgId }`.
- `extractResponsesText` / `parseJsonObject` / `parseOpenAIError` helpers already exist (`server/index.js:3597`, `:3622`, `:422`). `rateLimitAI` middleware is applied to AI routes.
- Existing chat stream parses `data: { choices: [{ delta: { content } }] }` and `data: [DONE]` lines (`src/pages/OrderChat.tsx:26`).
- Design tokens (AGENTS.md §8): `#FAFAF8` background, borderless panels, Phosphor icons `weight="light"`, Geist Sans, `PopButton`. No new design tokens.

## Decisions

1. **Confirm before apply.** The AI proposes structured action cards; the merchant clicks Apply / Reject. The server never mutates from the model's tool call directly — the browser must POST to a separate `/api/order-chat/apply` endpoint, which re-validates auth, admin role, and org scope.
2. **Admin only.** The server attaches `tools` to the Responses API call only when the resolved `user_roles.role === "admin"`. Team members get no tools and never see action cards. Enforced server-side; the frontend cosmetic guard is secondary.
3. **OpenAI function-calling** (`tools` with `strict: true`) — not freeform JSON in text. Gives validated, structured params and native multi-action (several `function_call` items in one response).
4. **`ask_user` tool** for clarifications. When the request is ambiguous (multiple products match a name, or add-vs-set is unclear), the model calls `ask_user` instead of a mutation tool. Renders an in-chat approval card; merchant answers; model resumes.
5. **Multiple actions per turn** allowed. One user message can yield text + N action cards + a clarification, all rendered in order.
6. **Audit log.** New `ai_action_log` table captures every applied mutation (`before` / `after` snapshots, actor, tool, args, `call_id`). Data capture in v1; a browser UI for it is out of scope.
7. **No delete tools in v1.** Model declines delete requests in text and points the merchant to the Products page. `ai_action_log.before_snapshot` enables a future undo.
8. **Courier dispatch capped at 25 orders/call.** System prompt requires the model to name each order number in its reasoning; the action card lists them.

## Architecture

```
Browser (OrderChat.tsx)
   │ 1. POST /api/order-chat  { messages, model }
   ▼
Express  ── resolves user + org + role; loads orders/products/variants/inbox (existing code)
   │ 2. If admin: calls OpenAI Responses API with `tools: [...AI_ACTION_TOOLS, ask_user]`
   │    If team: calls Responses API with no tools (today's behavior)
   ▼
OpenAI returns output[]:  mix of { type:"message", text } and { type:"function_call", name, arguments, call_id }
   │ 3. Server does NOT execute function calls.
   ▼
Express streams SSE back to browser — three event types plus the [DONE] terminator:
     • data: { delta: { content } }                                       → assistant text (as today)
     • data: { question: { call_id, questions } }                         → render AiClarifyCard
     • data: { action: { call_id, tool, recommendation, alternatives } }  → render AiActionCard
     • data: [DONE]                                                       → stream end
   │
   ▼ 4. Merchant reviews card(s). Applies one, several, or all; or rejects.
Browser  ── POST /api/order-chat/apply  { call_id, tool, args }
   ▼
Express  ── re-resolves user, checks role === "admin", checks org_id,
   │        calls executeAiAction(tool, args, { orgId, supabase, userId })
   │        which reuses extracted mutation functions (applyProductPatch, applyVariantPatch, …)
   │        reuses the same .eq("org_id", orgId) scoping. Writes one row to ai_action_log.
   ▼
Browser receives { ok, before, after } → card flips to "Applied ✓" with diff.
   │ 5. Browser re-calls /api/order-chat with prior messages + a synthetic
   │    function_call_output so the model writes a short natural confirmation.
   ▼
Assistant: "Done — M size for Cocoa Brown Trouser is now 62 (was 12)."
```

Key safety properties:

- **Server is the only mutator.** The browser calls only `/api/order-chat/apply`; it never calls `PATCH /api/products/...` directly for AI actions.
- **`canMutate` is server-side.** Tools are attached iff admin. The `apply` route 403s any non-admin caller regardless of what the client claims.
- **Stateless propose→apply.** The `call_id` from OpenAI is the correlation key. The apply payload is `{ call_id, tool, args }` — args are the exact JSON the model produced. The server re-derives `orgId` / `userId` / `role` fresh on apply, so a stale card from a logged-out session cannot mutate.
- **Org isolation on apply.** `get*ForAudit` readers filter `.eq("org_id", orgId)`; a cross-org UUID → 404 before any mutation. Tested explicitly.

## Tool schemas

Seven tools attached to the Responses API call when `canMutate`. All `strict: true` so OpenAI guarantees exact params.

- **`update_product`** — `product_id` + `fields` (name, selling_price, compare_at_price, cog, stock_quantity [only when no variants], published). Maps to `applyProductPatch`.
- **`update_variant`** — `product_id` + `variant_id` + `fields` (stock_quantity, cog, price_adjustment, attributes). Maps to `applyVariantPatch`. This is the "add 50 to M size" tool.
- **`update_order`** — `order_id` + `fields` (status [pending|confirmed|cancelled], fulfillment_status, notes). Maps to `applyOrderPatch`.
- **`dispatch_to_courier`** — `courier` [steadfast|pathao] + `order_ids` (array, 1–25). Maps to `dispatchToSteadfast` / `dispatchToPathao`.
- **`check_fraud`** — `phones` (array, 1–50). Server runs each through `normalizeBdPhone()` before `runFraudCheck` (AGENTS.md §12 rule 7).
- **`create_product`** — `name` + optional (description, selling_price, compare_at_price, cog, stock_quantity, published, variants[]). Maps to `createProductWithVariants`.
- **`ask_user`** — `questions` (array, 1–5) of `{ q, type [radio|check], options[2–6] }`. Does not mutate; streams a `question` SSE event. The merchant's answer is returned as `function_call_output` on the next Responses call so the model resumes.

IDs, not names: every mutation tool takes UUIDs from the PRODUCTS & STOCK / ORDERS context already injected. The model resolves "Cocoa Brown Trouser / M" → UUID by matching against context. If the name is ambiguous, the model is instructed to call `ask_user` first.

`stock_quantity` on `update_variant` is the **absolute** new value (matches the existing PATCH endpoint). System prompt instructs: for "add N", compute `current + N` from the context and emit the absolute result, and state the arithmetic in reasoning. The action card surfaces "was X, +N → Y" so the merchant catches mistakes.

## Backend changes (server/index.js)

1. **Extract mutation handler bodies into pure functions.** Today the logic lives inside route closures. Extract the post-auth/post-org body of each mutation endpoint into a reusable async function: `applyProductPatch`, `applyVariantPatch`, `applyOrderPatch`, `dispatchToSteadfast`, `dispatchToPathao`, `runFraudCheck`, `createProductWithVariants`. Each takes `{ supabase, orgId, …ids, patch/payload }` and returns the mutated row(s). The existing routes become thin wrappers: resolve auth + org, call the function, return JSON. No behavior change. This is the bulk of the server work and is mechanical.

2. **`executeAiAction({ supabase, orgId, userId, tool, args })` dispatcher.** `switch (tool)` → calls the matching extracted function. Before mutating, calls a `get*ForAudit` reader (`.select().eq("org_id", orgId).maybeSingle()`) to snapshot `before` and to 404 if the target row is missing or in another org. Returns `{ before, after }`. Throws on unknown tool.

   > **Helper note:** the existing `getUserOrg(supabase, userId)` returns `{ orgId }`. Add a thin `getUserOrgAndRole(supabase, userId)` (or extend `getUserOrg` to also select `role`) returning `{ orgId, role }`. Used by the `/apply`, `/answer`, and modified `/api/order-chat` routes. The existing `getUserOrg` callers keep working.

3. **`buildRecommendation(tool, args, { products, orders, variantsMap })`** — server-side helper that turns a model function call into the card payload. For `update_variant` with stock change, returns a primary recommendation (add interpretation, signal 3, green) and one alternative (set/replace interpretation, signal 1, orange). For tools with no natural alternative (`update_order`, `check_fraud`), returns `alternatives: []`. The summary string includes the resolved product/variant/order name and the "was X → Y" delta.

4. **Modify `POST /api/order-chat`** (`server/index.js:4331`):
   - After `getUserOrg`, also fetch `user_roles.role`. Set `canMutate = (role === "admin")`.
   - When `canMutate`, add `tools: [...AI_ACTION_TOOLS, askUserTool]` to the Responses payload.
   - Parse `data.output[]` by `item.type`: `"message"` → emit `{ delta: { content } }`; `"function_call"` with `name === "ask_user"` → emit `{ question: { call_id, questions } }`; any other `function_call` → emit `{ action: { call_id, tool: name, ...buildRecommendation(...) } }`. Then `[DONE]`.
   - Team-member path: no tools, behavior unchanged.

5. **New `POST /api/order-chat/apply`** (admin-only, `rateLimitAI`):
   - Resolve user + org + role; 401 / 403 if not admin.
   - Body: `{ call_id, tool, args }`. Validate `tool` against `AI_ACTION_TOOLS` allowlist (400 on unknown).
   - `const { before, after } = await executeAiAction({ supabase, orgId, userId, tool, args });`
   - Insert into `ai_action_log` (`call_id`, `org_id`, `user_id`, `tool`, `args`, `before_snapshot`, `after_snapshot`, `applied_at`).
   - Return `{ ok: true, before, after }`. Errors → 500 with `errorMessage(e)`.

6. **New `POST /api/order-chat/answer`** (admin-only, `rateLimitAI`):
   - Body: `{ call_id, answers, priorMessages }`. `answers` is an array of `{ q, type, selected:[indices], custom?: string }`.
   - Build a `function_call_output` string from the answers, re-call the Responses API with the prior messages + the output + tools attached, and stream the resumed turn back to the browser using the same SSE shape as `/api/order-chat`.

7. **System prompt additions** (only when `canMutate`):
   ```
   You can also MUTATE data by calling tools. Mutation rules:
   - If a request is ambiguous (multiple products match a name, or add-vs-set is unclear), call ask_user FIRST. Never guess.
   - For "add N stock", compute current + N from the PRODUCTS & STOCK context and emit the absolute value in fields.stock_quantity. Always state the arithmetic in your reasoning.
   - Never call a mutation tool in the same turn as ask_user.
   - After a mutation is applied (you'll receive function_call_output), write a one-line confirmation: what changed, before → after.
   - For dispatch_to_courier, name each order number in your reasoning before calling the tool. Max 25 per call.
   ```

## Database

New table `public.ai_action_log` (Supabase migration via the `supabase` skill before writing SQL):

```sql
create table if not exists public.ai_action_log (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  user_id         uuid not null,
  call_id         text not null,
  tool            text not null,
  args            jsonb not null,
  before_snapshot jsonb,
  after_snapshot  jsonb,
  applied_at      timestamptz not null default now()
);
create index if not exists ai_action_log_org_applied_idx
  on public.ai_action_log (org_id, applied_at desc);
alter table public.ai_action_log enable row level security;
-- Service role bypasses RLS (existing pattern). No public policies in v1.
```

`ai_action_log` is write-only from the backend (service role). No frontend reads it in v1.

## Frontend changes

New files under `src/components/order-chat/`:

1. **`useAiChatStream.ts`** — replaces the inline `streamChat` in `OrderChat.tsx`. Same SSE reader/decoder loop, but fans parsed events into a `StreamEvent` union: `{ delta }`, `{ question }`, `{ action }`, done. Returns a `send({ messages, model, signal, onEvent, onDone, onError })` callback.

2. **`AiClarifyCard.tsx`** — ports the `ApprovalCard` interaction: one question at a time, radio auto-advances, check toggles, custom-text field, pager dots + prev/next + send arrow, "Answers sent" green badge with "Start over". Props: `{ questions, status, onSubmit(answers), onDismiss }`. Token port per AGENTS.md §8:
   - `bg-white`, `text-black`, `border-black/[0.08]`, `bg-black/[0.04]` hover, `text-black/60` / `text-black/40`.
   - `rounded-[14px]`, `shadow-sm`, `p-3.5`, footer `border-t border-black/[0.06] bg-[#FAFAF8]`.
   - Icons: Phosphor `Check`, `CaretLeft`, `CaretRight`, `ArrowUp`, `X` (`weight="light"`).
   - Animations: existing `fade-up` / `pop-in` keyframes (already used in `OrderChat.tsx`).
   - Success badge: `bg-status-lime-background text-status-lime-text` + `Check` in `bg-status-lime-text` circle.

3. **`AiActionCard.tsx`** — ports the `RecommendationCard` interaction: primary recommendation body, confidence meter (3 bars), Alternatives drawer (grid-rows transition), Accept + Reject buttons, applied state with `before → after`. Props: `{ tool, recommendation, alternatives, status, before, after, onApply(args), onReject }`. Token port:
   - Meter tones: `bg-status-lime-text` (green), `bg-status-yellow-text` (orange), `bg-black/40` (ink).
   - Buttons: `PopButton` (existing). Accept → `color="blue"`; Reject → `color="default"`.
   - Applied badge: same green shape as AiClarifyCard's success badge.
   - When `alternatives.length === 0`, the Alternatives button is hidden (`update_order`, `check_fraud`).

Modifications to `src/pages/OrderChat.tsx`:

- Replace `streamChat` with `useAiChatStream`.
- Extend the `Msg` union:
  ```ts
  | { role: "user" | "assistant"; content: string; image?: string; at?: number; model?: string }
  | { role: "assistant"; kind: "clarify"; call_id: string; questions: ClarifyQuestion[]; status: "pending" | "answered" | "collapsed"; at?: number }
  | { role: "assistant"; kind: "action"; call_id: string; tool: string; recommendation: Recommendation; alternatives: Recommendation[]; status: "pending" | "applied" | "rejected"; before?: unknown; after?: unknown; at?: number }
  ```
- In `send`, route stream events: `delta` appends to a trailing text assistant message (as today); `question` / `action` append a new `kind` message.
- Render branch in the messages map: `kind === "clarify"` → `<AiClarifyCard>`; `kind === "action"` → `<AiActionCard>`; else existing text/image render.
- `handleApply(msg, args)` — POST `/api/order-chat/apply`; on success set `status: "applied"`, `before`, `after`; trigger a final `/api/order-chat` call with prior messages + synthetic `function_call_output` so the model writes the confirmation.
- `handleClarifyAnswer(msg, answers)` — POST `/api/order-chat/answer`; stream the resumed turn into messages.
- `handleReject(msg)` — set `status: "rejected"`; append a synthetic user note so the model can move on.
- `useUserRole()` (existing): if not admin, show a "AI mutations are admin-only" hint in the composer and skip rendering `AiClarifyCard` / `AiActionCard`. Server is the real gate.

`src/components/OrderChatComposer.tsx`: cosmetic-only — hides the mutation affordance hint for team members. No functional change.

Quick questions (`OrderChat.tsx:102`): add `"Add 50 stock to M size of Cocoa Brown Trouser"` for admins; filtered by role.

## Testing

**Backend unit tests** (Vitest, `src/test/`):
- `applyVariantPatch` — normalizes attributes, clamps stock ≥ 0, rejects unknown ids, returns updated row.
- `applyProductPatch` / `applyOrderPatch` — same shape.
- `buildRecommendation` — `update_variant` stock change produces primary (add, signal 3, green) + alt (set, signal 1, orange); `update_order` produces `alternatives: []`.
- `executeAiAction` — dispatches correctly; throws on unknown tool; throws when target row missing in org.
- `parseJsonObject` on model arguments — well-formed JSON, fenced JSON, empty string.

**Backend integration tests** (Express):
- `POST /api/order-chat/apply` — 401 without token, 403 for team_member, 400 missing `call_id`/`tool`, 400 unknown tool, 200 + audit row for admin.
- `POST /api/order-chat/answer` — same auth matrix, streams back SSE.
- **Org isolation:** admin A's `call_id` + target UUID submitted by admin B → 404 (row not in B's org).
- `POST /api/order-chat` — admin request body includes `tools`; team-member request body does not.

**Frontend component tests** (`@testing-library/react`):
- `AiClarifyCard` — radio auto-advances, check toggles, pager dots reflect state, custom text disables radio, submit fires `onSubmit`, dismiss fires `onDismiss`, "Answers sent" badge after submit.
- `AiActionCard` — primary renders, Alternatives drawer opens/closes, selecting alt promotes to primary, Accept fires `onApply`, Reject fires `onReject`, applied state shows `before → after`, error toasts and stays pending, no-alternatives hides button.
- `OrderChat` — mocked stream emitting `delta` + `action` → text + card render; mocked `/apply` success → card flips; team-member path skips cards.

**Manual QA** (`qa` skill pre-ship): end-to-end "add 50 stock to M size of Cocoa Brown Trouser" → clarify card if ambiguous → recommendation card with add-vs-set alternatives → accept → "Applied ✓ M: 12 → 62" → model confirmation "Done — M is now 62 (was 12).".

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Forged apply (client sends a tool the model never proposed) | `AI_ACTION_TOOLS` allowlist on apply route → 400. Args re-validated server-side. |
| Stale card (target row changed/deleted since proposal) | `get*ForAudit` returns null → 404 before mutating. `before` snapshot captured at apply time. |
| Cross-tenant apply (forged UUID from another org) | `get*ForAudit` filters `.eq("org_id", orgId)` → 404. Re-validated every apply. |
| AI mis-resolves a name shared by two products | `ask_user` tool + "never guess" system-prompt rule. Action card shows the resolved name. |
| Add-vs-set arithmetic mistake | Recommendation card shows "was X, +N → Y" with a "set to N (replace)" alternative. Merchant picks. |
| Bulk courier dispatch | Tool capped at 25/call; prompt requires naming each order; card lists them. |
| OpenAI cost / latency | Same 500-order / 8k-char caps as today. `strict: true` bounds output. `rateLimitAI` in place. |
| Refactor breaks existing endpoints | Mechanical extraction; `npm test` + `npm run build` after refactor, before AI layer. |
| `ai_action_log` unbounded growth | Indexed by `(org_id, applied_at desc)`. Cleanup cron out of scope for v1. |

## Out of scope (v1)

- Audit-log browser UI (`/admin/ai-actions` or a Products-page filter). Table captures data only.
- Undo button on applied cards (`before_snapshot` enables it later).
- Delete tools (`delete_product`, `delete_variant`). Model declines in text.
- Streaming the resumed confirmation turn (short; rendered in one shot).
- Feature flag. Admin-only is the gate; rollout is a single PR. Rollback = revert.

## Verification

1. `npm test` — unit + integration + component tests green.
2. `npm run lint` and `npm run build` — clean.
3. `supabase` skill confirms `ai_action_log` table exists with RLS enabled.
4. Manual end-to-end on localhost (admin): the stock-update example flows through clarify → recommend → apply → confirm.
5. Manual check (team member): chat is read-only, no cards render, `/apply` and `/answer` return 403.
6. `review` skill pre-landing — SQL safety, auth gaps, org_id isolation (AGENTS.md §12 rules 2, 3).
7. `verification-before-completion` — final green build.
8. `ship` skill — PR against `main`.

## Rollout order

1. Extract mutation handler bodies → pure functions. `npm test && npm run build`.
2. Add `ai_action_log` table (Supabase migration).
3. Add `executeAiAction` + tool schemas + `buildRecommendation`. Unit tests.
4. Modify `/api/order-chat` (tools for admin, stream `question`/`action`). Integration tests.
5. Add `/api/order-chat/apply` + `/api/order-chat/answer`. Integration tests incl. org isolation.
6. Build `useAiChatStream`, `AiClarifyCard`, `AiActionCard`. Component tests.
7. Wire into `OrderChat.tsx`; update quick questions. Component test for stream fan-out.
8. `qa` skill — manual end-to-end.
9. `review` skill — pre-landing.
10. `verification-before-completion` — final green build.
11. `ship` skill — PR.
