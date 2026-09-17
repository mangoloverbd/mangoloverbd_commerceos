# Manual Order Confirmed SMS Design

**Status:** Approved by user (2026-09-17)

## Goal

Orders created by the merchant through dashboard Create Order send a "confirmed" SMS
(আপনার {order_id} অর্ডারটি কনফার্ম করা হয়েছে…) instead of the storefront
"received, will call you" wording. Storefront orders keep their current message.

## Context

`POST /api/orders` is called only by the manual Create Order page
(`src/pages/NewOrder.tsx:188`) and today fires
`sendBulkSms(orgId, "confirmation", data)` — the storefront template.

## Change

1. `sendBulkSms` (`server/index.js:925`) gains a `manual_confirmation` type:
   template key `bulksms_manual_confirmation_template`, toggle key
   `bulksms_manual_confirmation_enabled` (defaults on, same `!== "false"` pattern
   as confirmation). Same placeholder replacement (`{customer_name}`, `{order_id}`,
   `{price}`, `{delivery_rate}`, `{courier_name}`, `{tracking_code}`), same BulkSMS BD
   gateway, same silent-skip on missing credentials/disabled toggle.
2. `POST /api/orders` calls `sendBulkSms(orgId, "manual_confirmation", data)`.
3. `src/components/BulkSmsSection.tsx` gains a template textarea + toggle for the
   manual message. Default template (merchant-provided Bengali):

   আসসালামু আলাইকুম {customer_name}, আপনার {order_id} অর্ডারটি কনফার্ম করা হয়েছে। খুব শীঘ্রই অর্ডারটি পেয়ে যাবেন, ইনশাআল্লাহ।— ম্যাংগো লাভার

## Unchanged

- Storefront webhook still sends `"confirmation"`; dispatch SMS untouched.
- SMS failure never fails order creation (existing try/catch + silent skip).
- No new provider, no schema change (settings live in `app_settings`).

## Testing

- Server-source test: `manual_confirmation` branch reads the new keys; POST route
  calls it; webhook still calls `"confirmation"`.
- Default-template test for the Bengali text with placeholder substitution.
- Full Vitest suite, lint, production build before completion.

## Non-goals

- No SMS for other creation paths, no Abandoned/inbox SMS changes.
- No delivery-report tracking or resend UI.
