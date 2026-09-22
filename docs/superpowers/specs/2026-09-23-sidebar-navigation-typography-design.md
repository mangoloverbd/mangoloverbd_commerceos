# Sidebar Navigation Typography Design

## Goal

Make sidebar navigation labels feel calmer and less visually heavy without weakening navigation clarity.

## Scope

- Apply the change only to primary and nested navigation labels.
- Render inactive labels at normal weight with `text-black/65`.
- Render active labels at medium weight with `text-black/90`.
- Use `text-black/85` for inactive hover text.
- Preserve icons, section headings, logo, footer links, spacing, and selected-item backgrounds.
- Preserve disabled-item styling.

## Testing

- Update the sidebar navigation style regression test to verify active and inactive label treatments.
- Run the focused test, full test suite, build, and lint.
