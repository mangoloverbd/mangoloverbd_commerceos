# Mobile Home Icon

## Goal

Use the supplied home icon artwork in the mobile bottom navigation without changing desktop navigation or any other mobile destination.

## Design

- Replace only the `Home` destination icon in `src/components/MobileBottomNav.tsx`.
- Render the supplied SVG path inline with `viewBox="0 0 24 24"`.
- Preserve the existing 21px icon size, current-color styling, accessible `Home` link label, and `/overview` route.
- Keep the existing Phosphor icons for Orders, Inbox, Products, and More.

## Testing

- Confirm the mobile navigation still exposes all five destinations and routes.
- Confirm the Home icon uses the supplied path and remains decorative to assistive technology.
