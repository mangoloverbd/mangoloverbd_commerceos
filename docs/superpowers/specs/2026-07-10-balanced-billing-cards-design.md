# Balanced Billing Cards Design

**Date:** 2026-07-10
**Status:** Approved

## Goal

Refresh the Billing plan section so Starter and Growth use a polished, glass-like pricing-card treatment while preserving all existing Stripe checkout behavior and the project’s existing `RichButton` styling.

## Scope

- Render only Starter and Growth on the Billing page.
- Keep Pro and Enterprise in the existing plan and Stripe configuration so they can be restored later.
- Use equal-width, top-aligned cards on desktop.
- Let Growth become only naturally taller because it lists more included features.
- Stack the cards responsively on smaller screens.
- Keep the existing 7-day trial and current-plan messaging.
- Keep the existing `/api/billing/checkout` request and redirect behavior unchanged.

## Visual Design

Each plan uses a compound pricing-card component with:

- A translucent outer shell with a subtle border, backdrop blur, and restrained shadow.
- A muted glass header containing the plan label, audience badge, monthly price, and CTA.
- A simple feature list with light Phosphor status icons.
- A subtle blue treatment for Growth without changing its width.
- Starter includes an “Upgrade to Growth” divider followed by two unavailable Growth benefits.
- Growth lists seven included benefits, making it naturally taller than Starter.

The CTA must use `src/components/ui/rich-button.tsx` with its existing default grey styling. No replacement button style is introduced.

## Component Boundaries

`src/components/ui/pricing-card.tsx` owns reusable pricing-card primitives only. It does not know about plan IDs, Stripe, billing state, or Merchant-Suite feature limits.

`src/pages/Billing.tsx` continues to own:

- Plan definitions and limits shown to the user.
- Current-plan and trial state.
- Checkout requests and Stripe redirects.
- Which features are included or locked for each plan.

## Behavior

- Selecting Starter or Growth calls the existing checkout endpoint with the selected `planId`.
- The current plan remains disabled and displays “Current Plan.”
- Upgrade/downgrade labels continue to derive from the plan order.
- Pro and Enterprise are not rendered and cannot be selected from this page.
- Existing billing tabs, usage, payment method, invoices, and Stripe portal remain unchanged.

## Testing

Tests will verify that:

- Starter and Growth render.
- Pro and Enterprise do not render.
- Growth exposes more listed benefits than Starter.
- The reusable pricing-card primitives compose without losing supplied classes or content.
- The Billing page still targets the existing Stripe checkout route.

## Out of Scope

- Manual bank-transfer submission and platform-owner approval.
- Changes to Stripe price IDs, checkout sessions, webhooks, invoices, or the customer portal.
- Removing Pro or Enterprise from backend configuration.
- Changing plan prices or quotas.
