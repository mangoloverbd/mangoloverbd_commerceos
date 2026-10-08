# State: cut-egress (2026-09-24)
- Suite branch `perf/cut-egress` (local, not pushed): 65ddcfb orders delta, 931bdf3 analytics+auth cache, 4015058 review fixes. 1411 tests pass, lint 36 warnings/0 errors, build ok.
- Storefront branch `perf/remove-posthog` (local clone in session scratchpad, commit 567398b, not pushed).
- Deferred: storefront realtime revision signal (public catalog already CDN-cached).
- Known limits: auth cache up to 30s staleness per warm instance; order-item hard deletes / >120s transactions caught by 10-min full reload; getSettings errors can cache fbConfigured:false.
- Done: suite PR #111 and storefront PR #77 merged and deployed 2026-09-24 00:29 UTC.
- Next: re-measure Supabase edge logs and Vercel 24h counts vs baseline (~20 GB/day egress, 745k Supabase req/day, 164k Vercel runs/day).
