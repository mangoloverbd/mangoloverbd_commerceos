# Meta Ad Currency-Aware Spend Design

## Goal

Ensure Facebook/Meta ad spend is represented in BDT correctly regardless of the
connected ad account's billing currency.

## Behavior

- For an ad account whose currency is `USD`, multiply the Meta-reported spend by
  the merchant's configured `usd_to_bdt_rate`.
- For an ad account whose currency is `BDT`, use the Meta-reported spend as-is.
- Keep the analytics response and P&L dashboard values represented as BDT.
- Do not silently apply the USD rate to currencies other than USD or BDT. Treat
  those currencies as unsupported for this BDT spend calculation.
- Preserve the existing default USD conversion rate behavior when the account
  currency is USD and no merchant rate is configured.

## Implementation

The analytics route will retrieve `currency` with the selected ad account from
`meta_ad_accounts`. The legacy/manual account path will use the same stored
currency when available. A normalized currency value will select the multiplier:
the configured USD rate for USD, `1` for BDT, and an explicit unsupported state
for other currencies or missing metadata.

The existing daily spend buckets and profit calculation will continue to use the
converted BDT amount, so no frontend changes are required.

## Verification

Add focused regression coverage for USD conversion and BDT pass-through, then
run the relevant test suite, lint, and production build.
