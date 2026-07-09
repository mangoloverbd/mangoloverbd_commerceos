# Shared Header Breadcrumb Design

## Goal

Show a consistent breadcrumb in the top-left of every authenticated application page.

## Design

The shared `DashboardLayout` header will replace its current page-title heading with a two-level breadcrumb. The first level is the muted, static label `Dashboard`; a light chevron separates it from the active page label, which is darker and semibold.

The dashboard route (`/`) displays `Dashboard › Overview`. Every other protected route displays `Dashboard ›` followed by its route label, including Customers, Returns, Products, Extraction, AI Chat, AI Analysis, Facebook, Instagram, WhatsApp, Inbox Orders, Studio, Billing, and System Settings.

The existing header controls on the right remain unchanged. Public, authentication, onboarding, privacy, and not-found pages do not use the shared authenticated layout and are out of scope.

## Implementation Boundaries

- Update `src/components/DashboardLayout.tsx` only for production behavior.
- Keep route-label resolution centralized in the shared layout.
- Add a focused test for the route-label helper if the current test setup supports it without introducing new test infrastructure.

## Validation

- Verify each protected route has a defined label.
- Run the focused test, lint, and production build after implementation.
