# TODOS

## Audit infrastructure

### Add transactional audit persistence or a durable outbox

**What:** Make business mutations and detailed audit intent commit atomically, then deliver audit rows reliably.

**Why:** The approved implementation writes detailed activity after a successful mutation, so a process crash or interruption in that gap can leave a business change without a detailed event.

**Context:** `feat/detailed-order-audit` intentionally preserves existing mutation routes and treats detailed writes as best-effort so audit failures do not cause retries of successful business writes. If compliance or stronger guarantees become necessary, compare per-mutation PostgreSQL RPCs with a transactional outbox. Preserve cancellation/addition intent, define retry/idempotency semantics, and migrate incrementally.

**Effort:** XL
**Priority:** P3
**Depends on:** Adoption evidence or a requirement for gap-free audit durability

## Completed
