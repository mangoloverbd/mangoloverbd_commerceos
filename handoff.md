# Handoff — Composio for Facebook + Instagram Connect

## Goal
Add one-click **Connect Facebook Page** and **Connect Instagram Business** to Merchant-Suite using Composio as the OAuth broker. WhatsApp Business stays on the current manual setup — Composio's WhatsApp flow requires the merchant to already have a WABA ID (confirmed via dashboard screenshots), so it adds no onboarding value for BD merchants.

Success = a BD merchant lands on `/integrations`, clicks Connect Facebook (or Instagram), goes through Meta's OAuth popup, and returns with a working Page/IG connection whose tokens land in the existing `app_settings` keys so the current Meta Graph webhook + send code keeps working unchanged.

## Current state
- Nothing built yet. This is a fresh feature.
- Decision locked: Composio for FB + IG, **not** WhatsApp.
- Architectural pattern locked: **Composio as OAuth broker only.** After connect, extract raw tokens from Composio and write to existing `app_settings` keys (`{orgId}:facebook_access_token`, `{orgId}:facebook_page_id`, `{orgId}:instagram_business_account_id`, etc.). Existing HMAC-verified webhooks and send paths remain direct-to-Meta — do not route through Composio at runtime.
- Meta App decision **pending**: ship first with Composio's Meta App (fast, but consent screen says "Composio"), then migrate to Merchant-Suite's own Meta App once we've validated with 5-10 merchants. Own-App requires Meta App Review (1-4 weeks) + Business Verification (1-14 days).
- Tenancy pattern locked: `user_id = "org_${orgId}:${userId}"` on every Composio call, with a server-side invariant test.
- Pricing gate locked: Composio-powered features live behind a Pro tier (5-8k taka/mo), never Starter. Per-tenant call quotas from day one.

## Active files
None modified yet. Files that will be touched next session:
- `server/index.js` — new Composio route section (`/api/composio/*`)
- `server/composio.js` — **NEW** — wrapper for `getComposioSession(orgId, userId)` and the token-extract-to-app_settings helper
- `.env` — add `COMPOSIO_API_KEY`
- `src/App.tsx` — add `/integrations` route under `ProtectedRoute`
- `src/pages/Integrations.tsx` — **NEW** — card grid for FB / IG (WhatsApp card either hidden or wired to existing manual flow)
- `src/components/AppSidebar.tsx` — add Integrations nav item (Phosphor `Plug` icon, `weight="light"`)

## Changes made
None. This session was decision + scoping only. No code was written, no dependencies installed, no routes added.

## Failed attempts
None this session. Prior-session context worth carrying forward:
- Considered using Composio for WhatsApp Business — **rejected** after seeing the dashboard connect flow requires a pre-existing WABA ID (screenshots confirmed no Meta Embedded Signup). Would provide no onboarding value over the current manual token paste.
- Considered replacing the hand-rolled Shopify / Steadfast / Pathao / FraudShield / Meta clients with Composio — **rejected**. Composio has no coverage for Steadfast/Pathao/FraudShield/Firecrawl, and moving Meta send/webhooks behind Composio breaks HMAC verification via `req.rawBody` and adds a 200-400ms hosted hop.
- Considered per-user Composio sessions keyed on Supabase `user.id` — **rejected**. Our tenant unit is `org_id`, not user; must prefix `user_id` with `org_` for tenant isolation since Composio has no native org primitive.

## Next steps
1. **Verify with Composio support**: (a) do they support BYO Meta App credentials on our tier, and (b) can we extract the raw Meta access token + Page ID + IG Business Account ID via their API after a successful connect, so we can write to `app_settings` and keep our direct-Meta code path. If either is "no", revisit — architecture depends on both.
2. **Invoke `brainstorming` skill** to finalize the Integrations page UX (card layout, connected-state indicators, disconnect flow, error surfaces for "IG not linked to Page" case).
3. **Invoke `writing-plans` skill** to produce a step-by-step implementation plan before touching code. Plan should include the Composio wrapper, the four `/api/composio/*` routes, the frontend page, and the token-extract-to-app_settings bridge.
4. **Invoke `plan-eng-review`** on the plan before implementation — catches multi-tenancy gaps and confirms the "OAuth broker only" boundary is preserved.
5. Register `COMPOSIO_API_KEY` in `.env` (dev) and confirm production secret path.
6. Implement behind a feature flag (`app_settings` key `composio_enabled`) so it can be killed instantly if Composio has an outage. Roll out to one internal test org first, then staged.
7. Add per-org rate limits + spend cap in `server/composio.js` before any second merchant is enabled — the pay-per-call model needs a ceiling.
8. Instrument connect funnel: connect_started / consent_granted / callback_success / callback_failure per toolkit, per org. Meta OAuth fails silently in many ways (Page not selected, IG not linked, permission denied) — need the data.
9. Add pre-flight helper on the Instagram card: "Your IG must be a Business/Creator account linked to a Facebook Page" with a link to Meta's how-to. Prevents the most common BD-merchant failure mode.
10. Do **not** ship a WhatsApp card via Composio. Leave WhatsApp Business setup as-is (manual token paste in Settings) until we evaluate a proper BSP (Interakt / Karix / Twilio) with Meta Embedded Signup.
