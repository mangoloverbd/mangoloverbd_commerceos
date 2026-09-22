# Sidebar Navigation Typography Design

## Goal

Make sidebar navigation labels feel calmer and less visually heavy without weakening navigation clarity.

## Scope

- Apply the change only to primary and nested navigation labels.
- Render primary navigation labels at `13px` while keeping nested labels at `11.5px` and section headings at `11px`.
- Render inactive labels at normal weight with `text-black/80`.
- Render active labels at medium weight with `text-black/90`.
- Use `text-black/85` for inactive hover text.
- Preserve icons, section headings, logo, footer links, spacing, and selected-item backgrounds.
- Preserve disabled-item styling.
- Place the Reports section above Intelligence while leaving Social Inbox below both.
- Hide the entire Billing & Plan sidebar item, including its icon and label.
- Keep System Settings as the only footer control; remove the copyright text and help control.

## Testing

- Update the sidebar navigation regression test to verify active and inactive label treatments, section order, and the icon-only Billing link.
- Run the focused test, full test suite, build, and lint.
