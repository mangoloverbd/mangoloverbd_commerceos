# Order Editor Landing-Page Label

## Goal

Make the originating landing page immediately discoverable in Order Editor without mixing campaign attribution into the canonical order-source field.

## Design

- Keep `Order source` as the editable channel value, such as `Website`.
- Add a read-only `Landing page` attribution block beside the source selector in the customer/order header.
- Derive a human-readable label from the stored normalized `/step/<slug>` path, for example `Katimon Mango`.
- Link the human-readable label to the stored local path in a new tab, preserving the exact path as the link title and accessible description.
- Keep the existing path visible as fallback context when a slug cannot be formatted.
- Always show the `Landing page` label; show `—` when no path is stored.
- Do not add landing pages to the source dropdown or change New Order.

## Testing

- Verify the human-readable label and link target for a stored path.
- Verify the source dropdown remains `Website` independently.
- Verify orders without attribution do not render a misleading landing-page link.
- Run the Merchant Suite test suite and production build before shipping.
