# Approved District Filter Design

**Status:** Draft — pending user review (2026-09-17)

## Goal

Add a district filter dropdown to the Dashboard Approved tab showing how many approved orders come from each জেলা (district), so the team can filter approved orders by district.

## Scope

- Approved tab only. No other status tab gets the dropdown.
- The order's `address` field is never modified. AI output only feeds the filter map; order data stays exactly as entered.

## UI (section 1)

- New district `Select` in the Dashboard toolbar next to the warehouse filter, rendered only when the Approved tab is active.
- Composes with search + warehouse filters; changing it resets pagination.
- Options carry counts: `All districts (42)`, `Dhaka (18)`, `Gazipur (5)`, … with `Unknown (3)` last.
- While auto-detection is running, the dropdown shows a subtle `Detecting…` state; counts update when results land.

## Built-in matcher (section 2)

- New pure lib `src/lib/bdDistricts.ts`: all 64 districts with English + Bengali names, plus an area→district alias map for common thanas/areas (Dhanmondi/Mirpur/Uttara/Savar→Dhaka, Tongi→Gazipur, Keraniganj→Dhaka, etc.).
- Case-insensitive substring match on the order address; Bengali and English both handled.
- No match → `null` → Unknown bucket. Instant, free, offline, fully unit-tested.

## AI fallback, automatic (section 3)

- No button. When the Approved tab loads and contains unseen unknown addresses, the frontend dedupes them (cap 50 per call) and calls a new authenticated route `POST /api/orders/resolve-districts` with `{ addresses: string[] }`.
- Backend resolves the fixed Mango Lover BD workspace (`org_id` guard, no client-supplied tenant), checks the learned alias map first, and calls OpenAI only for truly new addresses.
- Model is env-configurable (`DISTRICT_MODEL=gpt-5.4-mini`, following the existing `ADDRESS_VALIDATION_MODEL` pattern), constrained to answer with one of the 64 district names or `unknown`. Falls back to `gpt-4o-mini` if the API rejects the configured model.
- Results merge into the learned alias map in `app_settings` (`{orgId}:district_aliases`, capped at 500 entries): district answers become new aliases, definitive unknowns are negative-cached so they are never re-sent.
- Each address text is AI-resolved at most once ever. Transient API failures are not cached; the tab retries on next visit and stays on Unknown meanwhile.
- No order row is written. The alias map is filter-only metadata.

## Edge cases

- Empty/missing address → Unknown, never sent to AI.
- Missing `OPENAI_API_KEY` → route returns resolved-from-cache only, no error toast; dropdown works on the built-in map.
- AI returns a non-district string → treated as unknown and negative-cached.
- Alias map full → oldest learned entries evicted, built-in map unaffected.

## Testing

- Matcher unit tests: English, Bengali, area alias (Dhanmondi→Dhaka, Tongi→Gazipur), no-match→null, empty→null.
- Wiring test: dropdown renders only in Approved view, absent elsewhere.
- Server tests: auth required, org guard, cache-hit makes no OpenAI call, alias merge + negative cache, model fallback, failure keeps Unknown.
- Run focused tests, full Vitest suite, lint, production build before completion.

## Non-goals

- No address rewriting or order mutation of any kind.
- No district filter on other tabs.
- No new DB table or column (aliases live in `app_settings`).
- No storefront or public-API change.
